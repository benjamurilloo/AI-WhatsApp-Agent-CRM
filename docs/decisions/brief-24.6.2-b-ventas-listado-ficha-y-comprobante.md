# Brief 24.6.2-b — Ventas: listado, ficha y comprobante

- **Subfase**: 24.6.2-b de la Fase 24 ([Roadmap](../planning/Roadmap.md), tabla de la Fase 24).
- **Tipo de tarea**: `implementation`.
- **Estado**: **aprobado por el usuario el 2026-11-02**, con el corte de D-1. Nada implementado todavía.
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
lectura que solo una pestaña hace**. El estado de cobro y «Registrar cobro» viven en el encabezado, y
lo cobrado lo lee la pestaña Cobros; así que el encabezado decide con el estado de la venta, que toda
vista ya tiene. Es exactamente el defecto que la 24.6.1 encontró en dos mitades.

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
| `src/modules/service/sale-origins.ts` (nuevo), `index.ts` | La lectura de orígenes (D-3) |
| `tests/e2e/sales.spec.ts` | Los casos de la subfase |
| `tests/integration/` (archivo nuevo) | La medición de las dos lecturas |
| `docs/product/Screens.md` | §19 |
| `docs/architecture/Overview.md` | Las filas de `cash` y de `service`, que cada subfase actualiza |
| `CHANGELOG.md`, `docs/planning/Roadmap.md`, este brief | El cierre |

**A contar antes de tocar nada**: qué specs llenan o afirman sobre `/ventas` y su ficha. La 24.6.2
aprendió que ese recuento va **antes**, y la 24.6.1-b, lo que cuesta hacerlo después.

## Criterios de aceptación

| Id | Criterio |
|---|---|
| **AC-1** | El listado muestra número, fechas, cliente, vigencia y situación de cobro con la forma de la lámina 01, con los importes **en su moneda y sin un total único**. |
| **AC-2** | La situación de cobro sale de los **recibos vigentes y las imputaciones reales**, no de la suma bruta, y coincide con lo que la ficha de esa venta muestra. |
| **AC-3** | Los contadores por situación son **por moneda** y enlazan al listado filtrado. |
| **AC-4** | El origen distingue mostrador, pedido y **orden de servicio con su número**; sin la capacidad `repairs`, los dos primeros, y la lectura de `service` **no se ejecuta**. |
| **AC-5** | El filtro de período filtra **la fecha de emisión**, y la pantalla lo dice. |
| **AC-6** | La ficha tiene Resumen, Cobros y Actividad por URL, andan sin JavaScript, y **ningún control del encabezado depende de una lectura de una sola pestaña** (D-4). |
| **AC-7** | «Registrar cobro» aparece solo si la venta vigente admite más importe; «Anular» queda en «Más»; una venta cobrada no ofrece un cobro innecesario. |
| **AC-8** | El comprobante imprimible se compara entrada por entrada con la lámina 05, y al imprimir no salen navegación, botones ni overlays. |
| **AC-9** | Un `viewer` consulta sin acciones de gestión ni costos. |
| **AC-10** | **Medición, no afirmación**: la lectura por lote de `cash` emite un **número de consultas que no crece con la cantidad de filas**, medido con el contador de sentencias sobre el singleton de `getDb()`, con 1 y con 25 ventas. |
| **AC-11** | **Medición**: la lectura de orígenes de `service`, igual, y **cero consultas** sin la capacidad. |
| **AC-12** | **Medición**: tiempo y tamaño de `/ventas` con un volumen declarado, como la 24.5.3 y la 24.6.1. |
| **AC-13** | Sin desbordamiento horizontal de 320 a 1440 px, **medido** con `scrollWidth − clientWidth`, en el listado y en las tres pestañas. |
| **AC-14** | Controles de 44 px **medidos**, no mirados. |
| **AC-15** | `axe` sin violaciones WCAG 2.x A ni AA en los estados de las dos pantallas. |
| **AC-16** | Comparación visual contra las láminas 01, 03 y 05, entrada por entrada, sobre **capturas reales de la pantalla construida**, cada una clasificada en resuelta, declarada, nueva o cosmética aceptada. |
| **AC-17** | La batería local completa en verde **con su número de casos declarado**, y la CI en `success` sobre el **SHA exacto**. No se declaran «las specs de ventas»: se declara el total. |
| **AC-18** | Las dos lecturas nuevas **demostradas capaces de fallar** con mutaciones que cambien lo que la consulta devuelve. |
| **AC-19** | Revisión independiente de un agente que no participó, de solo lectura, contra este brief. |
| **AC-20** | Recorrido del usuario sobre producción, sin objeciones. |

## Mediciones requeridas

AC-10, AC-11, AC-12, AC-13 y AC-14. Ninguna se reemplaza por prosa. **NB-13 de la 24.6.2 quedó
declarado por no medir la geometría ni el zoom**; acá AC-13 y AC-14 lo cubren, y el zoom al 200 % se
declara explícitamente como **no medido** si no se mide.

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

## Nivel de validación objetivo

**Validado en staging**, con el recorrido del usuario sobre producción (AC-20). No certifica
**preparado para producción**.

## Ubicación en la fase

- **Necesario ahora**: todo lo incluido. Es la mitad de lectura de las cuatro láminas.
- **Requisito antes de producción**: nada propio; la subfase no cambia reglas.
- **Mejora posterior**: la **24.6.2-d** (panel de cobro y anulación con vista previa) y la
  **24.6.2-c** (mostrador con dos monedas), cuyo orden entre sí decide el usuario (D-6).
