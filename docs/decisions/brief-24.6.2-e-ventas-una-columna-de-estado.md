# Brief 24.6.2-e — Ventas: una sola columna de estado en el listado

- **Tipo de tarea**: `implementation`.
- **Estado**: **aprobado por el usuario el 2026-11-03, con las recomendaciones del brief.** Las
  tres decisiones de diseño del listado y la del alcance de la ficha las había tomado el usuario el
  mismo día y están en D-1 a D-4; al aprobar cerró además **D-5**, la única que el brief había
  dejado abierta, por la opción recomendada. **Aprobar el brief no autoriza commit, push ni
  despliegue**: cada uno se pide en su turno.

## Objetivo

Que el listado de `/ventas` diga el estado de una venta **una sola vez**, en una columna propia,
y que su acción sea el mismo botón que la de `/pedidos`.

Sale del recorrido del usuario sobre producción al cerrar la 24.6.2-b (su AC-20, el 2026-11-03).
**No son defectos de esa subfase**: la pantalla coincide con la lámina 01 aprobada y con su brief.
Son un cambio de criterio al verla funcionando, que es lo que un recorrido sobre producción tiene
que producir y lo que ninguna prueba ni revisión podía encontrar, porque las dos comparan contra
lo aprobado. Por eso entran acá y no como enmienda de aquel brief.

## Punto de partida verificado

Leído en el código el 2026-11-03, antes de escribir el alcance:

- **Los cuatro estados ya existen y ya se calculan.** `SALE_PAYMENT_LABEL` de
  `ventas/messages.ts:395` es exactamente `{ pending: "Pendiente", partial: "Parcial",
  collected: "Cobrada", voided: "Anulada" }`, y el componente `Payment` de `ventas/page.tsx:484`
  ya deriva los cuatro de `SaleStandingSummary`, con la anulación ganándole al cobro. **Esta
  subfase no inventa estados ni lógica nueva**: saca una insignia, renombra una columna y cambia
  una condición.
- **La doble etiqueta sale de dibujar dos componentes, no de un cálculo.** `VigencyBadge`
  (`page.tsx:431`) se dibuja además de `Payment`, y por eso una venta anulada dice «Anulada» dos
  veces. `Payment` ya oculta el estado de cobro de una anulada, como manda el README del lote.
- **El listado tiene DOS vistas y las dos dibujan las insignias**: la tabla de escritorio
  (`page.tsx:305-375`, `md:block`) y una lista de tarjetas para el teléfono (`page.tsx:377-405`,
  `md:hidden`). La tarjeta **no tiene** columna «Acción»: su número de venta es el enlace.
- **El botón de `/pedidos` es `inlineButtonClass`** (`pedidos/page.tsx:333`), que en
  `form-styles.ts:35` es el mismo `buttonBase + primary` que `primaryLinkClass`: el **sólido**.
  *Ampliado el 2026-11-03, por la comparación visual de AC-11*: lo que este punto de partida no
  miró es **la lámina**, que dibuja ese botón **con borde**. Leer qué clase usa pedidos no era lo
  mismo que comprobar si pedidos coincide con su propio mockup, y no coincidía. Ver V-4.
- **Ninguna llamada a módulo cambia.** La página importa `cash`, `crm`, `organizations`, `sales`
  y `service`, y compone sus lecturas; esta subfase no agrega, saca ni mueve ninguna.

### Las fronteras entre módulos, releídas con `grep` el 2026-11-03

Releídas aunque ya se hubieran leído en la sesión, porque el riesgo es creer que están
incorporadas. `docs/architecture/Overview.md` sigue diciendo que **`sales` no depende de `cash`**
—«lo cobrado en el detalle de la venta lo compone la página»— y que `sales` no conoce `service`.
Esta subfase **no toca ninguna de las dos aristas**: no agrega llamadas entre módulos, y las dos
lecturas por lote que la página ya compone siguen igual. Las guardas de dependencias no cambian.

## Hallazgos que condicionan el alcance

### H-1 · El sistema v2 separa los dos estados **a propósito**, y esto lo contradice

No es un descuido de la lámina. El prompt del lote dice las dos cosas por escrito, en
`docs/ui-redesign/v2/19-pedidos/prompts-v2-09.md`:

- Línea 97: «Small **Vigente** green badge under each V number **separate from payment state**».
- Línea 8, el sistema aprobado: «sale **Vigente** green, **Anulada** gray; payment **Pendiente**
  amber / **Parcial** amber / **Cobrada** green. **Physical stock and money are DIFFERENT
  statuses**».

**Se eleva como contradicción y la resolvió el usuario** (D-1): se unifica igual. Queda escrito
acá porque la decisión se tomó **sabiendo** que contradice un principio declarado del sistema, no
corrigiendo un error de la lámina. Es la diferencia entre enmendar y decidir.

**Lo que la unificación NO pierde, verificado**: hoy una anulada ya dice «Anulada» en «Cobros» y
ya oculta su estado de cobro, así que lo único que desaparece de la pantalla es la palabra
«Vigente» en las no anuladas, que se deduce de que no diga «Anulada». **No hay pérdida de
información**; lo que se contradice es el principio, no el dato.

**Con una excepción, que encontró la revisión independiente** (su MENOR-1) y que esta afirmación
categórica no tenía: los cuatro estados pasan a depender **solo** de la lectura de `cash`, y
`Payment` dibuja «—» cuando esa venta no tiene fila de situación (`ventas/page.tsx`). Antes, por
ese mismo camino, la insignia de vigencia seguía diciendo «Anulada», porque salía de
`sale.voidDisplayNumber`, que `listSales` siempre trae. Así que en ese camino una anulada pasa a
verse igual que una vigente. **Queda como límite aceptado y no se arregla acá**: `getSalesStanding`
solo falla con `FORBIDDEN` y el listado ya pasó su propia autorización antes de llamarla, el «—» es
anterior a esta subfase, y las pestañas con contador siguen distinguiendo las anuladas. Se anota
porque el Roadmap describe esta subfase diciendo «la vigencia ya viene en la fila», y la
implementación eligió **no** usarla.

### H-2 · El radio de impacto, contado antes de tocar nada: **solo `sales.spec.ts` maneja el listado**

Contado el 2026-11-03 con dos barridos, el segundo más ancho que el primero, porque la 24.6.2-b
aprendió cuatro veces que el barrido angosto es el que falla:

- **Quince specs** mencionan `/ventas` de algún modo. De ellas, **siete** afirman alguno de los
  cinco textos de estado o «por cobrar».
- De esas siete, **seis no afirman sobre el listado**: `clients.spec.ts:1389` es la lista de
  clientes; `receipts.spec.ts:196-205` es la ficha y **ya está acotada con `[data-estado-venta]`**
  desde la revisión de la 24.6.2-b; `refunds.spec.ts:336` es el comprobante de la ficha y `:370`
  es `/caja/devoluciones`; `search.spec.ts:220-223` es la búsqueda global, que arma su texto en
  `buscar/search.ts`; `trade-ins.spec.ts:329` es un usado; y `units.spec.ts:411` es un comentario.
- **Ninguna spec afirma el encabezado de columna «Cobros» del listado.**

**El recuento no está cerrado hasta que corre la batería entera** (la lección de la 24.6.2-b, que
allá se corrigió cuatro veces y aun así quedó mal sumada). Vale como punto de partida, no como
resultado.

### H-3 · El botón igual al de pedidos queda por debajo del objetivo táctil

`inlineButtonClass` es el mismo `buttonBase + primary` que `primaryLinkClass`, y la 24.6.2-b
**midió** que `primaryLinkClass` da **40 px**, contra los 44 px que pide el README de la v2.
Arreglarlo solo acá dejaría el botón de ventas más alto que el de pedidos, que es **exactamente lo
que el usuario pidió evitar**. Ver D-5.

**Corregido el 2026-11-03, al implementar: no son 40 px, son 36.** La cifra de la 24.6.2-b se midió
**fuera** de una tabla, y el alto de esta clase sale de la caja de línea: dentro de una tabla
`text-sm` da 36 px y en un formulario con el tamaño de base da 40. Lo encontró el caso de extremo
a extremo de esta subfase, que primero comparó el botón del listado contra «Aplicar filtros» —misma
clase, misma pantalla— y obtuvo **36 contra 40**. El caso quedó comparando contra **el botón de
`/pedidos`**, que es la igualdad que el usuario pidió, y **los dos dan 36**.

**El déficit táctil es mayor de lo que este brief supuso** —8 px, no 4— y **la decisión no cambia
por eso**: D-5 elige entre emparejar los dos botones y arreglar la clase, no entre dos números, y a
36 px el argumento de no desemparejarlos pesa más, no menos. Queda **declarado y no arreglado acá**.
Esto corrige además la cifra que la 24.6.2-b dejó escrita como «40 px en todo el repositorio»: vale
para donde la midió, no dentro de una tabla.

## Diferencias con la v2, declaradas antes de implementar

### V-1 · El listado unifica y la ficha separa, y queda inconsistente a propósito

Decidido por el usuario (D-4): la ficha **no se toca**. Después de esta subfase, el encabezado de
la ficha sigue con **dos** insignias —vigencia y cobro— y el listado tiene **una**. Tiene defensa
—en la ficha hay espacio y contexto, en una fila de tabla no— y es el alcance más chico y más
fácil de revertir. **Queda declarado, no disimulado.**

### V-2 · El orden de columnas no se cambia

`/pedidos` ordena Pedido · Cliente · Resumen · **Estado** · Origen · Total · Acción. El listado de
ventas queda Venta · Cliente · Origen · Total · **Estado** · Acción, con «Estado» donde hoy está
«Cobros». El usuario pidió unificar la etiqueta y emparejar el botón, **no reordenar**, y mover
columnas es un cambio visual mayor que nadie pidió.

### V-3 · El botón solo entra en la tabla

La vista de tarjetas del teléfono no tiene columna «Acción»: el número de venta es el enlace y así
queda. El botón sólido es de la tabla de escritorio.

## Decisiones

### D-1 · Una sola columna «Estado», con cuatro estados excluyentes

Tomada por el usuario el 2026-11-03, con H-1 a la vista. La columna «Cobros» pasa a llamarse
**«Estado»** y es la única que lleva insignia; la insignia de vigencia **sale** de debajo del
número de venta, en las dos vistas. Los cuatro estados son **Anulada, Cobrada, Parcial y
Pendiente**, excluyentes, con **la anulación ganándole al cobro**: en una venta anulada el estado
de cobro no significa nada.

Y el «Ver» de la columna «Acción» deja de ser un enlace de texto y pasa a ser **el mismo botón que
`/pedidos`**. *Precisado el 2026-11-03*: ese botón es el **secundario con borde** que dibujan las
dos láminas, no el sólido que pedidos tenía. Ver V-4.

**Descartado explícitamente**: llamar «Vigente» al estado sin cobrar. Una venta Parcial también
está vigente, y la palabra mezclaría vigencia con cobro en una sola etiqueta.

### D-2 · «Parcial» y «Pendiente» se mantienen separadas

El usuario las creía equivalentes y **no lo son**: Parcial es «entró algo de plata» y Pendiente es
«no entró nada». Unificarlas dejaría al listado sin distinguir de un vistazo al que pagó la mitad
del que no pagó nada, que es lo que uno mira para salir a cobrar.

### D-3 · El importe que falta se muestra solo cuando difiere del total

La repetición real que el usuario vio: en **toda** fila pendiente, «por cobrar» dice el mismo
número que la columna TOTAL. La condición pasa de «es `pending` o `partial`» a **«lo que falta no
es igual al total»**, que es lo que se quiere decir y no depende de que los estados conserven hoy
esa correspondencia.

### D-4 · La ficha no se toca

Tomada por el usuario el 2026-11-03, con V-1 a la vista.

### D-5 · El botón queda igual que el de pedidos, con su déficit táctil declarado

Tomada por el usuario el 2026-11-03 al aprobar el brief, por la opción recomendada y con H-3 a la
vista: **emparejar los dos botones** en vez de arreglar la clase en una sola pantalla. El déficit
contra los 44 px del README de la v2 **queda declarado**, como ya lo está desde la 24.6.2-b, y **no
se arregla acá**.

**Las cuatro mediciones, todas del 2026-11-03** y todas dentro de la tabla salvo donde se aclara:

| Qué | Alto |
|---|---|
| `inlineButtonClass` (sólido) **fuera** de una tabla, en el formulario de filtros | 40 px |
| `inlineButtonClass` (sólido) **dentro** de la tabla | 36 px |
| `outlineButtonClass` (con borde) dentro de la tabla, en ventas **y** en pedidos | **38 px** |
| Objetivo táctil del README de la v2 | 44 px |

*La cifra se corrigió dos veces*: este brief decía **40 px**, la medición dentro de la tabla dio
**36**, y con el botón de la lámina (V-4) quedó en **38**. El alto sale de la caja de línea, así que
la misma clase mide distinto adentro y afuera de una tabla `text-sm` — y por eso la medición «40 px
en todo el repositorio» que la 24.6.2-b dejó escrita **no vale dentro de una tabla**.

**La prueba no fija el número, fija la igualdad** entre las dos pantallas, y además lo **imprime**.
Así se pone roja si alguien desempareja las dos —que es lo que el usuario pidió evitar— y sigue en
verde el día que el objetivo táctil se arregle en todo el repositorio, que es una subfase propia.

**Descartados, con su motivo**: agregarle `min-h-11` solo a este botón llegaría a 44 px pero
**rompería la igualdad** que motivó el pedido; y arreglar `primaryLinkClass` en todo el repositorio
sube los dos botones juntos, pero toca todas las pantallas y es **una subfase propia**, anotada
como mejora posterior al final de este brief.

## Alcance

**Incluido**: sacar la insignia de vigencia del listado en sus dos vistas; renombrar la columna a
«Estado»; cambiar la condición del importe; borrar el `VigencyBadge` del listado, que queda sin
uso, y el import que quede huérfano; cambiar el enlace «Ver» de la tabla por el botón «Ver» de la
lámina, **y ese mismo botón en `/pedidos`**, que tenía el sólido (V-4); y los casos de extremo a
extremo que lo fijen.

**Excluido**: la ficha de la venta (D-4); el orden de columnas (V-2); la vista de tarjetas del
teléfono en lo que hace al botón (V-3); `primaryLinkClass` y el objetivo táctil del repositorio
(D-5, opción 3); cualquier cambio a las reglas de emisión, cobro o anulación; y migraciones,
tablas, contratos y lecturas nuevas, que las reglas de la Fase 24 prohíben y que acá **no hacen
falta**: todo lo que la columna necesita ya lo devuelve `getSalesStanding`.

## Lista cerrada de archivos

Salir de esta lista **se pregunta antes de implementar**, sin excepción por tamaño. **Al cerrar se
comprueba `git show --stat <sha>` contra esta tabla, fila por fila**: la 24.6.2-b preguntó tres
veces y la cuarta no, y lo encontró la revisión independiente, no la autoevaluación.

| Archivo | Qué cambia |
|---|---|
| `src/app/(autenticado)/ventas/page.tsx` | La columna, las dos vistas, el botón y el borrado de `VigencyBadge` |
| `src/app/(autenticado)/ventas/messages.ts` | El rótulo de la columna, si hace falta uno nuevo |
| `tests/e2e/sales.spec.ts` | Los casos de la subfase |
| `docs/product/Screens.md` | **§17**, el listado |
| `src/app/(autenticado)/pedidos/page.tsx` | **Extensión registrada el 2026-11-03, autorizada por el usuario en ese turno.** Una línea: el botón «Ver» pasa a `outlineButtonClass`. **Motivo**: la comparación visual de AC-11 encontró que las dos láminas dibujan ese botón con borde y que pedidos tenía el sólido (V-4). Tocarlo era la única forma de cumplir las dos instrucciones a la vez —coincidir con los mockups y que los dos botones sean iguales—. Se preguntó **antes** de tocarlo |
| `HANDOFF.md` | **Extensión registrada el 2026-11-03, autorizada por el usuario en ese turno.** Sus campos `active_phase` y `active_task` decían «la 24.6.2-e, sin brief», que quedó falso al aprobarse. **Motivo**: lo marcó la revisión independiente (su MENOR-4) junto con la contradicción de fondo —el archivo manda que «cada cierre reescribe este campo» y ninguna lista cerrada lo nombra, y el cierre de la 24.6.2-b lo reescribió igual—. Sin esto, la sesión siguiente arranca leyendo un estado falso |
| `CHANGELOG.md`, `docs/planning/Roadmap.md`, este brief | El cierre |

## Criterios de aceptación

| Id | Criterio |
|---|---|
| **AC-1** | El listado tiene una columna **«Estado»** donde estaba «Cobros», y **ninguna insignia debajo del número de venta**, en la tabla **y** en la vista de tarjetas. |
| **AC-2** | Una venta **anulada** muestra **una sola** insignia, «Anulada», y no muestra estado de cobro ni importe por cobrar. Hay un caso que falla si aparece dos veces. |
| **AC-3** | Los cuatro estados se ven en el listado con sus rótulos exactos: Anulada, Cobrada, Parcial, Pendiente. Una venta **parcial sigue diciendo «Parcial»** y una sin cobrar, «Pendiente»: el caso afirma las dos por separado, con sus importes distintos. |
| **AC-4** | El importe «por cobrar» aparece **solo cuando difiere del total**. Hay un caso con una venta pendiente que afirma que el importe **no** está, y uno con una parcial que afirma que sí, con su valor. |
| **AC-5** | La columna «Acción» de la tabla trae **el mismo botón «Ver» que `/pedidos`**, con su nombre accesible por venta. La vista de tarjetas no lo lleva (V-3). La igualdad se **mide contra el botón de `/pedidos`**, no contra otro control de la misma clase: fuera de una tabla esa clase mide distinto (D-5). *Precisado el 2026-11-03*: este criterio decía «el botón sólido», y el que corresponde es el **secundario con borde** de las dos láminas (V-4). |
| **AC-6** | `VigencyBadge` del listado **no existe** en el árbol, y no queda ningún import ni constante sin uso en `ventas/page.tsx`. Se comprueba con `grep`, no a ojo. |
| **AC-7** | **El listado sigue sin sumar monedas**: el importe por cobrar va en la moneda de su venta. |
| **AC-8** | **Ninguna lectura nueva y ninguna consulta de más**: las sentencias que la página emite son las mismas que antes del cambio, medidas con el contador de `tests/integration/sales-list-reads.test.ts`. |
| **AC-9** | `axe` sin violaciones WCAG 2.x A ni AA en el listado, en claro y oscuro, con filas de los cuatro estados. |
| **AC-10** | Sin desbordamiento horizontal a 320, 390, 768, 1024 y 1440 px, medido como en la 24.6.2-b. |
| **AC-11** | Comparación visual del listado contra la lámina 01, **entrada por entrada**, sobre capturas reales, con las diferencias de V-1 a V-3 declaradas y cualquier otra, clasificada. |
| **AC-12** | La batería local completa en verde **con su número de casos declarado**, y la CI en `success` sobre el **SHA exacto**. Se declara el total de la batería, no el de las specs tocadas. |
| **AC-13** | Revisión independiente de un agente que no participó, de solo lectura, contra este brief. |
| **AC-14** | Recorrido del usuario sobre producción. |

## AC-11 · Comparación visual contra la lámina 01, entrada por entrada

Hecha el **2026-11-03**, sobre una **captura real** de `/ventas` a 1440 px con las cinco filas de
los cuatro estados, contra `docs/ui-redesign/v2/20-ventas/desktop/01-listado-ventas-v2.png`. La
captura se tomó desde el propio caso de extremo a extremo y **no se versiona**: queda en el
scratchpad de la sesión, como las de las subfases anteriores.

**Esta sección la pedía AC-11 y la primera entrega no la tenía.** La marcó la revisión independiente
como su MAYOR-2, y tenía razón: sin ella, la condición de detención «si una diferencia con la lámina
no está en V-1 a V-3, se declara y se pregunta» no la podía verificar nadie más que quien
implementó. **Y al hacerla apareció una diferencia que ninguna de las tres cubría** (V-4).

| Entrada de la lámina | En pantalla | Veredicto |
|---|---|---|
| Título «Ventas» y subtítulo «Comprobantes y cobros» | igual | coincide |
| «+ Nueva venta», sólido violeta, arriba a la derecha | igual | coincide |
| Botón secundario «Ver pedidos» | no está | **ya declarado**: V-6 de la 24.6.2-b, la navegación lateral ya lo ofrece |
| Filtros «Número de venta», «Desde», «Hasta» | iguales | coincide |
| Desplegable «Cliente» en los filtros | no está; el filtro llega por la URL desde la ficha del cliente | **ya declarado**: V-7 de la 24.6.2-b |
| Pestañas Todas · Vigentes · Anuladas, con contador por pestaña | iguales, con 5 · 4 · 1 | coincide |
| Nota «El período filtra la fecha de emisión.» | igual | coincide |
| Columnas Venta · Cliente · Origen · Total · … · Acción | iguales y en ese orden | coincide (V-2: el orden no se tocó) |
| Encabezado de la quinta columna: **«Cobros»** | dice **«Estado»** | **diferencia de esta subfase**, es su objeto: D-1 |
| Insignia «Vigente» verde debajo del número de venta | **no está** | **diferencia de esta subfase**, es su objeto: D-1, con H-1 a la vista |
| Insignia de la situación de cobro, con su ícono | igual: Parcial ámbar con reloj, Cobrada verde con tilde, Anulada gris | coincide |
| «ARS 280.000 por cobrar» bajo la insignia, en las parciales | igual, en las dos parciales | coincide |
| Importe por cobrar en una fila **pendiente** | no se muestra | **no comparable**: la lámina no dibuja ninguna fila pendiente, y por eso no mostraba la repetición que el usuario vio en producción (D-3) |
| Botón «Ver», **con borde violeta sobre fondo blanco** | igual | **coincide, y no coincidía**: ver V-4 |
| Pie «Importes por moneda. Emitir una venta y registrar su cobro son pasos separados.» | igual | coincide |
| Paginación «4 ventas · ‹ 1 › · Página 1 de 1», a la derecha | «Mostrando 1 a 5 de 5 ventas», a la izquierda y sin controles con una sola página | **preexistente**, de la 20.2; no la introduce ni la toca esta subfase |
| Importes «ARS 480.000» y «USD 650» | «$ 480.000,00» y «US$ 650,00» | **preexistente**: es el formateador de moneda del repositorio, no de esta pantalla |
| Fecha «27 oct 2026» bajo el número | «03/11 16:30» | **preexistente**, de la 24.6.2-b: la fila lleva fecha **y hora** |
| Número de venta en negrita, sin subrayar | enlace monoespaciado subrayado | **preexistente**: es la convención de enlace del sistema, de la Fase 23 |
| Barra superior con la fecha y la campana | buscador, selector de tema y avatar | **preexistente**: es el marco de la Fase 23, común a todas las pantallas |

**Diferencias que introduce esta subfase: dos**, las dos son su objeto y las dos están en D-1. **No
quedó ninguna diferencia nueva sin clasificar.** Las cinco preexistentes no las introduce ni las
corrige esta subfase, y se dejan anotadas porque AC-11 pide clasificar «cualquier otra»; ninguna
amerita abrir alcance acá.

### V-4 · El botón de la lámina tiene borde, y la primera entrega lo puso sólido

**Encontrada por esta comparación, el 2026-11-03, y resuelta por el usuario en el mismo turno.**

El usuario pidió «que el botón de ventas sea como el de pedidos, el botón «Ver»». La primera entrega
lo tomó literalmente y copió **lo que `/pedidos` tiene hoy**: `inlineButtonClass`, el sólido. La
comparación mostró que **las dos láminas** —la 01 de este lote y la 01 del lote de pedidos— dibujan
ese botón **con borde violeta sobre fondo blanco**, y que el sistema v2 tiene una clase exactamente
para eso: `outlineButtonClass`, cuya definición en `form-styles.ts` dice «Secundario de los mockups
(brief-23.1, D-3) […] **cada pantalla decide en la Fase 24 qué botón pasa a esta clase**».

Es decir: **`/pedidos` ya venía desviado de su propia lámina**, desde antes de esta subfase, y la
primera entrega copió esa desviación. Eso ponía dos instrucciones del usuario en conflicto —«las
pantallas de la Fase 24 tienen que coincidir con los PNG de la v2» y «que los dos botones sean
iguales»—, que no se podían cumplir juntas sin tocar pedidos.

**Se elevó y el usuario eligió**: `outlineButtonClass` en las dos pantallas. Coincide con las dos
láminas **y** conserva la igualdad que motivó el pedido. Se descartó dejar el sólido en las dos
—iguales entre sí pero las dos fuera de sus láminas— y poner el borde solo en ventas, que habría
roto justamente la igualdad.

**Medido después del cambio**, con el número impreso por el caso: el botón da **38 px** en ventas y
**38 px** en pedidos, dentro de la tabla. Sigue por debajo de los 44 del objetivo táctil.

## Condiciones de detención

- Si hace falta una migración, una tabla, un contrato o una lectura nueva, **se para**: las reglas
  de la Fase 24 lo prohíben, y el punto de partida dice que no hacen falta. Que haga falta una
  significa que el alcance se entendió mal.
- Si aparece un archivo fuera de la lista cerrada, **se pregunta antes de tocarlo**.
- Si la batería completa saca casos del listado que H-2 no contó, **se recuenta entero y se anota**,
  en vez de arreglar el que se puso rojo.
- Si una diferencia con la lámina no está en V-1 a V-3, **se declara y se pregunta**.

## Nivel de validación objetivo

**Validado en staging**, con el recorrido del usuario sobre producción (AC-14). No certifica
**preparado para producción**.

## Ubicación en la fase

- **Necesario ahora**: todo lo incluido. Es chico y corrige lo que el usuario vio en producción.
- **Requisito antes de producción**: nada propio; la subfase no cambia ninguna regla.
- **Mejora posterior**: el objetivo táctil de `buttonBase` en todo el repositorio (D-5, opción 3),
  que esta subfase midió en **36 px dentro de una tabla** y que la 24.6.2-b había anotado como 40;
  y la inconsistencia entre el listado y la ficha (V-1), si el usuario cambia de criterio al verla.
