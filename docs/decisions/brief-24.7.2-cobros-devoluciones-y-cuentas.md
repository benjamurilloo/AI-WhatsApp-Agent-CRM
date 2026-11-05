---
schema: task-brief.v1
task_id: 24.7.2
task_type: implementation
generated_at: 2026-11-04
---

# Brief 24.7.2 — Cobros, devoluciones y cuentas de clientes

- **Estado**: **aprobado por el usuario el 2026-11-04, con las recomendaciones** («apruebo el brief
  con las recomendaciones»). Las siete decisiones quedan cerradas en su opción recomendada: **D-1
  (a)** la subfase se parte y esta es la mitad de cuentas; **D-2 (a)** «Cuentas de clientes» pasa a
  ser un ítem propio de Finanzas y «Deudores» sale de la barra de la caja; **D-3 (a)** el estado de
  cuenta es un componente compartido con dos entradas; **D-4 (a)** el filtro por cliente entra,
  declarado y medido, y viaja a la 24.7.2-b; **D-5 (a)** la búsqueda por nombre la compone la
  página, sin `JOIN`; **D-6 (a)** «Buscar cliente» es un enlace al buscador; **D-7 (a)** el recibo
  es un panel por URL, y viaja a la 24.7.2-b. **Aprobar el brief fija el alcance y no autoriza
  commit, push ni despliegue**: cada uno se pide en su turno.
- **D-1 partió la subfase.** Este brief es, desde la aprobación, **solo la mitad de cuentas**: las
  tres láminas del lote 22 y la tarjeta «No hay saldo a favor» de la 09. Las láminas **06 y 07** y
  la tarjeta «¿Anular R-000183?» pasan a la **24.7.2-b — Cobros y devoluciones de la caja**, que
  tendrá su propio brief. El corte es **por naturaleza**: acá está la cuenta del cliente, un saldo
  que se deriva y una imputación que se recalcula; allá está el documento de caja, un recibo y una
  devolución con su número y su anulación.
- **D-2 enmienda una decisión de la 24.7.1**, cerrada el mismo día: su D-3 devolvió «Deudores» a la
  barra de la caja porque esa decisión nombraba solo «Cotización» y «Medios de pago» para el «Más».
  Estas láminas, que aquella subfase no tenía en su alcance, lo sacan de la caja. **La enmienda se
  escribe, no se disimula**: queda anotada acá, en la fila del Roadmap y en el brief de la 24.7.1.
- **Fase**: 24 — Pantallas rediseñadas con lo que ya existe ([Roadmap](../planning/Roadmap.md)
  §Fases 23 a 28).
- **Subfase**: 24.7.2 (Notion `407702be6f4e81c481d3ccb1082ad5d6`, en «Esperando», leído en Notion
  el 2026-11-04).
- **Láminas**: las **seis** del bloque de cuentas, abiertas y miradas antes de escribir esto, no
  inferidas de su descripción:
  - [22-cuentas-clientes/01 — Deudores](../ui-redesign/v2/22-cuentas-clientes/desktop/01-deudores-por-moneda-v2.png)
  - [22-cuentas-clientes/02 — Estado de cuenta](../ui-redesign/v2/22-cuentas-clientes/desktop/02-estado-cuenta-cliente-v2.png)
  - [22-cuentas-clientes/03 — Cobro a cuenta, revisión](../ui-redesign/v2/22-cuentas-clientes/desktop/03-cobro-a-cuenta-imputacion-v2.png)
  - [21-caja/06 — Cobros, con el recibo](../ui-redesign/v2/21-caja/desktop/06-cobros-recibo-conversion-v2.png)
  - [21-caja/07 — Registrar devolución](../ui-redesign/v2/21-caja/desktop/07-devolucion-venta-sin-cliente-v2.png)
  - [21-caja/09 — Estados](../ui-redesign/v2/21-caja/estados/09-estados-caja-cuentas-v2.png), **su
    mitad de cuentas**: la 24.7.1 implementó la mitad de caja y dejó esta por escrito (su V-3).
  Contratos de diseño: los README de [V2-10 caja](../ui-redesign/v2/21-caja/README.md) y
  [V2-10 cuentas](../ui-redesign/v2/22-cuentas-clientes/README.md).
- **Nivel de evidencia pedido**: `producer-consumer` (validado en integración).

## Objetivo

Llevar a la forma de la v2 las pantallas de **cobros, devoluciones y cuentas de clientes**, que ya
existen todas, y resolver el acceso a la cuenta corriente que el Roadmap dejó pendiente desde la
24.4.1. **Sin migraciones, sin tablas y sin contratos nuevos**, y con las lecturas nuevas
declaradas y medidas, como manda la fase.

## Punto de partida verificado

Leído en el código el 2026-11-04, no de memoria:

| Pantalla | Ruta | Líneas | `Screens.md` |
|---|---|---:|---|
| Cobros | `/caja/cobros` | 271 | §30, §28, §32 |
| Devoluciones | `/caja/devoluciones` | 244 | §34, §33, §35, §36 |
| Deudores | `/caja/deudores` | 220 | §39 |
| Estado de cuenta | `/clientes/[clientId]/cuenta` | 149 | §37 |
| Cobrar a cuenta | `/clientes/[clientId]/cobrar` | 201 | §38 |
| Devolver saldo | `/clientes/[clientId]/devolver` | 142 | §33 |

**1.227 líneas en seis páginas, diez secciones de `Screens.md` y seis láminas.** Es el número que
sostiene D-1.

Las lecturas que `cash` ya expone y que esta subfase usa: `listDebtors`, `getClientAccountSummary`,
`previewAccountReceipt`, `createAccountReceipt`, `getAccountReceiptForm`, `listReceipts`,
`listRefunds`, `getReceipt`, `getRefund`, `getClientRefundForm` y `getSaleRefundForm`.

La 24.7.1 cerró el 2026-11-04 y dejó la barra de la caja con **«Caja actual · Sesiones · Cobros ·
Devoluciones · Deudores»** a la vista y «Cotización» y «Medios de pago» en un «Más». Eso importa
para D-2.

## Las fronteras entre módulos, releídas con grep

Releídas el 2026-11-04 aunque ya se habían leído en esta sesión, que es justo el paso que la
metodología exige no saltear:

- `Overview.md:49` — «otro módulo no hace `JOIN` directo contra tablas ajenas fuera de
  `analytics`».
- `Overview.md:52` — «Una lista con datos de dos módulos se compone en memoria, sin `JOIN`».
- `Overview.md:60` y `:66` — la lista de clientes (24.4.2) y las pestañas de la ficha (24.4.3)
  **ya componen `cash` con otros módulos en la página**, sin `JOIN`. Es el patrón que D-5 reutiliza.
- **Nadie depende de `cash`**: `cash` depende de otros y no al revés. La búsqueda por nombre de
  esta subfase **no puede** resolverse haciendo que `cash` consulte `crm` dentro de su consulta: se
  compone en la página.

**Ninguna de las decisiones de abajo cruza una frontera.** Lo que las toca es D-5, y se resuelve
con el patrón ya aceptado.

## Hallazgos que condicionan el alcance

### H-1 · «La venta más antigua» **no es una lectura nueva**, y el Roadmap dice que sí

La columna «Lecturas nuevas» de la fila 24.7.2 dice «Filtro, búsqueda y **la venta más antigua**».
Verificado en el código: `listDebtors` ya devuelve `oldestOutstandingAt` y `salesWithBalance`, y el
**número** de esa venta ya está en memoria —`SaleImputation.number`, que `summarize` recorre para
quedarse con `withBalance[0]`— y simplemente **no se lleva hacia afuera**.

Es decir: la lámina 01 pide «V-000218 / 26 oct. 2026» y hoy tenemos la fecha y tiramos el número en
el mismo objeto donde está. **Llevarlo no agrega ni una consulta.** La fila del Roadmap queda
corregida en el cierre, como la 24.7.1 corrigió la suya.

### H-2 · Las láminas sacan «Cuentas de clientes» de la caja, y la 24.7.1 acaba de meter «Deudores» adentro

Las láminas 01, 02, 03, 06 y 07 dibujan el menú lateral con **Finanzas → Caja · Cuentas de clientes
· Tipo de cambio**: «Cuentas de clientes» es **hermana de Caja**, no una sección suya. La lámina 06
lo confirma desde el otro lado: la barra de la caja tiene «Caja actual · Sesiones · Cobros ·
Devoluciones · Más» y **no** tiene Deudores.

La 24.7.1, en su D-3, hizo lo contrario **hoy**: devolvió «Deudores» a la barra de la caja, porque
esa decisión nombraba solo «Cotización» y «Medios de pago» para el «Más».

**No es una contradicción del diseño: es que la 24.7.1 no tenía estas láminas en su alcance.** Pero
es una decisión del usuario tomada hace horas, y cambiarla es D-2, no una consecuencia automática.

### H-3 · El filtro por cliente de Cobros y Devoluciones **sí** es nuevo

`listReceipts` y `listRefunds` reciben `{ number, page }` y nada más. La lámina 06 dibuja un
desplegable **«Cliente: Todos»** junto al buscador de número. Eso es un filtro nuevo sobre tablas
**propias de `cash`**, así que no toca ninguna frontera, pero **es una lectura nueva** y la fase
exige declararla y medirla. Es D-4.

### H-4 · La búsqueda por nombre en Deudores se compone, no se consulta

`listDebtors` filtra por moneda y pagina; los nombres los pide **solo para la página visible**, con
`getClientsByIds`. Buscar por nombre sobre toda la organización no se puede resolver ahí sin que
`cash` conozca a `crm`.

El camino que respeta las fronteras es el de la 24.4.2: **la página** busca en `crm` con
`searchClients`, y filtra en memoria los deudores por los ids que vuelven. Es D-5.

### H-5 · La nota de orden del Roadmap ya no se puede cumplir como está escrita

`Roadmap.md:456` dice: «La 24.7.2 va antes de la pestaña de cuenta de la ficha del cliente
(24.4.1), **o comparte su componente**». **La 24.4.1 cerró el 2026-10-29**, así que la primera
opción venció y queda la segunda. Ya quedó anotado en el §Ubicación del brief de la 24.7.1; acá se
resuelve, en D-3.

### H-6 · El tamaño

Seis láminas, seis páginas, 1.227 líneas, diez secciones de `Screens.md`, dos filtros nuevos y una
composición entre módulos. Para comparar: la **24.5.1** y la **24.6.1** volvieron **R2** de la
revisión independiente **por exceso de alcance**, y las dos eran más chicas que esto. La 24.7.1,
que cerró hoy, tenía seis pantallas y **ninguna lectura nueva**.

Es D-1, y la recomendación es partir.

### H-7 · Las propias láminas se contradicen en la miga

La 02 dibuja «Finanzas › **Cuentas** › Paula Méndez» y la 03, «Finanzas › **Cuentas de clientes** ›
Paula Méndez › Cobrar a cuenta». Son la misma sección con dos nombres. Se adopta uno y se declara.

## Diferencias con la v2, declaradas antes de implementar

- **V-1 · Los importes y el escenario de las láminas son un fixture de diseño.** Paula Méndez,
  Mateo Salas, 1 USD = ARS 1.500, V-000222: no se implementan.
- **V-2 · La barra superior difiere entre piezas del lote.** La 01 y la 03 llevan «Buscar en
  Vixora…», la 02 «Vixora CRM» con migas y la 06 otra. **Manda el marco de la 24.1**, como en todas
  las subfases de esta fase.
- **V-3 · La lámina 06 dibuja «Registrar cobro» deshabilitado** en el encabezado de Cobros, sin
  decir por qué. Hoy un cobro se registra **desde su venta o desde la cuenta del cliente**, nunca
  desde el listado, porque un cobro necesita un destino. El botón **no se agrega**: agregarlo
  obligaría a elegir destino primero, que es una pantalla que no existe.
- **V-4 · La lámina 02 muestra un selector «USD» dentro de la tarjeta «Cuenta en USD»** y a la vez
  tarjetas de las dos monedas arriba. Se conserva el selector como **filtro de la vista de detalle**
  y las tarjetas como resumen de todas, que es lo que el README describe («representa USD
  seleccionado y un resumen por ambas monedas; no elimina el detalle ARS»).
- **V-5 · La mitad de caja de la lámina 09 ya está implementada** por la 24.7.1. De esta lámina
  entran acá **solo dos tarjetas**: «¿Anular R-000183?» y «No hay saldo a favor».
- **V-7 · El resumen lateral de la lámina 01 muestra un «Equivalente en {principal}» por cada moneda.** No entra: calcularlo en la página sería reimplementar la regla de conversión, y exponerlo desde `referenceView` toca una función que también usan las cuentas de proveedores. Se muestra la deuda de cada moneda y el equivalente del **total**. *Agregado el 2026-11-04, al comparar contra la lámina.*
- **V-6 · El listado de la lámina 01 no muestra datos de contacto** y la ficha del cliente sí. No
  es una diferencia a resolver: es la regla del README, y se mantiene.

## Decisiones

### D-1 · El tamaño: ¿una subfase o dos? — CERRADA en (a)

(a) **Partir en dos, y hacer primero las cuentas** *(recomendada)*:
- **24.7.2 — Cuentas de clientes**: las tres láminas del lote 22 más la tarjeta «No hay saldo a
  favor» de la 09. Entran Deudores, Estado de cuenta, Cobrar a cuenta y Devolver saldo a favor.
- **24.7.2-b — Cobros y devoluciones de la caja**: las láminas 06 y 07 más «¿Anular R-000183?».

(b) Una sola subfase con las seis láminas.

**Por qué (a)**: el corte es **por naturaleza y no por tamaño nada más**. Lo del lote 22 es *la
cuenta del cliente* —un saldo que se deriva, una imputación que se recalcula y un cobro que no
elige venta—; lo de las láminas 06 y 07 es *el documento de caja* —un recibo y una devolución, cada
uno con su número, su panel y su anulación—. Comparten el módulo y casi nada más. Y las dos veces
que esta fase no cortó, volvió R2.

### D-2 · Dónde vive «Cuentas de clientes» (H-2) — CERRADA en (a)

(a) **Como las láminas: un ítem propio de Finanzas**, hermano de Caja, y «Deudores» **sale** de la
barra de la caja *(recomendada)*.
(b) Se queda dentro de Caja, como la 24.7.1 la dejó, y las láminas se declaran como diferencia.

**Por qué (a)**: la cuenta de un cliente **no es caja**. La caja es el efectivo de una sesión; la
cuenta es lo que una persona debe, y existe aunque la caja esté cerrada. Hoy está en la barra de la
caja por historia —la 21.6 la puso ahí— y el rediseño lo corrige. **Si elegís (a), es un cambio
sobre lo que se desplegó hoy**, y el brief lo dice en vez de disimularlo: la D-3 de la 24.7.1
queda enmendada, con su nota, igual que la 24.7.1 enmendó la fila del Roadmap de la 21.2.

### D-3 · El estado de cuenta, ¿una ruta o dos? (H-5) — CERRADA en (a)

(a) **Una sola implementación, dos entradas** *(recomendada)*: el cuerpo del estado de cuenta es un
componente compartido; `/clientes/[id]/cuenta` y la ruta nueva de Finanzas lo usan, con migas
distintas. Es lo que el Roadmap llama «comparte su componente», y es lo que la 24.4.1 ya hizo con
`account-tab.tsx` y `/cuenta`.
(b) Dos pantallas separadas.

**Por qué (a)**: (b) crea dos lugares donde arreglar el mismo defecto, y el README de la v2 pide
explícitamente que «Ver cuenta» abra **el mismo estado financiero** desde la ficha, desde Finanzas y
desde las ventas: «No se crean cuentas duplicadas».

### D-4 · El filtro por cliente en Cobros y Devoluciones (H-3) — CERRADA en (a), y viaja a la 24.7.2-b

(a) **Entra, declarado y medido** *(recomendada)*, como parámetro opcional de `listReceipts` y
`listRefunds`, filtrando en SQL sobre tablas de `cash`.
(b) No entra, y se declara como diferencia con la lámina.

**Por qué (a)**: es el único filtro que la lámina agrega, se resuelve dentro del módulo dueño de la
tabla y responde una pregunta que hoy no tiene respuesta («¿qué le cobré a esta persona?») sin
abrir su ficha. Si D-1 sale (a), esto viaja con la **24.7.2-b**.

### D-5 · La búsqueda por nombre en Deudores (H-4) — CERRADA en (a)

(a) **La compone la página** *(recomendada)*: `crm.searchClients` da los ids, y los deudores se
filtran en memoria por esos ids. Sin `JOIN` y sin que `cash` conozca `crm`.
(b) No entra.

**Por qué (a)**: es el patrón de la 24.4.2 y la 24.4.3, ya aceptado y medido. **Límite que se
declara**: el costo crece con la cantidad de deudores, porque `listDebtors` ya lee la organización
entera para contar el total del filtro. Lo mide M-2.

### D-6 · La pestaña «Buscar cliente» de la lámina 01 — CERRADA en (a)

(a) **Entra como enlace al buscador de clientes** *(recomendada)*, no como un segundo listado: la
pestaña lleva a `/clientes` con el foco en la búsqueda.
(b) Entra como listado propio de todos los clientes con su saldo.
(c) No entra.

**Por qué (a)**: es lo que el README dice que es —«un acceso propuesto al buscador/ficha de
Clientes para consultar cuentas sin deuda»— y (b) sería **otra vez la lista de clientes**, que la
24.4.2 ya hizo con su saldo por moneda. (c) deja sin respuesta «quiero ver la cuenta de alguien que
no debe nada».

### D-7 · El recibo de la lámina 06: ¿panel o pantalla? — CERRADA en (a), y viaja a la 24.7.2-b

(a) **Panel que abre y cierra por la URL** *(recomendada)*, como `?panel=cobro` de la 24.6.2-d y los
paneles de la 24.6.1.
(b) Una pantalla aparte.

**Por qué (a)**: es el patrón de la fase desde la 24.6.1, anda sin JavaScript y conserva el listado
detrás. La anulación del recibo —la tarjeta «¿Anular R-000183?» de la 09— es el `<dialog>` nativo
de la 24.6.2-d, que ya existe y no se reescribe.

## Alcance

**Incluido** (si D-1 sale (a), esto es la 24.7.2 y lo de la caja pasa a la -b):

1. **Deudores → «Cuentas de clientes»** con la forma de la lámina 01: filtro por moneda, búsqueda
   por nombre (D-5), la columna **«Más antigua» con el número y la fecha** (H-1), «Ventas con
   saldo», y el resumen orientativo lateral con el total por moneda y el equivalente.
2. **Estado de cuenta** con la forma de la lámina 02: las tarjetas por moneda, el equivalente
   orientativo, las pestañas Resumen y Comprobantes, la tabla de imputación y los cobros aplicados,
   compartido con la ficha del cliente (D-3).
3. **Cobrar a cuenta** con la forma de la lámina 03: los dos pasos, la revisión con la aplicación
   prevista, el aviso de que **es una previsión** y el de que **no cruza monedas**, y el contexto de
   la cuenta al costado.
4. **Devolver saldo a favor** con el patrón de la lámina 07 y destino «Cuenta del cliente», más el
   estado vacío **«No hay saldo a favor»** de la 09.
5. `Screens.md` §37, §38 y §39 reescritas, con las diferencias V-1 a V-6.

**Excluido, y por qué:**

- **Las láminas 06 y 07 y la tarjeta «¿Anular R-000183?»**, si D-1 sale (a): son la 24.7.2-b.
- **Vencimientos, morosidad, intereses, límite de crédito, recordatorios y contactar o cobrar por
  fuera**: el README de la v2 los excluye explícitamente.
- **Casillas para asignar un cobro a ventas elegidas a mano**: la imputación **se deriva**, y la
  lámina 03 lo dice con todas las letras. Cambiar eso es cambiar el ADR 0022.
- **Permuta como cobro a cuenta**: el README la excluye y el servicio no la ofrece.
- **Convertir la deuda entre monedas**: el equivalente es orientativo y no compensa.
- **El objetivo táctil de 44 px**: sigue siendo una subfase propia.
- **El desbordamiento del `<select>` de moneda en «cobrar a cuenta»**, que la 24.7.1 dejó declarado
  como probable y **no medido**. Si entra, entra **medido**, no supuesto.

## Lista cerrada de archivos

Se fija al aprobar, con las rutas de la tabla del §Punto de partida más `Screens.md` y este brief.
**Salirse de ella se pregunta antes, sin excepción por tamaño**, que es la regla que la 24.5.1 dejó
y que la 24.6.2-b volvió a romper una vez de cuatro.

## Criterios de aceptación

| # | Criterio | Cómo se verifica |
|---|---|---|
| **AC-1** | Deudores tiene la forma de la lámina 01, con «Más antigua» mostrando **número y fecha** | e2e + comparación visual |
| **AC-2** | La búsqueda por nombre filtra sin `JOIN` y conserva el filtro de moneda y el resumen | e2e + lectura del código |
| **AC-3** | El estado de cuenta tiene la forma de la lámina 02 y **es el mismo componente** desde las dos entradas | e2e desde ambas rutas |
| **AC-4** | Cobrar a cuenta tiene los dos pasos de la lámina 03, con la previsión y el aviso de que se recalcula | e2e |
| **AC-5** | Un cobro mayor que la deuda **no es un error**: el excedente queda a favor en la misma moneda | e2e + integración |
| **AC-6** | «Devolver saldo a favor» solo aparece con saldo disponible y permiso; sin él, «No hay saldo a favor» | e2e con los dos roles |
| **AC-7** | Las señas retenidas **no** se ofrecen como saldo para devolver ni reducen otra deuda | integración |
| **AC-8** | Un `viewer` consulta y no ve acciones de gestión | e2e con los dos roles |
| **AC-9** | Las pantallas andan **sin JavaScript** | e2e con `javaScriptEnabled: false` |
| **AC-10** | Sin desbordamiento horizontal de 320 a 1440 px | e2e |
| **AC-11** | axe sin violaciones A ni AA en cada estado | `expectAccessible` |
| **AC-12** | **Ninguna regla de dinero cambió**: la imputación y los rechazos siguen iguales | `git diff --stat` de `src/modules/cash/**` + integración |
| **AC-13** | Las lecturas nuevas son **solo** las que D-4 y D-5 aprueban, verificado contra `HEAD` archivo por archivo | `git show HEAD:<archivo>`, no de memoria |
| **AC-14** | La impresión conserva fecha, negocio, cliente, importes por moneda e imputación, y no imprime navegación | e2e de impresión |
| **AC-15** | Comparación visual contra las láminas, **entrada por entrada** | tabla en el §Cierre |
| **AC-16** | La batería completa en **una sola corrida de CI**, en verde, sobre el SHA exacto | leída por `headSha` |
| **AC-17** | Revisión independiente de un agente que no participó | su veredicto |
| **AC-18** | Recorrido del usuario en producción | tu confirmación |

**AC-13 lleva ese nombre y ese método a propósito.** La 24.7.1 declaró «ninguna lectura nueva» y
tenía una: la agregué sin verla y la encontró la revisión independiente. La única prueba de que no
hay lecturas de más es el diff contra el commit base, no el recuerdo de no haberlas agregado.

## Mediciones requeridas

- **M-1 · El costo de Deudores con la búsqueda por nombre.** Con un fixture de **al menos 200
  clientes con deuda**, el número de consultas con y sin texto de búsqueda, y el tiempo del camino
  completo. Si el contador de sentencias no alcanza porque Next corre en otro proceso —como en la
  24.6.2-b, la 24.6.2-d y la 24.7.1—, se declara **verificado por camino de código y no medido**,
  con ese nombre y no con otro, **y se dice qué parte quedó sin medir**.
- **M-2 · El costo del filtro por cliente en Cobros** (si D-4 sale (a)): consultas y tiempo con y
  sin filtro, sobre un fixture de al menos 200 recibos.
- **M-3 · El estado de cuenta con muchos comprobantes**: que el tope de 500 y su aviso sigan
  funcionando, y que el resumen cuente todos.

**M-1 y M-2 no heredan la escapatoria de la otra.** La 24.7.1 declaró su M-2 con la salvedad que
solo su M-1 tenía, sin decir que la estaba extendiendo, y lo encontró la revisión independiente.

## Condiciones de detención

1. **Una lectura nueva que no sea D-4 ni D-5 se pregunta, no se agrega al pasar.** Incluye agregar
   un campo que obligue a una consulta más.
2. **Una regla de dinero que haya que cambiar para que la pantalla se parezca a la lámina** se para
   y se pregunta: toca el ADR 0022.
3. **Salirse de la lista cerrada de archivos** se pregunta antes, sin excepción por tamaño.
4. **Si al implementar el alcance resulta más grande de lo que D-1 supone**, se para y se parte, en
   vez de entregar algo que vuelva R2.
5. **Una contradicción entre dos documentos** se eleva con los dos citados, no se resuelve sola.

## Nivel de validación objetivo

**Validado localmente** al terminar, con AC-1 a AC-15 en verde. **Validado en integración** con
AC-16. **Validado en staging** solo después del despliegue **y de tu recorrido** (AC-18). No
certifica **preparado para producción**.

## Ubicación en la fase

Es la **vigésimo primera** subfase de la Fase 24 y la segunda del bloque de Finanzas, que la 24.7.1
abrió. Después queda la **24.7.3** (cotización y medios de pago) y con eso cierra Finanzas.

**Necesario ahora**: cierra el acceso a la cuenta corriente que el Roadmap dejó pendiente desde la
24.4.1 y que ya venció una de sus dos opciones.
**Requisito antes de producción**: nada que esta subfase agregue.
**Mejora posterior**: el objetivo táctil de 44 px, el desbordamiento del `<select>` en las dos
pantallas que la 24.7.1 no barrió, y —si D-1 sale (a)— la 24.7.2-b.

## Cierre

*Implementado el 2026-11-04.* **Validado localmente**: AC-1 a AC-15 en verde contra un build hecho
en la misma corrida, con la guarda de frescura confirmándolo («Build de la corrida»). Falta AC-16
(la batería completa en una corrida de CI sobre el SHA exacto), AC-17 (revisión independiente) y
AC-18 (tu recorrido en producción).

### Lo que cambió respecto de lo aprobado, y por qué

- **La ruta.** El brief no fijaba dónde vivía «Cuentas de clientes». Al implementar apareció que el
  **menú ya la listaba** en Finanzas, apuntando a `/caja/deudores`: la posición y la etiqueta ya
  coincidían con la lámina, y lo que no coincidía era la ruta y que la pantalla se dibujaba con la
  barra de la caja. Se preguntó antes de tocar nada y el usuario eligió **mudarla a `/cuentas`**,
  con redirección permanente desde la vieja, que conserva `moneda`, `cliente` y `pagina`.
- **D-5 estaba mal y se corrigió antes de escribirla.** Decía que la página compusiera la búsqueda
  con `searchClients`. Al ir a implementarla se midió que **`CLIENTS_PAGE_SIZE` es 25**: ese
  mecanismo habría filtrado los deudores contra las primeras veinticinco coincidencias **y en
  silencio**, que es la peor clase de defecto. Se elevó en vez de parchearlo, y por decisión del
  usuario el filtro vive dentro de `listDebtors`, que con búsqueda pide los nombres de **todos** los
  deudores del filtro. Es un defecto de mi propia decisión, visible solo al implementar.

### AC-13 · Ninguna lectura nueva salvo la aprobada, verificado contra `HEAD`

Verificado con `git diff` sobre `src/modules/cash/service.ts`, línea por línea y no de memoria:
**el único `await` agregado en todo el módulo es `getClientsByIds`, y está detrás de
`if (text !== "")`**. Sin búsqueda, la pantalla ejecuta exactamente lo que ejecutaba antes.

Dos cosas que la lámina pide y que **no cuestan una consulta**, porque ya estaban cargadas y el
código las tiraba:

- el **número** de la venta con saldo más vieja, que vivía en `SaleImputation.number`;
- los **totales por moneda**, un pliegue en memoria sobre el conjunto filtrado que `listDebtors` ya
  tenía, calculado **antes de cortar la página** porque el resumen suma el filtro entero.

### Mediciones

- **M-1 · El costo con y sin búsqueda.** **Medido**, no declarado: contra PostgreSQL real, llamando
  al servicio, con **200 clientes con deuda**. Mediana de tres corridas tras una en frío:
  **18 ms sin búsqueda**, **15 ms con «añez»** y **17 ms con «anez»**. Las dos búsquedas devuelven
  **100 de 200**, y dan lo mismo con y sin tilde. **Buscar no sale más caro**: la llamada extra trae
  los doscientos nombres de un saque y el conjunto filtrado después es más chico. El arnés fue una
  prueba de integración descartable, corrida y borrada.
- **M-2 · El filtro por cliente en Cobros.** **No corresponde a esta subfase**: D-4 lo mandó a la
  **24.7.2-b** junto con las láminas 06 y 07. Se mide allá, y este brief no lo da por medido.
- **M-3 · El estado de cuenta con muchos comprobantes.** **Verificado sin trabajo nuevo**:
  `getClientStatement` **no se tocó** —el diff lo muestra— y sus pruebas de integración, con el
  tope de 500 y su aviso, siguen en verde.

### AC-15 · Comparación visual contra las láminas, entrada por entrada

Cada pantalla se capturó del build de producción y se miró **al lado** de su lámina, no de memoria.
Las diferencias están todas acá.

**Lámina 01 · Cuentas de clientes**

| Entrada de la lámina | Qué quedó |
|---|---|
| Título, subtítulo y pestañas «Con deudas / Buscar cliente» | ✔ |
| Filtros: Moneda y «Buscar cliente (opcional)» con su marcador | ✔ |
| Línea de conteo «3 saldos · 2 clientes» | ✔ con diferencia menor: dice «2 clientes en esta página», porque el recuento de clientes es el de la página y afirmar el del filtro entero exigiría contarlos aparte |
| Tabla: Cliente · Moneda · Debe · Ventas con saldo · Más antigua · Acción | ✔ |
| «Más antigua» con número y fecha | ✔ |
| «1 venta» / «2 ventas» con la palabra | ✔ *(primera versión mostraba el número solo; lo encontró esta comparación)* |
| «Ver cuenta» como botón con borde | ✔ *(primera versión era un enlace de texto, y se partía en dos renglones; lo encontró esta comparación)* |
| Nombre del cliente en un renglón | ✔ *(primera versión lo partía; lo encontró esta comparación)* |
| Resumen lateral con la nota de que el equivalente no convierte | ✔ |
| **«Equivalente en USD» por cada moneda** | ✘ **V-7**: calcularlo en la página sería reimplementar la regla de conversión, y exponerlo desde `referenceView` toca una función que **también usan las cuentas de proveedores**. Se muestra la deuda de cada moneda y el equivalente del **total** |
| Fechas «26 oct. 2026» | ✘ menor: el proyecto formatea `31/10/2026` con `formatDate` en todas sus pantallas |
| Menú lateral: Finanzas → Caja · Cuentas de clientes · Tipo de cambio | ✔, y ya era así antes de esta subfase |

**Lámina 02 · Estado de cuenta**: la pantalla es la de la 21.6, que esta subfase **no rediseñó**;
lo que agregó es su segunda entrada (D-3). Las tarjetas por moneda, el equivalente, las pestañas
Resumen y Comprobantes, la imputación y los cobros aplicados ya existían y coinciden. La miga de la
lámina dice «Finanzas › Cuentas › Paula Méndez»; la nuestra la arma el marco de la 24.1 desde la
ruta, y las dos entradas se distinguen por el «Volver».

**Lámina 03 · Cobrar a cuenta, revisión**

| Entrada de la lámina | Qué quedó |
|---|---|
| Los dos pasos nombrados, con el segundo activo | ✔ con diferencia de forma: son texto con `aria-current="step"`, no círculos numerados unidos por una línea |
| «Revisión de la aplicación» con su subtítulo | ✔ |
| «No es una selección manual de ventas» | ✔ |
| «Aplicación en la cuenta ({moneda})» con sus destinos e importes | ✔, en una región con nombre |
| «Quedará a favor en {moneda}» cuando sobra | ✔ |
| Aviso ámbar «Es una previsión de la cuenta actual» | ✔ |
| «{otra moneda} siguen pendientes; este cobro no cruza monedas» | ✔ |
| «Contexto de la cuenta» y «Datos del cobro (ingresados)» | ✔ |
| «Registrar no ejecuta una transferencia» | ✔ |
| «Cambiar datos» y «Registrar cobro» | ✔ |
| **En el paso 2 se ve solo la revisión** | ✔ *(primera versión dejaba arriba las tablas de ventas con saldo y la ayuda del paso 1, que la lámina no muestra y que repetían el aviso de la imputación; lo encontró esta comparación, y se resolvió pasando ese contexto al formulario, que lo dibuja solo en el paso 1)* |
| Miga «Finanzas › Cuentas de clientes › Paula Méndez › Cobrar a cuenta» | ✘ menor: la arma el marco de la 24.1 desde la ruta, que es `/clientes/…`; cambiarla es tocar el marco |

**Lámina 09 · «No hay saldo a favor»**

| Entrada de la lámina | Qué quedó |
|---|---|
| Ícono en círculo y título «No hay saldo a favor» | ✔ |
| «La deuda y las señas retenidas no son importes disponibles para devolver» | ✔ |
| Nota «La cuenta conserva su moneda. Consultá el estado actualizado» | ✔ |
| «Ver cuenta» | ✔ |
| El título no se repite | ✔ *(primera versión decía «No tiene saldo a favor» en el subtítulo y «No hay saldo a favor» en la tarjeta; es el defecto que la 24.6.2-e corrigió en el listado de ventas, y lo encontró esta comparación)* |
| «Consulta: sin acciones de gestión» | ✘ declarado: esa línea de la lámina es del caso `viewer`, y esta pantalla es solo de `admin` |

**El saldo de la comparación**: encontró **cinco defectos de forma** que ninguna prueba podía ver
—el número sin la palabra, el enlace en vez del botón, dos textos partidos, el ruido del paso 1 en
el paso 2 y el título repetido—. Ninguno rompía nada; los quince casos de extremo a extremo, axe y
el typecheck estaban en verde con todos ellos adentro. Es la **sexta vez** en esta fase que poner la
captura al lado de la lámina encuentra algo que no se encuentra de otra forma.
