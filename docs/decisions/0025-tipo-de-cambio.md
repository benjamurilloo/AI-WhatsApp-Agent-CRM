# 0025 — El tipo de cambio

- Estado: **aceptada** (decisión del usuario del 2026-10-18), con las correcciones de la revisión independiente del 2026-10-18 (R1: 2 bloqueantes, 12 medios y 7 bajos, los centrales verificados contra el código; §Revisión independiente). Subfase 29.3, [brief-29.3](brief-29.3-adr-del-tipo-de-cambio.md), aprobado por el usuario el 2026-10-18 con las recomendaciones de D-1 a D-14 y su decisión sobre la fuente. El usuario decidió R-M3 con la recomendación (a). Las correcciones no tuvieron una segunda revisión independiente: su verificación es autoevaluación.
- Fecha: 2026-10-18
- Nivel: **diseñado**. No hay código, tablas ni ejecución.
- **Supera en parte**: el [ADR 0019](0019-bases-de-los-comprobantes.md), punto 3; el [ADR 0022](0022-cobros-y-caja.md), en la moneda del cobro y de la devolución y en la moneda por defecto (punto 8); el [ADR 0023](0023-compras-y-proveedores.md), punto 8, en la moneda del pago; y el [ADR 0024](0024-rubros-y-capacidades.md), puntos 15 y 17. **Precisa** el [ADR 0016](0016-el-crm-se-amplia-hacia-un-erp-por-fases.md), punto 7.

*Nota del 2026-10-19, al cerrar la 29.4.3* ([brief-29.4.3](brief-29.4.3-devoluciones-y-pagos-en-otra-moneda.md)), sin cambiar el texto de abajo:

- **Punto 5, la moneda de lo aplicado contra la cuenta**: en la devolución desde la cuenta, la otra moneda solo sale contra lo que está a favor **en la principal**; lo que está a favor en otra moneda sale en su moneda, como antes. En el pago a cuenta, la moneda aplicada es la principal o una en la que se le deba al proveedor (D-4), y la regla vive en `cash`, que lee `supplierLedger`: `purchasing` sigue sin depender de `fx`.
- **Punto 5, el redondeo**: la tolerancia de un centavo vale solo para una salida convertida. Una devolución o un pago en la moneda del destino tienen el tope de siempre (P-2).
- **Punto 6**: la referencia a `supplier-payments.ts:308-318` (`cashShortfall`) quedó vieja. El control de las salidas en efectivo es `outgoingShortfall`, y el de lo que vuelve al anular, `returnExceedsLimit`, los dos en `cash/service.ts` y medidos en la moneda que sale o vuelve (P-3).
- **Punto 14 del ADR 0022, la exportación**: la de un cliente trae `tendered_currency`, `tendered_amount` y `exchange_rate` de sus cobros, devoluciones y sus anulaciones. Corrige la omisión de los cobros en la 29.4 (D-8).

*Nota del 2026-10-18, al implementar la 29.4* ([brief-29.4](brief-29.4-el-tipo-de-cambio.md)), sin cambiar el texto de abajo:

- **Punto 2, «cambiarla en una organización con datos no se permite»**: se lee como **cambiar** una moneda principal ya fijada. Fijarla **por primera vez** se permite aunque la organización tenga datos, porque no cambia ningún monto guardado: solo suma propuestas y totales de referencia (brief-29.4, D-2, decisión del usuario). La primera fue «iPhone Demo», que ya tenía precios en USD.
- **Punto 3**: la 29.4 crea las dos tablas **solo con lo manual**. La fuente `dolarapi_blue`, el ajuste, `last_confirmed_at`, `source_rate`, `source_observed_at` y el `CHECK` de la suma los suma la 29.4.2, con una migración aditiva (D-3).
- **Punto 5, R-M2**: un cobro a cuenta con moneda principal se aplica en la principal o en una moneda **en la que el cliente tenga saldo**, incluida una tercera (una venta vieja en euros), que sigue cobrándose en su moneda, como antes. Lo recibido solo se convierte entre la principal y la otra (brief-29.4, P-1).
- **Punto 5, «la del destino y la otra moneda de la organización»**: se convierte solo cuando entra la otra moneda contra un destino en la principal. Un destino en la otra moneda (una venta en pesos) se cobra en su moneda: al revés, el redondeo de lo recibido se multiplica por la cotización y lo propuesto excedería lo que falta en más de un centavo (revisión independiente de la 29.4, R1-1). **Sin cotización vigente se rechaza aunque venga una acordada** (R1-2).
- **Fases**: la fila de la 29.4 nombra «el cambio de fuente», que con lo de arriba pasa a la 29.4.2.
- **Punto 5**: el formulario manda la cotización vigente que mostró, y si cambió mientras se cargaba el cobro, se rechaza: lo aplicado nunca sale de una cotización que el `admin` no vio (P-4).

*Nota del 2026-10-19, al implementar la 29.4.2* ([brief-29.4.2](brief-29.4.2-la-lectura-de-la-cotizacion.md)), con las decisiones del usuario sobre D-4 y D-5, sin cambiar el texto de abajo:

- **Punto 4, el límite del 10 %**: se mide **contra la vigente**, no contra la última automática. Medido contra la automática, después de un salto real el lector quedaba trabado para siempre, porque cada lectura se rechazaba contra la misma automática vieja y una carga manual no lo destrababa (H-2). «Cambió o no» se sigue midiendo contra la última automática, así que R-M12 no cambia: una carga manual no se pisa mientras la fuente no cambie de valor (D-4).
- **Punto 4, volver a la fuente automática**: la primera lectura después de volver guarda siempre una fila. La última automática se busca desde el último cambio de fuente, `source_changed_at`, que mantiene un trigger. Sin eso, una manual quedaba vigente sin límite con la fuente en automática (H-3, D-5).
- **Punto 9, la regla vive en la base**: la suma, la comparación, el límite y la escritura los hace `fx_record_reading`, en `numeric`, y el lector solo le pasa la venta como texto. Así, una credencial filtrada mueve la cotización a lo sumo un 10 % por llamada, en lugar de ponerle cualquier valor (D-3).
- **Punto 9, la red**: además de las redes privadas, la unidad niega `169.254.0.0/16`, donde está el servicio de metadatos del droplet (H-7).
- **Punto 3**: ningún `CHECK` nombra `'dolarapi_blue'`, porque la migración que agrega el valor corre en la misma transacción (H-1).
- **Punto 9, `fx_reader_targets()`**: devuelve solo el id de cada organización, no la moneda, el ajuste ni la última automática. Esos datos los lee `fx_record_reading` dentro de su transacción, con la configuración bloqueada, así que el lector no necesita verlos (D-3; revisión independiente de la 29.4.2, B-3).
- **Punto 9, el rol de la aplicación**: `crm_app` recibe `UPDATE` sobre la configuración **solo en la fuente y el ajuste**. `last_confirmed_at` lo escribe solo `fx_record_reading` (revisión independiente de la 29.4.2, B-1).

## Contexto

El primer negocio del rubro de la Fase 29 publica y cobra en dólares, y acepta pesos al dólar blue de Córdoba, precio de venta (ADR 0024, R-2). Combina medios y monedas en una misma venta: efectivo en USD o ARS, transferencia en ARS, tarjetas y USDT (R-3).

El usuario decidió el 2026-10-18:

- **el dólar es la moneda fuerte**: todo se lleva en dólares, también la caja, aunque se cobre en pesos (U-2);
- **la cotización se lee automáticamente** (U-3);
- al aprobar el brief, cambió la fuente: **una API de dólar más 10 pesos**, en lugar de infodolar (brief-29.3, §Decisión del usuario sobre la fuente).

Lo que el CRM hace hoy, verificado contra el código el 2026-10-18 (brief-29.3, §Lo que se verificó):

- **Cada fila de dinero lleva su moneda**, ISO 4217, de la lista de `Intl` sin las de tres decimales. El dinero es `numeric(14, 2)` en la base y `bigint` en centésimos en TypeScript, **nunca `number`**. `src/shared/money/` **no admite montos negativos** (`index.ts:17, 112`).
- **`organizations` no tiene moneda.** «No hay tipos de cambio» (ADR 0019, punto 3).
- **El cobro copia la moneda de su destino en el servicio** (`src/modules/cash/service.ts:2037, 2146`). **`imputeAccount` lanza `InconsistentAccount`** si un cobro está en otra moneda que su venta (`src/modules/cash/imputation.ts:110-116`), y la cuenta del proveedor reutiliza esa función (`src/modules/cash/supplier-payments.ts:124-180`).
- **El cobro a cuenta, la devolución desde la cuenta y el pago a cuenta** van en la moneda que elige la persona (ADR 0022, l. 90; ADR 0023, l. 164; `service.ts:3868, 2476`; `supplier-payments.ts:286`).
- **Solo un `admin` cobra, anula, devuelve y opera la caja** (ADR 0022, punto 12; `service.ts:1987, 2079, 2466, 3973`).
- **La caja es por moneda**, y lo esperado de una nunca se suma con el de otra (ADR 0022, punto 8; `src/modules/cash/totals.ts:56-124`).
- **La aplicación web no sale a internet.** Fuera de ella, **tres procesos del servidor sí salen**:
  - el heartbeat a Healthchecks.io (`deploy/production/crm-heartbeat.sh`);
  - la copia externa de los backups al object storage (`crm-backup-offsite.service:11-13`);
  - certbot (`deploy/production/README.md:167`).
  
  Los decidieron briefs de la Fase 13, no un ADR. El despliegue **separa a propósito la red de la credencial de la base**: el backup corre con `IPAddressDeny=any`, y el heartbeat va en una unidad aparte para no darle red «a un proceso que lee el .pgpass del dueño» (`crm-heartbeat.sh:10-12`).

Los hallazgos H-1 a H-8 del brief son el punto de partida. Los centrales:

- **H-2**: cobrar en otra moneda rompe la imputación, no solo una regla escrita;
- **H-3**: los billetes de la caja no cambian de moneda;
- **H-4**: la cotización necesita más precisión que el dinero;
- **H-5**: leer una fuente externa desde un proceso con credencial de la base es nuevo, y un valor equivocado cobra mal;
- **H-8**: todos los movimientos de dinero tienen el mismo problema, no solo el cobro de una venta.

## Decisión

### 1. Qué decide este ADR

**Decide**:
- la moneda principal;
- la cotización, su historial y su conversión;
- el movimiento de dinero en otra moneda que su destino;
- la caja y las cuentas;
- USDT;
- la fuente automática y la carga manual;
- el proceso que lee afuera;
- lo que ve el agente;
- los roles y los datos;
- las subfases.

**No decide**:
- convertir los precios de los productos ni las líneas de un comprobante;
- las listas de precios, los descuentos ni **el recargo de las tarjetas** (R-3: el negocio no lo sabe);
- la diferencia de cambio contable, la revaluación ni la contabilidad;
- **un par en el que la moneda principal valga menos que la otra** (punto 3);
- cambios en el agente o en su repositorio.

### 2. La moneda principal

- **`organizations.main_currency`**, opcional, de las monedas aceptadas (`acceptedCurrencies()`). **Es del módulo `organizations`**, dueño de la tabla (Overview, «cada módulo posee sus tablas»), y la leen los demás por su interfaz, como ya leen la organización.
- **Sin moneda principal, el CRM se comporta exactamente como hoy**: ni cotización, ni conversión, ni totales de referencia. Es el invariante del núcleo del ADR 0024.
- **Con moneda principal**:
  - los formularios que eligen moneda la proponen primero: precio en `catalog`, orden de compra en `purchasing`, cobro a cuenta y apertura de caja en `cash`. Todos la leen de `organizations`, del que ya dependen, y **ninguno depende de `fx` por esto**;
  - la organización puede tener **una cotización** contra otra moneda (punto 3);
  - los movimientos de dinero pueden recibirse o pagarse en esa otra moneda (punto 5);
  - la caja, las cuentas y las listas suman un **total de referencia** en la moneda principal (puntos 6 y 7).
- **La fija quien opera el CRM**, con un script auditado, como las capacidades (ADR 0024, punto 3). No hay pantalla, y el `admin` del negocio no la cambia.
- **Cambiarla en una organización con datos no se permite** (brief, D-2): con precios, comprobantes, cobros o cotizaciones guardados, se resuelve con un ADR (revisión, R-M13).
- La primera organización con moneda principal es la del negocio de iPhone: **USD**.

### 3. La cotización

- **`exchange_rate_settings`**, una fila por organización con cotización, del módulo `fx`:
  - **`quote_currency`**: la otra moneda (`ARS`), distinta de la principal;
  - **`source`**: `manual` o `dolarapi_blue` (punto 4);
  - **`adjustment`**: el ajuste en la otra moneda que se suma a la fuente automática. Es `numeric(14, 2)` y **puede ser cero o negativo**; arranca en 10 para el negocio de iPhone;
  - **`last_confirmed_at`**: la última vez que la fuente automática confirmó el valor vigente (punto 4);
  - la crea el mismo script que fija la moneda principal. El `admin` cambia el ajuste y la fuente, con auditoría (punto 4).
- **El ajuste no es dinero de `src/shared/money/`**, que rechaza los negativos (revisión, R-M7). `fx` lo lee y lo escribe con su propio tipo: un `bigint` con signo, en centésimos, con su propia lectura del texto de la base. **Nunca `number`.**
- **`exchange_rates`, de solo inserción**, por organización:
  - el par: `base_currency`, la principal, y `quote_currency`, la otra;
  - **`rate`**: cuántas unidades de la otra moneda vale una de la principal (1 USD = 1.565 ARS), en `numeric(18, 6)`;
  - **`CHECK (rate >= 1)`**: el par va siempre en la dirección en la que la principal vale más. Con una principal más débil, seis decimales dejarían tres cifras significativas (revisión, R-M5). Ese caso queda fuera de este ADR (punto 1);
  - **`source`**: `manual` o `dolarapi_blue`;
  - **si es automática**: `source_rate` (lo que dio la fuente), `adjustment` (el ajuste que se sumó) y `source_observed_at` (la fecha que da la fuente), con un `CHECK` de que `rate = source_rate + adjustment`;
  - **si es manual**: `recorded_by`, el usuario que la cargó;
  - **`recorded_at`**: cuándo se guardó.
- **La vigente es la última guardada** para el par. No se edita ni se borra: una corrección es otra fila.
- **Una sola cotización por par**, la que el negocio usa para cobrar: el blue, venta. No hay compra y venta separadas (R-2).
- **En TypeScript**, la cotización es un tipo propio: el valor escalado a millonésimos como `bigint`, leído y escrito como texto, nunca `number`.
- **Una sola función de conversión**, pura, en `src/shared/money/`:
  - de la principal a la otra: `monto × rate`; de la otra a la principal: `monto ÷ rate`;
  - **redondeada a los decimales de la moneda de destino, con el medio hacia afuera del cero** (ADR 0019, punto 4);
  - **rechaza un resultado de cero**, porque un movimiento tiene monto positivo (`receipts_amount_positive`), **y uno mayor que `MAX_AMOUNT`**, como `computeLineTotal` (`src/shared/lines/line-total.ts:55-56`);
  - tiene tests de propiedades: el redondeo nunca se aleja más de media unidad mínima, y con `rate >= 1` la vuelta de un monto convertido de la principal a la otra da el mismo monto.

### 4. De dónde sale la cotización

**Decisión del usuario del 2026-10-18**: la fuente automática es **[DolarAPI](https://dolarapi.com/docs/argentina/)**, `GET https://dolarapi.com/v1/dolares/blue`, campo `venta`, **más el ajuste de la organización**. infodolar no se conecta.

- **Por qué DolarAPI**: publica sus condiciones de uso ([Uso de los datos](https://dolarapi.com/docs/uso)). Permiten consultar la API y usar las respuestas, y sugieren una consulta cada 3 horas por serie. Su [aviso legal](https://dolarapi.com/docs/legal) no garantiza la exactitud ni la vigencia, y el servicio puede cambiar o cortarse sin aviso.
- **Por qué el ajuste**: DolarAPI da el blue nacional, no el de Córdoba. El 2026-10-18 la diferencia fue de **16 pesos**: infodolar daba la venta de Córdoba a 1.571, y DolarAPI daba 1.555. Es una sola observación. El ajuste es un dato de la organización que el `admin` corrige cuando ve que no coincide, y cada fila guarda el que usó.
- **Se descartaron**:
  - **infodolar**: no tiene API ni términos de uso, y su HTML puede cambiar sin aviso. El usuario lo descartó;
  - **[Bluelytics](https://api.bluelytics.com.ar/v2/latest)**: da el mismo blue, pero no publica condiciones de uso;
  - **[Dolarito](https://www.dolarito.ar/solicitud-acceso-api)**: es paga.
- **El lector** es un proceso aparte (punto 9). Corre **a las 9, 12, 15, 18 y 21, hora de Argentina**, en el horario del local: cinco consultas por día, dentro de lo que sugiere DolarAPI (revisión, R-B4).
  - **Lee el cuerpo como texto**. Valida con un esquema estricto que `moneda` sea `USD` y `casa` sea `blue`, y que `fechaActualizacion` sea una fecha. **`venta` se toma del texto crudo de la respuesta**, con una expresión que exige un número decimal positivo con a lo sumo seis decimales, y se convierte al tipo de la cotización **sin pasar por `number`** (revisión, R-M6).
  - Para cada organización con `source = dolarapi_blue`, `quote_currency = ARS` y **moneda principal `USD`**, calcula `venta + adjustment`.
  - **Compara contra la última cotización automática**, no contra la vigente (revisión, R-M12):
    - si el valor no cambió, **no guarda una fila**: solo actualiza `last_confirmed_at`;
    - si cambió, guarda la fila nueva, que pasa a ser la vigente.
  - **Falla cerrada**: no guarda nada para una organización si pasa cualquiera de estas cosas:
    - la API no responde;
    - la respuesta no cumple el esquema;
    - el resultado es menor que 1;
    - el resultado se mueve más de un **10 %** contra la última automática.
    
    En la primera lectura, sin una automática anterior, se compara contra la vigente manual si hay una, y si no hay ninguna, se guarda. Una lectura dudosa nunca reemplaza a la vigente.
- **La carga manual**: un `admin` carga una cotización desde la pantalla de la cotización, en cualquier momento, y pasa a ser la vigente.
  - **Si la organización está en `dolarapi_blue`**, la próxima lectura automática que **cambie** la pisa. La pantalla lo avisa al cargarla.
  - **Para que una carga manual no se pise**, el `admin` pasa la fuente a `manual`, y la vuelve a `dolarapi_blue` cuando quiera. Cada cambio queda auditado.
  - Es la salida cuando la fuente se aleja del valor de Córdoba más que el ajuste, o cuando el lector frena por el límite del 10 %.
- **La antigüedad** (H-7):
  - la de una cotización automática se mide desde `last_confirmed_at`;
  - la de una manual, desde `recorded_at` (revisión, R-B3).
  
  **Nada se bloquea.** Cada pantalla que usa la cotización muestra su valor, su fuente y su fecha, y **avisa si tiene más de 24 horas sin contar sábados ni domingos**. Un feriado puede dar un aviso de más, y eso se acepta.
- **Atribución**: la pantalla de la cotización dice «Fuente: DolarApi (dolarapi.com) + ajuste de la organización».

### 5. Cobrar o pagar en otra moneda que el destino

**Un movimiento de dinero guarda dos montos: el que se aplica y el que se recibe o se paga.**

- **Las columnas que hoy existen no cambian de significado**: `currency` y `amount` siguen siendo **la moneda y el monto del destino**. Se los llama **lo aplicado**.
- **Columnas nuevas, opcionales**:
  - `tendered_currency` y `tendered_amount`: **lo que entró o salió de verdad**, en la otra moneda;
  - `exchange_rate`: la cotización usada, copiada como valor;
  - `exchange_rate_id`: la fila de `exchange_rates`, si la cotización fue la vigente; vacía si fue negociada.
- **Los `CHECK`** (revisión, R-M1):
  - `tendered_currency`, `tendered_amount` y `exchange_rate` van **las tres juntas o ninguna**;
  - `exchange_rate_id` solo puede tener valor si las tres lo tienen;
  - `tendered_currency` es distinta de `currency`;
  - `tendered_amount` es mayor que cero y `exchange_rate` es mayor o igual que 1.
- **Lo aplicado se calcula una sola vez, al registrar, con la función del punto 3, y se guarda.** Nunca se recalcula con otra cotización.
- **La imputación usa lo aplicado** (H-2). `imputeAccount` **no cambia sus reglas**: recibe montos en la moneda de la venta, como hoy. Lo mismo la cuenta del proveedor.
- **La caja usa lo recibido** (punto 6).
- **La moneda de lo aplicado** (revisión, R-M2):
  - **contra una venta, un pedido o una recepción**, es la de ese documento, como hoy;
  - **contra la cuenta** (un cobro a cuenta, una devolución desde la cuenta o un pago a cuenta), con moneda principal, **es la principal**, salvo que la persona elija la otra moneda, y eso solo se puede si el cliente o el proveedor **tiene un saldo pendiente o a favor en esa moneda**. Así, unos pesos recibidos a cuenta de un cliente que solo debe dólares se aplican en dólares, y no quedan como un saldo a favor en pesos que la imputación nunca cruza con la deuda (`imputation.ts:122`, una moneda por pasada).
- **Los topes se miden con lo aplicado**: no se cobra ni se paga más de lo que falta en la moneda del destino. La regla del redondeo (revisión, R-M4):
  - lo aplicado es `redondear(lo recibido ÷ rate)` a los decimales del destino;
  - si **después de redondear** lo aplicado excede lo que falta **en exactamente una unidad mínima** (un centavo), se guarda lo que falta, y la diferencia de lo recibido, que es menor que `rate × 0,01` (hoy unos 16 pesos), queda en la caja como redondeo, sin aplicarse a ninguna cuenta;
  - cualquier exceso mayor se rechaza;
  - **lo que propone la pantalla nunca cae en ese caso**: con `rate >= 1`, `redondear(lo que falta × rate)` vuelve exacto (punto 3).
- **La pantalla ayuda**: muestra lo que falta en la moneda del destino y su equivalente en la otra con la cotización vigente («faltan USD 100,00 = ARS 156.500,00»), y propone ese monto.
- **Una cotización negociada**: el `admin` que registra el movimiento puede escribir otra cotización para ese movimiento. Se guarda en `exchange_rate`, sin `exchange_rate_id`, y **no pasa a ser la vigente**. Solo un `admin` registra movimientos de dinero (ADR 0022, punto 12; punto 11).
- **Solo dos monedas por movimiento**: la del destino y la otra moneda de la organización. Sin moneda principal o sin cotización, el movimiento va en la moneda del destino, como hoy.
- **Combinar monedas en una venta** son varios cobros contra la misma venta, cada uno con su moneda recibida (ADR 0022, punto 3).
- **La anulación copia lo que entró**: `tendered_*` y `exchange_rate` del original, sin cotización nueva. La caja devuelve lo recibido, si la sesión del original sigue abierta (ADR 0022, punto 5), y la cuenta, lo aplicado. Los triggers de copia de las anulaciones (`0045:128-196`, `0051:92-125`) suman estas columnas.
- **La devolución** (revisión, R-M3; **decisión del usuario del 2026-10-18**): es un movimiento nuevo y **usa la cotización vigente**, o una negociada por el `admin`. Lo que se le debe al cliente está en la moneda del destino (dólares). Si se devuelve en pesos, se devuelve su equivalente de hoy, y no los pesos que entregó. Se descartó devolver los mismos pesos con la cotización del cobro original.
- **Se aplica a todos los movimientos de dinero** (H-8). Cada uno la implementa en su subfase (punto 12):
  - el cobro de una venta, la seña y el cobro a cuenta (`receipts`);
  - la devolución (`refunds`);
  - el pago a un proveedor (`supplier_payments`);
  - el pago de un usado (`trade_in_payments`, ADR 0024, punto 8);
  - y sus anulaciones.
- **La permuta no se convierte** (revisión, R-B5). El ADR 0024 (punto 8) guarda el valor reconocido del usado «con su moneda». **Un cobro con «Permuta» solo se acepta contra una venta en esa misma moneda.** Si las monedas difieren, se rechaza.

### 6. La caja

**Se cuenta por moneda, se informa en la principal.**

- **El arqueo no cambia** (H-3): lo esperado y lo contado siguen por moneda (ADR 0022, punto 8). Los pesos que entraron como pesos se cuentan como pesos.
- **`computeCashTotals` no cambia**: recibe pares de moneda y monto. Lo que cambia es quién la llama (`service.ts:447-506`), que le pasa **lo recibido** de cada movimiento en efectivo cuando existe.
- **Ninguna salida deja lo esperado negativo en la moneda en que sale.** Los controles de efectivo (`service.ts:2361-2369, 2534-2544`; `supplier-payments.ts:308-318`) reciben lo recibido o lo pagado, no lo aplicado.
- **La pantalla de la caja, el cierre y el historial suman un total de referencia en la moneda principal**, convertido con la cotización vigente, con su valor y su fecha, y marcado «de referencia».
- **El total de referencia no se guarda**: se calcula al leer. El cierre guarda lo contado por moneda, como hoy.
- **Esto supera la frase del ADR 0022, punto 8**, «el ADR 0019 no da a la organización una moneda por defecto»: la tiene si la fija el script. La caja sigue siendo por moneda.

### 7. Las cuentas y las listas

- **La deuda queda en la moneda del destino.** La cuenta de un cliente con ventas en USD y cobros en ARS queda en USD, porque cada cobro se aplicó en USD.
- **Un saldo en otra moneda** (por ejemplo, una venta vieja en ARS) sigue en su moneda.
- **La ficha del cliente, la del proveedor, la lista de deudores y la de «a pagar» suman un total de referencia** en la moneda principal, con la cotización vigente, sin guardarlo.

### 8. USDT

- **Es un medio de pago, no una moneda.** «USDT» es un medio activo de la organización, que **no es efectivo**. Su cobro va **en USD, uno a uno**, y no entra a la caja.
- No hay columna ni moneda nueva: lo da de alta el `admin`, como cualquier medio (ADR 0022).

### 9. Leer de afuera

**Precisa el ADR 0016, punto 7.** Leer una fuente externa no es producir un efecto externo. Desde este ADR, **un proceso nuevo del CRM solo sale a internet si un ADR lo autoriza, contra el host que nombra** (revisión, R-B2).

**Lo que ya sale y sigue igual**: el heartbeat, la copia externa de los backups y certbot. Se decidieron en la Fase 13 (brief-13.3) y este ADR los registra sin cambiarlos.

**Este ADR autoriza un proceso nuevo, el lector de la cotización.**

- **Dónde corre**: un servicio de systemd aparte, `crm-fx-reader`, con su timer y `DynamicUser`. Su código vive en `scripts/fx/`, **fuera de `src/`**.
- **Adónde sale**: solo a `dolarapi.com`, solo con `GET`, y nunca manda datos del CRM. **Lo garantiza el código y una guarda, no la red**: systemd filtra por IP, no por nombre de host (revisión, R-M9). La unidad niega igual las redes privadas y locales, salvo la base.
- **La base: red y credencial juntas, por primera vez, a sabiendas** (revisión, R-M9). El despliegue las separa (`crm-heartbeat.sh:10-12`) porque la credencial del backup es la del dueño. Acá se acepta juntarlas porque **la credencial es mínima**:
  - el rol propio `crm_fx_reader` **solo puede ejecutar dos funciones** `SECURITY DEFINER` de `fx`, sin acceso directo a ninguna tabla;
  - **`fx_reader_targets()`** devuelve, por organización con fuente automática: el id, la moneda principal, la otra, el ajuste y la última cotización automática;
  - **`fx_record_reading(...)`** inserta la cotización o actualiza `last_confirmed_at`, y repite en la base el `CHECK` de la suma y el de `rate >= 1`;
  - la contraseña del rol va en un archivo del servidor que solo lee esa unidad (`LoadCredential=`), no en el `.pgpass` del dueño.
  
  Si la credencial se filtra, lo peor que permite es insertar una cotización, y el límite del 10 % no lo frena: lo vería el `admin` en la pantalla y en el historial. Se acepta como riesgo.
- **El aviso**: el lector sale con **código distinto de cero si alguna organización falló**, aunque otras se hayan guardado. Así el heartbeat no manda su ping (`crm-heartbeat@.service:4-7`) y la alerta suena. El trabajo `fx-reader` se suma a la lista cerrada de `crm-heartbeat.sh`.
- **Las guardas**: `tests/guards/deployment-hostnames.test.ts` sigue rechazando hosts externos en `src/` (revisión, R-B7). Una guarda nueva fija que en `scripts/fx/` el único host externo es `dolarapi.com`.
- **La aplicación web no sale a internet.** Ninguna pantalla espera a la fuente.
- **El runbook de despliegue** suma el lector, su rol, su credencial y su trabajo del heartbeat (revisión, R-B6).

### 10. Lo que ve el agente

- **`read-v1` y `read-v2` no cambian.** Hasta la 29.8, el agente da el precio en la moneda del producto.
- **Desde el contrato del rubro de la 29.8**, cada precio lleva además su equivalente en la otra moneda, con la cotización vigente y su fecha. **Supera el ADR 0024, punto 15.**
- **El CRM hace la conversión**, no el agente. El agente la presenta como «a la cotización de hoy», orientativa, y no lee la fuente.
- El agente no registra cobros ni pagos (ADR 0016, punto 5), ni lee la cotización negociada de un movimiento.

### 11. Roles

- **Un `admin`**:
  - carga una cotización;
  - cambia el ajuste y la fuente;
  - registra los movimientos en otra moneda, con la vigente o con una negociada;
  - ve el historial.
- **Un `viewer`** ve la cotización vigente, su fuente y su fecha, y los totales de referencia. **No registra movimientos de dinero**: el ADR 0022, punto 12, no cambia (revisión, R-B1, que corrige el D-10 del brief).
- **La cotización no deja inferir nada oculto.** Es un dato público, y lo aplicado y lo recibido de un movimiento ya los ve quien ve ese movimiento (comparar con el R-1 de la 22.1).

### 12. Datos y retención

- **Las cotizaciones no son datos personales**: no nombran a nadie, salvo el usuario que cargó una manual, como cualquier fila auditada (revisión, R-M10; brief, D-12).
- **Se conservan sin límite**, como los precios, porque cada movimiento apunta a la suya. El vaciado de los datos de un cliente (ADR 0015) no las toca.

### 13. El módulo y lo que crea cada subfase

- **Módulo nuevo del núcleo, `fx`**: la configuración, las cotizaciones, la carga manual, las dos funciones del lector y la lectura de la vigente.
  - **Depende de** `organizations` y `audit`.
  - **`cash` depende de `fx`**, para convertir y para los totales de referencia.
  - **`src/app/api/read/`** dependerá de `fx` en la 29.8.
  - **`fx` no depende de nadie más**, y no hay ciclos.
  - **`catalog` y `purchasing` no dependen de `fx`** (punto 2). La regla 1 de `tests/guards/purchasing-dependencies.test.ts` no cambia.
  - `fx` entra en la lista de módulos de dominio de `eslint.config.mjs` y del Overview, con su guarda de dependencias (revisión, R-M8).
- **La función de conversión es pura** y vive en `src/shared/money/`, porque no lee la base.

Ajusta el punto 17 del ADR 0024, que tenía una sola 29.4:

| Subfase | Crea |
|---|---|
| **29.4 — El tipo de cambio** | `fx`; `main_currency`; `exchange_rate_settings`; `exchange_rates`; la carga manual, el cambio de fuente y el historial; la conversión con sus propiedades; el cobro de una venta, la seña y el cobro a cuenta en otra moneda, con su anulación; los totales de referencia de la caja y de las cuentas de clientes; el script de la moneda principal |
| **29.4.2 — La lectura de la cotización** | `crm-fx-reader` con su timer, su rol, sus dos funciones y su credencial; la lectura de DolarAPI sin `number`; la falla cerrada; el trabajo del heartbeat; la guarda de hosts; el runbook |
| **29.4.3 — Devoluciones y pagos en otra moneda** | la regla del punto 5 en `refunds` y `supplier_payments`, con sus anulaciones, y el total de referencia de las cuentas de proveedores |
| **29.7** | la misma regla en `trade_in_payments` |

## Alternativas descartadas

- **Una capacidad `multi_currency` sin moneda principal**: no dice a qué convertir los totales.
- **Convertir todos los montos a USD**: los pesos que entraron de verdad se pierden.
- **La moneda principal en `fx`, fuera de `organizations`**: obligaría a `catalog` y `purchasing` a depender de `fx` solo para proponer una moneda.
- **Compra y venta separadas**: el negocio cobra con una sola (R-2).
- **Una cotización global, compartida por las organizaciones**: rompe el aislamiento; cada negocio puede usar otra fuente u otro ajuste.
- **Cualquier par, en cualquier dirección, con `numeric(18, 6)`**: con una principal débil quedan tres cifras significativas. Otra precisión se decide cuando un negocio lo pida.
- **infodolar, Bluelytics y Dolarito** (punto 4).
- **Solo carga manual**: va contra U-3. Queda como respaldo.
- **Que la aplicación lea la fuente al abrir el cobro**: pone un servicio de terceros en el camino de cada cobro, y un error de red bloquea la caja.
- **Que el agente lea la fuente** (brief, D-9 (c)): pone la regla del negocio fuera del CRM.
- **Darle al lector acceso directo a las tablas**: con red y credencial juntas, una tabla de más es una fuga posible.
- **Comparar la lectura contra la vigente**: una carga manual duraría como mucho hasta la próxima lectura, y el límite del 10 % se mediría contra ella.
- **Cobrar en la moneda del destino y registrar el cambio como un movimiento de caja aparte**: dos operaciones por cobro, y la caja «vendería dólares» que nunca entraron.
- **Guardar solo lo recibido y convertir al leer**: la cuenta de un cliente cambiaría cada vez que se mueve el dólar.
- **Cambiar `currency` y `amount` para que sean lo recibido**: obliga a cambiar `imputeAccount`, la cuenta del proveedor y todas las lecturas que suman montos.
- **Dejar libre la moneda aplicada de un cobro a cuenta**: los mismos pesos quedarían como saldo a favor en pesos o como pago de la deuda en dólares, según quién los cargue.
- **Convertir el efectivo en pesos a dólares al cobrar**: lo contado nunca coincide con lo esperado.
- **Una caja solo en dólares**: va contra R-3.
- **Convertir todos los saldos a la principal al leer, sin mostrar la moneda original** (brief, D-7 (b)): esconde lo que de verdad se debe.
- **USDT como moneda**: rompe el `CHECK` de tres letras y la lista de `Intl`. **USDT con su propia cotización** (brief, D-8 (c)): el negocio no la usa.
- **Sumar el precio en pesos a `read-v2`**: cambia la forma de un contrato publicado.
- **Que el `viewer` cobre con la cotización vigente**, como decía el D-10 del brief: contradice el ADR 0022, punto 12, y el código (revisión, R-B1).

## Consecuencias

- **Notas fechadas, sin cambiar su texto**:
  - **ADR 0016, punto 7**: desde este ADR, un proceso nuevo solo sale a internet si un ADR lo autoriza contra el host que nombra; los que ya salen quedan registrados (punto 9);
  - **ADR 0019, punto 3**: «no hay tipos de cambio» deja de valer para los movimientos de dinero; el comprobante sigue con una sola moneda y sus líneas no se convierten; «`organizations` no tiene moneda por defecto» deja de valer para la organización con moneda principal (revisión, R-M11);
  - **ADR 0022**: «la moneda es la de su destino» es la moneda **aplicada**, y la recibida puede ser otra; la moneda aplicada de un movimiento a cuenta sigue la regla del punto 5; la caja cuenta lo recibido; y la frase de la moneda por defecto del punto 8;
  - **ADR 0023, punto 8**: la moneda del pago es la aplicada, y el efectivo sale de la sesión en la moneda pagada (revisión, R-M11);
  - **ADR 0024**: en el **punto 8**, la permuta solo contra una venta en la moneda del valor reconocido; en el **punto 15**, el agente da el precio en pesos desde la 29.8; en el **punto 17**, la 29.4 se divide en tres.
- **DataModel**: una nota de diseño con las tablas y las columnas que vienen, sin crearlas.
- **Overview**: el módulo `fx` y sus dependencias.
- **FunctionalRequirements**: el cobro en otra moneda y el total de referencia de la caja.
- **Roadmap §Fase 29**: la 29.4.2 y la 29.4.3, y la corrección de «la lectura automática de infodolar» (revisión, R-B9).
- **HANDOFF**: la misma corrección.
- **`docs/decisions/README.md`** y el CHANGELOG.
- **Notion**: crear la 29.4.2 y la 29.4.3 en «Esperando», con la autorización del usuario, y corregir la descripción de la 29.3 y la 29.4, que nombran infodolar.

## Riesgos

- **DolarAPI puede cortarse o cambiar** sin aviso. Lo mitigan la falla cerrada, la alerta del heartbeat y la carga manual.
- **El ajuste fijo en pesos se desactualiza** cuando el dólar se mueve: 10 pesos hoy, quizás 20 dentro de unos meses. Lo mitiga que se vea en la pantalla y que el `admin` lo cambie. Si el negocio lo pide, un ajuste en porcentaje se decide con una nota.
- **El valor nacional y el de Córdoba pueden separarse más que el ajuste** en un día de mucho movimiento, y el límite del 10 % no lo detecta. Lo mitigan la carga manual con la fuente en `manual` y la cotización negociada del `admin`.
- **El redondeo**: un cobro en pesos escrito a mano puede dejar unos pesos de redondeo en la caja (punto 5).
- **Un proceso con red y credencial de la base**, por primera vez. Lo acotan el rol sin acceso a tablas, las dos funciones, la credencial propia y la guarda de hosts.

## Revisión independiente

La hizo el 2026-10-18 un agente que no participó del trabajo, con acceso de solo lectura, contra el brief, `CLAUDE.md`, los ADR 0016, 0019, 0022, 0023 y 0024, la documentación de arquitectura, `src/shared/money/`, `src/modules/cash/`, las migraciones 0042 a 0051, `deploy/production/` y las guardas. **Veredicto: R1**, con 21 hallazgos: 2 bloqueantes, 12 medios y 7 bajos. Los centrales se verificaron contra el código antes de aceptarlos:

- solo un `admin` cobra: ADR 0022, l. 282, y `service.ts:1987, 2079, 2466, 3973`;
- la copia externa tiene red: `crm-backup-offsite.service:11-13`;
- la separación de red y credencial: `crm-heartbeat.sh:10-12`;
- `src/shared/money/` rechaza los negativos: `index.ts:17, 112`;
- la regla 1 de `purchasing-dependencies.test.ts:26-32`;
- la moneda del pago: ADR 0023, l. 164 y 167;
- el valor de la permuta «con su moneda»: ADR 0024, l. 237.

| Hallazgo | Severidad | Corrección |
|---|---|---|
| R-B1: un `viewer` «cobra», contra el ADR 0022 y el código | bloqueante | corregido: solo el `admin` registra movimientos (puntos 5 y 11); el D-10 del brief estaba mal |
| R-B2: «la única salida es el heartbeat», y una regla que producción no cumplía | bloqueante | corregido en §Contexto y en el punto 9: la regla es para procesos nuevos, y los que ya salen quedan registrados |
| R-M1: el `CHECK` de cuatro columnas contra la negociada | medio | corregido en el punto 5 |
| R-M2: la moneda aplicada de los movimientos a cuenta | medio | decidida en el punto 5 |
| R-M3: a qué cotización se devuelve | medio | decidido por el usuario el 2026-10-18 con la recomendación (a): la cotización vigente (punto 5) |
| R-M4: la tolerancia de una unidad mínima | medio | precisada en el punto 5: se mide después de redondear |
| R-M5: la precisión con una principal débil; el cero y el máximo | medio | `rate >= 1`, el par fuera de alcance, y la conversión rechaza el cero y el máximo (punto 3) |
| R-M6: la lectura de DolarAPI pasa por `number` | medio | corregido en el punto 4: el texto crudo |
| R-M7: el ajuste negativo no cabe en `src/shared/money/` | medio | corregido en el punto 3: un tipo propio de `fx` |
| R-M8: el dueño de `main_currency` y las dependencias | medio | corregido en los puntos 2 y 13 |
| R-M9: el rol, el heartbeat y la red | medio | corregido en el punto 9 |
| R-M10: faltaban D-12 y alternativas | medio | punto 12 y §Alternativas |
| R-M11: superaciones sin nota (0023 y la moneda por defecto) | medio | encabezado, punto 6 y §Consecuencias |
| R-M12: la carga manual dura hasta 3 horas | medio | corregido en el punto 4: la comparación contra la última automática y la fuente `manual` |
| R-M13: «con movimientos convertidos» era más laxo que el brief | medio | corregido en el punto 2: «con datos» |
| R-B3: el aviso de antigüedad y la primera lectura | bajo | corregido en el punto 4 (`last_confirmed_at`) |
| R-B4: faltaba el horario del local | bajo | corregido en el punto 4 |
| R-B5: la permuta, mal citada | bajo | corregido en el punto 5 |
| R-B6: una cita del runbook que no existe | bajo | corregido en el punto 9 |
| R-B7: las guardas de hosts existentes | bajo | corregido en el punto 9 |
| R-B8: `.claude/settings.json` sin seguimiento | bajo | es la configuración local del entorno; no es parte de la entrega ni va en ningún commit |
| R-B9: dos menciones a infodolar que quedan falsas | bajo | §Consecuencias (Roadmap, HANDOFF y Notion) |

## Lo que este ADR no decide

- Los precios en dos monedas y las listas de precios.
- El recargo de las tarjetas y las cuotas.
- La diferencia de cambio, la revaluación y la contabilidad.
- Un segundo par de monedas por organización, o un par con la moneda principal más débil.
- La forma exacta del contrato del agente de la 29.8.
