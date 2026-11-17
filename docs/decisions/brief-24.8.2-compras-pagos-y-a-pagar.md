---
schema: task-brief.v1
task_id: 24.8.2
task_type: implementation
generated_at: 2026-11-16
---

# Brief 24.8.2 — Compras: pagos y a pagar

- **Estado**: **aprobado por el usuario el 2026-11-16**, con **D-1 a D-8 cerradas en su opción
  (a)**, las ocho tal como estaban escritas. Listo para implementar. La aprobación del alcance no
  alcanza a los efectos externos: commit, push, despliegue y Notion siguen pidiendo autorización en
  el turno (condición de detención 6).
- **Origen**: fila «**24.8.2 Pagos, a pagar, proveedores y técnicos**» de
  [Roadmap.md](../planning/Roadmap.md), §Fase 24. Es la **tercera y última** fila del bloque de
  Abastecimiento, y la **primera de las cinco que quedan sin cerrar** de la fase.
- **Tarea de Notion**: `407702be6f4e816fbc12d5a89286cac7`, en «Esperando». Su descripción anota, de
  la replanificación del 2026-10-28: «panel del pago y filtro por moneda, a pagar con recepciones y
  trabajos separados, ficha del técnico solo para admin. El "Es técnico" del formulario necesita su
  propia decisión (brief-29.6 D-3). Lecturas nuevas: filtros y órdenes por técnico. Sin migraciones.»
- **Láminas**: lote **V2-11**, las cuatro del grupo
  [27-pagos-proveedores](../ui-redesign/v2/27-pagos-proveedores/README.md) —`desktop/01-pagos-detalle-v2.png`
  (pieza 08), `desktop/02-pago-recepcion-conversion-v2.png` (09),
  `desktop/03-cuentas-a-pagar-v2.png` (10) y `desktop/04-pago-a-cuenta-v2.png` (12)— más la
  **tarjeta 4** de `25-compras/estados/04-estados-compras-proveedores-v2.png` («Anular un pago de una
  sesión cerrada»), que **H-3 del [brief-24.8.1](brief-24.8.1-compras-ordenes-y-recepciones.md) ya
  había repartido a esta subfase**. **Las cinco se abrieron para escribir este brief**: la tabla de
  diferencias sale de mirarlas, no de su README.
- **Lo que D-1 propone mandar a una subfase hermana**: las cuatro del grupo
  [28-proveedores](../ui-redesign/v2/28-proveedores/README.md) (piezas 11, 13, 14 y 15), la pieza 07
  de [16-tecnicos](../ui-redesign/v2/16-tecnicos/README.md) y las **tarjetas 5 y 6** de la lámina de
  estados.
- **Contratos de negocio**: [ADR 0023](0023-compras-y-proveedores.md) (puntos 8 a 13),
  [ADR 0025](0025-tipo-de-cambio.md) y los briefs [22.6](brief-22.6-los-pagos-a-proveedores.md),
  [22.7](brief-22.7-la-cuenta-del-proveedor.md), 29.4.3 y 29.6, que construyeron lo que acá se
  redibuja.

## Objetivo

Rediseñar, con la v2 y **sin cambiar ninguna regla de negocio**, las pantallas por las que sale la
plata hacia un proveedor: la **lista de pagos** con su **detalle en un panel por URL** y sus filtros
de proveedor, moneda y estado; las **dos pantallas de registro** —pagar una recepción y pagar a
cuenta—; la **anulación del pago**; y la lista **«A pagar»**, con las recepciones y los trabajos de
técnicos **contados por separado** y los totales por moneda. Son las pantallas **50, 51, 52, 53, 54
y 56** de [Screens.md](../product/Screens.md).

Lo que esta subfase **no** hace: cambiar quién puede pagar, qué se puede pagar, cómo se imputa un
pago, qué pasa con la caja al anularlo ni cómo se convierte una moneda. Todo eso ya está decidido y
corre en producción; acá se redibuja.

## Punto de partida verificado

- **Producción corre `25e006e`** desde el 2026-11-07, con **67 migraciones** y la CI en `success`
  sobre ese SHA exacto. Para volver atrás: `ccb980d`.
- **La Fase 24 lleva veinticinco subfases cerradas en veinticuatro entradas del CHANGELOG**, que
  cubren **veinticuatro de sus 29 filas**. Quedan cinco: esta, la 24.9.1, la 24.9.2, la 24.9.3 y la
  24.10, **ninguna con brief**.
- **El bloque de Abastecimiento lleva cerradas la 24.8.1 y la 24.8.1-b.** Esta fila lo cierra.
- **Las pantallas existen y funcionan**: la lista de pagos y su comprobante desde la **22.6**, la
  cuenta del proveedor y «A pagar» desde la **22.7**, los cargos de los técnicos en la cuenta desde
  la **29.6**, y el pago en otra moneda desde la **29.4.3**. Nada de esto se reimplementa.
- **Medido el 2026-11-16**: el código de pagos, «A pagar» y las dos pantallas de registro suma
  **2.596 líneas en 15 archivos**; el de proveedores, su ficha y su cuenta, **2.346 líneas en 16
  archivos**. **La fila entera son 4.942 líneas en 31 archivos**, más los cuatro archivos de `cash`
  que las dos mitades tocarían (2.002 líneas).

## Las fronteras entre módulos, releídas con `grep`

No alcanza con haberlas leído antes; se volvieron a abrir para este brief
([DataModel.md](../architecture/DataModel.md), líneas 1214-1244 y 1448-1455):

- **`cash` es el dueño del pago a proveedor.** `supplier_payments` vive en `cash` porque el pago en
  efectivo sale de la sesión de caja. **`purchasing` no depende de `cash`** y nunca toma el bloqueo
  de cobros (ADR 0023, punto 11).
- **La cuenta del proveedor no tiene tabla** (ADR 0023, punto 9): `supplierLedger` arma la entrada de
  `imputeAccount`. El tope del pago, la vista previa y lo que falta de una recepción **salen de la
  misma función**. Cualquier cifra que esta subfase dibuje tiene que salir de ahí y no de una cuenta
  propia.
- **La deuda con el técnico la compone `cash` en memoria**: `listTechnicianChargesForAccounts` de
  `service`, sumada a las recepciones en `supplierAccountInput`. **Sin `JOIN` entre módulos** y sin
  tocar `imputeAccount`. `service` no depende de `cash`.
- **Los nombres de los proveedores los trae `purchasing`** (`getSupplierNames`), y la página compone.
  Una fila sin nombre no es de la organización.

**No se encontró ninguna contradicción** entre las láminas y estos documentos que obligue a elevar un
hallazgo de arquitectura. Lo que sí hay son cifras que las láminas dibujan y hoy no existen: están en
H-4 a H-7, con su costo medido.

## Hallazgos que condicionan el alcance

### H-1 · La fila es del tamaño de la 24.8.1 entera, y el corte ya está dibujado

Nueve láminas y **4.942 líneas en 31 archivos**. La 24.8.1 se partió con **nueve láminas y 5.095
líneas en veinticuatro archivos** (su D-1), y la mitad que quedó sola cerró bien. Acá el corte
además **no hay que inventarlo**: los dos README del lote V2-11 ya separan «Pagos y cuentas a pagar»
(cuatro piezas) de «Proveedores, técnicos y estado de cuenta» (cuatro piezas más la 07 del V2-06).
El corte es **por naturaleza**, como el de la 24.7.2: acá la plata que sale, allá la ficha del
proveedor y su cuenta. Es **D-1**.

### H-2 · El panel del pago ya tiene molde probado y desplegado

La 24.7.2-b resolvió exactamente esto para el recibo del cobro: **panel que abre y cierra por la
URL**, sobre el listado, **sin diálogo modal y sin JavaScript**, con la regla de que el panel **vive
en una sola pestaña** y de que **no se dibuja fuera de su listado** aunque se escriba la dirección a
mano; los filtros y la página **se conservan en la URL** mientras el panel está abierto (su D-0b,
D-2 y D-3). La pantalla suelta del comprobante **siguió existiendo**: es la página imprimible. Acá
vale igual, y es lo que **D-2** propone.

### H-3 · El filtro de proveedor de los pagos no puede reusar ninguna de las dos lecturas de opciones que ya existen

`findPurchaseOrderSupplierOptions` devuelve los proveedores **con órdenes**, y
`findGoodsReceiptSupplierOptions`, los que tienen **recepciones** (la 24.8.1-b ya chocó con esto, su
H-6). Las dos viven en `purchasing` y miran tablas de `purchasing`. Los **pagos viven en `cash`**, así
que el filtro de la lámina 08 pide una **tercera hermana**, en `cash` y sobre `supplier_payments`,
que devuelva los proveedores con algún pago. Es **lectura nueva**, y es una de las dos que la fila
anuncia en el Roadmap.

### H-4 · El filtro por moneda no existe, y las monedas del selector tampoco

`listSupplierPayments` recibe hoy `{ status, supplierId, search, page }`: **no hay moneda**. Para
dibujar el selector hace falta además **la lista de monedas con algún pago**, como
`SuppliersOwedPage.currencies` la trae para «A pagar». Es la otra lectura nueva de la fila.

### H-5 · «Estado de la recepción» del panel tiene lectura, pero no es gratis

El panel de la lámina 08 muestra **Monto total · Pagado · Restante** de la recepción del pago.
Existe: `getGoodsReceiptPaymentForm` devuelve `total`, `paid`, `imputed` y `outstanding` de la misma
cuenta que limita el pago. Pero trae además **los medios de pago activos y la oferta de cambio**, que
el panel no usa, y **solo sirve para un pago contra recepción** (a cuenta no hay recepción). Es
**D-3**.

### H-6 · «1 comprobante» y «1 trabajo» no se pueden contar con lo que hay, pero el patrón ya existe

`summarizeSupplierAccount` cuenta `receiptsWithBalance` sobre `account.sales`, y **ahí las
recepciones y los cargos de técnicos ya están mezclados**: `AccountSale` no lleva de qué tipo es. La
lámina 10 los quiere separados. **No hace falta tocar `imputation.ts`**: el estado de cuenta ya
resuelve lo mismo armando afuera un `Map` de `id → { kind, displayNumber }` y leyéndolo al componer
(`statementCurrency`, `supplier-accounts.ts:272-298`). `readOwed` tiene las recepciones y los cargos
a mano y puede hacer lo mismo.

### H-7 · Los totales por moneda de «A pagar» no cuestan una consulta

`listSuppliersOwed` **lee todo, filtra, ordena y pagina en memoria**
(`supplier-accounts.ts:432-480`), y ya calcula el total de referencia sobre la lista filtrada
**entera**, no sobre la página. Sumar por moneda sobre ese mismo arreglo es aritmética sobre datos ya
leídos: **cero consultas nuevas**.

### H-8 · La conversión del pago ya existe, y la moneda que sale se elige con un enlace a propósito

Desde la 29.4.3 se paga en la otra moneda con la cotización vigente o una acordada
(`TenderCurrencyChoice` y `TenderedAmountFields`, en `caja/exchange-fields.tsx`). La lámina 09 la
dibuja como un `<select>` de «Moneda de salida» y dos radios de cotización. **Hoy es un enlace que
recarga**, porque así anda **sin JavaScript**, y **el componente lo comparte el cobro de la venta**:
cambiarlo toca la caja entera, que no es de esta subfase. Queda declarado en la tabla de diferencias
y el archivo **fuera de la lista cerrada**.

### H-9 · Lo que el README del lote 27 ya descarta, y conviene no reimplementar de buena fe

Dicho por el propio README: el **filtro por nombre** en «A pagar», los **agrupamientos nuevos** y un
**acceso global a cuentas con saldo a favor** son «mejoras propuestas, no lecturas garantizadas por
el código actual»; y el render **no muestra una marca de inactivo** en «A pagar» porque la lectura
actual no la suministra —que es exactamente lo que D-7 de la 22.7 ya había decidido—. Nada de eso
entra, y está en la tabla de diferencias para que no vuelva a discutirse.

### H-10 · La anulación de la lámina es un diálogo modal, y el proyecto ya decidió lo contrario tres veces

La tarjeta 4 dibuja «Anular PP-000072» como diálogo con la **X** de cerrar y el motivo **ya
elegido**. El paso `?confirmar=anular` de hoy es el patrón del proyecto (D-3 de la 24.8.1, D-6 de la
24.8.1-b) y el único que anda sin JavaScript; y **el motivo no viene elegido** porque elegir por
quien anula, en una acción que no se deshace, es justamente lo que no se hace (lección de la
24.8.1-b). Se conserva lo de hoy y se adopta de la tarjeta **lo que dice**, no su forma.

## Diferencias con la v2, declaradas antes de implementar

Las cinco láminas se abrieron para esta tabla. **La comparación se hizo a 1.280 px**, y la
verificación de AC-13 vuelve a hacerla **declarando el ancho**, por la lección de la 24.8.1-b: una
comparación sin ancho declarado dejó pasar cuatro defectos.

| # | Lámina | Lo que dibuja | Qué se hace |
|---|---|---|---|
| V-1 | 08, 09, 10, 12 | Barra superior con buscador global, fecha y ciudad, y una navegación lateral con secciones nuevas | **No se adopta**: es el marco de la aplicación, que ninguna subfase de la fase tocó |
| V-2 | 08 | Columnas «Comprobante · Proveedor · Recepción · Fecha y hora · Medio de pago · Monto» y la vigencia en una insignia a la derecha | **Se adopta el orden de la lámina** y la vigencia como **columna «Estado» con texto e ícono**, no como insignia suelta: es lo que decidió la 24.6.2-e para las ventas |
| V-3 | 08 | La columna se llama «Recepción» | **Se conserva «Destino»**: la lámina no dibuja ningún pago a cuenta, y con «Recepción» esa fila queda vacía |
| V-4 | 08 | Flechas de ordenamiento en cada encabezado | **No se adopta**: no hay lectura ordenable por columna, y ordenar necesitaría un parámetro por columna o JavaScript |
| V-5 | 08 | Tres filtros —«Proveedor», «Moneda» y «Vigencia»— y ningún buscador de número | **Se adoptan los tres** —el de proveedor como control, con su lectura nueva (H-3), y el de moneda nuevo (H-4)— y **se conserva el buscador por número**, que hoy existe y la lámina no dibuja. El rótulo sigue siendo **«Estado»** (D-6) |
| V-6 | 08 | El detalle en un panel lateral sobre la lista, con el fondo atenuado | **Se adopta como panel por URL** (D-2), con el molde de la 24.7.2-b. Sin atenuar el fondo: el panel del proyecto no usa capa modal |
| V-7 | 08 | «⋮ Más» en la cabecera del panel | **No se adopta**: un menú así es un *popover* y necesita JavaScript (D-2 de la 24.7.2-b). Las acciones van como enlaces |
| V-8 | 08 | Tres bloques: «Aplicado a la recepción», «Salida registrada» y «Cotización guardada» | **Se adoptan solo cuando el pago tiene conversión**; uno en la misma moneda no tiene qué mostrar (V-06 de la 24.7.2-b) |
| V-9 | 08 | «Estado de la recepción» con Monto total, Pagado y Restante | **D-3** |
| V-10 | 08 | «Nota: No afecta el efectivo de caja» y el recuadro «Este comprobante registra el pago; no ejecuta una transferencia bancaria» | **Se adoptan los dos**, con el texto de hoy para la caja: la sesión si fue en efectivo, o que la caja no cambia |
| V-11 | 09, 12 | «Tipo de pago» y «Método de pago» como `<select>` | **No se adopta**: el medio sigue siendo un grupo de opciones con los activos, donde el efectivo dice «sale de la caja». Son pocos y la elección se ve entera |
| V-12 | 09 | «Moneda de salida» como `<select>` y la cotización como dos radios | **No se adopta la forma**: hoy la moneda que sale se elige con un enlace que recarga, para andar sin JavaScript, y el componente lo comparte el cobro (H-8). `caja/exchange-fields.tsx` queda **fuera de la lista cerrada** |
| V-13 | 09 | Dos columnas: «Datos del pago» y «Tipo de pago» | **Se adopta** en escritorio, una sola columna en el teléfono |
| V-14 | 09 | «Resumen» con «Aplicar a la recepción», «Registrar salida» y «Pendiente después» | **Se adopta con lo propuesto**, y con la ayuda que ya dice que el límite se revalida al confirmar: sin JavaScript las tres cifras no se recalculan mientras se escribe |
| V-15 | 12 | «Vista previa de aplicación del pago», con una fila por comprobante y lo que este pago le aplica | **D-4** |
| V-16 | 12 | Banderas de país por moneda | **No se adopta**: identifica el **código** de la moneda, no la bandera. Lo pide el propio README del lote |
| V-17 | 12 | «Proveedor» como campo deshabilitado | **No se adopta**: el proveedor es el de la URL y ya está en el encabezado |
| V-18 | 10 | Dos tarjetas «Total a pagar» por moneda | **Se adoptan** (H-7: sin consulta nueva) |
| V-19 | 10 | «Cantidad» con «1 comprobante» y «1 trabajo», con ícono distinto | **Se adopta** (H-6) |
| V-20 | 10 | «Ver cuentas con saldo a favor» | **No se adopta**: no hay lectura, y el README lo declara mejora propuesta (H-9) |
| V-21 | 10 | «Ver cuenta» como botón por fila | **Se adopta**, y el nombre sigue enlazando a la cuenta |
| V-22 | 10 | El encabezado «Antigüedad del comprobante» | **Se conserva «Desde»**, con la nota al pie que ya explica qué fecha es |
| V-23 | 10 | La nota «Incluye recepciones vigentes y trabajos reparados de técnicos. El saldo a favor del negocio se consulta en cada cuenta» | **Se adopta** |
| V-24 | 17-4 | La anulación como diálogo modal con **X** | **No se adopta**: sigue el paso `?confirmar=anular` (H-10) |
| V-25 | 17-4 | El motivo ya elegido en «El pago no se hizo» | **No se adopta**: el motivo **no viene elegido** (H-10) |
| V-26 | 17-4 | El aviso de la sesión cerrada en tres frases | **Se adopta el contenido**, con el texto que ya produce `voidCashNote` para cada caso |

## Decisiones

**Las ocho quedaron cerradas en su opción (a) el 2026-11-16**, que era la recomendada en cada una.
Las opciones descartadas se conservan escritas: son el motivo por el que la elegida se eligió.

### D-1 · ¿Se parte la fila? — CERRADA en (a)

- **(a) Sí, y esta subfase toma los pagos y «A pagar»** *(recomendada)*. Proveedores, la ficha del
  técnico y el estado de cuenta pasan a **24.8.2-b**, hermana y no subtarea, como la 24.4.3, la
  24.5.2-b, la 24.6.1-b, la 24.7.2-b y la 24.8.1-b. Motivo medido en **H-1**, y el corte es el que
  los dos README del lote ya trazan.
- **(b)** Hacerla entera: nueve láminas y 4.942 líneas en una subfase, contra dos precedentes de R2
  por exceso de alcance con bastante menos.
- **(c)** Partir en tres, separando «A pagar» de los pagos. No hace falta: «A pagar» son 233 líneas
  y comparte con los pagos la misma cuenta y el mismo módulo.

**Si se aprueba (a)**, al cerrar hay que **renombrar la fila del Roadmap y la tarea de Notion** a
«24.8.2 Compras: pagos y a pagar» y **crear la 24.8.2-b** con el resto, como **tarea** dentro del
proyecto de la Fase 24 y en «Esperando».

### D-2 · El detalle del pago, ¿panel por URL o pantalla suelta? — CERRADA en (a)

- **(a) Panel que abre y cierra por la URL sobre la lista, y el comprobante sigue existiendo como
  pantalla propia e imprimible** *(recomendada)*. Es el molde de la 24.7.2-b (H-2): el panel no se
  dibuja fuera de su listado, conserva filtros y página, y anda sin JavaScript. La pantalla 53 no
  desaparece: es **la página imprimible** del pago (ADR 0023, punto 13), y el panel la enlaza.
- **(b)** Reemplazar la pantalla por el panel. Rompe la impresión del comprobante y un enlace que ya
  existe en la caja, en la cuenta del proveedor y en la lista.
- **(c)** Dejar todo como está. Es la única fila del Roadmap que nombra el panel explícitamente.

### D-3 · ¿El panel muestra «Estado de la recepción»? — CERRADA en (a)

- **(a) Sí, reusando `getGoodsReceiptPaymentForm`, y solo en un pago contra recepción**
  *(recomendada)*. Es la misma cuenta que limita el pago, así que las tres cifras no pueden
  contradecir a la recepción. Se mide con `explain (analyze, buffers)` (AC-11).
- **(b)** Una lectura nueva y más chica, que devuelva solo total, pagado e imputado. Es otra puerta a
  la misma cuenta, y el proyecto ya tiene una.
- **(c)** No mostrarlo. El panel pierde lo único que lo distingue del comprobante.

### D-4 · La vista previa del pago a cuenta (lámina 12), ¿se implementa? — CERRADA en (a)

- **(a) Sí, con la imputación simulada sobre la cuenta de hoy, y con el aviso de que se revalida al
  confirmar** *(recomendada)*. `imputeAccount` ya es una función pura sobre una entrada que
  `supplierLedger` arma: simular el pago es pasarle una entrada con un cobro más. **No cambia ninguna
  regla** y es lo que el README del lote pide decir. Sin JavaScript la previsualización es la del
  monto propuesto, no la del que se está escribiendo.
- **(b)** Conservar la tabla de hoy —lo que se debe y lo que está a favor por moneda— sin
  previsualizar.
- **(c)** Previsualizar con JavaScript al escribir. Rompe el invariante de la fase.

### D-5 · El filtro de proveedor de la lista, ¿control o enlace desde la ficha? — CERRADA en (a)

- **(a) Control, con la lectura nueva de H-3** *(recomendada)*: un `<select>` con los proveedores que
  tienen algún pago, como la 24.8.1 hizo con las órdenes y la 24.8.1-b con las recepciones. El
  enlace desde la ficha del proveedor sigue funcionando igual, porque es el mismo parámetro.
- **(b)** Dejarlo como hoy: un campo oculto que solo se llena viniendo de la ficha. La lámina dibuja
  el control.

### D-6 · «Vigencia», ¿reemplaza a «Estado»? — CERRADA en (a)

- **(a) No: el rótulo sigue siendo «Estado», con «Todos», «Vigentes» y «Anulados»** *(recomendada)*.
  Es el mismo nombre que usan las otras listas de la fase, y la 24.6.2-e lo fijó para las ventas.
- **(b)** Adoptar «Vigencia» como la lámina, y quedar con dos nombres para lo mismo en pantallas
  vecinas.

### D-7 · ¿Dónde se documenta esto en `Screens.md`? — CERRADA en (a)

- **(a) En las secciones que ya existen —50, 51, 52, 53, 54 y 56—, con la nota «*Rediseñada en la
  24.8.2*»** *(recomendada)*, como hicieron la 24.7.2-b y la 24.8.1-b. No se crean secciones nuevas:
  no hay pantallas nuevas.
- **(b)** Una sección nueva para el panel. El panel es una forma de la pantalla 52, no otra pantalla.

### D-8 · El aviso del proveedor inactivo (tarjeta 5), ¿entra acá? — CERRADA en (a)

- **(a) No: va con la ficha del proveedor, en la 24.8.2-b** *(recomendada)*, que es donde se ve y
  donde está «Reactivar proveedor». H-3 de la 24.8.1 ya la había asignado a «24.8.2 (proveedores)».
  Lo que sí entra acá es **que un proveedor inactivo puede recibir pagos**, que ya funciona así.
- **(b)** Adelantarla, y dibujar el aviso en las dos pantallas de pago.

## Alcance

### Incluido

1. **La lista de pagos (pantalla 52)** con la forma de la lámina 08: columnas y orden de la lámina,
   «Estado» como columna con texto e ícono, los filtros de **proveedor** (D-5), **moneda** (H-4) y
   estado, el buscador por número que ya existe, y la paginación de hoy.
2. **El detalle del pago en un panel por URL** sobre esa lista (D-2), con el contenido de la lámina
   08: información general, el detalle con la conversión cuando la hay, el estado de la recepción
   (D-3), la nota de la caja y el aviso de que el comprobante no ejecuta una transferencia. Enlaza
   al comprobante imprimible y a la anulación.
3. **Pagar una recepción (pantalla 50)** con la forma de la lámina 09: la tarjeta de la recepción,
   las dos columnas, el resumen de tres cifras y la ayuda del límite. **Ninguna regla del pago
   cambia.**
4. **Pagar a cuenta (pantalla 51)** con la forma de la lámina 12: la situación por moneda en
   tarjetas, la vista previa de la aplicación (D-4) y el aviso de lo que queda a favor.
5. **La anulación del pago (pantallas 53 y 54)** con lo que dice la tarjeta 4, en el paso
   `?confirmar=anular` de hoy y con el motivo sin elegir.
6. **«A pagar» (pantalla 56)** con la forma de la lámina 10: los totales por moneda (H-7), la
   cantidad separada en comprobantes y trabajos (H-6), «Ver cuenta» por fila y la nota al pie.
7. **Dos lecturas nuevas**, las que el Roadmap anuncia: **los proveedores con algún pago**, para el
   filtro, y **las monedas con algún pago**, para el suyo. Las dos **medidas** (AC-11).
8. **`Screens.md`** actualizado en sus seis secciones (D-7).

### Excluido

- **Las cuatro láminas del grupo 28, la 07 del 16-tecnicos y las tarjetas 5 y 6**: son de la 24.8.2-b
  si D-1 se aprueba en (a). **Ningún archivo de `compras/proveedores/` se toca**, salvo
  `[supplierId]/pagar/page.tsx`, que es una pantalla de pago.
- **La pantalla «Técnicos» de la lámina 07 no existe hoy**, y crearla sería una pantalla nueva, no un
  rediseño. Queda para la 24.8.2-b, con su propia decisión.
- **El marco de la aplicación**: navegación lateral, buscador global y barra superior.
- **`caja/exchange-fields.tsx` y `caja/exchange.ts`**: los comparte el cobro (H-8).
- **`imputation.ts`**: no se toca (H-6).
- **Migraciones, tablas, columnas y contratos nuevos.** Siguen **67** migraciones.
- **El objetivo táctil de 44 px** y **el desbordamiento del `<select>`**, pendientes declarados desde
  la 24.7.1 y la 24.7.2-b: **no se arreglan acá de paso**. Si el `<select>` de esta pantalla se mide
  y está mal, se declara y se deja anotado, como hicieron las dos subfases anteriores.
- **Cualquier módulo o pantalla de ERP fuera de esta fase y de este brief** (CLAUDE.md).

## Lista cerrada de archivos

Tocar algo fuera de esta lista es un hallazgo bloqueante, no una mejora bienvenida. Ampliarla se
**pide antes de implementar**, no después.

| # | Archivo | Para qué |
|---|---|---|
| 1 | `src/app/(autenticado)/compras/pagos/page.tsx` | La lista, los filtros y el panel |
| 2 | `src/app/(autenticado)/compras/pagos/payment-panel.tsx` | **Nuevo**: el panel del pago |
| 3 | `src/app/(autenticado)/compras/pagos/payments-table.tsx` | Columnas y columna «Estado» |
| 4 | `src/app/(autenticado)/compras/pagos/filters.ts` | Moneda y proveedor en la URL |
| 5 | `src/app/(autenticado)/compras/pagos/filters.test.ts` | Sus casos |
| 6 | `src/app/(autenticado)/compras/pagos/messages.ts` | Textos nuevos |
| 7 | `src/app/(autenticado)/compras/pagos/messages.test.ts` | Sus casos |
| 8 | `src/app/(autenticado)/compras/pagos/[paymentId]/page.tsx` | La vuelta a la lista con el panel |
| 9 | `src/app/(autenticado)/compras/pagos/[paymentId]/void-confirm.tsx` | El contenido de la tarjeta 4 |
| 10 | `src/app/(autenticado)/compras/pagos/payment-form.tsx` | Las dos columnas y el resumen |
| 11 | `src/app/(autenticado)/compras/recepciones/[receiptId]/pagar/page.tsx` | Lámina 09 |
| 12 | `src/app/(autenticado)/compras/proveedores/[supplierId]/pagar/page.tsx` | Lámina 12 |
| 13 | `src/app/(autenticado)/compras/a-pagar/page.tsx` | Lámina 10 |
| 14 | `src/modules/cash/supplier-payments.ts` | El filtro de moneda y las dos lecturas nuevas |
| 15 | `src/modules/cash/supplier-payment-repository.ts` | Sus consultas |
| 16 | `src/modules/cash/supplier-accounts.ts` | Totales por moneda y cantidad por tipo |
| 17 | `src/modules/cash/index.ts` | Lo que se exporta |
| 18 | `tests/e2e/supplier-payments.spec.ts` | Panel, filtros y anulación |
| 19 | `tests/e2e/supplier-accounts.spec.ts` | «A pagar» |
| 20 | `tests/integration/supplier-payments.test.ts` | Las lecturas nuevas |
| 21 | `tests/integration/supplier-accounts.test.ts` | Totales y cantidad por tipo |
| 22 | `docs/product/Screens.md` | Secciones 50, 51, 52, 53, 54 y 56 |
| 23 | `docs/planning/Roadmap.md` | La fila, al cerrar |
| 24 | `CHANGELOG.md` | La entrada, al cerrar |
| 25 | `HANDOFF.md` | El estado, al cerrar |
| 26 | `docs/decisions/brief-24.8.2-compras-pagos-y-a-pagar.md` | Este archivo |

## Fuentes de verdad, en orden

1. El código y las migraciones de este repositorio.
2. [DataModel.md](../architecture/DataModel.md), §`supplier_payments`, §`supplier_payment_voids` y la
   nota de la deuda con el técnico.
3. [ADR 0023](0023-compras-y-proveedores.md) y [ADR 0025](0025-tipo-de-cambio.md); los briefs 22.6,
   22.7, 29.4.3 y 29.6; [Roadmap.md](../planning/Roadmap.md) §Fase 24.
4. [Screens.md](../product/Screens.md), secciones 50 a 56.
5. Las láminas y sus README, **para la forma**, no para las reglas.
6. Notion, solo para el estado de la tarea.

## Invariantes

1. **Todo anda sin JavaScript**: las listas, los filtros, el panel, los dos formularios de pago y la
   anulación.
2. **Ninguna regla de negocio cambia**: el tope del pago, la imputación, el efecto en la caja, la
   anulación y la conversión quedan exactamente como están.
3. **Ninguna cifra sale de una cuenta propia**: todo de `supplierLedger` e `imputeAccount`.
4. **Sin `JOIN` entre módulos** y sin que `purchasing` o `service` dependan de `cash`.
5. **Solo `admin`**, también en el servidor: un `viewer` recibe el aviso y **ningún dato**.
6. **Sin migraciones**: siguen 67.
7. **No se suman dos monedas** sin una referencia explícita y su tasa.
8. **Un pago no ejecuta una transferencia**: lo dice la pantalla.

## Criterios de aceptación

| id | Criterio | Evidencia |
|---|---|---|
| **AC-1** | La lista de pagos tiene la forma de la lámina 08: columnas, orden y «Estado» con texto e ícono | e2e |
| **AC-2** | Los filtros de **proveedor**, **moneda** y estado y el buscador por número viven en la URL, se combinan y sobreviven a la paginación | e2e, incluida la URL escrita a mano |
| **AC-3** | El panel del pago **abre y cierra por la URL**, conserva filtros y página, y **no se dibuja fuera de su listado** | e2e |
| **AC-4** | El panel muestra la conversión **solo cuando el pago la tiene**, y el estado de la recepción solo en un pago contra recepción | e2e con un pago convertido y uno simple |
| **AC-5** | El comprobante imprimible **sigue existiendo** y al imprimir queda solo el comprobante | e2e |
| **AC-6** | Pagar una recepción y pagar a cuenta tienen la forma de las láminas 09 y 12, y **ningún rechazo cambia**: monto que excede, caja cerrada, efectivo insuficiente y medio desactivado siguen dando el mismo mensaje | e2e, uno por rechazo |
| **AC-7** | La anulación sigue en `?confirmar=anular`, **con el motivo sin elegir**, y dice qué pasa con la caja en los tres casos | e2e |
| **AC-8** | «A pagar» muestra los totales por moneda y la cantidad separada en **comprobantes** y **trabajos**, y los números cierran contra el estado de cuenta del mismo proveedor | integración + e2e |
| **AC-9** | **Todo anda sin JavaScript**, panel y filtros incluidos | e2e con `javaScriptEnabled: false` |
| **AC-10** | Un `viewer` recibe el aviso y **ningún dato** en las seis pantallas, también por URL directa | e2e + integración |
| **AC-11** | **Las dos lecturas nuevas medidas** con `explain (analyze, buffers)`, y declarado si alguna recorre toda la tabla | medición pegada en el §Cierre |
| **AC-12** | **Sin migraciones nuevas**: siguen 67 | la cuenta de los archivos de migración |
| **AC-13** | **Comparación entrada por entrada con las cinco láminas abiertas**, declarando **a qué ancho** se hizo y cubriendo **al menos un ancho entre el quiebre de la tabla y el `max-width` del contenedor** | tabla de diferencias en el §Cierre |
| **AC-14** | **Reflujo medido dentro de las tarjetas**, no solo del documento: a **320, 375, 1.280, 1.440, 1.536 y 1.680 px**, comparando cada fila contra su contenedor | el caso de `goods-receipts.spec.ts` replicado acá |
| **AC-15** | axe sin violaciones A ni AA en cada pantalla y con el panel abierto | `expectAccessible` |
| **AC-16** | La batería completa en CI sobre el **SHA exacto**, leída por `headSha`, con «Corre todo: true» | la corrida de CI citada |
| **AC-17** | **Revisión independiente** de un agente que no participó, contra este brief y contra las reglas vigentes | informe con veredicto |
| **AC-18** | Despliegue con las **siete verificaciones del runbook** y **recorrido del usuario** | journal y la palabra del usuario |

## Mediciones requeridas

1. **La lectura de proveedores con pagos** (H-3) y **la de monedas con pagos** (H-4): `explain
   (analyze, buffers)`, con el plan pegado.
2. **`getGoodsReceiptPaymentForm` desde el panel** (D-3), si se aprueba en (a): cuánto cuesta abrir
   el panel contra no abrirlo.
3. **El reflujo dentro de las tarjetas** en los seis anchos de AC-14, midiendo con
   `getBoundingClientRect` en el navegador y **no razonando sobre la captura** (lección de la
   24.8.1-b).

## Condiciones de detención

El implementador **para y reporta**, sin seguir, cuando:

1. Una decisión **D-1 a D-8 no está aprobada** y el trabajo la necesita.
2. Haría falta **un archivo fuera de la lista cerrada**. Se pide **antes** de tocarlo.
3. Aparece la necesidad de una **migración, una tabla, una columna o un contrato nuevo**.
4. Una lectura nueva **recorre toda una tabla** y la medición lo muestra.
5. Una lámina **contradice** un ADR, un brief aprobado o `Screens.md`: se documenta la discrepancia y
   se eleva, **nunca se resuelve en silencio**.
6. Antes de **commit, push, despliegue, cambios en Notion** o cualquier efecto externo: cada uno
   necesita autorización del usuario **en el turno**.

## Nivel de validación objetivo

**Validado en staging**, y solo con AC-18 cumplido. Hasta el despliegue y el recorrido del usuario el
nivel es **validado en integración**, y **un nivel superior nunca se infiere de uno inferior**.

## Ubicación en la fase

- **Necesario ahora**: las seis pantallas con la forma de la v2 y las dos lecturas nuevas. Cierran,
  con la 24.8.2-b, el bloque de Abastecimiento.
- **Requisito antes de producción**: nada de esta subfase lo es por sí solo; la Fase 24 entera es
  rediseño sobre lo que ya corre.
- **Mejora posterior**: el filtro por nombre y los agrupamientos de «A pagar», el acceso a cuentas
  con saldo a favor y la marca de inactivo en «A pagar» (H-9); el objetivo táctil de 44 px, que tiene
  subfase propia pendiente.

## Cierre

*Escrito el 2026-11-16 con el trabajo implementado y verificado localmente, y **completado el
2026-11-17**, cuando la CI corrió la batería entera sobre el SHA exacto, la subfase se desplegó con
las siete verificaciones del runbook y el usuario hizo el recorrido. **Nivel alcanzado: validado en
staging.** No es «preparado para producción»: eso pide además seguridad, observabilidad, backups
probados, vuelta atrás ejercitada y limitaciones aceptadas, y **un nivel superior nunca se infiere
de uno inferior**. Esta sección es **una autoevaluación**; la revisión independiente es AC-17 y está
más abajo.*

### Alcance real contra la lista cerrada

**27 archivos, +3.070/−359** en el commit `8c35914`, contando los dos nuevos: `payment-panel.tsx`
(354 líneas) y este brief; **sin el brief son 26 archivos, +2.470/−359**. *Corregido el 2026-11-17,
al escribir el cierre*: esta línea decía «+2.116/−359» **diciendo que contaba los dos nuevos**, y
ese número era el `git diff --stat` de los 25 archivos ya versionados, que justamente los deja
afuera. Lo encontró `git show --stat` contra el commit al escribir el cierre, que es lo que la
regla pide hacer, y no una relectura de la frase. Son los 26 de la lista cerrada más **tres ampliaciones, pedidas y autorizadas en su turno
antes de tocar los archivos**:

| Archivo | Por qué entró |
|---|---|
| `tests/e2e/exchange.spec.ts` | Sus casos afirmaban textos de la pantalla de pago que la lámina 09 cambia: sin tocarlo, la forma nueva rompía una spec ajena |
| `tests/guards/purchasing-dependencies.test.ts` | La regla 3 exige registrar en `SNAPSHOT_READS` toda lectura nueva del libro mayor, y hay dos |
| `tests/integration/organization-isolation.test.ts` | El aislamiento por organización se prueba lectura por lectura: dos lecturas nuevas, dos casos nuevos |

Ningún archivo fuera de esa lista y esas tres ampliaciones. `.claude/settings.json` figura sin
versionar **desde antes de esta subfase**: se declara y no se toca.

### La revisión independiente (AC-17)

Veredicto **R1 con diez hallazgos** —dos bloqueantes, cuatro no bloqueantes y cuatro notas— de un
agente que no participó del trabajo, con acceso de solo lectura, contra este brief y contra las
reglas vigentes. **Los diez se verificaron contra el código antes de aceptarlos, y los diez eran
ciertos.** La revisión no otorgó ninguna autorización.

| Hallazgo | Qué era | Qué se hizo |
|---|---|---|
| **B-1** (bloqueante) | `Screens.md` §50 decía «**«Registrar salida» no se adopta**» mientras el código dibuja la cifra y V-14 la da por adoptada: tres documentos en contradicción, que ninguna prueba puede ver | El documento era el viejo —la cifra se restauró al implementar V-14—: §50 ahora dice las **tres** cifras y **cuándo** aparece «Registrar salida» |
| **B-2** (bloqueante) | El barrido de AC-14 recorría **cinco** pantallas y dejaba afuera `/compras/a-pagar`, la única que estrena tarjetas y columna | «A pagar» agregada: **seis** pantallas por seis anchos. Falló, y encontró un defecto real (abajo) |
| **N-3** | AC-9 nombra los filtros y la anulación, y sin JavaScript solo se probaban el panel y el pago | Caso nuevo sin JavaScript: el filtro de proveedor por GET y la anulación entera |
| **N-4** | AC-6 pide un caso por rechazo y faltaban dos: caja cerrada y medio desactivado | Caso nuevo con los dos; el segundo desactiva el medio con el formulario ya dibujado |
| **N-5** | §51 nombraba «Aplicación del pago propuesto» —que es el rótulo de la región, no el título— y «Trabajo de técnico» donde la celda dice «del técnico» | Los dos textos corregidos |
| **N-6** | `AMOUNT` tenía el punto **sin escapar**, así que «12345» pasaba el filtro y llegaba a `moneyFromDatabase`, que lanza en vez de devolver `VALIDATION_ERROR` | Punto escapado |
| **Nota 7** | Un `?pago=` que no resuelve dejaba 24 rem de columna vacía: la grilla la reserva aunque el panel no dibuje nada | La fila pasa de `grid` a `flex`: sin panel, la lista ocupa el ancho entero |
| **Nota 8** | En una recepción **anulada** el panel mostraba «Restante $ 0,00» sin decir por qué, y se lee al revés | El panel lo dice: lo pagado quedó a favor en la cuenta del proveedor |
| **Nota 9** | El estado vacío de «A pagar» hablaba solo de recepciones, y V-23 suma los trabajos de técnicos | Texto corregido |
| **Nota 10** | `messages.test.ts` citaba V-6 donde la decisión es V-10 | Cita corregida |

La revisión confirmó limpios, además: la lista cerrada sin desvíos más allá de las tres
ampliaciones, las invariantes 3, 4, 5 y 7, D-3 y D-4, los recuentos exactos y el aislamiento por
organización.

### El defecto que destapó el barrido

Al agregar «A pagar» al barrido (B-2), **falló**, y el defecto no era el que se esperaba: a 320 px
el documento pedía **673 px** mientras la tarjeta de la tabla medía **288** y desplazaba bien.
Medido elemento por elemento en el navegador, el culpable era el `sr-only` de «Ver cuenta de
{proveedor} en {moneda}», el texto que **V-21 agrega en esta subfase**: `sr-only` es
`position: absolute`, **ningún ancestro dentro de la tabla está posicionado**, y entonces su bloque
contenedor es el documento. El `sr-only` se escapa del contenedor que desplaza y estira la raíz.
Se corrigió con `relative` en esa tarjeta: los tres `sr-only` de adentro —ese, el de «Acciones» y
el `caption`— se miden ahora contra ella.

**La lección es del instrumento, no del defecto**: una tarjeta que desplaza no garantiza que el
documento no desborde, porque un hijo `absolute` no respeta el contenedor de desplazamiento si
nada en el camino está posicionado. Y lo único que lo hizo visible fue agregar la pantalla al
barrido: con las cinco de antes, la batería daba verde.

### Las tres mediciones

**1. Las dos lecturas nuevas (AC-11).** Con **5.000 pagos y 40 proveedores**, `explain (analyze,
buffers)` sobre PostgreSQL real:

- `findSupplierPaymentSupplierIds` (con `limit 51`): `Limit → HashAggregate → Bitmap Heap Scan`
  sobre `supplier_payments`, por `supplier_payments_session_idx`, `Buffers: shared hit=96`,
  **0,99 ms**.
- `findSupplierPaymentCurrencies`: `Sort → HashAggregate → Bitmap Heap Scan`, el mismo índice,
  `Buffers: shared hit=96`, **0,93 ms**.

**Ninguna recorre toda la tabla**: las dos entran por el índice de organización y ningún plan tiene
`Seq Scan`. Agregan sobre las filas de **una** organización, que es lo que el filtro necesita.

**2. El recuento de sentencias.** `toEqual([4, 13, 5])` en los tres casos, con el número fijado
antes de mirar: las pantallas nuevas no agregan consultas por fila.

**3. El reflujo dentro de las tarjetas (AC-14).** Seis pantallas por seis anchos (320, 375, 1.280,
1.440, 1.536 y 1.680), midiendo con `getBoundingClientRect` en el navegador —no razonando sobre una
captura— y comparando cada hijo contra la caja de su tarjeta, más el `scrollWidth` del documento.

### AC-13: la comparación con las láminas, declarando el ancho

Hecha **a 1.280 px y a 1.152 px**. El segundo es el que pide el criterio: está entre el quiebre de
la tabla (`lg`, 1.024) y el `max-width` del contenedor. Además de las diferencias declaradas antes
de implementar (V-1 a V-26) y de las ocho encontradas al implementar, las capturas agregan seis:

| Lámina | Diferencia | Qué se hace |
|---|---|---|
| 10 | **Corrige una nota anterior**, que decía que el «Total de referencia» no se adopta | Lo que no se adopta es **la tarjeta de la lámina** con su equivalencia. La pantalla **sí** muestra el total de referencia, con la línea propia que tiene desde la 29.4.3 (D-6), y esta subfase no lo tocó. En la captura no se ve porque con una sola moneda no se dibuja |
| 10 | **«Ver cuentas con saldo a favor»** arriba a la derecha | **No se adopta**: esa vista no existe, y el saldo a favor se consulta en cada cuenta, que es lo que dice la nota al pie que sí se adoptó |
| 10 | La columna se llama **«Antigüedad del comprobante»** | Se conserva **«Desde»**, explicado al pie |
| 08 y 10 | El filtro de **moneda** se dibuja siempre | Se muestra solo con **más de una moneda** (o cuando ya está filtrado): un `<select>` de una opción no decide nada |
| 12 | Los campos van en **una fila arriba** | Se usan **las dos columnas de la lámina 09**, para que las dos pantallas de pago se lean igual |
| 08 | El panel va **encima** de la lista, que queda entera y atenuada | Es una **columna** (V-6, D-2). Medido: con el panel abierto la tabla muestra tres de sus siete columnas a 1.152 px y cuatro a 1.280, y el resto se alcanza **desplazando la tarjeta**, que es el comportamiento del molde de la 24.7.2-b. El ancho del panel se alineó con ese molde: **22 rem**, no 24 |

### Criterios de aceptación

| id | Veredicto | Evidencia |
|---|---|---|
| **AC-1** | **Cumplido** | `supplier-payments.spec.ts`: columnas, orden y «Estado» con texto e ícono |
| **AC-2** | **Cumplido** | Filtros combinados en la URL, escrita a mano incluida, y sobreviviendo a la paginación |
| **AC-3** | **Cumplido** | El panel abre y cierra por la URL, conserva el filtro, y un `?pago=` que no resuelve no dibuja nada |
| **AC-4** | **Cumplido** | Un pago convertido y uno simple: la conversión solo en el primero; el estado de la recepción, solo contra recepción |
| **AC-5** | **Cumplido** | El comprobante sigue siendo pantalla propia, y al imprimir queda solo él |
| **AC-6** | **Cumplido** | Los **cuatro** rechazos con su mensaje de siempre; los dos que faltaban los trajo N-4 |
| **AC-7** | **Cumplido** | `?confirmar=anular`, motivo sin elegir, y la caja dicha en los tres casos |
| **AC-8** | **Cumplido** | Totales por moneda y cantidad separada en comprobantes y trabajos, cerrando contra el estado de cuenta |
| **AC-9** | **Cumplido** | Sin JavaScript: panel, pago, **filtros y anulación** |
| **AC-10** | **Cumplido** | Un `viewer` recibe el aviso y ningún dato, también por URL directa |
| **AC-11** | **Cumplido** | Las dos mediciones de arriba, con sus planes |
| **AC-12** | **Cumplido** | **67** archivos en `drizzle/`, los mismos |
| **AC-13** | **Cumplido** | La comparación de arriba, a 1.280 y 1.152 px |
| **AC-14** | **Cumplido** | Seis pantallas por seis anchos; encontró un desbordamiento real, corregido y vuelto a medir |
| **AC-15** | **Cumplido** | `expectAccessible` sin violaciones A ni AA, en claro y oscuro, con el panel abierto |
| **AC-16** | **Cumplido** | Corrida **43991289978** en `success` sobre `8c35914`, leída por `headSha`, con «Corre todo: true» |
| **AC-17** | **Cumplido** | La revisión de arriba, con sus diez hallazgos verificados y aplicados |
| **AC-18** | **Cumplido** | Desplegada en `8c35914` el 2026-11-17, con las siete verificaciones pasadas y el recorrido hecho sin observaciones |

### Evidencia determinista

Contra PostgreSQL real de desarrollo, el 2026-11-16, **después** de aplicar las correcciones:

- **Unidad**: 1.317 pruebas en 123 archivos.
- **Guardas**: 920 en 33 archivos.
- **Integración**: 1.936 en 115 archivos, en una sola corrida.
- **e2e**: las **57** del tramo que contiene todas las specs que tocan estas pantallas —
  `supplier-payments` (12), `supplier-accounts` (3), `exchange` (11), y `cash`, `receipts`,
  `refunds` y `accounts` (31)—.

**Declarado con precisión**: la batería e2e completa corrió en esta máquina **antes** de aplicar
los diez hallazgos; después de aplicarlos se repitieron acá las 57 de arriba, que son las que tocan
lo que cambió. **La batería entera sobre el código final la corrió CI** sobre `8c35914`
(AC-16): 1.317 de unidad, 1.936 de integración y **392 e2e en 23,2 min**. Los 392 son los 390 de
antes más los dos casos que trajeron los hallazgos N-3 y N-4.

### Desvíos y correcciones de forma

- **El panel pasa de 24 rem a 22 rem**, el molde de la 24.7.2-b que D-2 manda copiar. Lo vio la
  comparación con capturas, no una prueba.
- **La fila de la lista pasa de `grid` a `flex`**, para que un `?pago=` que no resuelve no reserve
  una columna vacía.
- **Ninguna decisión del usuario se aflojó y ningún archivo salió de la lista cerrada.**

### Instrumento temporal, declarado

Las capturas de AC-13 salieron de un archivo de pruebas escrito para esto y **borrado después**: no
está en la entrega, no corre en CI y no es evidencia por sí mismo. Lo que vale es la comparación
que permitió y el defecto que destapó, los dos escritos acá.

### El despliegue y el recorrido (AC-18)

**Desplegada en `8c35914` el 2026-11-17**, con el procedimiento de `deploy/production/README.md`:
el SHA anterior —`25e006e`— anotado antes de tocar nada, el build desacoplado del `ssh` en un
script del servidor, el servicio detenido durante el build, el heap en 1.536 MB y el arranque
decidido por el `BUILD_ID`. **Sin migraciones nuevas: siguen 67**, así que la vuelta atrás es solo
de código.

**Las siete verificaciones del runbook, pasadas:**

| # | Verificación | Resultado |
|---|---|---|
| 1 | La configuración desplegada es la versionada | **18 de 18** archivos idénticos |
| 2 | Un solo salto de proxy, medido por consecuencia | El intento directo dejó la clave **igual** a la de la IP del operador; el control desde el droplet dejó **otra**. Dos filas en la ventana, las dos explicadas, ninguna es `sha256('sin-proxy')` |
| 3 | HSTS | Presente sobre HTTPS, ausente sobre HTTP, que redirige con `301` |
| 4 | La aplicación solo en loopback | `127.0.0.1:3000` |
| 5 | El rol no es el dueño | `crm_app_login` ≠ `crm_owner`, con `INSERT=t`, `DELETE=f` y `UPDATE=f` |
| 6 | Ingestión y API de lectura | Las tres responden **401** desde afuera, que es lo que corresponde estando encendidas para `agente-demo` |
| 7 | Ningún dato real de cliente | La organización real en **0/0/0**; las otras dos son de demostración |

**La verificación 2 engaña en la primera lectura, y conviene dejarlo escrito.** El runbook dice
«la primera fila tiene que ser de recién», y la primera fila era la del **control desde el
droplet**, corrido después del intento directo: comparada contra la IP del operador daba
«distintos», que leído rápido es exactamente la forma que tendría un salto de proxy de más. Lo que
decide es comparar **fila por fila**, no la primera: la del intento directo coincide y la del
control no, que es lo que el paso busca. **Ni la IP ni su hash se escriben en ningún lado.**

**El recorrido del usuario, el 2026-11-17: sin observaciones.** Es el instrumento que más rinde en
este proyecto —el de la 24.8.1-b encontró cuatro defectos visuales que ni la revisión independiente
ni las cuatro mediciones habían visto—, y esta vez no encontró nada.

### Lo que queda, y lo que esto no certifica

Queda la actualización de Notion y el commit del cierre, **cada uno con su autorización en su
turno**. Y **no** se certifica como «preparado para producción»: el nivel es **validado en
staging**.
