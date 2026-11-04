# Brief 24.7.1 — Caja y cierre

- **Fase**: 24 — Pantallas rediseñadas con lo que ya existe.
- **Subfase**: 24.7.1, la vigésima de la fase y la primera del bloque de Finanzas.
- **Tipo**: `implementation`.
- **Estado**: **aprobado por el usuario el 2026-11-04, con las recomendaciones.** Las seis
  decisiones quedan cerradas por la opción recomendada, incluida **D-6**, que era una contradicción
  entre dos documentos aprobados y la resolvió el usuario.
- **Láminas**: 01, 02, 03, 04, 05, 08 y la mitad de caja de la 09, del lote
  [V2-10](../ui-redesign/v2/21-caja/README.md). Las láminas 06 y 07 son de la 24.7.2.
- **Pantallas de `Screens.md`**: 21 (Caja), 22 (Abrir caja), 23 (Registrar aporte o retiro),
  24 (Cerrar caja), 25 (Sesiones de caja) y 26 (Sesión de caja y su arqueo).

## Objetivo

Que las seis pantallas de caja tengan la forma del lote V2-10, **sin cambiar una sola regla de
dinero** y sin migraciones, tablas ni contratos nuevos. Lo que esta subfase agrega es presentación
y una previsión; lo que mueve la plata ya está escrito y probado desde la Fase 21.

## Punto de partida verificado

Leído el 2026-11-04 contra el código, no contra la documentación:

- **Las seis pantallas existen y funcionan** desde la 21.2, ampliadas por la 21.3 (cobros), la 21.4
  (señas), la 21.5 (anulaciones y devoluciones), la 22.6 (pagos a proveedores), la 29.4 (el total de
  referencia) y la 29.7.2 (pagos de usados). Suman **662 líneas** en las cinco páginas, más
  `session-tables.tsx` (790) y `messages.ts` (365).
- **`getCashState` ya devuelve todo lo que la lámina 01 quiere unificar**, en una sola lectura:
  `movements`, `receipts`, `refunds`, `lateVoids`, `supplierPayments`, `tradeInPayments`,
  `currencies` y `reference` (`src/modules/cash/service.ts:1236`). **Unificar es composición en la
  página, no una lectura nueva.**
- **El «equivalente orientativo» de la lámina ya está implementado**: `ReferenceTotal`
  (`caja/reference-total.tsx`), de la 29.4 (D-7 y D-8), con la cotización, su fecha, el aviso de
  cotización vieja y la regla de no mostrar nada sin moneda principal o sin cotización. La lámina lo
  dibuja como novedad y **no lo es**.
- **La moneda principal ya se propone en la apertura** (29.4, D-9).
- **El cierre ya es de dos pasos**, con lo esperado a la vista, «Corregir lo contado» y el
  recálculo que rechaza cerrar si lo esperado cambió mientras confirmabas (pantalla 24).
- **Lo único que la lámina pide y no existe** es la **previsión del movimiento** (lámina 03: «La
  revisión muestra esperado actual y previsto después de registrar»). Hoy el formulario solo tiene
  una advertencia fija: «Efectivo que sale de la caja: no puede dejar lo esperado por debajo de
  cero» (`caja/movimiento/page.tsx:65`).

**Consecuencia para el alcance**: esta subfase es, en su mayor parte, **reordenar lo que ya se lee**.
La columna de lecturas nuevas del Roadmap dice «—» y, verificado, es correcta.

## Las fronteras entre módulos, releídas con grep

Releídas hoy en `docs/architecture/Overview.md`, aunque ya se habían leído en esta sesión, porque la
skill lo exige y porque creerlas incorporadas es el modo en que fallan:

- **`cash` depende de `sales`, `orders`, `crm`, `purchasing`, `tradeins` y `fx`** (líneas 177 a 187,
  ADR 0022 a 0025). **Ningún módulo depende de `cash`**: lo cobrado en una venta o en un pedido y el
  saldo de un cliente **los compone la página**.
- La dirección `cash → fx` es la que habilita el total de referencia sin romper nada: `fx` no sabe
  de caja.
- **Esta subfase no agrega ninguna dependencia nueva**, porque no agrega ninguna lectura. Si al
  implementar apareciera la tentación de una, es condición de detención (§Condiciones de detención).

## Hallazgos que condicionan el alcance

### H-1 · El `viewer` no recibe dos de las listas que la lámina unifica

`supplierPayments` y `tradeInPayments` son **`null` para un `viewer`** a propósito
(`service.ts:1253` y `:1256`; brief-22.6, D-9): ve los **totales** por moneda, no el detalle con
nombres de proveedores. La página ya lo respeta (`caja/page.tsx:66`).

La lámina 01 dibuja **una sola lista de movimientos unificada**. Unificarla sin pensar produce, para
un `viewer`, **una lista que no cuadra con la columna de totales que tiene arriba**: el total incluye
pagos que la lista no muestra, sin decir por qué. Es el mismo modo de falla que la 24.6.2-d tuvo con
el dinero de la anulación —un número y sus partes que no cierran—, y acá se puede prever. **Es D-1.**

### H-2 · La previsión del movimiento es aritmética, no una lectura

Lo esperado por moneda ya viene en `currencies`. «Esperado después» es ese número más o menos el
importe escrito, con el signo del tipo. **No hace falta ninguna lectura nueva**, igual que la vista
previa del cobro de la 24.6.2-d.

Dos límites que hay que decir en la pantalla, y no esconder:

- **Un retiro no puede dejar lo esperado negativo**, y la regla la vuelve a comprobar el servidor
  dentro de la transacción. La previsión **anticipa el rechazo**, no lo reemplaza.
- **Es una foto**: entre leerla y confirmar puede entrar un cobro en efectivo. A diferencia de la
  anulación de una venta (24.6.2-d, H-2), acá **el servidor sí vuelve a mirar** al registrar, así
  que la previsión no promete nada que la escritura no compruebe. **No hace falta la línea de
  salvedad de la 24.6.2-d**, y ponerla sería ruido.

### H-3 · «Más» en la barra de caja choca con el menú de las fichas

El README del lote dice: «Más reúne configuración y destinos secundarios sin esconder la sección
activa». La barra de hoy (`cash-sub-nav.tsx`) lleva «Caja de hoy», «Sesiones», «Cobros»,
«Devoluciones» y «Medios de pago», todos al mismo nivel.

El proyecto **ya tiene** un control de desbordamiento: `MoreActions` con `iconOnly`, el botón de
tres puntos de las fichas del producto, del cliente, de la entrada y —desde el 2026-11-04— de la
venta. Pero `MoreActions` es un **menú de acciones**, y acá lo que se agrupa son **destinos de
navegación**. Usar el mismo control para las dos cosas confunde «qué hace» con «adónde va». **Es
D-3.**

### H-4 · La barra de caja no está en la lista de la v2 de «consistencia» — SALDADO

El lote 32 (`32-consistencia-accesibilidad`) fija los patrones comunes. Quedó declarado como
pendiente de lectura antes de implementar D-3 y D-4, porque era donde podía estar ya resuelto cómo
se agrupan destinos.

**Leído el 2026-11-04, antes de implementar. No lo resuelve, y lo confirma.** Su única regla sobre
agrupación dice: «Más acciones reúne operaciones menos frecuentes y destructivas. No se duplica una
acción en el menú si ya está visible.» Habla de **acciones**, no de destinos de navegación, que es
exactamente la distinción en la que D-3 se apoya. El lote tampoco define una barra de sección.
Queda, eso sí, una regla aplicable que no estaba en este brief: **no duplicar en el menú algo que ya
está visible**, que vale para el «Más» de D-3.

## Diferencias con la v2, declaradas antes de implementar

- **V-1 · El equivalente orientativo no es nuevo.** La lámina 01 lo dibuja como una fila destacada;
  existe desde la 29.4 con la misma semántica. Se conserva **tal como está**, incluida su regla de no
  inventar un cero ni una tasa. No se rediseña.
- **V-2 · Los importes de ejemplo de la lámina son ficticios** y su escenario (sesión C-000046,
  cotización 1 USD = ARS 1.500) no se implementa: es un fixture del diseño.
- **V-3 · La lámina 09 mezcla estados de caja y de cuentas de clientes.** Solo la mitad de caja entra
  acá; la otra mitad es de la 24.7.2.
- **V-4 · La barra superior de cada lámina difiere entre piezas del lote.** Manda el marco de la
  24.1, como en todas las subfases de esta fase.
- **V-5 · Las láminas 01 y 03 dibujan barras de sección distintas.** La 01 agrupa en un «Más» y la
  03 muestra pestañas «Resumen · Movimientos · Registrar movimiento». Manda la 01: registrar un
  movimiento es una página propia desde la 21.2, no una pestaña de la caja, y convertirla cambiaría
  sus pasos, que el alcance excluye.
- **V-6 · La lista de la lámina 01 nombra al cliente de un cobro** («Cobro de Paula Méndez»).
  `getCashState` no devuelve ese nombre, y pedirlo sería una lectura nueva, que la condición de
  detención 1 prohíbe sin preguntar. La lista dice el **destino**, que sí está —«Cobro · Venta
  V-000012», «Cobro · Pedido P-000001», «Cobro · A cuenta»—, y el nombre queda a un clic, en el
  recibo.

*V-5 y V-6 se agregaron el 2026-11-04, al revisar la entrega: el §Cierre y un comentario del código
los citaban sin que existieran, que es el mismo defecto que la revisión de la 24.6.2-b registró como
MENOR-3.*

## Decisiones

Las seis están **abiertas**. Cada una lleva mi recomendación, que no vale como decisión.

### D-1 · Qué ve un `viewer` en la lista unificada de movimientos (H-1) — CERRADA en (a)

- **(a)** Una sola lista para los dos roles, y para el `viewer` **una línea explícita** donde faltan
  las filas: «Los pagos a proveedores y de usados suman a los totales; su detalle es solo para un
  administrador.»
- **(b)** Lista unificada solo para `admin`; el `viewer` conserva las tarjetas separadas de hoy.
- **(c)** No unificar: conservar las tarjetas separadas para los dos roles, y tomar de la lámina solo
  la jerarquía visual.

***Decisión del usuario, 2026-11-04: **(a)**. Es la que cumple la lámina sin mentirle a nadie, y la que evita el defecto
que la 24.6.2-d pagó: un total cuyas partes no se ven y nadie explica. El costo es una línea de
texto.***

### D-2 · La previsión del movimiento (H-2) — CERRADA en (a)

- **(a)** Un bloque «Vista previa» en el mismo formulario, que sigue lo que se escribe, con el
  servidor calculándolo para el caso sin JavaScript. **Es exactamente el patrón de la 24.6.2-d**, ya
  implementado y probado.
- **(b)** Un segundo paso de revisión, como el cierre.

***Decisión del usuario, 2026-11-04: **(a)**. (b) convierte en dos pasos una operación de un paso que hoy funciona, y el
cierre es de dos pasos porque es irreversible; un aporte se corrige con el movimiento opuesto.***

### D-3 · El «Más» de la barra de caja (H-3) — CERRADA en (a)

- **(a)** Un `<details>` de navegación propio de la barra, con «Medios de pago» y «Cotización»
  adentro, y «Caja actual», «Sesiones», «Cobros» y «Devoluciones» siempre visibles.
- **(b)** Reusar `MoreActions` con `iconOnly`, el de las fichas.
- **(c)** No agrupar: dejar los cinco destinos al mismo nivel y tomar de la lámina solo el orden.

***Decisión del usuario, 2026-11-04: **(a)**, después de leer el lote 32 (H-4). `MoreActions` es un menú de acciones y
esto son destinos; reusarlo por parecido visual es la misma clase de error que copiar una pantalla
sin mirar su lámina. Y un `<details>` anda sin JavaScript, que acá es invariante medida.***

### D-4 · Las pestañas de móvil de la lámina 08 — CERRADA en (a)

La lámina separa «Resumen» y «Movimientos» en pantalla chica.

- **(a)** Un parámetro de URL, como las pestañas de la ficha de la venta y del pedido.
- **(b)** Estado de cliente.

***Decisión del usuario, 2026-11-04: **(a)**, sin dudar: 22 archivos de `tests/e2e/` prueban esta aplicación sin
JavaScript, y (b) no anda ahí.***

### D-5 · Si las pantallas de caja adoptan el botón de tres puntos para sus **acciones** — CERRADA en (a)

«Registrar aporte», «Registrar retiro» y «Cerrar caja» están hoy como botones en línea.

- **(a)** Conservarlos en línea: son las tres acciones principales de la pantalla.
- **(b)** Dejar la principal visible y mandar las otras al menú de tres puntos.

***Decisión del usuario, 2026-11-04: **(a)**. El menú de desbordamiento es para lo poco frecuente y lo destructivo; acá
las tres son el trabajo del día. «Cerrar caja» sí lleva tratamiento de operación irreversible.***

### D-6 · **Contradicción entre documentos**: qué propone el formulario de apertura — CERRADA en (b)

Los dos textos están aprobados y dicen cosas distintas:

| Fuente | Qué dice |
|---|---|
| `Screens.md` §22, de **brief-21.2, D-3** | El formulario propone «lo contado en el último cierre» |
| README del lote **V2-10** | «El inicial se cuenta y declara; **no se copia silenciosamente del cierre anterior**» |

**Por la jerarquía de fuentes de verdad del proyecto, gana el brief-21.2**: `docs/decisions/` está en
el nivel 3 y los documentos de rediseño son contexto de apoyo. Pero la objeción de la v2 no es
caprichosa: un campo prellenado con el conteo de ayer invita a confirmar sin contar, que es
exactamente lo que un arqueo no debe permitir.

- **(a)** Conservar la conducta actual. La v2 queda declarada como diferencia.
- **(b)** Dejar los campos **vacíos** y mostrar lo contado en el último cierre **al lado, como dato**,
  con un «Usar estos valores» explícito. Cumple las dos cosas: no copia en silencio y no obliga a
  buscar el dato en otra pantalla.
- **(c)** Dejarlos vacíos y no mostrar nada.

***Decisión del usuario, 2026-11-04: **(b)**. Es la única que respeta la intención de las dos fuentes. **Cambia conducta
de una pantalla de dinero**, así que no la tomo sin que la decidas vos.***

## Alcance

**Incluido:**

1. La pantalla 21 con la forma de la lámina 01: jerarquía, totales por moneda y la lista unificada
   de movimientos según D-1.
2. La pantalla 23 con la previsión de la lámina 03, según D-2.
3. Las pantallas 22, 24, 25 y 26 con la jerarquía, el espaciado y los patrones de la 24.1, sin
   cambiar sus pasos ni sus reglas.
4. La barra de caja según D-3 y las pestañas de móvil según D-4.
5. La apertura según D-6.
6. `Screens.md` actualizado, **con las diferencias con la v2**, que es un criterio y no un extra.

**Excluido, y por qué:**

- **Las láminas 06 y 07** (cobros, recibo con conversión, devoluciones): son la **24.7.2**.
- **Cotización y medios de pago**: son la **24.7.3**, aunque la barra los enlace.
- **Cualquier regla de dinero**: el cálculo de lo esperado, los motivos, los topes, el recálculo al
  cerrar y el arqueo guardado **no se tocan**.
- **Migraciones, tablas y contratos**: prohibidos por la fase.
- **El objetivo táctil de 44 px**: sigue siendo una subfase propia.

## Lista cerrada de archivos

Salirse de esta lista **se pregunta antes de implementar**, sin excepción por tamaño.

| Archivo | Qué cambia |
|---|---|
| `src/app/(autenticado)/caja/page.tsx` | La lámina 01: jerarquía y lista unificada |
| `src/app/(autenticado)/caja/cash-sub-nav.tsx` | D-3 |
| `src/app/(autenticado)/caja/session-tables.tsx` | Las tablas compartidas por la pantalla 21 y el arqueo |
| `src/app/(autenticado)/caja/messages.ts` | Los textos nuevos: la línea de D-1 y la previsión |
| `src/app/(autenticado)/caja/movimiento/page.tsx` | D-2 |
| `src/app/(autenticado)/caja/movimiento/movement-form.tsx` | D-2 |
| `src/app/(autenticado)/caja/abrir/page.tsx` | D-6 |
| `src/app/(autenticado)/caja/abrir/open-form.tsx` | D-6 |
| `src/app/(autenticado)/caja/cerrar/page.tsx` | Jerarquía de la lámina 04 |
| `src/app/(autenticado)/caja/cerrar/close-form.tsx` | Jerarquía de la lámina 04 |
| `src/app/(autenticado)/caja/sesiones/page.tsx` | Lámina 05 |
| `src/app/(autenticado)/caja/sesiones/[sessionId]/page.tsx` | Lámina 05, el arqueo conservado |
| `docs/product/Screens.md` | §21 a §26 |
| `tests/e2e/cash.spec.ts` | Los casos nuevos y los que cambien de localizador |

**Desvíos de esta lista, preguntados y autorizados antes de implementar:**

| Archivo | Por qué | Autorizado |
|---|---|---|
| `src/app/_components/sub-nav.tsx` | D-3 necesita un «Más» en la barra de sección, y `SubNav` es el componente compartido que dibuja esa barra en clientes, ventas, pedidos y productos. La alternativa era una barra propia de caja, que dejaría **dos barras de sección** en el sistema: exactamente la forma del menú hecho a mano que el recorrido de la 24.6.2-d encontró en el encabezado de la venta. La ranura es **opcional**: sin `more`, las demás pantallas dibujan lo de antes | 2026-11-04 |
| `tests/e2e/receipts.spec.ts`, `tests/e2e/refunds.spec.ts`, `tests/e2e/supplier-payments.spec.ts` | Las tres asertan sobre la pantalla 21 **anterior**: la región «Cobros en efectivo de la sesión», que D-1 unificó, y `getByRole("row").nth(1)` de la tabla por moneda, que ahora está transpuesta. No es un defecto de la subfase: es la consecuencia esperada de dos decisiones aprobadas, en specs que el brief no previó. Se corrigen los localizadores **y se conserva lo que cada aserción probaba**, releída contra la lista unificada | 2026-11-04 |
| `tests/e2e/exchange.spec.ts`, `tests/e2e/order-receipts.spec.ts`, `tests/e2e/trade-in-payments.spec.ts` | **La misma causa, encontrada después**: la etiqueta del total de referencia en la pantalla 21 pasó a ser «Equivalente orientativo» (lámina 01), la tarjeta de cobros es la lista unificada y «Pagos de usados» es el encabezado de una fila y no de una columna. Mismo tratamiento. Una de ellas, `order-receipts`, **encontró una pérdida real**: la lista unificada no decía a qué pedido entró una seña, dato que la tarjeta mostraba desde la 21.4. Está en lo que `cash` ya devuelve, así que pasó al concepto —«Cobro · Pedido P-000001»— sin ninguna lectura nueva | 2026-11-04 |
| `src/app/(autenticado)/caja/money-fields.tsx`, `src/app/(autenticado)/caja/currency-rows.tsx` | El barrido de anchos de AC-8 encontró que **a 320 px el `<select>` de Moneda desborda la página**: su opción más larga le fija un ancho mínimo de 413 px, y la página se iba 109 px en el movimiento y 130 px en el cierre. **Es anterior a la 24.7.1** —los tres archivos implicados estaban sin tocar— y el arreglo es una clase. `CurrencySelect` recibe un `className` opcional y las pantallas de caja le pasan `w-full min-w-0`; cobrar a cuenta y pagos a proveedores, que también lo usan, quedan **idénticas**. La alternativa era declararlo incumplido y mandarlo a una subfase propia | 2026-11-04 |

**Sin tocar, a propósito**: `src/modules/cash/**` —ninguna regla ni lectura cambia—,
`caja/actions.ts`, `caja/reference-total.tsx`, `caja/exchange.ts` y `caja/money-fields.tsx`.

## Criterios de aceptación

| # | Criterio | Cómo se verifica |
|---|---|---|
| **AC-1** | La pantalla 21 tiene la forma de la lámina 01, con los totales por moneda y la lista unificada | e2e + comparación visual |
| **AC-2** | Un `viewer` ve totales y lista **coherentes entre sí**, según D-1 | e2e con los dos roles |
| **AC-3** | La previsión del movimiento sigue lo que se escribe y coincide con lo que el registro deja | e2e + integración |
| **AC-4** | Un retiro que dejaría lo esperado negativo **lo anuncia antes** y el servidor lo rechaza igual | e2e |
| **AC-5** | La apertura se comporta según D-6 | e2e |
| **AC-6** | El cierre conserva sus dos pasos, «Corregir lo contado» y el rechazo por cambio de lo esperado | e2e, **sin modificar** esos casos |
| **AC-7** | Las seis pantallas andan **sin JavaScript** | e2e con `javaScriptEnabled: false` |
| **AC-8** | Sin desbordamiento horizontal de 320 a 1440 px, y las pestañas de móvil de la lámina 08 | e2e |
| **AC-9** | axe sin violaciones A ni AA en cada estado | `expectAccessible` |
| **AC-10** | **Ninguna regla de dinero cambió**: `src/modules/cash/**` sin modificar | `git diff --stat` |
| **AC-11** | **Ninguna lectura nueva**: la pantalla 21 ejecuta las mismas consultas que antes | contador de sentencias, o declarado por camino de código si no se puede medir |
| **AC-12** | `Screens.md` §21 a §26 dice qué cambió, **incluidas las diferencias V-1 a V-4** | lectura |
| **AC-13** | Comparación visual contra las láminas 01, 02, 03, 04, 05 y 08, **entrada por entrada** | tabla en el §Cierre |
| **AC-14** | La batería completa en **una sola corrida de CI**, en verde, sobre el SHA exacto | leída por `headSha` |
| **AC-15** | Revisión independiente de un agente que no participó | su veredicto |
| **AC-16** | Recorrido del usuario en producción | tu confirmación |

## Mediciones requeridas

- **M-1 · Que no haya lectura nueva (AC-11).** Se cuenta lo que ejecuta la pantalla 21 antes y
  después. Si el contador de sentencias no alcanza porque Next corre en otro proceso —como en la
  24.6.2-b y la 24.6.2-d—, se declara **verificado por camino de código y no medido**, con ese
  nombre y no con otro.
- **M-2 · El costo de la lista unificada con muchos movimientos.** Es composición en memoria, así
  que lo que se mide es que **no aparezca un `N+1`** al resolver nombres o destinos. Fixture con una
  sesión de al menos 40 movimientos de los cinco tipos.

## Condiciones de detención

Se para y se pregunta, sin seguir:

1. **Si hiciera falta una lectura nueva.** La columna del Roadmap dice «—» y el punto de partida lo
   confirma. Si aparece una necesidad real, es una enmienda al alcance, no un detalle.
2. **Si una lámina pidiera cambiar una regla de dinero**: el cálculo de lo esperado, un motivo, un
   tope, el recálculo al cerrar o el arqueo guardado.
3. **Si D-6 llevara a tocar el servicio de apertura.** La decisión es de presentación; si para
   cumplirla hubiera que cambiar `openCashSession`, se para.
4. **Si la lista unificada necesitara un dato que `cash` no da hoy para un `viewer`.** La respuesta
   no es pedírselo a `cash`: es D-1.

## Nivel de validación objetivo

**Validado localmente** al terminar, con AC-1 a AC-13 en verde. **Validado en integración** con
AC-14. **Validado en staging** solo después del despliegue y de tu recorrido (AC-16). No certifica
**preparado para producción**.

## Ubicación en la fase

Es la **vigésima** subfase de la Fase 24 y abre el bloque de Finanzas, que sigue con la 24.7.2
(cobros, devoluciones y cuentas) y la 24.7.3 (cotización y medios de pago).

**Una nota del Roadmap que ya no se puede cumplir como está escrita**, y que esta subfase no
resuelve: dice «La 24.7.2 va antes de la pestaña de cuenta de la ficha del cliente (24.4.1), o
comparte su componente». **La 24.4.1 se cerró el 2026-10-29**, así que la primera opción venció y
queda la segunda. Es un hallazgo para el brief de la 24.7.2, no para este.

**Necesario ahora**: es la puerta del bloque de Finanzas y fija sus patrones, como la 24.6.2-b fijó
los de Ventas.
**Requisito antes de producción**: nada que esta subfase agregue.
**Mejora posterior**: el objetivo táctil de 44 px y la lista unificada para un `viewer` si D-1 sale
por (b) o (c).

## Cierre

*Implementado el 2026-11-04. Cerrada el 2026-11-04.*

**Nivel alcanzado: validado en integración.** Lo fija este mismo brief en §Nivel de validación
objetivo, sin interpretación: «**Validado en integración** con AC-14. **Validado en staging** solo
después del despliegue y de tu recorrido (AC-16)». AC-14 está cumplido y AC-16 **no**, así que el
nivel se queda en integración. **No certifica preparado para producción.**

- **AC-1 a AC-13**: en verde contra un build hecho en la misma corrida, con la guarda de frescura
  del build confirmándolo («Build de la corrida»).
- **AC-14 cumplido**: la batería completa en **una sola corrida de CI**, en verde, sobre el SHA
  exacto. Run **41909701797** sobre `cad4e60f125aeb3608f1754be11e3fa736b6b4fa`, leída por
  `headSha` y no por «la última». Pasaron los treinta y siete pasos, **incluido el de formato**,
  que en esta máquina falla por `core.autocrlf` y que acá es el único veredicto real.
- **AC-15 cumplido**: la revisión independiente devolvió **R1**, sus hallazgos se verificaron uno
  por uno y los diez reales están corregidos (§Revisión independiente, más abajo).
- **AC-16 NO cumplido, y este brief no lo da por hecho.** El criterio pide «tu confirmación», y el
  usuario autorizó el cierre sin declarar el recorrido. Queda pendiente, no satisfecho por el
  despliegue: desplegar y verificar no es recorrer, y un nivel superior no se infiere de uno
  inferior. Si el recorrido se hace después, se anota acá con su fecha y el nivel pasa a
  **validado en staging**.

### Despliegue y verificación en producción

| | |
|---|---|
| SHA desplegado | **`cad4e60`** (`cad4e60f125aeb3608f1754be11e3fa736b6b4fa`) |
| CI sobre ese SHA | **`success`**, run 41909701797, leída por `headSha` |
| Vuelta atrás | **`7432629`**, anotado en `/var/lib/crm-production/despliegues` antes de desplegar |
| Migraciones | **ninguna** entre `7432629` y `cad4e60`: cero archivos de `drizzle/`; siguen **67**. La vuelta atrás es solo de código |
| Caída durante el despliegue | unos **dos minutos**, la ventana esperada: el servicio se detiene para el build desde la 29.5. Activo otra vez a las 21:49:43 UTC, `Ready in 422ms` |

**Las siete verificaciones del runbook, todas pasadas:**

1. **La configuración desplegada es la versionada**: **18 de 18 iguales**, y el bucle mira
   exactamente los 18 archivos versionados — la cuenta se comprobó, que es justo lo que falló las
   dos veces anteriores, cuando el bucle pasó en verde habiendo mirado menos archivos de los que
   decía.
2. **Un solo salto de proxy**, medido por consecuencia: **iguales**, con las tres condiciones que
   lo hacen válido comprobadas y no supuestas — la ventana de 15 minutos estaba en **cero antes**
   del intento, la fila es de recién (21:52:40 UTC) y su clave **no** es el `sha256` de la
   constante `'sin-proxy'`. El **control negativo** dejó **dos claves distintas para dos
   orígenes**. Se hizo con la variante desde dentro del droplet: **cuarto despliegue seguido** sin
   poder usar el túnel SOCKS, así que la nota del README acierta y la variante es el camino
   principal. *El recuento se corrigió al cerrar*: acá decía «tercer», copiado del README, que
   documenta dos —2026-11-01 y 2026-11-03— y **no registró el del 2026-11-04**; la memoria de
   trabajo sí lo tenía. Recontar en vez de copiar es la regla del proyecto y esta vez la aplicó
   el cierre, no la redacción. Ni la IP ni su hash se escriben acá.
3. **HSTS** presente sobre HTTPS (`max-age=31536000; includeSubDomains`) y ausente sobre HTTP, que
   responde 301.
4. **La aplicación escucha solo en loopback**: `127.0.0.1:3000`.
5. **El rol de la aplicación no es el dueño**: `crm_app_login` contra `crm_owner`, con
   `INSERT=t`, `DELETE=f` y `UPDATE=f` sobre `audit_logs`, leído del catálogo y sin mandar
   ninguna escritura destructiva.
6. **La ingestión y la API de lectura**: las tres rutas responden **401** sin token desde afuera,
   que es como deben estar desde la 13.5.2-a.
7. **Ningún dato real de un cliente**: «Vixora» en **0 clientes, 0 mensajes y 0 productos**; las
   otras dos organizaciones son de demostración, con el desglose por organización y no en total.

**El journal, desde el reinicio**: nada a prioridad *warning* o superior en journald, y los únicos
avisos de aplicación son los que dejaron las propias verificaciones —los dos intentos de ingreso
del paso 2 y las tres sondas del paso 6—. Ninguno viene del código nuevo.

### AC-13 · Comparación visual contra las láminas, entrada por entrada

Cada pantalla se comparó contra su lámina leyendo las dos, no de memoria. Las diferencias **están
todas acá**, con su motivo; ninguna es un olvido.

#### Lámina 01 · La caja abierta (pantalla 21)

| Entrada de la lámina | En la pantalla | |
|---|---|---|
| H1 «Caja» con subtítulo «Efectivo del negocio.» | «Caja» · «El efectivo del negocio.» | ✔ |
| «+ Registrar movimiento» primaria y «Preparar cierre» secundaria, arriba a la derecha | igual | ✔ |
| Barra: Caja actual · Sesiones · Cobros · Devoluciones · Más ⌄ | igual, con «Deudores» también a la vista —D-3 nombró solo «Cotización» y «Medios de pago» para el menú—; la nuestra lleva ícono en cada sección, la lámina no | ✔ |
| Tarjeta de sesión con número, insignia «Abierta», fecha y responsable | igual; la insignia baja a la línea siguiente en vez de ir al lado del número | ✔ con diferencia menor |
| Tabla Concepto × moneda, con «Esperado» destacado y signos + y − | igual | ✔ |
| Filas «Pagos a proveedores» y «Pagos de usados» | solo cuando la sesión tuvo alguno, que es la regla que ya existía | ✔ |
| «Equivalente orientativo» con cotización y hora | igual; en la captura no se ve porque la organización de prueba no tiene cotización cargada | ✔ |
| Aviso ámbar de moneda | igual | ✔ |
| «Movimientos recientes» con «Ver todos» | igual | ✔ |
| Columnas Fecha y hora · Comprobante · Concepto · Moneda · Importe | igual | ✔ |
| Columna «Acción» con un «Ver» por fila | **no está**: el comprobante ya es el enlace, y una columna con un segundo camino al mismo lugar es la misma duplicación que el recorrido de la 24.6.2-d marcó en la ficha de la venta | ✖ declarada |
| «Cobro de Paula Méndez» | «Cobro», o «Cobro · Venta V-000012» / «Cobro · Pedido P-000001» / «Cobro · A cuenta» | ✖ declarada: el destino sí está porque `cash` ya lo devuelve; el nombre del cliente exigiría una lectura nueva (V-6) |

#### Lámina 02 · Abrir caja (pantalla 22)

| Entrada de la lámina | En la pantalla | |
|---|---|---|
| Campos vacíos, sin copiar el cierre anterior | igual (D-6) | ✔ |
| Tarjeta «Antes de abrir» al costado con lo contado al cerrar | igual, con «Usar estos valores» como enlace | ✔ |
| «Estos importes son lo que hay físicamente al iniciar» | «Al cerrar la última sesión se contó:» + el detalle | ✔ |
| «Agregar moneda» y papelera por fila | **no están**: el formulario muestra cuatro filas fijas desde la 21.2, y cambiarlo es tocar `currency-rows.tsx` más allá del arreglo de ancho autorizado | ✖ declarada |
| Banderas junto a cada moneda | **no están** en ninguna pantalla del sistema | ✖ declarada |
| El selector muestra «USD Dólar estadounidense» completo | se trunca a «USD — dólar estadoun…» | ✖ declarada: es **el precio del arreglo de 320 px**. Sin `min-w-0` el select mide 413 px y desborda la página en un teléfono; con él se encoge a su columna. El código de moneda, que es lo que identifica, queda siempre a la vista |

#### Lámina 03 · Registrar movimiento (pantalla 23)

| Entrada de la lámina | En la pantalla | |
|---|---|---|
| Tarjeta «Registrar movimiento» a la izquierda, revisión a la derecha | igual | ✔ |
| Conmutador «Aporte | Retiro» con íconos | igual, y son dos enlaces: cada tipo trae su lista de motivos del servidor | ✔ |
| Moneda e Importe en una fila | igual | ✔ |
| Motivo como desplegable | igual | ✔ |
| Caja de información con qué **no** es este movimiento | igual | ✔ |
| «Volver» y «Registrar retiro» | igual | ✔ |
| «Revisión del retiro»: esperado actual, por registrar, «Esperado después» destacado | igual, y la aritmética cierra: 7.500 + 1.500 = 9.000 | ✔ |
| «Efectivo en USD (sin cambios)» | igual | ✔ |
| «La disponibilidad se vuelve a comprobar al guardar.» | igual | ✔ |
| Pestañas Resumen · Movimientos · Registrar movimiento | **no están**: registrar un movimiento es una página propia desde la 21.2, no una pestaña de la caja, y convertirla cambiaría sus pasos | ✖ declarada |

#### Lámina 04 · Cerrar caja, paso 2 (pantalla 24)

| Entrada de la lámina | En la pantalla | |
|---|---|---|
| «Paso 2 de 2: Revisión» | está, debajo del subtítulo, no dentro del H1 | ✔ con diferencia menor |
| Aviso «Lo contado es físico; la diferencia no se compensa entre monedas.» | igual | ✔ |
| Tabla Moneda · Esperado · Contado · Diferencia | igual | ✔ |
| Diferencia como insignia con ícono | igual; el sobrante va en ámbar como el faltante, porque en un arqueo tampoco es normal | ✔ |
| Tarjeta «Revisar antes de cerrar» con lo contado por moneda | igual | ✔ |
| Tipo de cambio y equivalente orientativo | igual, en la línea de referencia de la 29.4 (no se ve en la captura por lo mismo que en la 01) | ✔ |
| Las tres advertencias en ámbar | igual, y las tres se verificaron contra el código antes de escribirlas | ✔ |
| «Corregir lo contado» y «Cerrar caja» en rojo | igual | ✔ |
| «← Corregir conteo» arriba a la derecha | **no está**: es la misma acción que «Corregir lo contado», que está abajo; dos nombres distintos para lo mismo confunden más de lo que ahorran | ✖ declarada |
| Subtítulo con quién abrió la sesión y cuándo | **no está**: exige la zona horaria de la organización, que esta pantalla no lee, y la condición de detención 1 dice que una lectura nueva se pregunta antes | ✖ declarada |

#### Lámina 05 · Sesiones y arqueo (pantallas 25 y 26)

| Entrada de la lámina | En la pantalla | |
|---|---|---|
| H1 «Sesiones de caja» | igual | ✔ |
| Buscador por número | igual, con su etiqueta visible | ✔ |
| Estado como insignia | igual, en su propia columna | ✔ |
| Columnas Número · Fecha · Horario · Estado · Acciones | Sesión · Apertura · Cierre · Estado · Diferencia | ✖ declarada: apertura y cierre llevan su autor, la diferencia se queda y no hay un «Ver» que duplique el enlace del número |
| Panel lateral «Arqueo» con pestañas Resumen · Movimientos · Actividad | la pantalla 26 es una **página imprimible**: lo impreso tiene que llevar el arqueo entero, y partirlo en pestañas dejaría afuera lo que no esté en la abierta | ✖ declarada |
| «Valores guardados al cierre. Una anulación posterior no reescribe este arqueo.» | igual, y ahora **siempre** en una sesión cerrada, no solo cuando ya hubo una anulación | ✔ |
| «Imprimir arqueo» | «Imprimir o guardar PDF», que dice más | ✔ |

#### Lámina 08 · La caja en pantalla chica

| Entrada de la lámina | En la pantalla | |
|---|---|---|
| Las dos acciones apiladas a ancho completo | igual | ✔ |
| Pestañas «Resumen» y «Movimientos» | igual, como enlaces con `?vista=` | ✔ |
| Una tarjeta por moneda, con su desglose | **no están**: en pantalla chica se muestra la misma tabla transpuesta, con desplazamiento propio. Dos composiciones distintas del mismo dato se desincronizan, que es el modo de falla que la 24.6.2-d pagó caro | ✖ declarada |
| Barra inferior de navegación | es la del sistema, de la 24.1, no una propia de caja | ✔ |

### Mediciones

- **M-1 · Ninguna lectura nueva.** **Verificado por camino de código y no medido**, con ese nombre y
  no con otro: Next corre en otro proceso y el contador de sentencias no lo alcanza, igual que en la
  24.6.2-b y la 24.6.2-d. La pantalla 21 hace las mismas llamadas que antes, comparadas una por una
  contra `git show HEAD`: `requireSession`, `getCashState`, `getOrganizationTimezone` y
  `getSupplierNames`, más el `requireSession` y el `getMainCurrency` que `CashSubNav` ya hacía desde
  la 29.4. *La primera versión de esta medición enumeraba tres y dejaba afuera las de la barra; el
  recuento lo corrigió la revisión independiente, y la igualdad se sostiene igual.*
  **Ninguna de las pantallas tocadas agrega una lectura** — pero **no fue así de entrada**: la primera
  versión le agregó `getOrganizationTimezone` a la pantalla 23, para la hora de inicio de la lámina
  03, y yo no lo vi. Lo encontró la revisión independiente, y la verificación contra `HEAD` lo
  confirmó. La lectura se sacó el 2026-11-04 por decisión del usuario, así que la afirmación vuelve
  a ser cierta y el motivo por el que el subtítulo de la lámina 04 quedó afuera sigue en pie.
- **M-2 · El costo de la lista unificada.** **No se midió con el método que el brief fijó, y eso es un
  desvío**: M-2 pedía un fixture de al menos cuarenta movimientos **de los cinco tipos** y no trae la
  escapatoria que M-1 sí trae. Lo que hay es:
  - un caso de extremo a extremo con **cuarenta y dos movimientos** —los cuarenta nuevos más los dos
    del fixture, todos aportes y retiros— que demuestra lo observable: la tarjeta corta en diez y
    «Ver todos» los trae completos, sin que el corte dependa del volumen;
  - los otros cuatro tipos **no están en ese fixture**: cada uno exige una venta, un cliente, un
    proveedor o una recepción, y armarlos en `cash.spec.ts` es una spec nueva, no un fixture;
  - que no haya `N+1` está **verificado por camino de código y no medido**: `unifiedMovements` no
    tiene un solo `await` adentro, y los nombres de proveedor salen de **una** llamada a
    `getSupplierNames` con la lista completa de ids, que ya existía.
  *La primera versión declaró M-2 con la escapatoria de M-1 sin decir que la estaba extendiendo. Lo
  encontró la revisión independiente.*
- **El desborde a 320 px.** Antes del arreglo: 109 px en el movimiento y 130 px en el cierre, medidos
  con `scrollWidth − clientWidth`. Después: 0 en las cinco pantallas y en los cinco anchos.

### Lo que esta subfase encontró y no venía a buscar

- **El `<select>` de Moneda desbordaba la página en un teléfono desde la 21.2.** Lo encontró el
  barrido de anchos que AC-8 pedía y que para la caja no existía. Arreglado con un `className`
  opcional, sin tocar las pantallas de otros módulos que usan el mismo componente.
- **La lista unificada se comía el destino de una seña.** Lo encontró `order-receipts.spec.ts`, una
  spec que el brief no había previsto tocar. El dato estaba en lo que `cash` ya devuelve.
- **Un `<summary>` no es un botón en el árbol de accesibilidad.** «Más acciones» de las fichas sí lo
  es, pero porque `MoreActions` dibuja un `<button>` real cuando hay JavaScript y el `<details>` es
  solo su reemplazo sin él.
- **Dos corridas de Playwright a la vez se pisan.** La segunda vacía `test-results/` al arrancar y le
  borra los artefactos a la primera, que falla con `ENOENT` en `browserContext.close`. Parece una
  prueba rota y no lo es.

### Revisión independiente (AC-15)

Hecha el 2026-11-04 por un agente que no participó del trabajo, con acceso de solo lectura.
**Veredicto: R1.** Encontró **dieciséis** cosas; verifiqué las dieciséis contra el código antes de
aceptar ninguna, como manda `CLAUDE.md`. **Diez eran reales y están corregidas**; las demás son
declaraciones que faltaban. Su veredicto no autorizó nada.

**Un límite de esa revisión, dicho por ella misma**: no tuvo Bash, así que no pudo correr `git diff`
ni `git show HEAD`. Marcó tres cosas como «sospecha que no pude confirmar leyendo». Las tres las
verifiqué yo; **la más importante era cierta**.

| | Qué encontró | Qué pasó |
|---|---|---|
| **H-3** | La pantalla 23 lee la zona horaria, mientras la 24 declara que leerla sería una lectura nueva que hay que preguntar | **Confirmado contra `HEAD`: la lectura era nueva y la agregué sin verlo**, contra la condición de detención 1. El usuario decidió sacarla. Es el hallazgo que justifica la revisión entera |
| **H-1** | El aviso de D-1 se dibujaba para todo `viewer`, hubiera o no pagos ocultos | Real. Ahora se decide por el dato. Y el escenario de D-1 **no se probaba en ninguna parte**: el caso nuevo está en `supplier-payments.spec.ts`, donde el pago existe |
| **H-2** | En teléfono, «Ver todos» caía en «Resumen» y escondía la lista que expande | Real, y ningún caso tocaba ese parámetro. Los enlaces conservan la vista y hay un caso que lo ejerce a 390 px |
| **H-5** | El barrido de anchos dejaba afuera la pantalla 22, la que D-6 reestructuró | Real. Se barre antes de abrir la caja, que es cuando esa pantalla muestra el formulario |
| **H-6** | «Deudores» se fue al «Más», y D-3 nombró solo «Medios de pago» y «Cotización» | Real: moví un destino que la decisión no mencionó. Volvió a la barra. Al corregirlo apareció algo que el código ya hacía bien y nadie había probado: **cuando al menú no le queda nada, no se dibuja** |
| **H-7** | La revisión decía «Elegí la moneda» con la moneda ya elegida, si la sesión no la tenía | Real. Una moneda nueva espera cero, que es lo que el servicio hace |
| **H-4** | M-2 se declaró con la escapatoria de M-1, que M-2 no tiene | Real. Declarado como desvío arriba, con un caso de cuarenta y dos movimientos |
| **H-8** | `Screens.md` traía V-1 y le faltaban V-2, V-3 y V-4 | Real. Están los cinco |
| **H-9** | El §Cierre y el código citaban un «V-6» que el brief no tenía | Real. V-5 y V-6 existen ahora |
| **H-15** | Una aserción de `refunds.spec.ts` buscaba «0,00» suelto, que con la tabla transpuesta pasa siempre | Real. Anclada al concepto |
| **H-11** | El Roadmap seguía afirmando que la apertura propone el último cierre | Real. Corregido con autorización del usuario, porque el archivo está fuera de la lista cerrada |
| **H-16** | La enumeración de M-1 dejaba afuera las lecturas de la barra | Real. Corregida; la igualdad se sostiene |
| **H-10** | `HANDOFF.md` está modificado y no está en ninguna lista | Cierto, y la explicación es que **no es de esta subfase**: corrige el recuento de filas sin cerrar del cierre de la 24.6.2-d —decía ocho, son nueve, porque la 24.3.1 cerró con la 24.3 y nunca tuvo fila—, hecho en esta misma sesión antes de empezar la 24.7.1 y todavía sin commitear. Se commitea con esto y se dice de dónde viene |
| **H-12** | El `<select>` de moneda probablemente sigue desbordando en cobrar a cuenta y en pagos a proveedores | **No medido**: esas dos pantallas están fuera del alcance y no las barrí. Queda como candidata a subfase propia, junto con el objetivo táctil de 44 px |
| **H-13** | Sin JavaScript la previsión de D-2 no sigue lo que se escribe | Cierto y **es inherente a la decisión**: sin JavaScript no hay nada que el servidor pueda seguir hasta que se envía. El panel se dibuja igual, el rechazo lo calcula el servidor y la pantalla anda. Declarado acá y en `Screens.md` |
| **H-14** | La lista muestra lo anulado a monto completo y el total lo netea | Cierto, es la convención de la 21.5 y la marca «Anulado» es el indicio. Dado que D-1 se justificó en «un total cuyas partes no suman», queda declarado |

**Lo que la revisión confirmó, que también es información**: ninguna regla de dinero cambió y
`src/modules/**` está intacto; las tres advertencias del cierre son ciertas según el servicio;
ninguna de las seis specs hermanas perdió cobertura y una quedó más fuerte; el `className` de
`CurrencySelect` no cambia nada para las dos pantallas de otros módulos; y la lista de un `viewer`
no puede desincronizarse de sus totales por una anulación posterior, porque `impactedSession` solo
devuelve la sesión del original si sigue abierta.
