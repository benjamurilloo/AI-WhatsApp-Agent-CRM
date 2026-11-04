# Brief 24.6.2-d — Ventas: cobro con permuta y anulación

- **Tipo de tarea**: `implementation`.
- **Estado**: **CERRADA el 2026-11-04**, desplegada en `7432629` y recorrida por el usuario. El
  §Cierre está al final. *Aprobado por el usuario el 2026-11-04, con las recomendaciones.* Las cinco
  decisiones que quedaban abiertas —D-1, D-3, D-5, D-7 y D-8— se cierran en la opción recomendada,
  y cada una lo dice en su apartado. **Aprobar el brief no autoriza commit, push ni despliegue**:
  cada uno se pide en su turno.
- **Láminas**: **03** (el panel de cobro) y **04** (la anulación) del lote
  [V2-09](../ui-redesign/v2/20-ventas/README.md). Las dos abiertas y miradas antes de escribir
  esto, no inferidas de su descripción.
- **Viene de**: D-1 del [brief-24.6.2-b](brief-24.6.2-b-ventas-listado-ficha-y-comprobante.md), que
  partió la subfase **por naturaleza y no por tamaño**: lo que quedó allá no escribe dinero, y todo
  lo que escribe dinero quedó acá.
- **Hereda de la 24.6.2-c**, cerrada el 2026-11-03: una operación de mostrador puede emitir **N
  comprobantes, uno por moneda, no ligados entre sí**. Cada uno se cobra por separado, con este
  panel. El panel se diseña sabiéndolo, que es exactamente para lo que el usuario eligió ese orden.

## Objetivo

Que el cobro de una venta se registre en un **panel dentro de la ficha**, con la permuta, y que la
anulación muestre **qué va a pasar, calculado**, antes de confirmar.

Son las dos mitades de dinero de la lámina 03 y la lámina 04. Hoy el cobro es una **ruta aparte** y
la anulación avisa de su efecto con **texto fijo**, que no mira la venta.

## Punto de partida verificado

Cada afirmación con su archivo y su línea. Medido el 2026-11-03 sobre `c59b4b1`.

**El cobro es una ruta aparte de 1.049 líneas en cinco archivos**, no 1.052: el Roadmap y la tarea
de Notion traen esa cifra, medida el 2026-11-02, y cambió desde entonces. La de hoy es

| Archivo | Líneas |
|---|---|
| `src/app/(autenticado)/ventas/[saleId]/cobrar/actions.ts` | 106 |
| `src/app/(autenticado)/ventas/[saleId]/cobrar/messages.ts` | 188 |
| `src/app/(autenticado)/ventas/[saleId]/cobrar/page.tsx` | 171 |
| `src/app/(autenticado)/ventas/[saleId]/cobrar/receipt-form.tsx` | 286 |
| `src/app/(autenticado)/ventas/[saleId]/cobrar/sale-receipts-section.tsx` | 298 |

**`ReceiptForm` no es de ventas: lo comparte pedidos.**
`src/app/(autenticado)/pedidos/[orderId]/page.tsx:12` lo importa por su ruta completa para las
señas. Es el dato que más condiciona el alcance y está en H-1.

**`SaleReceiptsSection` ya vive en la ficha.** `ventas/[saleId]/page.tsx:61` lo importa y lo
muestra en la pestaña «Cobros», desde la 24.6.2-b.

**La ficha ya tiene el mecanismo que las dos láminas necesitan.** Tres pestañas por URL en
`?pestana=` (`ventas/[saleId]/page.tsx:84`, `TAB_PARAM`), y la anulación es un paso por URL,
`?confirmar=anular` (`ventas/[saleId]/page.tsx:108`), que dibuja `void-sale.tsx` **en la página, no
en un modal**, y anda sin JavaScript.

**`/ventas/[saleId]/anulacion` no es el formulario de anulación.** Es el **comprobante** de una
anulación ya hecha, imprimible, y devuelve «Esta venta no está anulada» si no la hay
(`anulacion/page.tsx`). No se toca en esta subfase.

**Las reglas de la permuta ya existen y no hay que escribirlas.** Las puso la 29.7.2 y viven en
`cash`, en `src/modules/cash/service.ts`:

| Regla | Línea |
|---|---|
| `trade_in_requires_trade_in_method` | 2378 |
| `trade_in_currency_mismatch` | 2386 y 2408 |
| `trade_in_voided` | 2401 |
| `trade_in_not_sale_credit` | 2403 |
| `trade_in_other_client` | 2406 |
| `exceeds_trade_in_available` | 2416 |
| `tradeInAvailable`, el disponible de un usado | 2334 |

Corren **dentro de la transacción** (reciben `tx`), así que **la recomprobación al confirmar que
pide el Roadmap ya está hecha**. Lo que falta es presentarla.

**La permuta está detrás de una capacidad.** `cash/service.ts:3706` devuelve `null` sin
`trade_ins`, y `cash/service.ts:2382` la vuelve a exigir al escribir. La lámina 03 la dibuja siempre.

**La anulación rechaza por tres reglas** (`sales/service.ts:886` a `901`): `already_voided`,
`stock_limit` y `unit_serial_back` —el IMEI vendido que volvió al local en otra unidad, de la 29.7—.

**Funcionar sin JavaScript es una invariante medida, no una preferencia.** **22 archivos** de
`tests/e2e/` tienen al menos un caso con `javaScriptEnabled: false`, `sales.spec.ts` entre ellos.

## Las fronteras entre módulos, releídas con grep

No las di por incorporadas: las volví a buscar, que es el paso donde una subfase anterior del
proyecto se equivocó.

- **`Overview.md:173`: «Ningún módulo depende de `sales`».**
- **`Overview.md:177`: `cash` depende de `sales` y de `crm`.**

De ahí sale una consecuencia que no es de estilo: **la mitad de dinero de las dos vistas previas no
puede vivir en `sales`**. Va en `cash`, y la página compone — la misma forma que D-2 de la
24.6.2-b, que ya resolvió este mismo problema para el listado.

## Hallazgos que condicionan el alcance

### H-1 · `ReceiptForm` es de pedidos tanto como de ventas

Vive en `ventas/[saleId]/cobrar/receipt-form.tsx` y lo importa `pedidos/[orderId]/page.tsx:12`.
**Rediseñarlo en el lugar toca la pantalla de señas de un pedido**, que no está en esta subfase y
cuya lámina es otra.

Es el mismo acoplamiento entre pantallas gemelas que la 24.6.2-e pagó caro: ahí se copió un botón
de pedidos que venía desviado de su propia lámina, y la desviación se propagó. Acá el riesgo es el
inverso y peor: **cambiar ventas cambia pedidos sin que nadie lo pida**. Lo decide D-1.

### H-2 · Las dos vistas previas de esta subfase NO tienen la misma garantía, y la pantalla no puede sugerir que sí

- **La de la permuta se recomprueba.** Sus reglas corren dentro de la transacción del cobro, así
  que entre ver la previsión y confirmar, un cambio produce un **rechazo**, no un cobro mal hecho.
  La lámina ya lo dice bien: «Previsión. El cobro todavía no se registró».
- **La de la anulación no se recomprueba, y hoy no puede.** El [ADR 0022](0022-cobros-y-caja.md),
  en su línea 129, es explícito: «**Lo que este bloqueo no serializa**: la emisión y la anulación de
  una venta, que siguen en `sales` sin mirar los cobros. Si una venta se anula mientras se registra
  un cobro contra ella, el cobro queda contra una venta anulada».

  Entonces el efecto en dinero que la lámina 04 promete —«Quedará ARS 80.000 a devolver»— es una
  **foto del momento de abrir el diálogo**. Si entra un cobro en el medio, la anulación **igual se
  hace** y la cifra que el usuario leyó era otra.

**Hacer que se recomprobara exigiría que `voidSale` mirara cobros, y eso cambia el punto 6 del ADR
0022.** Un ADR no se enmienda desde una subfase de pantallas: es condición de detención. Lo que sí
corresponde es **decir la verdad en la pantalla**, y lo decide D-5.

### H-3 · El efecto en dinero de la anulación es la lectura nueva, y no es una resta

La lámina pide distinguir dos casos, y el README del lote los fija:

- **Sin cliente**: «lo cobrado queda a devolver sobre la venta».
- **Con cliente**: «lo cobrado pasa a su cuenta: **primero se aplica a ventas con saldo** y solo lo
  restante queda a favor».

El segundo **no se calcula restando**: hay que correr la regla de imputación contra las otras
ventas del cliente con saldo. El ADR 0022, punto 9 y línea 104, la fija. La Fase 24 **permite
lecturas nuevas** y exige que cada brief las declare y que **las que leen por lote se midan**. Esta
lee la cuenta de un cliente entera: se declara y se mide (M-1).

### H-4 · El fondo de la lámina 04 está viejo, y solo su diálogo sirve

La 04 dibuja detrás la ficha **anterior al rediseño**: «Información general», «Productos» y «Pago»
en tarjetas sueltas, con un botón «Volver a ventas». Esa ficha ya no existe: la 24.6.2-b entregó la
de tres pestañas que dibuja la **03**.

Es la trampa que la nota del vault [[A Screen Named as the Reference Must Be Checked Against the
Spec Before It Is Copied]] describe. **De la 04 se toma el diálogo y nada más**; el fondo correcto
es el de la 03. Queda en V-1 para que no se lea como un olvido.

### H-5 · Un modal de verdad rompería la invariante de los 22 archivos

La lámina 04 dibuja un diálogo centrado sobre el fondo atenuado, y la 03 un panel lateral. Las dos
formas, hechas con estado de cliente, **solo andan con JavaScript**. El repositorio prueba lo
contrario en 22 archivos de extremo a extremo. Lo decide D-3, y la recomendación no es resignar el
dibujo: es conseguirlo con lo que ya anda.

### H-6 · Sin la capacidad `trade_ins`, la permuta no existe

`cash/service.ts:3706` devuelve `null`, y la lámina la dibuja siempre porque su organización de
ejemplo la tiene. El panel tiene que **omitir la opción entera**, no mostrarla deshabilitada: una
opción deshabilitada promete una función que la organización no contrató.

## Diferencias con la v2, declaradas antes de implementar

- **V-1 · El fondo de la lámina 04 no se implementa.** Es la ficha vieja (H-4). Se usa la de la 03.
- **V-2 · El diálogo y el panel no son `position: fixed` con estado de cliente**, sino lo que D-3
  decida. El dibujo se respeta; el mecanismo no puede ser el que rompe los 22 archivos.
- **V-3 · «Permuta con PU-000082» aparece solo con la capacidad `trade_ins`** (H-6).
- **V-4 · La barra superior de la 04 difiere de la de la 03** —una trae fecha y otra el avatar—.
  Es ruido entre piezas del lote; manda el marco de la 24.1, que ya está implementado.
- **V-5 · La «Vista previa» del cobro no se dibuja cuando entra la otra moneda.** *Agregada el
  2026-11-04, implementando.* La lámina 03 cobra en la moneda de la venta y no tiene ese caso. Con
  `?moneda=` el campo pasa a ser el de la moneda que entra, y los tres números de la previsión están
  en la moneda de la venta: mostrarlos al lado de un importe en otra moneda pediría convertir en el
  navegador con la cotización, que es una cuenta que decide el servidor dentro de la transacción. Se
  omite en vez de arriesgar un número que no coincida con lo que el registro escribe. **La permuta
  no se ve afectada**: va siempre en la moneda de la venta.
- **V-6 · El motivo de la anulación no viene preseleccionado.** *Agregada el 2026-11-04, por la
  revisión independiente (NOTA-2).* La lámina 04 dibuja «Error de carga» ya marcado. Acá ninguna
  opción viene marcada y el campo es obligatorio: en una operación que no se deshace, proponer un
  motivo invita a confirmar sin leer, y el motivo queda escrito en el comprobante de la anulación.
  La implementación ya era esta; lo que faltaba era **declararla**: la tabla de AC-14 anotaba esa
  fila como «Coincide», que es exactamente el error que una comparación entrada por entrada tiene
  que evitar.

## Decisiones

### D-1 · Qué pasa con `ReceiptForm`, que comparte pedidos — **CERRADA en (c)**

- **(a) Moverlo a `_components` compartido y rediseñarlo una vez**, con pedidos usándolo igual.
  Una sola forma del cobro en todo el proyecto. **Toca una pantalla fuera del alcance.**
- **(b) Dejarlo donde está, intacto, y escribir el panel nuevo aparte.** Pedidos no se entera.
  **Dos formas del mismo cobro conviviendo**, y la de pedidos queda sin rediseñar.
- **(c) Moverlo a `_components` **sin rediseñarlo**, y que el panel lo envuelva.** Pedidos recibe el
  mismo componente en otra ruta de importación, sin cambio visible.

***Decisión del usuario, 2026-11-04: (c).*** Conserva la regla de que nada fuera del alcance cambia de conducta, saca el
componente de una ruta que no le corresponde —hoy pedidos importa de `ventas/[saleId]/cobrar/`, que
es una frontera rara— y deja el rediseño de la pantalla de señas para su propia subfase, con su
lámina. (a) es más prolijo y es el que haría si pedidos estuviera en esta subfase; no lo está.

### D-2 · El panel vive en la ficha, en la pestaña «Cobros»

La lámina 03 muestra el panel sobre la ficha con «Cobros» activa. Es también donde el usuario ya
vuelve después de cobrar: `ventas/[saleId]/page.tsx:154` abre esa pestaña con `?cobro=<id>`.

**Cerrada por la lámina**, no hay alternativa que proponer.

### D-3 · Con qué mecanismo se abren el panel y el diálogo — **CERRADA en (a) + (b)**

- **(a) Un parámetro de URL en la ficha**, `?panel=cobro` y el `?confirmar=anular` que ya existe,
  dibujados con la forma de las láminas. Andan sin JavaScript porque son enlaces, igual que las
  pestañas. Con JavaScript se les puede agregar foco atrapado y cierre con Escape.
- **(b) Un `<dialog>` nativo** con el paso por URL como respaldo. Más fiel al dibujo —el fondo se
  atenúa de verdad—, y el elemento trae foco atrapado y Escape **gratis**. Más piezas.
- **(c) Estado de cliente.** Es lo que la lámina sugiere y lo que rompe la invariante.

***Decisión del usuario, 2026-11-04: (a) para el panel de cobro y (b) para el diálogo de
anulación.*** No es una
inconsistencia: son dos cosas distintas. El panel de cobro es un **formulario largo** que el usuario
puede querer tener abierto mientras mira la ficha, y un enlace con su URL propia se puede recargar,
compartir y volver atrás. El diálogo de anulación es **una decisión destructiva de un solo paso**,
donde atrapar el foco y cerrar con Escape **son el requisito** y `<dialog>` los da sin escribirlos.
(c) queda descartada por H-5, no por gusto.

### D-4 · La ruta `/ventas/[saleId]/cobrar` no se borra

Queda, y redirige al panel. Tres razones: está en el historial de los usuarios, la enlaza
`sale-receipts-section.tsx`, y borrarla rompería enlaces que el proyecto no controla. Una redirección
es más barata que buscar todos los enlaces.

**Cerrada**: borrar una ruta en uso no es una opción que valga proponer.

### D-5 · Cómo se dice que la vista previa de la anulación no se recomprueba — **CERRADA en (a)**

Viene de H-2. Es la decisión más importante del brief porque es la única que puede **mentirle al
usuario sobre dinero**.

- **(a) Una línea en el diálogo**, junto al efecto en dinero: «Calculado ahora. Si entra un cobro
  mientras tanto, la anulación se hace igual y este importe cambia».
- **(b) Volver a leer el efecto al confirmar y, si cambió, no anular: mostrar el nuevo y pedir de
  nuevo.** Es lo que el usuario esperaría. **No lo da el ADR**: `voidSale` no mira cobros, así que
  la relectura iría en la página, fuera de la transacción, y **seguiría teniendo la misma ventana**
  — más chica, y por eso más convincente, sin ser más cierta.
- **(c) No mostrar el efecto en dinero.** Cumple el ADR y **incumple la lámina**.

***Decisión del usuario, 2026-11-04: (a).*** Es la única que no promete lo que no se puede cumplir. (b) es peor que (a)
aunque parezca mejor: una comprobación que reduce la ventana sin cerrarla **compra confianza que no
respalda**, y es el patrón que el proyecto ya tiene anotado como modo de falla. (c) tira el valor de
la lámina por un riesgo que una línea de texto cubre.

**Si el usuario quiere la garantía de verdad**, es otra subfase y empieza por un ADR que decida si
la anulación mira cobros. Queda en §Condiciones de detención.

### D-6 · El efecto en stock se calcula, no se escribe fijo

Hoy `void-sale.tsx` elige entre dos textos fijos según si hay pedido. La lámina pide «**Se reponen 2
unidades al stock**», con el número. Se calcula de las líneas de la venta, que la ficha ya tiene.

Los tres orígenes de la tabla del README —mostrador, pedido entregado, reparación— dan tres textos
distintos, y el tercero **hoy no se distingue**: `void-sale.tsx` solo pregunta `hasOrder`. La
distinción de reparación ya existe en el listado desde la 24.6.2-b (D-3), detrás de `repairs`.

**Cerrada por la lámina**, que trae la tabla de los tres orígenes.

### D-7 · Si la vista previa del cobro entra en esta subfase — **CERRADA en (a)**

La lámina 03 trae **dos** previsiones, no una: el bloque «Vista previa» del panel —«Cobrados
después», «Faltará», «Disponible del usado después»— además de la de la anulación.

- **(a) Las dos.** Es lo que las láminas dibujan.
- **(b) Solo la de la anulación**, que es la que el Roadmap nombra como lectura nueva, y el panel
  muestra la situación actual sin previsión.

***Decisión del usuario, 2026-11-04: (a).*** La del cobro es **aritmética sobre datos que el panel ya tiene** —saldo,
importe escrito y disponible del usado—, no una lectura nueva, así que no agrega riesgo ni consulta.
Y es la que **sí** se recomprueba al confirmar (H-2), con lo cual es la barata y la más sólida de
las dos. Dejarla afuera sería dejar afuera lo fácil y quedarse con lo difícil.

### D-8 · Si «Registrar cobro» con varios medios se puede hacer en una pasada — **CERRADA en (a)**

El README del lote es terminante: «Cobrar con varios medios requiere registros separados; **no se
dibuja una operación conjunta atómica que el servicio no tenga**».

- **(a) Un medio por registro**, como hoy y como el README manda.
- **(b) Varios medios en una pasada.**

***Decisión del usuario, 2026-11-04: (a).*** (b) exigiría una transacción que `cash` no tiene y entraría en el territorio
de la 24.6.2-c —varias escrituras de dinero que o entran todas o no entra ninguna—. Está fuera.
La pongo como decisión y no como alcance excluido porque es la pregunta que el panel invita a
hacerse apenas se lo ve.

## Alcance

**Entra**: el panel de cobro de la lámina 03 dentro de la pestaña «Cobros», con la permuta y su
previsión; el diálogo de anulación de la lámina 04 con el efecto en stock y en dinero **calculados**;
la lectura nueva del efecto en dinero, en `cash`; y la redirección de `/cobrar`.

**Excluido**, y cada exclusión con su motivo:

- **El rediseño de la pantalla de señas de un pedido.** Tiene su propia lámina y no es esta subfase
  (D-1, opción (c): el componente se mueve **sin** cambiar de conducta).
- **La devolución del dinero.** `/ventas/[saleId]/devolver` existe y el README del lote la manda al
  lote financiero V2-10. La anulación **no la dispara**, y el diálogo lo dice.
- **Que la anulación mire los cobros**, que es el punto 6 del ADR 0022 (H-2, D-5).
- **Varios medios en un registro** (D-8).
- **El comprobante de la anulación**, `/ventas/[saleId]/anulacion`, que ya existe e imprime.
- **El objetivo táctil de 44 px**, que es una subfase propia todavía sin abrir.

## Lista cerrada de archivos

Salir de esta lista **se pregunta antes de implementar, sin excepción por tamaño**. Es la regla que
esta misma serie de subfases viene incumpliendo una de cada cuatro veces.

**Código**

| Archivo | Qué cambia |
|---|---|
| `src/app/(autenticado)/ventas/[saleId]/page.tsx` | El panel en «Cobros», el diálogo de anulación y el efecto calculado (D-2, D-3, D-6) |
| `src/app/(autenticado)/ventas/[saleId]/void-sale.tsx` | De dos textos fijos a los efectos calculados, y la forma del diálogo (D-3, D-5, D-6) |
| `src/app/(autenticado)/ventas/[saleId]/cobrar/page.tsx` | Pasa a redirigir al panel (D-4) |
| `src/app/(autenticado)/ventas/[saleId]/cobrar/sale-receipts-section.tsx` | El enlace al panel en vez de a la ruta |
| `src/app/(autenticado)/ventas/[saleId]/cobrar/messages.ts` | Los textos del panel, de la previsión y del efecto |
| `src/app/(autenticado)/ventas/actions.ts` | El destino después de cobrar y de anular |
| `src/app/_components/receipt-form.tsx` | **Archivo nuevo**: `ReceiptForm` movido sin cambiar de conducta (D-1, opción c) |
| `src/app/(autenticado)/ventas/[saleId]/cobrar/receipt-form.tsx` | **Se borra**, movido al anterior |
| `src/app/(autenticado)/pedidos/[orderId]/page.tsx` | **Solo la línea del import** (D-1, opción c). Sin cambio visible |
| `src/modules/cash/service.ts` | La lectura nueva del efecto en dinero de una anulación (H-3) |
| `src/modules/cash/index.ts` | Su export |

**Pruebas**

| Archivo | Qué cambia |
|---|---|
| `tests/integration/receipts.test.ts` | La lectura nueva, con cliente y sin cliente |
| `tests/integration/trade-in-payments.test.ts` | Que la previsión coincide con lo que el cobro escribe |
| `tests/e2e/sales.spec.ts` | El panel, el diálogo, los dos sin JavaScript |
| `tests/e2e/orders.spec.ts` | Que la seña de un pedido **no cambió** (D-1) |

**Documentación**: este brief con su §Cierre, `docs/product/Screens.md` §19, y al cierre
`CHANGELOG.md`, `docs/planning/Roadmap.md` y `HANDOFF.md`.

**Ninguna guarda se toca. Ninguna migración. Ninguna tabla. Ningún contrato.**

## Criterios de aceptación

| # | Criterio | Cómo se verifica |
|---|---|---|
| **AC-1** | El panel de cobro aparece en la pestaña «Cobros» con la forma de la lámina 03: medio de pago, importe con su moneda, previsión y las dos acciones | Comparación visual (AC-14) y extremo a extremo |
| **AC-2** | Con la capacidad `trade_ins` y un usado elegible del mismo cliente y moneda, aparece «Permuta con PU-…» con valor reconocido, ya aplicado y disponible | Integración y extremo a extremo |
| **AC-3** | **Sin la capacidad, la opción no aparece** — no aparece deshabilitada (H-6, V-3) | Extremo a extremo con la capacidad apagada |
| **AC-4** | La previsión del cobro dice «Cobrados después», «Faltará» y «Disponible del usado después», y coincide con lo que el registro escribe | Integración: previsión y escritura comparadas |
| **AC-5** | Un importe mayor al saldo o al disponible del usado **se rechaza al confirmar**, conservando lo cargado | Integración, con las reglas de `cash` ya existentes |
| **AC-6** | Efectivo sin sesión abierta **en la moneda que entra** avisa y ofrece el acceso **sin borrar lo cargado** | Extremo a extremo |
| **AC-7** | El diálogo de anulación muestra el efecto en stock **con el número real de unidades o cantidades**, según los tres orígenes | Integración y extremo a extremo, un caso por origen |
| **AC-8** | El efecto en dinero distingue **sin cliente** («queda a devolver») de **con cliente** («se aplica a ventas con saldo y lo restante queda a favor»), con los importes calculados | Integración, los dos casos |
| **AC-9** | **El diálogo dice que el efecto en dinero está calculado ahora y puede cambiar** (D-5) | Extremo a extremo, texto exacto |
| **AC-10** | «Conservar venta» tiene el foco al abrirse y «Anular venta» usa el tratamiento destructivo | Extremo a extremo y comparación visual |
| **AC-11** | **El panel y el diálogo andan sin JavaScript** | Extremo a extremo con `javaScriptEnabled: false`, como los otros 22 archivos |
| **AC-12** | **La seña de un pedido no cambió**: misma pantalla, mismo comportamiento (D-1) | `orders.spec.ts` sin modificar su expectativa |
| **AC-13** | La ruta `/ventas/[saleId]/cobrar` sigue respondiendo y lleva al panel (D-4) | Extremo a extremo |
| **AC-14** | **Comparación visual** contra las láminas 03 y 04, entrada por entrada, con las diferencias de V-1 a V-4 declaradas | Tabla propia en este brief, al implementar |
| **AC-15** | Contraste AA y foco visible en el panel y en el diálogo | axe |
| **AC-16** | `Screens.md` §19 dice qué cambió, incluidas las cuatro diferencias con la v2 | Revisión del documento |
| **AC-17** | **La batería completa en una sola corrida de CI**, en verde, sobre el SHA exacto | La corrida, leída **por `headSha`** |
| **AC-18** | **Revisión independiente** de un agente que no participó, de solo lectura | Antes del cierre, por `CLAUDE.md` |
| **AC-19** | **Recorrido del usuario** sobre producción: cobra una venta con permuta y mira el efecto de una anulación sin confirmarla | Después del despliegue, con su autorización |

## Mediciones requeridas

- **M-1 · La lectura nueva del efecto en dinero** (H-3): consultas y milisegundos, con un cliente
  **con varias ventas con saldo**, que es el caso que corre la imputación. Un fixture con **un solo
  cliente y una sola venta no mide nada**: colapsa la diferencia entre «se aplica a otras ventas» y
  «queda a favor», que es justo lo que la lectura decide. Es la nota
  [[A Comparative Measurement Needs a Fixture Where the Two Sides Can Differ]], que este mismo
  proyecto escribió hace dos subfases y confirmó hace una.
- **M-2 · El número de consultas de la ficha no sube en las pestañas que no son «Cobros»**, que es
  la regla que la 24.6.1 dejó y la 24.6.2-b aplicó.

## AC-14 · Comparación visual contra las láminas 03 y 04, entrada por entrada

Hecha el 2026-11-04 sobre **capturas reales** del build de producción, con un arnés temporal que
después se borró —el mismo método de la 24.6.2-c—, a 1672 × 941, la medida de las láminas, y a
390 px. El fixture reproduce los datos del README del lote: Mateo Salas, V-000221 de ARS 480.000 con
ARS 200.000 cobrados, y el usado PU-000082 con valor reconocido ARS 200.000 y ARS 120.000 ya
aplicados; y V-000220, sin cliente, dos fundas, cobrada.

### Lámina 03 · el panel de cobro

| Entrada de la lámina | En la pantalla | Veredicto |
|---|---|---|
| Panel a la derecha de la ficha, con «Cobros» activa detrás | Igual | Coincide |
| Título «Registrar cobro» y la cruz de cerrar | Igual; la cruz es un enlace a la ficha sin el panel | Coincide |
| «Venta V-000221» y el nombre del cliente debajo | Igual | Coincide |
| «Medio de pago» con los medios y «Permuta con PU-000082» | Igual; el texto dice «Permuta con el usado PU-000082», que es el de la 29.7.2 | Coincide |
| **Ficha del usado: «Valor reconocido / Ya aplicado / Disponible»** | Igual, con los tres importes de la lámina: 200.000, 120.000 y 80.000 | **Coincide**, y los dos primeros son campos nuevos de `PermutaOffer` que no cuestan ninguna consulta |
| «Mismo cliente y moneda · Sin movimiento de caja», debajo de la ficha | **Dice lo mismo en otro lugar**: el texto de ayuda del grupo de medios, que ya traía la 29.7.2 | Diferencia de ubicación, no de contenido |
| Campo «Importe» con la moneda en una caja a la izquierda | «Monto en ARS \*» como etiqueta, el campo sin prefijo y «Se lee: …» debajo | **Cosmética aceptada**: es el campo compartido con la seña de un pedido y con la caja, y cambiarlo los cambia a todos (D-1, opción c) |
| **«Vista previa»: «Cobrados después», «Faltará», «Disponible del usado después»** | Igual, con los tres números de la lámina: 280.000, 200.000 y 0 | **Coincide** |
| «Previsión. El cobro todavía no se registró.» con su ícono | Igual | Coincide |
| Botones «Volver» y «Registrar cobro» | «Cancelar» y «Registrar cobro» | **Cosmética aceptada**: «Cancelar» es el del formulario compartido; renombrarlo renombra el de la seña |
| Fondo: «Resumen actual / Total de la venta / Cobros registrados / Saldo pendiente actual» | «Cobros / Total / Cobrado / Falta» | **Preexistente**, declarada cosmética en la 24.6.2-b |
| Fondo: tabla «Pagos registrados (1)» con «Estado» y «Ver» | La tabla de la ficha, con Recibo / Medio / Monto | **Preexistente** de la 24.6.2-b |

A 390 px el panel pasa debajo de la ficha, a lo ancho y sin desplazamiento horizontal, igual que el
panel de la ficha del pedido de la 24.6.1.

### Lámina 04 · el diálogo de la anulación

| Entrada de la lámina | En la pantalla | Veredicto |
|---|---|---|
| Diálogo centrado sobre el fondo atenuado | Igual, con `showModal()` y el token `bg-overlay` | Coincide |
| «Anular venta V-000220» y la cruz | Igual | Coincide |
| «Motivo» con las cuatro opciones de la lista cerrada | Igual, **pero sin ninguna marcada**: la lámina trae «Error de carga» ya elegido | **V-6**, declarada el 2026-11-04 por la revisión independiente: la primera versión de esta tabla decía «Coincide» |
| «Efecto de la anulación» como título de la sección | Igual | Coincide |
| «Venta de mostrador sin pedido / Se reponen 2 unidades al stock.» | Igual, con «, con un movimiento «Anulación de venta».» agregado | **Coincide**; la cola es el vocabulario que la 20.4 ya usaba |
| «Se conserva el cobro de ARS 80.000 / Quedará ARS 80.000 a devolver porque no tiene cliente.» | Igual, palabra por palabra | **Coincide** |
| — | **La línea de D-5**: «Calculado ahora. Si entra un cobro mientras tanto, la anulación se hace igual y este importe cambia.» | **Sin lámina**: es lo que H-2 obliga a decir. Usa el mismo tamaño y el mismo gris que el detalle de arriba |
| Aviso ámbar «Anular la venta no devuelve dinero ni anula el recibo. La devolución se registra aparte.» | Igual | Coincide |
| «Se genera un comprobante de anulación. No se puede deshacer.» | Igual | Coincide |
| «Conservar venta» con borde y «Anular venta» en rojo, en ese orden | Igual, y «Conservar venta» con el foco | Coincide |
| **El fondo**: ficha vieja, con «Información general», «Productos» y «Pago» | La ficha de tres pestañas de la 24.6.2-b | **V-1**, declarada antes de implementar: la lámina dibuja una pantalla que ya no existe |
| Barra superior con fecha en vez del avatar | El marco de la 24.1 | **V-4** |

**Resultado: ningún desvío introducido por esta subfase.** Las dos diferencias de contenido —el
campo del importe y el botón «Cancelar»— vienen de que el formulario es compartido, que es
exactamente lo que D-1 decidió conservar.

## Mediciones hechas

**M-1 · la lectura nueva**, medida el 2026-11-04 contra PostgreSQL real con el contador de
sentencias sobre el cliente del pool, con un arnés temporal que después se borró. Mediana de cinco
corridas después de una de calentamiento, con el cliente teniendo **2, 11 y 41 ventas**, una cobrada
entera y las demás con saldo:

| Ventas del cliente | Sentencias | Mediana |
|---|---|---|
| 2 | **6** | 12 ms |
| 11 | **6** | 13 ms |
| 41 | **6** | 12 ms |

**El número no crece con la cuenta del cliente**, que es lo que había que comprobar: las cuatro
consultas del libro mayor son por cliente y no por venta. Las seis son el libro mayor (4), la venta
(1) y sus cobros (1). **Costó una decisión de diseño**: `saleStanding` ahora acepta la cuenta ya
leída, porque la primera versión la leía dos veces —una para la situación de la venta y otra para el
contrafáctico— y medía **10 sentencias**.

El fixture tiene **dos ventas y no una** a propósito. Con una sola, «se aplica a otras ventas» y
«queda a favor» dan el mismo número, y el caso pasaría con una implementación que restara, que es
justo lo que hay que descartar ([[A Comparative Measurement Needs a Fixture Where the Two Sides Can
Differ]]).

**M-2 · el costo de las otras pestañas**, verificado **por el camino del código y no medido**, con
el mismo criterio que AC-11-b de la 24.6.2-b: el recuento de consultas de una página servida no se
puede medir con el contador de sentencias, que envuelve el pool del proceso de los tests, y Next
corre en otro. Las tres lecturas que esta subfase agrega están cada una detrás de su condición
—`collecting` para el formulario del cobro, `voiding` para el origen y para el efecto en dinero—, así
que una pestaña sin panel y sin diálogo ejecuta exactamente las mismas consultas que antes de esta
subfase. Queda declarado como no medido.

## Lo que se encontró implementando

Escrito el 2026-11-04, antes de pedir la revisión independiente.

**Tres filas de la lista cerrada no eran lo que decían.** Las tres salen del mismo error: el brief
se escribió mirando el estado anterior a la 24.6.2-b en dos puntos y sin abrir `Screens.md` en uno.

- `cobrar/sale-receipts-section.tsx` figuraba por «el enlace al panel en vez de a la ruta». **No
  enlaza `/cobrar`**: ese botón se mudó al encabezado de la ficha en la 24.6.2-b. El único enlace a
  la ruta en todo `src/` estaba en `ventas/[saleId]/page.tsx`. El archivo no se tocó.
- `ventas/actions.ts` figuraba por «el destino después de cobrar y de anular». Los dos destinos ya
  eran los correctos. El archivo no se tocó.
- `Screens.md` figuraba con «§19». Las pantallas son la **18** (la ficha) y la **28** (el cobro);
  la 19 es el alta de mostrador. Se actualizaron las dos que correspondían.

**Cuatro desvíos de la lista, preguntados y autorizados por el usuario el 2026-11-04**, en dos
tandas —los dos primeros antes de escribir una línea, los otros dos al chocar con ellos—:

| Archivo | Por qué | Qué cambió |
|---|---|---|
| `ventas/messages.ts` | Los textos fijos de la anulación viven acá, no en `cobrar/messages.ts` | Los tres orígenes calculados, el efecto en dinero y la línea de D-5 |
| `cobrar/actions.ts` | Revalidaba `/ventas/<id>/cobrar`, que ahora solo redirige | Una línea: revalida la ficha |
| `receipts`, `exchange`, `trade-in-payments` y `units` de `tests/e2e/` | Afirmaban la URL de la ruta vieja, el nombre del botón que la lámina renombra y el aviso que un viewer recibía en una página que ya no existe | Las aserciones, no la conducta |
| `tests/e2e/repairs.spec.ts` | AC-7 pide un caso por origen, y el de una orden de servicio **depende de la capacidad `repairs`**: es el único lugar del repositorio donde ese camino se recorre entero | Tres líneas al final de su recorrido |

**Y una decisión de D-1 que se estiró un poco.** El brief dice mover `ReceiptForm` «sin
rediseñarlo». La previsión del cobro depende del importe que se escribe, que vive adentro del
componente, así que el usuario eligió —preguntado— que gane un **prop opcional** que solo pasa el
panel de la venta. La seña de un pedido no lo pasa y se dibuja igual: lo afirma `orders.spec.ts`, que
**no se modificó** (AC-12) y pasa sus 19 casos.

**Tres defectos propios que las pruebas encontraron**, los tres reales y los tres corregidos:

- **El enlace «Proponer lo que queda» pegaba un `?` a una dirección que ya tenía uno.** En la ruta
  vieja nunca pasaba, porque `/cobrar` no llevaba consulta; en el panel, siempre. Es exactamente el
  cuidado que `receiptExchange` había tomado en la 24.6.1, y que este componente no tenía.
- **El fondo del diálogo no se atenuaba.** La clase era `backdrop:bg-black/40`, y este proyecto
  **borra la paleta por omisión** con `--color-*: initial`: `bg-black` no existe y Tailwind no generaba
  la regla. El repositorio ya tenía el token para esto, `bg-overlay`, en los otros dos `<dialog>`.
  **No lo encontró ninguna prueba: lo encontró mirar la captura al lado de la lámina.**
- **«Conservar venta» no recibía el foco.** Medido sobre el build: el `<a>` que Next renderiza **no
  lleva el atributo `autofocus`**, así que `showModal()` se quedaba con el primer elemento enfocable,
  que es la cruz de cerrar. El foco se pone ahora explícitamente, con una referencia.

**Un defecto de fixture que costó media hora** y conviene dejar anotado: `sales.spec.ts` vacía
`document_counters` en su `beforeEach` y su helper inserta recibos por SQL **sin mover el contador**.
El primer cobro que registra la aplicación vuelve a pedir el número 1 y choca con el que ya está. El
síntoma no dice de dónde viene: la Server Action devuelve su error genérico y el caso ve una
pantalla que no cambió.

## La revisión independiente, y lo que cambió por ella

Hecha el 2026-11-04 por un agente que no participó del trabajo, con acceso de solo lectura, contra
este brief y contra las reglas vigentes (`CLAUDE.md` §Metodología). **No corrió las pruebas**: su
veredicto alcanza a lo que se puede leer. Resultado: **R1**, un hallazgo MAYOR, dos MENORES y tres
NOTAS, sin bloqueantes. Los verifiqué contra el código antes de aceptarlos, como la regla pide; los
cinco que pedían un cambio están corregidos acá, y ninguno de los dos que no lo pedían se tocó.

**MAYOR-1 · El efecto en dinero ignoraba lo que la venta tenía imputado del remanente.** Es el
hallazgo que importa, y es correcto. `saleStanding` devuelve `collected` e `imputed` como campos
distintos, y la vista previa informaba solo el primero. Pero los tres términos del reparto sí
absorben lo imputado, porque al marcar la venta anulada eso también vuelve al remanente. La
identidad real es

> `toOtherSales + toFavor + retained = cobros directos + seña + imputado`

y el brief afirmaba que cerraba con `collected`. Dos consecuencias, las dos en la pantalla de una
operación que no se deshace, y las dos reproducidas con un test antes de arreglar nada:

1. **El bloque de dinero desaparecía aunque el dinero se moviera.** Una venta cubierta con un
   **cobro a cuenta** —que existe desde la 21.6— tiene `collected` en cero y todo imputado. El
   encabezado de la ficha la muestra «Cobrada», porque `getSalesStanding` suma directo más
   imputado, y el diálogo de anulación **no decía nada del dinero**, cuando al anular esos pesos
   pasan a otra venta con saldo o quedan a favor. La previsión los calculaba bien; el corte de
   `voidMoneyEffect` los tiraba.
2. **Los números no cerraban cuando se mostraban.** Con 1.000 directos y 1.000 imputados sobre una
   venta de 2.000, y otra venta con saldo, el diálogo decía «Se conserva el cobro de $ 1.000» y
   repartía $ 2.000. Cada número era cierto por separado.

**El arreglo es de una línea**: `collected` es ahora `standing.collected + standing.imputed`, el mismo
criterio que el encabezado de la ficha usa para decir «Cobrada». Con eso la identidad cierra y el
corte de `voidMoneyEffect` pasa a ser correcto por construcción: los tres términos no son nunca
negativos, así que su suma es cero exactamente cuando `collected` es cero. **No hubo que mover el
corte**, que era la otra corrección posible. No se tocó ninguna regla de dinero.

**Lo que deliberadamente no cambié**: la fila «Cobrados después» del panel de cobro, que sigue
siendo lo directo. El propio revisor la llamó defendible y coincido, por un motivo que la hace
preferible: esa fila se lee contra la fila «Cobrado» de la pestaña, que tiene al lado su propia fila
«Imputado desde la cuenta del cliente». Son dos preguntas distintas —cuánto va a decir esa fila, y
cuánta plata tiene la venta encima— y cada número contesta la suya. Queda escrito en el tipo.

**MENOR-1 · `retained` no tenía ninguna prueba que lo ejercitara.** Cierto: las dos únicas
apariciones en las pruebas nuevas eran `retained: "0.00"`. La regla de fondo sí está cubierta desde
la 21.4 —`order-receipts.test.ts` prueba que la seña vuelve a quedar retenida cuando su venta se
anula—, pero que la **vista previa lo informe** no lo probaba nadie. Agregado: un pedido entregado
con seña, su venta, y la previsión que nombra los 500 aparte, con la identidad comprobada.

**MENOR-2 · `Screens.md` no traía ninguna diferencia con la v2, y AC-16 las pide.** Cierto, y era
un incumplimiento literal del criterio. Agregado el ítem «Lo que las láminas dibujan y no se
implementa» a la pantalla 18, con las seis diferencias y su motivo, con la forma que el resto del
documento ya usa, más la conducta de `?moneda=` en la pantalla 28.

**NOTA-1 · Con una dirección a mano el panel se abría en otra pestaña, sin previsión.** Cierto:
`collecting` no miraba la pestaña, así que `?pestana=resumen&panel=cobro` dibujaba el formulario sin
la vista previa —porque los cobros de la venta solo se leen en «Cobros»— y pagaba una lectura en una
pestaña que M-2 declara sin costo extra. Ningún enlace de la aplicación produce esa dirección, pero
D-2 dice que el panel vive en «Cobros» y el código no lo hacía cumplir. Ahora `collecting` exige las
dos cosas.

**NOTA-2 · Una entrada de la tabla de AC-14 daba por «Coincide» algo que difiere**: el motivo
preseleccionado de la lámina. Cierto. Está arriba como **V-6**, y la fila de la tabla quedó
corregida. Es el hallazgo más incómodo de los seis, porque la tabla era el instrumento.

**NOTA-3 · `.claude/settings.json` sin seguimiento.** No es de esta subfase y no se toca:
`HANDOFF.md` ya lo declara desde el 2026-11-03.

**Lo que el revisor no pudo hacer, y queda sin cubrir por él**: no tenía Bash, así que **no leyó
ningún `git diff`** —afirma «`createSaleReceipt` y `voidSale` no cambiaron» por lectura del estado de
hoy, no por diferencia— y no corrió pruebas, lint, build ni axe. AC-15 y AC-17 siguen dependiendo de
la corrida, y AC-14 de las capturas.

## Condiciones de detención

- **Si hace falta una migración, una tabla o un contrato, se para.** Las reglas de la Fase 24 lo
  prohíben y el punto de partida dice que no hacen falta.
- **Si para cumplir la lámina hubiera que hacer que `voidSale` mire los cobros, se para** (H-2):
  eso cambia el punto 6 del ADR 0022 y corresponde un ADR, no una subfase de pantallas.
- **Si el rediseño del panel empieza a cambiar la pantalla de señas de un pedido, se para** y se
  pregunta (H-1, D-1).
- **Si alguna regla de la permuta resultara no existir** donde el punto de partida dice que existe,
  se para: escribir una regla de dinero nueva no es una subfase de pantallas.
- **Si la lista cerrada de archivos se queda corta, se pregunta antes de tocar**, sin excepción por
  tamaño.

## Nivel de validación objetivo

**Validado localmente** al terminar, con AC-1 a AC-16 en verde. **Validado en integración** con
AC-17. **Validado en staging** solo después del despliegue y del recorrido del usuario (AC-19). No
certifica **preparado para producción**.

## Ubicación en la fase

Es la **decimonovena** subfase de la Fase 24 y **cierra la 24.6.2**, que se partió dos veces: en
24.6.2-b y -d por naturaleza, y antes en -c y -e por pedidos del usuario al recorrer. Con esta,
Ventas queda entero: listado, alta de mostrador, ficha, comprobante, cobro y anulación.

**Necesario ahora**: las dos láminas de dinero son lo último que le falta a Ventas.
**Requisito antes de producción**: nada que esta subfase agregue; el dinero que escribe ya se
escribe hoy por otras rutas.
**Mejora posterior**: el rediseño de la seña de un pedido (D-1), la garantía real de la vista previa
de la anulación (D-5, empieza por un ADR) y el objetivo táctil de 44 px.

## Cierre

**Cerrada el 2026-11-04.** Nivel alcanzado: **validado en staging**. No certifica preparado para
producción.

| Criterio | Estado | Evidencia |
|---|---|---|
| AC-1 a AC-13 | Cumplidos | `tests/e2e/sales.spec.ts` (el panel, la previsión, el diálogo, los tres orígenes, sin JavaScript), `tests/integration/{receipts,trade-in-payments}.test.ts` y la CI de `6f2dba7` |
| AC-14 · comparación visual | Cumplido | Las dos tablas entrada por entrada de este brief, sobre capturas del build de producción. **Encontró lo que ninguna prueba vio**: el fondo del diálogo no se atenuaba |
| AC-15 · axe | Cumplido | `expectAccessible` dentro de los casos de `sales.spec.ts`, en verde en la CI |
| AC-16 · `Screens.md` | Cumplido **después de la revisión** | No traía ninguna de las diferencias con la v2, que el criterio pide por escrito. Agregadas las seis, con su motivo |
| AC-17 · CI sobre el SHA exacto | Cumplido | Run 41831878111 sobre `6f2dba7`, `success`, 36,1 min, **leída por `headSha`**. El cambio del menú tiene la suya: run 41844563682 sobre `7432629` |
| AC-18 · revisión independiente | Cumplido | R1, seis hallazgos, ninguno bloqueante, todos reales. §La revisión independiente de este brief |
| AC-19 · recorrido del usuario | Cumplido | 2026-11-04, sobre `6f2dba7`. Encontró **un defecto estético**: el menú «Más» hecho a mano. Corregido en `7432629` y vuelto a recorrer |

**Las dos mediciones**: M-1 dio **6 sentencias** con 2, 11 y 41 ventas del cliente, planas, en 12, 13
y 12 ms. M-2 quedó **declarado como no medido** y verificado por el camino del código, con el mismo
criterio que AC-11-b de la 24.6.2-b.

**Lo que este cierre deja aprendido**, además de lo que ya está en §Lo que se encontró implementando
y en §La revisión independiente:

- **`npx playwright test` no construye.** `next start` sirve el `.next` que haya, y `reuseExistingServer:
  false` reinicia el servidor pero no reconstruye. **Tres corridas locales de extremo a extremo
  pasaron en verde habiendo probado un build de dos horas antes**, y se informaron como evidencia
  del código corregido sin serlo. Se descubrió solo porque el cambio del menú sí tenía una prueba
  que lo miraba: las otras no habrían avisado nunca. Un resultado local de extremo a extremo no vale
  sin `npm run build` inmediatamente antes, o se declara como lo que es. La CI no tiene el problema
  porque construye desde cero.
- **El control negativo del salto de proxy por túnel SOCKS dejó de ser el camino principal.** Tercer
  despliegue seguido en que no se puede abrir; la variante desde dentro del droplet contra el
  dominio público es la que funciona, y da la misma garantía por el mismo mecanismo.

**Pendientes que este cierre no toca**, declarados: el objetivo táctil de 44 px; la inconsistencia
entre el listado y la ficha (D-4 y V-1 de la 24.6.2-e); la garantía real de la vista previa, que
empieza por enmendar el punto 6 del ADR 0022; y que `docs/decisions/README.md` **no indexa ningún
brief de la serie 24.6**, hallazgo de la revisión independiente, anterior a esta subfase.
