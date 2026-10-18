---
schema: task-brief.v1
task_id: "29.3"
task_type: design
generated_at: 2026-10-18
---

# Brief 29.3 — ADR del tipo de cambio

- **Contrato**: `task-brief.v1`
- **Tipo de tarea**: `design`. El resultado es un ADR, el **0025**, y las enmiendas que ordene. No hay código, migraciones, dependencias ni cambios en la forma de ningún contrato.
- **Nivel de evidencia objetivo**: ninguno de ejecución.
- **Nivel de validación alcanzable**: diseñado.
- **Orden**: tercera subfase de la Fase 29 — Rubros, abierta el 2026-10-18. El usuario la eligió ese día antes que la 29.2 («vamos con la 29.3»). Es solo diseño, así que no necesita el negocio confirmado (brief-29.1, D-16). En Notion, la tarea `3fd702be6f4e81e6be67d96777e7abc1` está en «En proceso» desde el 2026-10-18.
- **Origen**: el [ADR 0024](0024-rubros-y-capacidades.md) deja al 0025 cuatro cosas: la moneda principal (U-2), la cotización, la moneda del cobro (H-10) y la lectura de infodolar (H-11, U-3).
- **No abre ni cierra un gate.** Pero **supera en parte dos ADR aceptados del núcleo** (0019, punto 3; 0022, la moneda del cobro), así que la revisión independiente se hace (D-14).
- **Estado de este documento**: **aprobado el 2026-10-18** por el usuario, con las recomendaciones de D-1 a D-14, **salvo la fuente de D-4**, que el usuario cambió ese mismo día (§Decisión del usuario sobre la fuente).

## Decisión del usuario sobre la fuente (2026-10-18)

Al aprobar el brief, el usuario decidió **no conectar con infodolar**: pidió una API de dólar y **sumarle 10 pesos** para aproximar el blue de Córdoba. Cambia D-4 y D-13.

**La API recomendada: [DolarAPI](https://dolarapi.com/docs/argentina/), `GET https://dolarapi.com/v1/dolares/blue`, campo `venta`.** Leída el 2026-10-18:

- responde `{"moneda":"USD","casa":"blue","compra":1535,"venta":1555,"fechaActualizacion":"2026-10-18T14:57:00.000Z"}`;
- **sus condiciones de uso están publicadas** ([Uso de los datos](https://dolarapi.com/docs/uso)): se puede consultar la API y usar las respuestas; una publicación que use los datos cita «DolarApi https://dolarapi.com»; no hay un máximo de consultas, pero **sugiere una consulta cada 3 horas por serie** y guardar una copia local;
- **su aviso legal** ([Aviso legal](https://dolarapi.com/docs/legal)) no garantiza la exactitud ni la vigencia, y puede cambiar o cortar el servicio sin aviso;
- el código es MIT; la licencia de las series de terceros no cambia.

Se descartaron [Bluelytics](https://api.bluelytics.com.ar/v2/latest) (da el mismo blue, venta 1.555, pero su última actualización era del viernes 16 a las 19:45 y no publica condiciones de uso) y [Dolarito](https://www.dolarito.ar/solicitud-acceso-api) (paga).

**El ajuste de 10 pesos, medido una vez**: el mismo día, infodolar mostraba el blue de Córdoba a **1.571** y DolarAPI el nacional a **1.555**. **La diferencia fue de 16 pesos, no de 10.** Es una sola observación, de un domingo con los valores del viernes, y no alcanza para fijar un número. Por eso el ajuste **es un dato de la organización, en pesos, que un `admin` cambia** desde la pantalla de la cotización, y **arranca en 10**, como pidió el usuario.

**Cómo queda D-4**:

- **La fuente automática es DolarAPI, blue, venta, más el ajuste de la organización.** La fila de la cotización guarda el valor de la fuente, el ajuste y el resultado, para que se vea de dónde salió.
- **El lector sigue siendo un servicio aparte**, con su timer, que solo sale a `dolarapi.com`. Consulta **cada 3 horas** en el horario del local, como sugiere DolarAPI, y no cada 30 minutos.
- **Falla cerrada**, como antes: si la API no responde, cambia de forma, o el valor se mueve más de un 10 % contra el último, no guarda nada y avisa por el heartbeat.
- **La carga manual sigue disponible** y es la vigente hasta la próxima lectura que cambie.
- **Atribución**: la pantalla de la cotización dice «Fuente: DolarApi (dolarapi.com) + ajuste».
- **Ya no hace falta un permiso de infodolar**: la 29.4.2 se puede hacer sin esa condición.

## Objetivo

Decidir con el ADR 0025 **cómo el CRM trabaja con una moneda principal y cobra en otra**:

- qué es la moneda principal de una organización y qué cambia con ella;
- qué es una cotización, de dónde sale y cómo se guarda;
- cómo se cobra en pesos una venta en dólares, y cómo se devuelve, se paga a un proveedor o se paga un usado en otra moneda;
- qué pasa con la caja, que guarda billetes de cada moneda, cuando «todo se lleva en dólares»;
- si el CRM puede leer un servicio externo, y cómo lee infodolar;
- qué ve el agente;
- qué crea cada subfase siguiente.

El ADR **no crea tablas**. Las crea la 29.4.

## Lo que se verificó antes de escribir este brief

Releído el 2026-10-18 contra `main` (`97e438b`). Un relevamiento de solo lectura del código, hecho ese día, citó cada punto con archivo y línea.

- **El ADR 0019, punto 3**: un comprobante tiene una sola moneda, la de su primera línea, y «**no hay tipos de cambio**». La alternativa del tipo de cambio cargado a mano se descartó porque «nadie lo pidió» (l. 136). `organizations` no tiene moneda por defecto (l. 82).
- **El ADR 0022**: «**la moneda es la de su destino**» (l. 90); la caja es por moneda y lo esperado de una moneda nunca se suma con el de otra (l. 204-210).
- **El ADR 0024**:
  - R-2: el negocio publica y cobra en USD, y acepta pesos al dólar blue de Córdoba, precio de venta, de infodolar.com;
  - R-3: efectivo en USD o ARS, transferencia en ARS, tarjetas y USDT, combinados en una misma venta;
  - U-2: el dólar es la moneda fuerte, todo se lleva en dólares, también la caja, aunque se cobre en pesos;
  - U-3: la cotización se lee de infodolar automáticamente, no se carga a mano;
  - punto 15: hasta el 0025, el agente da el precio en la moneda del producto y no convierte.
- **El ADR 0016, punto 7**: «el CRM sigue sin producir efectos externos salvo que un ADR lo decida». **No habla de leer** un servicio externo (ADR 0024, H-11).

### El código

- **La moneda va en cada fila**: `currency text NOT NULL` con `CHECK (currency ~ '^[A-Z]{3}$')` en precios, costos, pedidos, ventas, cobros, devoluciones, caja, órdenes de compra, recepciones y pagos (migraciones 0017 a 0051). La lista de monedas aceptadas es la de `Intl`, sin las de tres decimales (`src/shared/money/index.ts:23-50`). **No hay tabla de monedas.**
- **El dinero**: `numeric(14, 2)` en la base y `bigint` en centésimos en TypeScript (`src/shared/money/index.ts:7-12`), nunca `number`. El redondeo es por línea, con el medio hacia afuera del cero (`src/shared/lines/line-total.ts:12-64`).
- **`organizations`** tiene solo `id`, `name`, `timezone` y las fechas (`src/modules/organizations/schema.ts:12-25`).
- **El cobro copia la moneda de su destino en el servicio, no en la base**:
  - `createSaleReceipt` inserta `currency: sale.currency` (`src/modules/cash/service.ts:2037`), y `createOrderReceipt`, la del pedido (l. 2146);
  - el cobro a cuenta va en la moneda que se elija (l. 3868-3911);
  - **`imputeAccount` lanza `InconsistentAccount`** si un cobro está en otra moneda que su venta (`src/modules/cash/imputation.ts:110-116`);
  - **ningún trigger** compara la moneda del cobro con la de la venta o el pedido.
- **La cuenta del proveedor reutiliza `imputeAccount`**: las recepciones hacen de ventas y los pagos de cobros (`src/modules/cash/supplier-payments.ts:124-180`). El pago copia la moneda de la recepción (l. 373).
- **La caja**: el inicial y el cierre se guardan por `(session_id, currency)` (`drizzle/0042_cash.sql:29, 49`), lo esperado se calcula por moneda (`src/modules/cash/totals.ts:56-124`) y el cierre exige contar cada moneda con movimientos (`src/modules/cash/service.ts:782-806`).
- **Las cuentas y las listas** (deudores, a pagar, estados de cuenta) son por moneda, sin conversión. `analytics` no suma dinero.
- **El agente**: `read-v1` y `read-v2` exponen el precio como `{amount, currency}` (`src/app/api/read/v1/contract.ts:104-109`; `read/v2/contract.ts:13-21`).
- **Salidas a internet**: el servidor no hace ninguna llamada HTTP saliente. La única la hace `deploy/production/crm-heartbeat.sh` (Healthchecks.io) desde un servicio de systemd con `DynamicUser`, con su URL en un archivo de entorno del servidor. `crm-backup.service` corre con `IPAddressDeny=any`. Hay guardas de las direcciones permitidas (`tests/guards/heartbeat-urls.test.ts`, `deployment-hostnames.test.ts`).
- **Tareas programadas**: no hay cron dentro de la aplicación. Las que existen son timers de systemd (`crm-backup.timer`, `crm-restore-check.timer`).

### infodolar.com, leído el 2026-10-18

- La página del dólar en Córdoba (`/cotizacion-dolar-provincia-cordoba.aspx`) muestra «Precio Dólar Blue en Córdoba» con **compra $ 1.539,00 y venta $ 1.571,00**, actualizada el «viernes, 16 de octubre de 2026 18:01». **El 18 es domingo**: el fin de semana muestra el último valor del viernes.
- Muestra también un promedio de casas de cambio y cotizaciones por entidad, que no son el blue.
- **No ofrece una API.** La página y el pie no tienen términos de uso ni condiciones de acceso automático; la dirección `/terminos-y-condiciones.aspx` da 404. Tiene un formulario de contacto. Dice que las cotizaciones tienen «**carácter orientativo**».
- **Que se permita leerla de forma automática no está verificado**: no hay términos que lo digan, ni a favor ni en contra.
- **Otras fuentes**: DolarAPI.com es una API pública con licencia MIT que da un blue nacional, **sin el de Córdoba**. Dolarito tiene una API paga. Ninguna da el valor que el negocio usa.

### Hallazgos

- **H-1. Nada dice cuál es la moneda de una organización.** «Todo en dólares» necesita un dato nuevo en `organizations`. Una organización sin ese dato tiene que seguir como hoy (ADR 0024, invariante del núcleo).
- **H-2. Cobrar en otra moneda rompe la imputación, no solo una regla escrita.** `imputeAccount` suma cobros y ventas de la misma moneda, y lanza un error si no coinciden. La cuenta del proveedor usa la misma función. El cobro en pesos de una venta en dólares tiene que llegar a la imputación **ya convertido**, o la cuenta corriente de clientes y la de proveedores dejan de cerrar.
- **H-3. Los billetes de la caja no cambian de moneda.** U-2 pide «todo en dólares, también la caja». Pero los pesos que entran a la caja siguen siendo pesos al contarlos. Convertirlos al cobrar haría imposible el arqueo, porque lo contado nunca coincidiría con lo esperado. Hace falta separar **lo que se cuenta** (por moneda, como hoy) de **lo que se informa** (en dólares).
- **H-4. La cotización necesita más precisión que el dinero.** `numeric(14, 2)` y los centésimos no alcanzan para cotizaciones como 0,00064 (ARS a USD) y no sirven para 1.571,00 multiplicado sin perder centavos. Hace falta un tipo propio y una regla de redondeo, sin pasar nunca por `number`.
- **H-5. Leer infodolar sería la primera salida a internet de la aplicación**, y desde una página sin API ni términos. Cualquier cambio de su HTML rompe la lectura. Leer una página mal puede guardar un valor equivocado sin que nadie lo note, y un valor equivocado cobra mal.
- **H-6. USDT no es una moneda para el CRM.** El `CHECK` exige tres letras y la lista de `Intl` no lo tiene. El negocio lo toma como dólares.
- **H-7. El fin de semana la cotización no se mueve**, y la del viernes sigue siendo la que el negocio usa. Una regla de «cotización vencida» por horas trabaría el sábado.
- **H-8. Cada movimiento de dinero en otra moneda tiene el mismo problema**: el cobro, la seña, el cobro a cuenta, la devolución, el pago a un proveedor y, desde la 29.7, el pago de un usado. Una regla que sirva solo al cobro de una venta deja los demás para otro ADR.

## Decisiones

Cada una trae una recomendación. El usuario la aprueba, la cambia o la rechaza.

### D-1 — Qué decide el ADR y qué no

**Recomendada**:

- **Entran**: la moneda principal; la cotización y su historial; el movimiento de dinero en otra moneda que su destino; la caja; USDT; la fuente automática y la carga manual; lo que ve el agente; los roles; las subfases.
- **No entran**:
  - convertir los precios de los productos: el precio sigue en una sola moneda (ADR 0019, punto 3);
  - **un comprobante con líneas en dos monedas**: sigue rechazado;
  - las listas de precios, los descuentos y **el recargo de las tarjetas**, que el negocio todavía no sabe (R-3);
  - la diferencia de cambio contable, la revaluación y la contabilidad;
  - otros pares que no sean USD y ARS, salvo que el diseño no los impida;
  - cambios en el agente o en su repositorio.

### D-2 — La moneda principal (H-1, U-2)

- **(a) Recomendada**: **un dato opcional de la organización, `main_currency`**, de las monedas aceptadas.
  - **Sin moneda principal, nada cambia**: es el CRM de hoy.
  - **Con moneda principal**:
    - los formularios la proponen primero (precios, compras, cobro a cuenta, caja);
    - las cuentas, la caja y las listas suman además un **total de referencia en la moneda principal**, convertido con la cotización vigente y marcado como tal;
    - los cobros y pagos en otra moneda se convierten a la del documento (D-5).
  - **Quién la fija**: quien opera el CRM, con un script auditado, como las capacidades (ADR 0024, punto 2). No hay pantalla. Cambiarla con datos no se permite.
- (b) Una capacidad `multi_currency` sin moneda principal. No dice a qué convertir los totales.
- (c) Cambiar todos los montos a USD. Los pesos que entran de verdad se pierden.

### D-3 — La cotización (H-4)

- **(a) Recomendada**: **una tabla de cotizaciones por organización, de solo inserción**, con:
  - el par: la moneda principal y la otra (por ejemplo `USD` y `ARS`);
  - **una sola cotización por par**, la que el negocio usa para cobrar: en este caso el **blue de Córdoba, precio de venta** (R-2). No hay compra y venta separadas;
  - el valor como «cuántas unidades de la otra moneda vale una de la principal» (1 USD = 1.571 ARS), en `numeric(18, 6)`, mayor que cero;
  - el origen (`manual` o la fuente automática), quién la cargó si fue manual, la fecha que dice la fuente y la fecha en que se guardó;
  - **la vigente es la última guardada**. No se edita ni se borra: una corrección es otra fila.
- **En TypeScript**: un tipo propio, con el valor escalado como `bigint`, **nunca `number`**, y una sola función de conversión con el redondeo del ADR 0019 (a los decimales de la moneda de destino, con el medio hacia afuera del cero).
- (b) Compra y venta separadas. El negocio cobra con una sola (R-2); la otra queda sin uso.
- (c) Una cotización global, compartida por las organizaciones. Rompe el aislamiento: cada negocio puede usar otra fuente o corregirla.

### D-4 — De dónde sale la cotización (H-5, H-7, U-3)

- **(a) Recomendada**: **la lectura automática de infodolar, con la carga manual siempre disponible.**
  - **Quién lee**: un **servicio aparte del de la aplicación**, en un timer de systemd, como el heartbeat: con `DynamicUser`, sin acceso a la base salvo para insertar cotizaciones, y que solo sale a `www.infodolar.com`. **La aplicación web no sale a internet.** Esto es lo que el ADR 0025 autoriza, y nada más: **leer**, nunca escribir afuera (ADR 0016, punto 7).
  - **Cuándo**: cada 30 minutos en el horario del local. Si el valor no cambió, no guarda una fila nueva.
  - **Falla cerrada**: si la página no responde, cambia de forma, o el valor no es un número, o se mueve más de un **10 %** contra el último guardado, **no guarda nada** y avisa por el heartbeat. Una lectura dudosa nunca reemplaza a la vigente.
  - **El fin de semana** (H-7) sigue vigente el último valor, con su fecha visible. **No hay vencimiento que bloquee**: la pantalla del cobro muestra la cotización y de cuándo es, y **avisa si tiene más de 24 horas hábiles**.
  - **La carga manual** la hace un `admin` desde una pantalla, en cualquier momento, y pasa a ser la vigente hasta la próxima lectura que cambie. Sirve de respaldo y para corregir.
  - **Qué fuente usa cada organización** es configuración de la organización (`manual` o `infodolar_cordoba_blue`), por script, como la moneda principal.
  - **Riesgo aceptado, a confirmar por el usuario**: infodolar no publica términos ni una API, y dice que sus valores son orientativos. El ADR lo registra. **Se recomienda pedirle permiso a infodolar por su formulario de contacto antes de la 29.4.2** (D-13); si lo niega, la organización queda en `manual`.
- (b) Solo carga manual. Es lo más seguro y lo más simple, pero va contra U-3.
- (c) DolarAPI.com. Tiene API y licencia, pero no da el blue de Córdoba: el negocio cobraría con otro valor que el que mira.
- (d) Que la aplicación lea infodolar al abrir el cobro. Pone una página de terceros en el camino de cada cobro, y un error de red bloquea la caja.

### D-5 — Cobrar o pagar en otra moneda que el documento (H-2, H-8, H-10)

- **(a) Recomendada**: **el movimiento guarda dos montos: lo que se recibió y lo que se aplica.**
  - Un cobro guarda **la moneda y el monto recibidos** (por ejemplo 157.100 ARS), **la cotización usada** (la fila de D-3) y **el monto aplicado en la moneda del destino** (100,00 USD).
  - **El monto aplicado se calcula una vez, al registrar, y se guarda**: recibido dividido por la cotización, redondeado a los decimales del destino. Nunca se recalcula con otra cotización.
  - **La imputación usa el monto aplicado** (H-2). `imputeAccount` no cambia de reglas: recibe montos en la moneda de la venta, como hoy.
  - **La caja usa el monto recibido**: 157.100 ARS entran a los pesos de la sesión.
  - **Los topes se miden con el aplicado**: no se cobra más de lo que falta en la moneda de la venta.
  - **La pantalla ayuda**: muestra lo que falta en la moneda del documento y su equivalente en la otra con la cotización vigente («faltan USD 100,00 = ARS 157.100»).
  - **El `admin` puede escribir otra cotización para ese movimiento** (una negociada), que se guarda como manual y solo para él. El `viewer` usa la vigente.
  - **Si la organización no tiene moneda principal**, el movimiento va en la moneda del destino, como hoy.
  - **Alcance**: la misma regla para **el cobro de una venta, la seña, el cobro a cuenta, la devolución, el pago a un proveedor y el pago de un usado** (H-8). Cada uno la implementa en su subfase, pero el ADR la fija una vez.
  - **La anulación** devuelve lo mismo que entró: el monto recibido a la caja y el aplicado a la cuenta, sin cotización nueva.
- (b) Cobrar en la moneda del documento y registrar el cambio como un movimiento de caja aparte (compra de pesos). Dos operaciones por cobro, y la caja tendría que «vender dólares» que nunca entraron.
- (c) Guardar solo el monto recibido y convertir al leer. La cuenta de un cliente cambiaría cada vez que se mueve el dólar.

### D-6 — La caja (H-3, U-2)

- **(a) Recomendada**: **se cuenta por moneda, se informa en la principal.**
  - **El arqueo no cambia**: cada moneda se cuenta por separado, porque los billetes no cambian de moneda (ADR 0022, punto 8).
  - **La pantalla de la caja suma un total en la moneda principal**, con la cotización vigente y su fecha, marcado «de referencia». Lo mismo el cierre y el historial de sesiones.
  - **El total de referencia no se guarda**: se calcula al leer. El cierre guarda lo contado por moneda, como hoy.
  - Así, «todo en dólares» se cumple en lo que el negocio mira (U-2), y el arqueo sigue siendo exacto.
- (b) Convertir el efectivo en pesos a dólares al cobrar. Lo contado nunca coincide con lo esperado.
- (c) Una caja solo en dólares que rechaza el efectivo en pesos. Va contra R-3.

### D-7 — Las cuentas y las listas

- **(a) Recomendada**: **la deuda queda en la moneda del documento, y el total de referencia en la principal.**
  - La cuenta de un cliente con ventas en USD y cobros en ARS queda **en USD**, porque cada cobro se aplicó en USD (D-5).
  - Un saldo que ya esté en otra moneda (una venta vieja en ARS) sigue en su moneda, y la ficha suma el total de referencia en la principal.
  - La lista de deudores y la de «a pagar» suman la columna de referencia.
- (b) Convertir todos los saldos a la principal al leer, sin mostrar la moneda original. Esconde lo que de verdad se debe.

### D-8 — USDT (H-6, R-3)

- **(a) Recomendada**: **un medio de pago, no una moneda.** «USDT» es un medio activo de la organización, que no es efectivo, y su cobro va **en USD, uno a uno**. No entra a la caja.
- (b) Una moneda `USDT`. Rompe el `CHECK` y la lista de `Intl`, y el negocio no lo trata como una moneda aparte.
- (c) USDT con su propia cotización contra el USD. El negocio no la usa.

### D-9 — Lo que ve el agente

- **(a) Recomendada**: **el precio en la moneda del producto, y además en la otra moneda con la cotización vigente y su fecha**, en el contrato nuevo del rubro de la 29.8. El agente presenta el valor en pesos como **«a la cotización de hoy», orientativo**.
  - `read-v1` y `read-v2` **no cambian**.
  - La conversión la hace el CRM, no el agente.
- (b) Sumar el precio en pesos a `read-v2`. Cambia la forma de un contrato publicado.
- (c) Que el agente lea infodolar. Pone la regla del negocio fuera del CRM.

### D-10 — Roles

**Recomendada**:

- **Un `admin`** carga una cotización, escribe una negociada en un movimiento (D-5) y ve el historial de cotizaciones.
- **Un `viewer`** ve la cotización vigente y su fecha, y cobra con ella. No la cambia.
- La cotización es pública: no hay nada que inferir de ella (comparar con el R-1 de la 22.1).

### D-11 — Qué supera y qué no

**Recomendada**:

- **Supera en parte el ADR 0019, punto 3**: «no hay tipos de cambio» deja de valer para los movimientos de dinero. **El comprobante sigue teniendo una sola moneda** y las líneas siguen sin convertirse.
- **Supera en parte el ADR 0022**: «la moneda es la de su destino» pasa a ser **la moneda aplicada**; la recibida puede ser otra.
- **Supera el ADR 0024, punto 15**: el agente da el precio en pesos desde el contrato de la 29.8.
- **Precisa el ADR 0016, punto 7**: leer una fuente externa no es un efecto externo, pero solo lo hace el proceso que un ADR autoriza, contra el host que nombra.
- Cada uno recibe una **nota fechada**, sin cambiar su texto.

### D-12 — Datos y retención

**Recomendada**: las cotizaciones no son datos personales. Se conservan sin límite, como los precios, porque cada movimiento apunta a la suya.

### D-13 — Qué crea cada subfase

**Recomendado**. Ajusta el punto 17 del ADR 0024, que tenía una sola 29.4:

| Subfase | Crea |
|---|---|
| **29.4 — El tipo de cambio** | `main_currency` y la fuente en la organización, la tabla de cotizaciones, la carga manual y el historial, la conversión como función pura con sus propiedades, el cobro de una venta, la seña y el cobro a cuenta en otra moneda, su anulación, y los totales de referencia de la caja y las cuentas |
| **29.4.2 — La lectura de infodolar** | el servicio aparte con su timer, la lectura con falla cerrada, el aviso por el heartbeat y la guarda de hosts. **Solo con el permiso de infodolar o la decisión del usuario con fecha** (D-4) |
| **Cada subfase que mueva dinero** | la regla de D-5 para su movimiento: la devolución y el pago a un proveedor en la 29.4 si caben, si no en una 29.4.3; el pago de un usado en la 29.7 |

### D-14 — Revisión independiente y cierre

**Recomendada**:

- **Revisión independiente**: sí, antes de pedir la aceptación, porque supera dos ADR del núcleo. La hace un agente de solo lectura contra:
  - este brief y `CLAUDE.md`;
  - los ADR 0016, 0019, 0022, 0023 y 0024;
  - DataModel, Overview, el Roadmap y `deploy/production/README.md`;
  - `src/shared/money/`, `src/shared/lines/`, `src/modules/cash/` (`service.ts`, `imputation.ts`, `totals.ts`, `supplier-payments.ts`, `supplier-accounts.ts`), `src/app/api/read/` y las guardas de `tests/guards/`.
- **Cuándo cierra**: con el ADR aceptado o rechazado y sus enmiendas escritas, con fecha y conservando el texto anterior. Como mínimo:
  - notas en los ADR 0016, 0019, 0022 y 0024;
  - DataModel: una nota de diseño, sin tablas;
  - FunctionalRequirements: la caja y el cobro (FR-CAJ);
  - el Roadmap §Fase 29, con la 29.4.2;
  - `docs/decisions/README.md`, el CHANGELOG y el HANDOFF.

## Supuestos

Respuestas del usuario del 2026-10-18 (ADR 0024, R-2, R-3, U-2 y U-3), **no confirmadas por el negocio**:

1. Se cobra con **una sola cotización**, el blue de Córdoba, venta.
2. **El negocio no negocia** la cotización caso por caso, salvo excepciones (por eso la negociada es solo del `admin`, D-5).
3. **USDT se toma uno a uno** con el dólar.
4. La moneda principal es el **USD**.

Si el negocio opera distinto, la decisión afectada se revisa con una nota fechada.

## Alcance incluido

- `docs/decisions/0025-tipo-de-cambio.md`, nuevo, y este brief.
- Con el ADR aceptado, las enmiendas de D-14.
- En el cierre: `CHANGELOG.md`, `HANDOFF.md` y la tarea de Notion.

## Alcance excluido

- **Código, migraciones, tablas, dependencias, servicios de systemd y cambios en la forma de un contrato.**
- **Cualquier lectura automática de infodolar**: el ADR la diseña, no la ejecuta. Leer la página para este brief fue una consulta puntual, a mano.
- Escribirle a infodolar: lo hace el usuario, si lo decide.
- El recargo de las tarjetas, las listas de precios y la contabilidad.
- Cambios en el agente o en su repositorio.

## Fuentes de verdad

- `CLAUDE.md`.
- ADR 0016, 0019, 0022, 0023 y 0024.
- DataModel §Reglas de diseño, §`organizations`, §`product_prices`, §la caja y los cobros.
- `deploy/production/README.md` §heartbeat.
- El código citado en §Lo que se verificó.

## Invariantes

1. **Ninguna tabla nueva** en esta subfase.
2. **Una organización sin moneda principal se comporta como hoy.**
3. **Un comprobante tiene una sola moneda**, y sus líneas no se convierten.
4. **El dinero y la cotización nunca pasan por un `number`.**
5. **Un monto aplicado no se recalcula**: guarda la cotización con la que se calculó.
6. **El arqueo cuenta billetes por moneda**: lo esperado y lo contado nunca se convierten.
7. **La aplicación web no sale a internet.** Solo el proceso que autorice el ADR, contra el host que nombre, y solo para leer.
8. **Lo que se lee de afuera nunca reemplaza a la vigente si es dudoso.**
9. **El agente no registra cobros ni pagos** (ADR 0016, punto 5) y no lee costos.

## Criterios de aceptación

- **AC-1**: el ADR 0025 responde de D-2 a D-13, cada una con la decisión, las alternativas descartadas con su motivo y las consecuencias.
- **AC-2**: el ADR fija cómo un cobro en otra moneda llega a la imputación sin cambiar sus reglas (H-2), y cómo llega a la caja sin romper el arqueo (H-3).
- **AC-3**: el ADR fija la precisión y el redondeo de la cotización y de la conversión, sin `number` (H-4).
- **AC-4**: el ADR fija qué proceso lee una fuente externa, contra qué host, cómo falla y qué pasa si la fuente no está (H-5, H-7).
- **AC-5**: el ADR fija la regla de D-5 para todos los movimientos de dinero de H-8, aunque cada uno se implemente en su subfase.
- **AC-6**: el ADR dice qué supera de los ADR 0019, 0022 y 0024 y qué precisa del 0016, con notas fechadas y sin enmendar su texto.
- **AC-7**: hay una revisión independiente antes de pedir la aceptación, con cada hallazgo verificado contra el código o el documento citado.
- **AC-8**: con el ADR aceptado, las enmiendas están escritas, fechadas, conservan el texto anterior y no contradicen al ADR.
- **AC-9**: el usuario acepta o rechaza el ADR.

## Pruebas y evidencia requerida

No hay ejecución. La evidencia es documental: el ADR, la revisión independiente con sus hallazgos verificados y los diffs de las enmiendas.

## Condiciones de detención

Detenerse y avisar si:

- el ADR necesita crear una tabla, cambiar la forma de un contrato con el agente, o enmendar el texto de un ADR aceptado o una prohibición de `CLAUDE.md`. Una nota fechada no es enmendar el texto;
- una decisión obliga a cambiar las reglas de `imputeAccount` o el arqueo, en lugar de darles montos ya convertidos;
- una decisión necesita que la aplicación web salga a internet;
- una decisión depende de cómo opera el negocio y no se puede dejar como supuesto;
- hace falta tocar un archivo fuera del alcance.

Pedir autorización explícita, en su turno, **antes de**:

- cualquier commit;
- actualizar Notion más allá del estado de la 29.3 (por ejemplo, crear la 29.4.2).

## Resultados

### El ADR

`docs/decisions/0025-tipo-de-cambio.md`, escrito el 2026-10-18 con la decisión del usuario sobre la fuente. Nivel: diseñado.

### Revisión independiente (D-14, AC-7)

La hizo el 2026-10-18 un agente que no participó del trabajo, con acceso de solo lectura. **Veredicto: R1**, con 21 hallazgos (2 bloqueantes, 12 medios y 7 bajos). Los centrales se verificaron contra el código antes de aceptarlos (ADR 0025, §Revisión independiente). Los 21 se resolvieron: 20 corregidos en el ADR y uno, R-M3, decidido por el usuario con la recomendación (a). **Las correcciones no tuvieron una segunda revisión independiente**: su verificación es autoevaluación.

**Desvíos del brief**:

- **D-10 estaba mal**: decía que un `viewer` cobra con la cotización vigente, contra el ADR 0022, punto 12, y el código. El ADR lo corrige: solo un `admin` registra movimientos de dinero (R-B1).
- **H-5 y §Lo que se verificó decían que el heartbeat era la única salida a internet**: la copia externa de los backups y certbot también salen (R-B2).
- **D-4**: la fuente cambió por decisión del usuario; el lector consulta a las 9, 12, 15, 18 y 21 y compara contra la última automática (R-M12).
- **D-13**: suma la 29.4.3, y la 29.4.2 ya no espera un permiso de infodolar.

## Cierre

- **2026-10-18**: el usuario **aceptó el ADR 0025** con las correcciones de la revisión, y decidió R-M3: la devolución usa la cotización vigente. AC-9 cumplido.
- **Enmiendas escritas ese día, con fecha y conservando el texto anterior** (AC-8):
  - notas en los ADR 0016, 0019, 0022, 0023 y 0024;
  - DataModel: la nota de diseño del tipo de cambio, sin tablas;
  - Overview: el módulo `fx`;
  - FunctionalRequirements: FR-CAJ-09;
  - el Roadmap §Fase 29, con la corrección de infodolar y la 29.4.2 y la 29.4.3;
  - el README de decisiones, el CHANGELOG y el HANDOFF.
- **Notion**: la 29.3 en «Completado». Crear la 29.4.2 y la 29.4.3 y corregir las descripciones que nombran infodolar queda **pendiente de la autorización del usuario** (§Condiciones de detención).
- **Nivel**: diseñado. No hay código, tablas, migraciones, servicios ni cambios en ningún contrato.
- **Revisión**: la del ADR fue independiente. La verificación de las correcciones y de las enmiendas es autoevaluación.
- **Siguiente**: el brief de la 29.2 o el de la 29.4. Los dos construyen, así que necesitan el negocio confirmado o una decisión explícita del usuario con fecha (brief-29.1, D-16).
