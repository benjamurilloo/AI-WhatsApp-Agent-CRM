# Brief 24.6.2-b — Ventas: listado, ficha y comprobante

- **Subfase**: 24.6.2-b de la Fase 24 ([Roadmap](../planning/Roadmap.md), tabla de la Fase 24).
- **Tipo de tarea**: `implementation`.
- **Estado**: **aprobado por el usuario el 2026-11-02**, con el corte de D-1. **Implementado el
  2026-11-03** (`15a0365`), con la CI en verde sobre ese SHA. **Revisado por un agente
  independiente el 2026-11-03**: veredicto **R2**, un bloqueante de alcance y nueve hallazgos más,
  todos verificados contra el código y aplicados; están en §AC-19. *Corregido el 2026-11-03*: esta
  línea decía «Nada implementado todavía» y seguía diciéndolo en el commit que lo implementaba.
  **Desplegada en producción el 2026-11-03 en `b39ec5d`**, con las siete verificaciones del
  runbook pasadas, y **recorrida por el usuario** el mismo día (AC-20). **Subfase cerrada**: los
  veinte criterios cumplidos.
- **Fecha**: 2026-11-02.
- **Láminas**: 01, 03 y 05 del lote [V2-09](../ui-redesign/v2/20-ventas/README.md). **La 04 y el panel de cobro de la 03 no entran** (D-1).

## Objetivo

Rediseñar **`/ventas`** y **`/ventas/[saleId]`** con las láminas 01 y 03 de la v2, y cerrar la 05: el
listado con la situación de cobro y el origen de cada venta, la ficha en pestañas por URL, y el
comprobante imprimible verificado contra su lámina. **Ninguna regla de la emisión, del cobro ni de la
anulación cambia**: cambia qué se ve y por dónde se llega.

## Punto de partida verificado

Medido el 2026-11-02 sobre el código, no supuesto:

| Qué | Estado real |
|---|---|
| `/ventas` (`page.tsx`, 355 líneas) | **No importa nada de `cash`.** No hay columna de cobros ni contadores. |
| `/ventas/[saleId]` (`page.tsx`, 506 líneas) | **Sin pestañas.** Una sola página con todo, y ya es el comprobante imprimible. |
| El comprobante (lámina 05) | **Ya existe y ya imprime.** La ficha tiene las clases `print:*` del proyecto y el comentario de cabecera dice «al imprimir queda solo él». `PrintButton` llama `window.print()`. |
| `/ventas/[saleId]/cobrar` | Ruta aparte, **1.052 líneas** en cinco archivos (`page`, `receipt-form`, `sale-receipts-section`, `actions`, `messages`). |
| `/ventas/[saleId]/anulacion` | Ruta aparte, 250 líneas, ya con estilos de impresión. |
| Lo cobrado de **una** venta | `getSaleReceipts(context, saleId)` de `cash`, **una venta por llamada**, y la ficha ya la compone así. Por dentro `readSaleStanding` hace **unas 6 consultas**. |
| Lo cobrado de **un lote** de ventas | **No existe.** `cash` no expone ninguna lectura por lote de ventas: lo más cercano, `listSalesForAccounts`, va en la dirección contraria (la usa `cash` para la lista de deudores). |
| El número de la orden de servicio de una venta | **No existe ninguna lectura.** `src/modules/service/index.ts` exporta 9 funciones y **ninguna recibe un `saleId`**. |

### Las fronteras entre módulos, releídas con `grep` el 2026-11-02

Esto no se da por incorporado: se reabrió `docs/architecture/Overview.md` y `DataModel.md` y se buscó
con `grep`, como exige el procedimiento, **aunque se hubieran leído la misma tarde**.

- **`sales` no depende de `cash`**, y el Overview dice por qué y cómo se resuelve: «lo cobrado en el
  detalle de la venta **lo compone la página**». La dirección es `cash → sales`.
- **`sales` no conoce `service`.** `DataModel.md:1441` es explícito: «**`sales` no conoce `service`**:
  la orden apunta a la venta». `service_orders.sale_id` es una FK a `sales` y es `UNIQUE`. Lo vigilan
  las guardas `service-dependencies` y `service-writes`.
- **Ningún módulo depende de `cash`.**

De ahí sale, sin margen, que **las tres lecturas nuevas las compone la página** y ninguna puede
resolverse con un `JOIN` entre módulos. Es la misma frontera que la 24.5.3 pagó con 300 ms a 10.000
productos y declaró como pendiente.

## Hallazgos que condicionan el alcance

### H-1 · La columna de cobros es un `N+1` de 150 consultas si se escribe de la forma obvia

La lámina 01 pide una columna de cobros y contadores por situación. Lo único que hay hoy es
`getSaleReceipts`, de **una** venta, con unas **6 consultas** por llamada. Una página de **25** filas
resuelta llamándola por fila son **~150 consultas**. No es una hipótesis: es el costo del único
camino que existe.

Hace falta **una lectura por lote en `cash`**, y la fila del Roadmap ya lo pide medido («Cobro y
origen en la lista, **con medición**»). Es el mismo riesgo que la 24.6.1 tuvo con la columna
«Resumen» y resolvió demostrando que no era un `N+1`.

### H-2 · El origen de una venta de reparación exige una lectura nueva en `service`, y está detrás de una capacidad

La lámina 01 pide que «las ventas de reparaciones **deben indicar su orden de servicio** cuando el
módulo componga ese contexto, sin tratar todo *Sin pedido* como mercadería de mostrador». Hoy el
listado solo puede distinguir **mostrador** de **pedido**, porque es lo que `sales` sabe.

`service_orders.sale_id` existe, es `UNIQUE` y apunta a la venta; pero `sales` **no puede leerlo**.
La lectura es nueva, vive en `service`, la compone la página, y **solo tiene sentido con la capacidad
`repairs` encendida**: sin ella no hay órdenes de servicio y la lectura no debe ni ejecutarse.

El molde existe: `service/technician-charges.ts` es una lectura de `service` que consume otro módulo.

### H-3 · La lámina 05 está casi hecha, y eso cambia el tamaño de la subfase

Al escribir la primera versión de este brief supuse que el comprobante era una ruta nueva, por
analogía con `/usados/[tradeInId]/comprobante`. **Es falso**: la ficha de la venta ya es su
comprobante y ya tiene los estilos de impresión del proyecto. Lo que la lámina 05 agrega es que el
**panel de situación de cobro no se imprima** —y ese panel lo construye la lámina 03—, más la
comparación visual.

Queda anotado como hallazgo y no como nota al pie, porque es exactamente la clase de afirmación que
la revisión de la 24.6.2 encontró once veces: texto escrito desde el plan y no desde el código.

### H-4 · Mover el cobro a un panel es la mitad del volumen de la subfase

La lámina 03 dibuja el cobro **dentro de la ficha**, en panel, con la permuta. Hoy es una ruta aparte
de **1.052 líneas en cinco archivos**, con reglas que no son de presentación: el tope del saldo, el
tope de lo disponible del usado, la misma moneda, la sesión de caja abierta **en la moneda que
entra**, la recomprobación al confirmar y el rechazo que conserva lo cargado.

### H-5 · El recuento de specs, hecho antes de tocar nada, saca cinco specs y un componente de la lista

Lo manda la §Lista cerrada de archivos de este brief, y el resultado **cambió el alcance antes de
escribir una línea**. Medido el 2026-11-02 con `grep` sobre `tests/` y sobre el código:

**Todo el dinero de la ficha sale de un solo componente que la lista no nombraba**:
`ventas/[saleId]/cobrar/sale-receipts-section.tsx`, **301 líneas**, importado **solo** por la ficha
pese a vivir bajo `cobrar/`. Rinde cinco piezas: lo cobrado y lo que falta, «A devolver» y
«Devuelto», «Cuenta del cliente» con «Devolver saldo a favor», el enlace al usado de la permuta, y
las dos tablas —«Cobros de la venta X» y «Devoluciones de la venta X»—. Es la forma que el vault
tiene anotada como «A Shared Component Falls Outside a File Allowlist Written Per Screen».

**Y siete casos de cinco specs afirman sobre esas piezas desde `/ventas/<id>`**, con la ficha en una
sola página. Al mandarlas a la pestaña «Cobros», se ponen rojas:

| Spec | Casos | Qué afirma hoy en la ficha |
|---|---|---|
| `tests/e2e/receipts.spec.ts` | 2 | «Sin cobros.» y la región «Cobros de la venta V-000001» |
| `tests/e2e/refunds.spec.ts` | 2 | «A devolver», «Devuelto», el enlace «Devolver» y la región «Devoluciones de la venta V-000001» |
| `tests/e2e/accounts.spec.ts` | 1 | «Cuenta del cliente: debe» y «Devolver saldo a favor» |
| `tests/e2e/order-receipts.spec.ts` | 1 | «Imputado desde la cuenta del cliente» |
| `tests/e2e/trade-in-payments.spec.ts` | 1 | el enlace «PU-000001» de la permuta |

`tests/e2e/sales.spec.ts`, la única spec que la lista tenía, **no aporta ninguno de los siete**: sus
casos del listado y del comprobante ya estaban previstos.

**D-4 ubicaba una de las cinco piezas** —«Cobros»— y dejaba sin lugar las otras cuatro.

**Recontado al implementar: eran trece casos, no siete.** El recuento previo se hizo buscando los
textos del dinero, y por eso quedó corto. Lo que faltaba:

- **La historia de la venta**, que también se va a una pestaña —«Actividad»—, y que el recuento no
  miró porque no es dinero: **cuatro casos** de `sales.spec.ts`, que ya estaba en la lista.
- **«Incluye la seña del pedido P-000001»**, un texto del dinero que el filtro no tenía.
- **Un segundo caso** de `trade-in-payments.spec.ts` con el mismo enlace al usado.

El reparto final, medido corriendo la batería contra el código nuevo: **trece casos rojos**, de los
cuales **cuatro en `sales.spec.ts`** —que la lista ya tenía— y **nueve en las cinco specs de
afuera**. La decisión del usuario no cambia: son las mismas cinco specs y el mismo componente. Lo
que cambia es el número, y queda corregido acá en vez de repetido.

**Se preguntó al usuario antes de implementar**, como manda la regla sin excepción por tamaño, y
decidió el 2026-11-02 **extender la lista con los seis archivos**: la pestaña «Cobros» se lleva las
cinco piezas y los siete casos pasan por la pestaña. Queda en la tabla de la §Lista cerrada.

**Recontado una tercera vez, con la batería completa: son dieciséis casos de ocho specs.** El recuento
de trece se midió corriendo **solo las specs que la lista ya nombraba**, que es la misma raíz que el
vault tiene anotada desde la 24.6.1-b: acotar la verificación a lo que uno tocó. La batería entera,
corrida el 2026-11-03 contra el código nuevo, agregó dos archivos:

| Spec | Casos | Qué afirmaba, y desde cuándo |
|---|---|---|
| `tests/e2e/exchange.spec.ts` | 2 | El detalle del cobro en la ficha al volver de `/cobrar` (brief-21.3) |
| `tests/e2e/units.spec.ts` | 1 | El clic directo en «Anular venta», que AC-7 mandó adentro de «Más» (brief-20.4) |

**`exchange.spec.ts` no se toca**: los dos casos los arregla la página, en H-7. **`units.spec.ts`
sí**, y lo autorizó el usuario el 2026-11-03: una línea que abre «Más» antes del clic, la misma que
`sales.spec.ts` ya tenía.

**Y una cuarta vez, por el arreglo del tercero: son diecisiete casos de nueve specs.** La segunda
corrida de la batería —361 pasados, 2 rojos— puso en rojo `receipts.spec.ts:197` y
`repairs.spec.ts:350`, los dos por lo mismo: `getByText("Cobrada")` sin acotar pasó a matchear
**dos** elementos. Con `?cobro=` abriendo «Cobros» (H-7), el badge del encabezado —que D-4 pide
igual en las tres pestañas— convive con la fila «Falta» de la tabla de dinero, que al no faltar nada
dice la palabra en vez de un importe. `receipts.spec.ts` ya estaba en la lista; **`repairs.spec.ts`
se agregó el 2026-11-03, autorizado por el usuario**. Se barrieron las specs por los cinco textos
del encabezado —«Vigente», «Anulada», «Pendiente», «Parcial», «Cobrada»— y no hay más casos: los
otros los acota su propia región o su propia tabla.

*Corregidos los dos números el 2026-11-03*, por la revisión independiente (MAYOR-1). Decían
**quince** y **dieciséis**, y los dos estaban corridos en uno, por dos errores distintos:

- El tercer recuento sumó mal: 13 + `exchange.spec.ts` (2) + `units.spec.ts` (1) son **16**, no 15.
- El cuarto contó **dos** casos nuevos donde había **uno**. `receipts.spec.ts:197` cae **dentro**
  del caso que empieza en `receipts.spec.ts:148` y termina en el 231, y ese caso ya estaba contado
  entre los dos de `receipts` del segundo recuento. El único caso nuevo es el de `repairs`.

Que el cuarto recuento «cerrara» (15 + 1 = 16) fue una coincidencia de los dos errores: el total
venía corrido en uno y el delta estaba inflado en uno. Las nueve specs sí eran nueve. Y la ironía
está anotada a propósito: **el recuento del que esta subfase sacó una lección metodológica estaba
mal sumado**, y lo encontró contando sobre los archivos quien no había participado.

La lección es del recuento, no del arreglo: **un recuento de specs afectadas no está cerrado hasta
que corre la batería entera**, y **el arreglo de un recuento abre el siguiente**. Las tres veces que
quedó corto, se había buscado dentro del subconjunto que ya se conocía.

## Diferencias con la v2, declaradas antes de implementar

### V-1 · El IMEI enmascarado de la ficha no se puede cumplir

La lámina 03 muestra el IMEI enmascarado en la ficha (`…2403`) y completo en el comprobante. **El
enmascarado del IMEI está fuera de la Fase 24 y sin subfase asignada**, por decisión del usuario del
2026-10-31, y necesita un ADR porque toca el modelo de seguridad ([Roadmap](../planning/Roadmap.md),
nota después de la tabla de la Fase 24; [brief-24.5.2](brief-24.5.2-unidades-panel-historial-y-filtros.md),
P-1). La ficha seguirá mostrando el IMEI completo. **No es un defecto de esta subfase**: es una
decisión anterior que esta subfase no reabre.

### V-2 · Sin un total único entre monedas, los contadores son por moneda

La lámina pide «se evita un total único entre ARS y USD» y «los importes conservan moneda visible».
Los contadores de situación de cobro y la columna se presentan **por moneda**, sin sumar. Es la misma
regla que la 24.5.2-b aplicó al costo en dos monedas.

### V-3 · El período filtra la emisión, y se dice

«El período filtra la fecha de emisión de las ventas. Un importe cobrado en otro período **no debe
redefinir sin explicación** las métricas de ese período.» El filtro es de emisión, y la pantalla lo
dice en su texto de ayuda, no solo en este brief.

### V-4 · El listado no busca por IMEI

«Los filtros de cliente y número **no prometen buscar por IMEI** dentro del listado.» Se respeta: la
búsqueda por IMEI es de la búsqueda global y de Unidades.

### V-5 · La pestaña «Cobros» muestra lo registrado sin ofrecer registrar

Con el panel de cobro fuera del alcance (D-1), la pestaña «Cobros» de la ficha **muestra** lo
registrado y lo pendiente, y «Registrar cobro» sigue llevando a `/ventas/[saleId]/cobrar`, la ruta
actual. La lámina dibuja el panel; esta subfase deja el enlace. **Se declara como diferencia, no se
disimula.**

### V-6 · «Ver pedidos» no entra, y el filtro de cliente sigue llegando por la URL

La lámina 01 dibuja un botón secundario «Ver pedidos» junto a «Nueva venta», y un desplegable
«Todos» para el cliente. **Las dos se declaran y no se implementan**, por decisión del usuario del
2026-11-02. «Ver pedidos» obligaría a cambiar el encabezado compartido de todas las pantallas por un
destino que la navegación lateral ya ofrece; el desplegable es una lectura nueva en `crm` que este
brief no previó. El filtro de cliente sigue llegando por la URL desde la ficha del cliente, con su
línea «Ventas de …» y su enlace para quitarlo, como hasta hoy.

### V-7 · El origen «Pedido» va sin su número

La lámina escribe «Pedido P-000202». Leer ese número pide una lectura por lote en `orders` que la
lista cerrada no incluye —`getOrdersForAccountsByIds` existe, pero recibe una transacción y es de
uso interno de `cash`—. La columna dice **«Pedido»** y enlaza al pedido. AC-4 pide el número solo
para la orden de servicio, y eso sí se cumple.

### V-8 · Los contadores de la lámina son de vigencia, y no llevan moneda

La lámina 01 muestra «Todas (4) · Vigentes (4) · Anuladas (0)»: son **recuentos de filas por
vigencia**, no importes, así que la frase «por moneda» de V-2 y de AC-3 no les aplica. Lo que sí va
por moneda, y sin un total único, es la **columna** de cobros y el total de cada fila. AC-3 queda
enmendado abajo.

## Decisiones

### D-1 · La subfase se parte otra vez, y esta es la propuesta

**Entra**: lámina 01 (listado), lámina 03 **solo la ficha con pestañas**, lámina 05 (comprobante).
**No entra**: el **panel de cobro con permuta** de la lámina 03 y la **anulación con vista previa** de
la lámina 04, que pasan a una **24.6.2-d**.

El corte no es por tamaño nada más: es por **naturaleza**. Lo que entra **no escribe dinero ni toca
una sola regla de negocio** —son lecturas y navegación—. Lo que sale es todo lo que escribe dinero,
con sus topes, su sesión de caja por moneda y su recomprobación al confirmar.

Tres razones medidas:

1. **El volumen.** Entero son cuatro láminas, tres lecturas nuevas que cruzan módulos y el traslado de
   un flujo de 1.052 líneas a un panel. La 24.6.2 se partió por comprimir seis láminas, y la 24.6.1 y
   la 24.5.1, con menos que esto, volvieron **R2**.
2. **El riesgo está concentrado y es medible.** Las dos lecturas del listado (H-1 y H-2) son el riesgo
   real de esta mitad, y se pueden medir y cerrar sin tocar dinero.
3. **La 24.6.2-c cae justo en la otra mitad.** El usuario pidió vender en monedas distintas con un
   comprobante por moneda, y eligió hacer primero esta subfase. Si el panel de cobro se rediseña
   ahora, se rediseña sin saber si una operación emite uno o dos comprobantes. **Lo que entra acá no
   tiene ese problema**: un listado y una ficha con pestañas funcionan igual con una venta o con dos.

**Aprobada por el usuario el 2026-11-02**, con el corte tal como está propuesto. La otra mitad queda
como la **24.6.2-d**.

### D-2 · La lectura por lote vive en `cash` y la compone la página

Una función nueva en `cash` que reciba **los ids de las ventas de la página** y devuelva, por venta,
lo cobrado y lo pendiente **en su moneda**. La página la llama **una vez** con los 25 ids. `sales` no
se enterará: sigue sin depender de `cash`.

Lo que la lámina exige de ella, y es una regla, no una presentación: se calcula «con los **recibos
vigentes**, las señas que corresponden y las **imputaciones reales**; **no** con la suma bruta de
todos los documentos». Reutiliza `imputation.ts`, que es donde esa regla ya vive.

### D-3 · El origen se compone con una lectura nueva en `service`, y solo con la capacidad encendida

Una función nueva en `service` que reciba los ids de las ventas y devuelva, para las que sean de una
orden de servicio, su número `OS-000123`. La página la llama **una sola vez** y **solo si la
organización tiene `repairs`**. Sin la capacidad, el listado distingue mostrador y pedido, como hoy.

### D-4 · Las pestañas de la ficha, por URL, como la 24.6.1

Resumen, Cobros y Actividad, con un solo parámetro de búsqueda, igual que la ficha del pedido de la
24.6.1 y la del cliente de la 24.4.1. Andan sin JavaScript porque son enlaces.

**Y con la lección de la 24.6.1 aplicada**: un control del encabezado **no puede depender de una
lectura que solo una pestaña hace**. Es exactamente el defecto que la 24.6.1 encontró en dos mitades.

**Enmendado el 2026-11-02, antes de implementar.** Este apartado decía que «el encabezado decide con
el estado de la venta, que toda vista ya tiene», y **eso es falso**: se verificó que `SaleDetail` de
`sales` **no tiene estado de cobro**. `status` y `outstanding` viven en `SaleReceipts`, que
devuelve `getSaleReceipts` de `cash`. De la venta misma el encabezado solo sabe si está anulada,
por `sale.saleVoid`. Así escrito, **AC-6 y AC-7 no se cumplían juntas**: o el encabezado no sabe si
la venta admite más importe, o «Actividad» paga una lectura que no muestra, contra la regla que la
24.6.1 dejó de que cada pestaña pide solo sus lecturas.

**Lo resolvió el usuario el 2026-11-02**: el encabezado decide con **la lectura por lote de D-2,
llamada con un solo id**, en toda pestaña. Número de consultas fijo en cualquiera de las tres, el
encabezado no cambia de una a otra, AC-7 se cumple tal como está escrita, y no agrega ningún archivo
—es la misma función que el listado llama con 25 ids—. La pestaña «Cobros» sigue llamando
`getSaleReceipts`, que es la lectura completa, solo cuando se la muestra.

### D-5 · El comprobante no se reescribe: se verifica

La lámina 05 se cierra **comparándola** con lo que ya existe, entrada por entrada, y arreglando lo que
difiera. No se reescribe una pantalla que ya imprime bien.

### D-6 · Pendiente de decisión del usuario: si la 24.6.2-d va antes o después de la 24.6.2-c

No lo decide este brief. Queda señalado porque importa: el panel de cobro de la 24.6.2-d y el
mostrador con dos monedas de la 24.6.2-c se tocan.

## Alcance

**Incluido**: `/ventas` con la columna de cobros por moneda, los contadores, el filtro de período y la
columna de origen; `/ventas/[saleId]` con las tres pestañas por URL; la lectura por lote en `cash`; la
lectura de orígenes en `service`; la verificación del comprobante; y la comparación visual contra las
láminas 01, 03 y 05.

**Excluido**: el panel de cobro con permuta y la anulación con vista previa (D-1, van a la 24.6.2-d);
el enmascarado del IMEI (V-1); cualquier cambio a las reglas de emisión, cobro o anulación; las
sesiones de efectivo, la devolución de dinero, el estado de cuenta, las imputaciones, los tipos de
cambio y los medios de pago, que **el propio README del lote manda al lote V2-10**; migraciones,
tablas y contratos nuevos, que las reglas de la Fase 24 prohíben.

## Lista cerrada de archivos

Salir de esta lista **se pregunta antes de implementar**, sin excepción por tamaño.

| Archivo | Qué cambia |
|---|---|
| `src/app/(autenticado)/ventas/page.tsx` | El listado con la forma de la lámina 01 |
| `src/app/(autenticado)/ventas/filters.ts` | El filtro de período |
| `src/app/(autenticado)/ventas/messages.ts` | Los textos nuevos |
| `src/app/(autenticado)/ventas/[saleId]/page.tsx` | La ficha en tres pestañas |
| `src/modules/cash/service.ts`, `repository.ts`, `index.ts` | La lectura por lote (D-2) |
| `src/modules/sales/service.ts`, `repository.ts`, `index.ts` | `countSalesByStatus`, los contadores de vigencia de la lámina 01 (AC-3), y `listScope` extraído para compartir el ámbito con el listado. ***Agregado el 2026-11-03, después de implementar*, y es la única de las cuatro extensiones de esta lista que *no se preguntó antes*: el desvío se hizo y se registró al encontrarlo la revisión independiente (BLOQUEANTE-1). El usuario lo autorizó el 2026-11-03, ya hecho.** Las otras tres se preguntaron antes, que es lo que esta fila manda |
| `src/modules/service/sale-origins.ts` (nuevo), `index.ts` | La lectura de orígenes (D-3) |
| `src/app/(autenticado)/ventas/[saleId]/cobrar/sale-receipts-section.tsx` | Las cinco piezas de dinero pasan a la pestaña «Cobros» (H-5) |
| `tests/e2e/sales.spec.ts` | Los casos de la subfase |
| `tests/e2e/receipts.spec.ts`, `refunds.spec.ts`, `accounts.spec.ts`, `order-receipts.spec.ts`, `trade-in-payments.spec.ts` | Los siete casos que afirman sobre el dinero de la ficha pasan por la pestaña (H-5) |
| `tests/e2e/units.spec.ts` | El clic en «Anular venta» abre «Más» primero (H-5, tercer recuento). *Agregado el 2026-11-03*, autorizado por el usuario |
| `tests/e2e/repairs.spec.ts` | «Cobrada» se afirma en el badge del encabezado (H-5, cuarto recuento). *Agregado el 2026-11-03*, autorizado por el usuario |
| `tests/integration/` (archivo nuevo) | La medición de las dos lecturas |
| `docs/product/Screens.md` | **§17 y §18**. *Corregido el 2026-11-02*: esta fila decía «§19», y §19 es «Nueva venta», que es de la 24.6.2. Las secciones de esta subfase son la lista (§17) y la ficha con su comprobante (§18). |
| `docs/architecture/Overview.md` | Las filas de `cash` y de `service`, que cada subfase actualiza |
| `CHANGELOG.md`, `docs/planning/Roadmap.md`, este brief | El cierre |

**A contar antes de tocar nada**: qué specs llenan o afirman sobre `/ventas` y su ficha. La 24.6.2
aprendió que ese recuento va **antes**, y la 24.6.1-b, lo que cuesta hacerlo después.

**Contado el 2026-11-02, antes de escribir una línea.** Veinte archivos de `tests/` nombran
`/ventas`: quince specs de extremo a extremo y cinco guardas. De ellos, **ocho specs navegan a la
ficha**, y **siete casos de cinco de ellas afirman sobre el dinero que pasa a la pestaña «Cobros»**;
ese es el resultado que amplió esta tabla, y está en H-5. `frame.spec.ts` usa `/ventas` solo para
el enlace de la navegación y su `aria-current`. Las cinco guardas lo nombran como ruta, no como
pantalla.

## Criterios de aceptación

| Id | Criterio |
|---|---|
| **AC-1** | El listado muestra número, fechas, cliente, vigencia y situación de cobro con la forma de la lámina 01, con los importes **en su moneda y sin un total único**. |
| **AC-2** | La situación de cobro sale de los **recibos vigentes y las imputaciones reales**, no de la suma bruta, y coincide con lo que la ficha de esa venta muestra. |
| **AC-3** | Los contadores de **vigencia** —Todas, Vigentes, Anuladas— enlazan al listado filtrado y cuentan dentro del ámbito de cliente, número y período que esté puesto. *Enmendado el 2026-11-02*: decía «contadores por situación **por moneda**», y la lámina cuenta filas por vigencia, no importes (V-8). |
| **AC-4** | El origen distingue mostrador, pedido y **orden de servicio con su número**; sin la capacidad `repairs`, los dos primeros, y la lectura de `service` **no se ejecuta**. |
| **AC-5** | El filtro de período filtra **la fecha de emisión**, y la pantalla lo dice. |
| **AC-6** | La ficha tiene Resumen, Cobros y Actividad por URL, andan sin JavaScript, y **ningún control del encabezado depende de una lectura de una sola pestaña**: el encabezado usa la lectura por lote con un solo id, en las tres (D-4, enmendado). |
| **AC-7** | «Registrar cobro» aparece solo si la venta vigente admite más importe; «Anular» queda en «Más»; una venta cobrada no ofrece un cobro innecesario. Lo decide la lectura por lote del encabezado, no `getSaleReceipts` (D-4, enmendado). |
| **AC-8** | El comprobante imprimible se compara entrada por entrada con la lámina 05, y al imprimir no salen navegación, botones ni overlays. |
| **AC-9** | Un `viewer` consulta sin acciones de gestión ni costos. |
| **AC-10** | **Medición, no afirmación**: la lectura por lote de `cash` emite un **número de consultas que no crece con la cantidad de filas**, medido con el contador de sentencias sobre el singleton de `getDb()`, con 1 y con 25 ventas. |
| **AC-11** | **Medición**: la lectura de orígenes de `service`, igual, y **cero consultas** sin la capacidad. |
| **AC-11-b** | La pestaña «Actividad» de la ficha **no ejecuta** `getSaleReceipts`, y el encabezado muestra lo mismo en las tres pestañas (D-4, enmendado). *Enmendado el 2026-11-03*: decía «Medición», y **el recuento de consultas de una página servida no se puede medir** con el contador de sentencias, que envuelve el pool del proceso de los tests; Next corre en otro proceso. Se verifica por dos vías: el camino del código —`wantsReceipts`, explícito en la página— y un caso de extremo a extremo que comprueba que «Actividad» no muestra nada de esa lectura y que el encabezado dice lo mismo en las tres. **El número de consultas de la página queda declarado como no medido.** |
| **AC-12** | **Medición**: tiempo y tamaño de `/ventas` con un volumen declarado, como la 24.5.3 y la 24.6.1. |
| **AC-13** | Sin desbordamiento horizontal de 320 a 1440 px, **medido** con `scrollWidth − clientWidth`, en el listado y en las tres pestañas. |
| **AC-14** | Controles de 44 px **medidos**, no mirados. *Medido y no corregido*: el botón «Imprimir o guardar PDF» da **38 px** de alto, y vive en `print-button.tsx`, fuera de la lista cerrada; queda como pendiente. «Registrar cobro» daba **40** —`primaryLinkClass` es de 40— y se corrige en la pantalla, no en la clase compartida, que usan todas. |
| **AC-15** | `axe` sin violaciones WCAG 2.x A ni AA en los estados de las dos pantallas. |
| **AC-16** | Comparación visual contra las láminas 01, 03 y 05, entrada por entrada, sobre **capturas reales de la pantalla construida**, cada una clasificada en resuelta, declarada, nueva o cosmética aceptada. |
| **AC-17** | La batería local completa en verde **con su número de casos declarado**, y la CI en `success` sobre el **SHA exacto**. No se declaran «las specs de ventas»: se declara el total. |
| **AC-18** | Las dos lecturas nuevas **demostradas capaces de fallar** con mutaciones que cambien lo que la consulta devuelve. |
| **AC-19** | Revisión independiente de un agente que no participó, de solo lectura, contra este brief. |
| **AC-20** | Recorrido del usuario sobre producción, sin objeciones. |

### H-6 · La ficha desbordaba 140 px a 320 px, y venía así desde la 20.2

Lo encontró **la medición de AC-13**, no la vista: a 320 px de ancho el documento medía 460 y la
ventana 320. La causa es que el comprobante es un **ítem de grilla sin `min-w-0`**, y el ancho
mínimo automático de un ítem de grilla es el de su contenido, así que la tabla de líneas no lo
dejaba encoger. **No lo introdujo esta subfase**: el mismo `<article>` estaba así desde la 20.2, y
la ficha nunca se había medido a 320. Se arregla acá, que es la pantalla que esta subfase abre.

### H-7 · La vuelta de `/cobrar` aterrizaba donde el dinero ya no estaba

`/ventas/<id>/cobrar` redirige a `/ventas/<id>?cobro=<id>` desde la 21.3, y D-8 de esa subfase
destaca ahí el recibo recién registrado entre los de la venta. Con el dinero mudado a la pestaña
«Cobros», la primera versión de esta subfase dejaba ese aviso en «Resumen» y **pedía los recibos
igual**, solo para nombrar el que volvía.

Son dos defectos en uno. El visible: el detalle del cobro queda una pestaña más allá, y es lo que
afirmaban los dos casos de `exchange.spec.ts`. El de fondo: **la página pagaba una lectura que no
mostraba**, que es exactamente lo que D-4 prohíbe y lo que la 24.6.1 encontró partido en dos
mitades.

**Resuelto en la página**: `?cobro=` abre la pestaña «Cobros», y `wantsReceipts` pasa a ser
`tab === "cobros"` a secas. Una pestaña pedida en la URL sigue mandando, así que un enlace a otra
no cambia. No agrega ningún archivo: `exchange.spec.ts` pasa sin tocarse. *Elegido por el usuario
el 2026-11-03*, entre esto y actualizar los dos casos.

**Lo encontró la batería completa, no la corrida acotada.** Las dos specs que lo afirmaban no
estaban en la lista cerrada, así que ninguna corrida parcial de esta subfase las tocó.

**Y el arreglo tuvo su propio costo, medido**: al traer el badge del encabezado y la tabla de dinero
a la misma pantalla, dos localizadores sin acotar de otras dos specs pasaron a matchear dos
elementos. Está en el cuarto recuento de H-5. No es un defecto de la página —el encabezado dice lo
mismo en las tres pestañas porque D-4 lo pide—, sino de dos aserciones que podían ser ambiguas y no
lo eran por casualidad.

## Mediciones requeridas

AC-10, AC-11, AC-12, AC-13 y AC-14. Ninguna se reemplaza por prosa. **NB-13 de la 24.6.2 quedó
declarado por no medir la geometría ni el zoom**; acá AC-13 y AC-14 lo cubren, y el zoom al 200 % se
declara explícitamente como **no medido** si no se mide.

## Mediciones obtenidas

Tomadas el 2026-11-02 contra PostgreSQL real, con `tests/integration/sales-list-reads.test.ts`.

### AC-10 · La situación de cobro por lote

| Página | 1 fila | 25 filas | La forma obvia con 25 |
|---|---|---|---|
| Todas con cliente | **3** | **3** | **252** |
| Todas sin cliente | **2** | **2** | — |
| Mezclada: con cliente, sin cliente y anulada | — | **5** | > 100 |

**El número no crece con las filas**: idéntico con 1 y con 25. Lo que lo hace variar es **qué formas
de venta tiene la página**, no cuántas: las dos lecturas agrupadas de las ventas sin cliente no se
ejecutan si no hay ninguna, y las cuentas de los clientes no se leen si todas son sin cliente. El
peor caso medido es **5**.

**H-1 estimaba «unas 150» y la medición dio 252.** La estimación quedó corta; el hallazgo queda
confirmado y peor de lo escrito. Son **84 veces** más sentencias que la lectura por lote.

### AC-11 · El origen por lote

Sin la capacidad `repairs`, **cero** consultas a `service_orders`. Con ella, **una**, con 1 y con
25 ventas, y el total de sentencias tampoco cambia entre las dos. Sin ventas, **cero** sentencias.

### AC-16 · La comparación con las láminas, entrada por entrada

Hecha el 2026-11-03 sobre **capturas reales de la pantalla construida** a 1672 × 941, el tamaño de
las láminas, con un arnés temporal **ya borrado** que reproduce las cuatro ventas de la tabla de
datos ficticios del README del lote. Cada entrada queda clasificada en **resuelta**, **declarada**
(diferencia conocida y aceptada antes de implementar), **nueva** (aparecida al implementar) o
**cosmética aceptada**.

**El fixture se corrigió a mitad de la comparación.** Las cuatro ventas se habían insertado en el
mismo instante, y el listado ordena por `created_at` descendente con el id como desempate: el orden
de la captura salía al azar y no era comparable con el de la lámina. Con una fecha propia cada una
—las de la lámina—, el listado sale en el orden de la lámina. **No era un defecto de la pantalla,
y haberlo dado por tal habría sido el error contrario.**

#### Lámina 01 · El listado

| Entrada | Veredicto |
|---|---|
| Título «Ventas» y subtítulo «Comprobantes y cobros» | resuelta |
| «Nueva venta» | resuelta |
| **«Ver pedidos»**, botón secundario | **declarada** (V-6: el usuario decidió no implementarlo) |
| Filtros Número de venta, Desde, Hasta | resuelta |
| **Desplegable «Cliente»** | **declarada** (V-6, misma decisión) |
| Las cuatro filas, en el orden de la lámina, con sus datos | resuelta |
| Columnas Venta · Cliente · Origen · Total · Cobros · Acción | resuelta |
| Número, fecha y badge «Vigente» en la celda de la venta | resuelta |
| «Parcial» / «Cobrada» con el importe por cobrar debajo | resuelta |
| Contadores «Todas (4) · Vigentes (4) · Anuladas (0)» | resuelta |
| «Origen: Pedido P-000202» en V-000219 | **declarada**: el enlace al pedido va **sin** su número, y la celda la cubre el caso de extremo a extremo, no esta captura, porque el fixture no arma un pedido entregado |
| Selector de vigencia: la lámina dibuja chips con «Vigentes» activa; la pantalla, pestañas con el contador en una pastilla y «Todas» activa | cosmética aceptada |
| Botón «Aplicar filtros» y nota «El período filtra la fecha de emisión» | nueva, aceptada: es el patrón de filtros del CRM, que la lámina no dibuja |
| Importes: «ARS 480.000» en la lámina, «$ 480.000,00» en la pantalla | cosmética aceptada: es el formato de moneda del CRM |
| Fecha: «27 oct 2026» en la lámina, «27/10 16:40» en la pantalla | cosmética aceptada, preexistente |
| «Ver» como botón con borde en la lámina, como enlace en la pantalla | cosmética aceptada |
| Pie: «4 ventas» con paginación en la lámina, «Mostrando 1 a 4 de 4 ventas» en la pantalla | cosmética aceptada |
| Barra lateral y barra superior | fuera de alcance: son el marco de la app, de otra subfase |

#### Lámina 03 · La ficha

| Entrada | Veredicto |
|---|---|
| Pestañas **Resumen · Cobros · Actividad**, en ese orden | resuelta |
| Badge «Vigente» y badge «Parcial» en el encabezado | resuelta |
| Los tres números: total 480.000, cobrado 200.000, falta 280.000 | resuelta |
| Tabla de los cobros con el número de recibo, el medio y el importe | resuelta |
| Enlace a la cuenta del cliente | resuelta: la pantalla además dice cuánto debe |
| El producto con su cantidad, precio unitario y subtotal | resuelta, **en la pestaña Resumen** (D-4) |
| **El panel «Registrar cobro»** | **declarada** (D-1: fuera del alcance) |
| **IMEI enmascarado** «…2403» | **declarada** (V-1: el enmascarado está fuera de la Fase 24) |
| El encabezado de la lámina lleva cliente, fecha y «Venta de mostrador»; el construido lleva el total y los dos badges | nueva, aceptada: el cliente y la fecha están en la pestaña Resumen, y el encabezado tiene que decir lo mismo en las tres (D-4) |
| «Estado» y «Acciones» en la tabla de cobros | nueva: la pantalla no trae esas dos columnas; el número del recibo ya es el enlace |
| «Ver comprobante» en la lámina, «Imprimir o guardar PDF» en la pantalla | cosmética aceptada |
| Menú «⋮» en la lámina, «Más» en la pantalla | cosmética aceptada |
| Etiquetas «Total de la venta / Cobros registrados / Saldo pendiente actual» frente a «Total / Cobrado / Falta», y el resaltado amarillo del pendiente | cosmética aceptada |

#### Lámina 05 · El comprobante

| Entrada | Veredicto |
|---|---|
| Encabezado con el nombre de la organización y «Documento no válido como factura» | resuelta |
| «Venta V-000221» y su fecha | resuelta |
| «Cliente / Mateo Salas» | resuelta |
| Tabla Producto · Cantidad · Precio · Total | resuelta |
| Total destacado | resuelta |
| «DOCUMENTO NO VÁLIDO COMO FACTURA» al pie | resuelta |
| «Volver» e «Imprimir» | resuelta; el alto de 38 px del botón queda declarado en AC-14 |
| **El panel «Situación de cobro»** al lado del comprobante, con «Este panel no se imprime» | **declarada**: el dinero vive en la pestaña «Cobros» (D-4), y la situación, en el badge del encabezado |
| El comprobante como página aparte | **declarada**: vive dentro de la pestaña Resumen (D-5: el comprobante no se reescribe) |
| «Origen de venta / Venta sin pedido» | nueva: el comprobante construido no lo trae |
| «U-0403 · IMEI ficticio …» bajo el producto | el fixture no tiene unidades serializadas: lo cubre `units.spec.ts`, no esta captura |
| Ciudad y «(UTC −3)» junto a la fecha | cosmética aceptada: la zona está en el pie |

**Recuento**: 21 entradas resueltas, 7 declaradas, 4 nuevas —tres aceptadas con su razón y una, las
columnas «Estado» y «Acciones» de la tabla de cobros, que queda como pendiente anotado— y 11
cosméticas aceptadas.

### AC-12 · Tiempo y tamaño de `/ventas` con volumen

Tomadas el 2026-11-03 con un arnés temporal, **ya borrado**, sobre la organización de volumen:
siete de cada diez ventas con cliente, una de cada diez anulada, una de cada cuatro con un cobro.
Mediana de cinco corridas después de una de calentamiento, y **las sentencias al lado del tiempo**,
que es lo que la 24.5.3 no hizo.

| Lectura | Sentencias | 1.000 ventas | 10.000 ventas |
|---|---|---|---|
| `countSalesByStatus` | 2 | 3 ms | 15 ms |
| `listSales`, página 1 | 5 | 8 ms | 18 ms |
| `getSalesStanding`, 25 filas | 5 | 16 ms | 50 ms |
| `getSaleOrigins`, 25 ids, sin la capacidad | 1 | 1 ms | 1 ms |
| **Las cuatro, como las pide la página** | **13** | **29 ms** | **79 ms** |

**El número de sentencias no cambia con el volumen**: 13 con 1.000 y con 10.000. El tiempo sí, y
**conviene decir qué parte crece**: `getSalesStanding` pasa de 16 a 50 ms porque sus dos lecturas
agrupadas van **por toda la organización**, no por la página —es el precio de reusar la máquina de
`readAccounts` en vez de escribir una regla nueva, y está asumido en D-2—. `countSalesByStatus`
pasa de 3 a 15 ms porque cuenta todas las filas, que es lo que un contador hace.

**79 ms para las cuatro lecturas con 10.000 ventas.** Queda declarado como el límite medido: a un
volumen mucho mayor, la lectura por lote es lo primero que habría que acotar a la página.

La única sentencia de `getSaleOrigins` sin la capacidad es **la lectura de la capacidad misma**, no
una consulta a `service_orders`: de esas hay cero, y es lo que AC-11 afirma y el test versionado
comprueba.

### AC-18 · Las mutaciones, corridas el 2026-11-03

Siete mutaciones, cada una aplicada al código de producción, corrida, comprobada en rojo y
revertida. El árbol quedó verificado igual al de antes después de cada una.

| # | Qué se mutó | Qué se puso rojo |
|---|---|---|
| M-1 | `standingOf` devuelve `row.direct` sin `row.imputed` | «coincide con lo que la ficha muestra» |
| M-2 | `shape` dice `"pending"` siempre que no esté anulada | ídem |
| M-3 | las anuladas salen de `ownReceiptIds` | ídem |
| M-4 | `accountsIn` se llama siempre, aun sin ventas con cliente | «una página sin cliente consulta menos» |
| M-5 | sin la comprobación de `repairsAllowed` | «sin la capacidad no toca `service_orders`» |
| M-6 | `getSaleOrigins` devuelve el mapa vacío | el caso de extremo a extremo del origen |
| M-7 | `current` se cuenta sin el filtro de vigencia | el caso de los contadores de la lámina |

**M-4 no se puso roja la primera vez, y eso encontró un defecto del test.** El caso se titulaba
«una página de ventas sin cliente consulta menos todavía» y **no afirmaba que consulte menos**:
comparaba el recuento contra sí mismo con más filas y después contra un techo de `<= 8`. Con las
cuentas leídas siempre, el número pasa de 2 a 3 y el techo lo dejaba pasar en verde.

**Arreglado fijando los tres números exactos** —3 con clientes, 2 sin clientes, 5 en la página
mezclada—, que son los que esta misma sección ya declaraba medidos pero que nada afirmaba. Con los
números fijos, M-4 se pone roja. Es la forma que el vault tiene anotada como «un check en verde no
prueba nada»: el techo holgado medía lo que uno quería ver.

### Dos defectos del propio instrumento, encontrados al medir

Los dos están explicados en comentarios dentro del archivo, porque el contador es lo que sostiene
AC-10 y AC-11, y un contador mal escrito mide lo que uno quiere ver:

1. **No desenvolver los clientes al terminar.** El pool los reusa, así que el envoltorio de una
   medición sobrevivía a la siguiente y le sumaba sus sentencias a un recuento ya leído: contó 3
   donde había 1.
2. **Contar en el pool y en el cliente a la vez.** `Pool.query` de pg saca un cliente y le pasa la
   consulta, así que una consulta sin transacción se contaba dos veces y una dentro de una
   transacción, una sola: dos varas distintas en la misma medición.

## Condiciones de detención

- Si la lectura por lote de `cash` no se puede escribir sin que `sales` dependa de `cash`, **se para y
  se consulta**: la frontera no se cruza por conveniencia.
- Si la lectura de orígenes exige que `sales` conozca `service`, **se para**: lo prohíbe
  `DataModel.md:1441` y lo vigilan dos guardas.
- Si el número de consultas crece con las filas y no se puede evitar, **se para y se informa** antes
  de seguir.
- Si hace falta una migración, una tabla o un contrato nuevo, **se para**: las reglas de la Fase 24 lo
  prohíben.
- Si aparece una diferencia con la v2 que no está declarada acá, **se declara y se pregunta** antes de
  implementarla.

## AC-19 · La revisión independiente, y lo que encontró

Hecha el 2026-11-03 por un agente que **no participó** del trabajo, de solo lectura, sobre `15a0365`
y contra este brief. Fijó su escala de severidad antes de mirar y recorrió siete dimensiones. No
otorgó ninguna autorización: **los diez hallazgos se verificaron contra el código antes de
aceptarse, y los diez resultaron reales.** Ninguno falso, que es lo que distingue esta revisión de la
de la 8.4, donde uno de cuatro lo era.

**Veredicto: R2** — un bloqueante, cuatro mayores, cinco menores.

| # | Hallazgo | Resuelto |
|---|---|---|
| **BLOQUEANTE-1** | Tres archivos de `src/modules/sales/` en el commit, fuera de la lista cerrada y sin extensión registrada | La cuarta fila de la lista, con la anomalía declarada: es la única extensión que **no se preguntó antes**. Autorizada por el usuario el 2026-11-03, ya hecha |
| **MAYOR-1** | El recuento de specs no cerraba: eran 16 y 17, no 15 y 16 | Los dos números corregidos, con los dos errores distintos anotados |
| **MAYOR-2** | «Imprimir o guardar PDF» en las tres pestañas, y desde «Cobros» o «Actividad» imprimía **una hoja en blanco** | El botón solo en «Resumen», con un caso que afirma las dos mitades |
| **MAYOR-3** | «Cobrada» afirmado con `.first()` donde el comentario decía «el del encabezado» | `data-estado-venta` en el encabezado y las dos aserciones acotadas |
| **MAYOR-4** | La ficha pasó a pagar una lectura de **toda la organización**, sin declarar ni medir | Medido (abajo) y declarado como límite aceptado en `Overview.md` |
| MENOR-1 | «Nada implementado todavía» en el commit que lo implementaba | Corregido |
| MENOR-2 | `Screens.md` describía la ficha que H-7 reemplazó | Corregido |
| MENOR-3 | Dos entradas visuales citaban D-6 donde va V-6 | Corregido |
| MENOR-4 | `NO_ORDER_TEXT`, constante muerta: la columna que describe la borró esta subfase | Borrada |
| MENOR-5 | En el caso del origen, dos aserciones pasarían con un mapa vacío | Anotado en el propio caso, con dónde vive la conducta positiva |

### MAYOR-4 · Lo que cuesta la ficha, medido

El encabezado llama `getSalesStanding` con un solo id (D-4), y con una venta **con cliente** ese
camino entra por `accountsIn`, que lee las ventas con cliente, los cobros y las devoluciones de
**toda la organización**. Antes la ficha pagaba `getSaleReceipts`, acotado **a un cliente**. El
hallazgo es correcto: es un costo nuevo y no estaba declarado.

Tomadas el 2026-11-03 con un arnés temporal, **ya borrado**, sobre una organización de volumen con
**200 clientes** —siete de cada diez ventas con cliente, una de cada diez anulada, una de cada
cuatro con un cobro—. Mediana de cinco corridas después de una de calentamiento.

| Lectura | 1.000 ventas | 10.000 ventas |
|---|---|---|
| `getSalesStanding`, 1 id, venta **con** cliente (el encabezado nuevo) | 16 ms | **58 ms** |
| `getSalesStanding`, 1 id, venta **sin** cliente | 5 ms | 9 ms |
| `getSaleReceipts`, la misma venta (lo que la ficha pagaba antes) | 17 ms | **24 ms** |

**A 10.000 ventas el encabezado cuesta 2,4 veces lo que costaba la lectura que reemplazó**, y la
venta **sin** cliente se queda en 9 ms. Eso último es lo que confirma el mecanismo exacto: el costo
está en `accountsIn`, no en la lectura por lote. Queda **declarado como límite aceptado**: la ficha
hereda el techo de la lista de deudores, y acotar el camino de un solo id a la cuenta de su cliente
—sin cambiar D-4 ni el contrato— es la mejora disponible si un negocio se acerca a ese volumen.

**La primera medición no sirvió y se descarta por escrito**: el fixture tenía **un solo cliente**,
y con un cliente «por cliente» y «por organización» son el mismo conjunto, así que midió
`getSaleReceipts` *más lento* que `getSalesStanding` —148 contra 66 ms— y la distinción que el
hallazgo denuncia se colapsaba. Un arnés que no puede mostrar la diferencia que mide no la refuta.

### Lo que la medición confirmó de paso, y no estaba buscando

La comprobación de coherencia del arnés **puso en rojo AC-2** en la primera corrida: la lectura por
lote decía `collected: 1000.00` donde la ficha decía `400.00`. **No era un defecto**: era la
comprobación comparando el campo equivocado. `SaleStandingSummary.collected` es, por diseño y por
su propio comentario, **lo cobrado más lo imputado**, y la ficha muestra los dos separados. Con los
campos que de verdad se comparan, cierra exacto con 200 clientes y 10.000 ventas:
`lote.collected = ficha.collected + ficha.imputed` y los dos `outstanding` iguales. Es una
confirmación de AC-2 **más fuerte que la del test versionado**, que corre con un puñado de filas.
Haberlo anotado como defecto habría sido el error contrario, igual que con el fixture de AC-16.

### Lo que la revisión miró y no produjo hallazgos

Las fronteras de módulos, leyendo los `import` reales y no las descripciones: `sale-origins.ts` no
importa `sales` ni `cash`, `sales` no importa `cash` ni `service`, y las dos lecturas las compone
la página. Las prohibiciones absolutas: cero Airtable, ninguna referencia al repositorio del agente,
ninguna tabla especulativa, y **67 migraciones contadas archivo por archivo**, sin huecos. La
correctitud de las lecturas en sus bordes —anuladas con y sin cliente, ventas sin cliente, lotes
vacíos, organizaciones distintas, monedas mezcladas, cobros anulados, la seña del pedido y el
sobrepago—, sin encontrar una entrada alcanzable que devuelva un importe incorrecto. Y la honestidad
del nivel de validación, sin inflado: lo que faltaba de «No certifica» eran MAYOR-2 y MAYOR-4, los
dos ahora declarados.

### Una conducta anotada, sin arreglar, porque es una decisión

`standingOf` cae en `shape(0n, 0n)` cuando una venta vigente con cliente **no aparece** en su
cuenta, y `shape` convierte eso en `status: "collected"`: el listado diría **«Cobrada»** para un
estado que la propia función considera inconsistente. Es la lectura más tranquilizadora posible, y
contrasta con el precedente que la 24.6.1 fijó —«cuando `cash` no puede leer los recibos, la
pantalla lo dice en vez de dibujar ceros»—. **Por los caminos normales no es alcanzable**: una venta
vigente con cliente siempre está en su cuenta; sí lo es en una carrera estrecha, si la venta se
anula entre `listSales` y la instantánea, y es transitoria. No se cambia acá porque cambiarla es
elegir qué mostrar, y eso es una decisión del usuario, no un arreglo.

## AC-20 · El recorrido del usuario, y las cuatro observaciones que dejó

Hecho el 2026-11-03 sobre producción (`b39ec5d`): el listado y la ficha, con sus tres pestañas y el
botón de imprimir, que es lo único del commit correctivo que se ve a simple vista.

**No fue «sin objeciones», y la distinción es la que decide dónde se anota cada cosa.** El usuario
hizo cuatro observaciones sobre el listado, y **ninguna es un defecto de lo entregado**: la pantalla
hace lo que la lámina 01 y este brief pedían. Son un cambio de criterio al verla funcionando, que
es exactamente lo que un recorrido sobre producción tiene que producir y que ninguna prueba
automatizada ni revisión de código podía encontrar, porque las dos comparan contra lo aprobado.

| # | Observación | Qué pasa con ella |
|---|---|---|
| 1 | La insignia de vigencia bajo el número de venta sobra | Se saca |
| 2 | En una venta anulada, «Anulada» aparece **dos veces** —bajo el número y en «Cobros»— | Se resuelve con una columna **ESTADO** única |
| 3 | «Parcial» y «Pendiente» parecen lo mismo | **Son distintos y se mantienen** —Parcial es «entró algo», Pendiente es «no entró nada»—. La repetición real era otra: en toda fila pendiente, «por cobrar» dice **el mismo número que TOTAL**. El importe pasa a mostrarse **solo cuando difiere del total** |
| 4 | El «Ver» de ventas no se parece al de pedidos | Pasa a ser el mismo botón sólido |

**Van a una subfase nueva, con su propio brief**, por decisión del usuario del 2026-11-03. No se
enmienda este brief ni se reabre esta subfase: lo entregado coincide con lo aprobado, y mezclar las
dos cosas borraría justamente eso. Los cuatro estados de la columna nueva quedan decididos:
**Anulada, Cobrada, Parcial y Pendiente**, excluyentes, con la anulación ganándole al cobro porque
en una venta anulada el estado de cobro no significa nada. Se descartó llamar «Vigente» al estado
sin cobrar: una venta Parcial también está vigente, y la palabra mezclaría vigencia con cobro.

## Nivel de validación objetivo

**Validado en staging**, con el recorrido del usuario sobre producción (AC-20). No certifica
**preparado para producción**.

## Ubicación en la fase

- **Necesario ahora**: todo lo incluido. Es la mitad de lectura de las cuatro láminas.
- **Requisito antes de producción**: nada propio; la subfase no cambia reglas.
- **Mejora posterior**: la **24.6.2-d** (panel de cobro y anulación con vista previa) y la
  **24.6.2-c** (mostrador con dos monedas), cuyo orden entre sí decide el usuario (D-6).
