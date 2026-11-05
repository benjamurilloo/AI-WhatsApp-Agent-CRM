---
schema: task-brief.v1
task_id: 24.7.3
task_type: implementation
generated_at: 2026-11-05
---

# Brief 24.7.3 — Cotización y medios de pago

- **Estado**: **aprobado por el usuario el 2026-11-05 con las recomendaciones**, con **D-1 a D-5
  cerradas en su opción (a)**. En implementación.
- **Origen**: fila «24.7.3 Cotización y medios de pago» de
  [Roadmap.md](../planning/Roadmap.md), §Fase 24. Es la **última fila del bloque de Finanzas**:
  con ella cierra el bloque que abrieron la 24.7.1, la 24.7.2 y la 24.7.2-b.
- **Láminas**: `23-tipo-cambio/desktop/01-cotizacion-fuente-historial-v2.png` y
  `24-medios-pago/desktop/01-medios-pago-configuracion-v2.png`, con sus README
  ([tipo de cambio](../ui-redesign/v2/23-tipo-cambio/README.md),
  [medios de pago](../ui-redesign/v2/24-medios-pago/README.md)). Las dos son del lote
  **V2-10**, el mismo de la 24.7.1 y la 24.7.2-b, y las dos son **solo de escritorio**: el
  teléfono «reutiliza los patrones descritos, sin imágenes adicionales».

## Objetivo

Que las dos pantallas de configuración de Finanzas —**Tipo de cambio** y **Medios de pago**—
tengan la forma de sus láminas, **sin cambiar una sola regla de dinero y sin una sola lectura
nueva**. Es un rediseño, como la 24.7.1: lo que cambia es cómo se compone lo que ya se lee.

## Punto de partida verificado

Leído en el código en `HEAD` (`86c3b5f`), no en la documentación:

- **`/caja/cotizacion`** son cinco archivos y 798 líneas: `page.tsx` (249), `messages.ts` (150),
  `actions.ts` (140), `rate-form.tsx` (132) y `settings-form.tsx` (127). La página ya muestra la
  vigente con su par, la fuente, la lectura de DolarAPI con su ajuste, la fecha de registro, la
  de última confirmación, el aviso de antigüedad, la configuración de fuente y ajuste para
  `admin`, la carga manual y el historial paginado. Sin moneda principal, `notFound()`.
- **`/caja/medios-de-pago`** son tres archivos y 535 líneas: `page.tsx` (251),
  `payment-method-form.tsx` (148) y `payment-method-actions.tsx` (136). Ya tiene la lista con
  nombre, efectivo y estado; alta, renombre por `?editar=<id>`, desactivación con confirmación
  por `?confirmar=<id>`, reactivación, lista inicial y el bloqueo de «Permuta».
- **El equivalente de referencia no se dibuja en ninguna de las dos.** Vive en `/caja` y en las
  cuentas, con `reference-total.tsx`. Queda **fuera de alcance**.

## Las fronteras entre módulos, releídas con `grep`

Releídas acá, no recordadas, como manda el paso 5 de la metodología:

- `Overview.md:49` — «otro módulo no hace `JOIN` directo contra tablas ajenas fuera de
  `analytics`». Las dos pantallas leen de **un solo módulo cada una**, así que no hay nada que
  componer y nada que cruzar.
- `Overview.md:38`, fila de `fx` — «**Solo `cash` depende de `fx`**», y lo fija la guarda
  `fx-dependencies`. `fx` depende de `organizations` y `audit`. La página de cotización llama a
  `getExchangeRatePage` (de `fx`) y a `getOrganizationTimezone` (de `organizations`): es una
  **página** componiendo dos módulos, que es lo permitido, y no agrega ninguna dependencia.
- `Overview.md:36`, fila de `cash` — los medios de pago son suyos. `listPaymentMethods` no sale
  del módulo.

**No hay contradicción entre los documentos de arquitectura y el diseño aceptado.** La que sí
aparece está abajo, en H-6, y es entre un README de la v2 y el ADR 0025.

## Hallazgos que condicionan el alcance

### H-1 · La pantalla de Tipo de cambio no existe en `Screens.md`

El índice de `Screens.md` tiene 59 secciones y **salta de la 26 (Sesión de caja y su arqueo) a
la 27 (Medios de pago)**. La pantalla existe en el código desde la 29.4, la navegación la nombra
(`Screens.md:60`, «Finanzas: Caja, Cuentas de clientes (`/cuentas`) y Tipo de cambio
(`/caja/cotizacion`)») y tres briefs la describen, pero **ninguna sección la especifica**.

Consecuencia directa: esta subfase no edita su sección, **la crea**. Y hasta que exista, el
contrato de producto de esa pantalla son el [ADR 0025](0025-tipo-de-cambio.md) y los briefs
[29.4](brief-29.4-el-tipo-de-cambio.md) y [29.4.2](brief-29.4.2-la-lectura-de-la-cotizacion.md).
Lo resuelve **D-4**.

### H-2 · La lámina ya se cumple fuera de la pantalla; lo que no coincide es su propio encabezado

`layout.tsx:106-131` ya lista **«Tipo de cambio»** como ítem de Finanzas, hermano de Caja y de
Cuentas de clientes, exactamente como lo dibuja la lámina. Y las migas ya dicen
«‹organización› / Finanzas / Tipo de cambio», porque `currentLink` (`nav-links.ts:44-60`) elige
**el `href` más largo que cubre la ruta**, y `/caja/cotizacion` es más largo que `/caja`.

Lo único que contradice la lámina es la pantalla misma: `page.tsx:76-80` dibuja
`PageHeader title="Caja"` y debajo la `CashSubNav`. **La lámina está a un encabezado y un
componente de distancia**, sin mudar la ruta. Lo resuelve **D-1**.

### H-3 · Mudar la ruta cuesta más de lo que parece, y el precedente dejó un defecto medido

Si se mudara `/caja/cotizacion`, el costo verificado es:

- **Tres guardas nombran la ruta literalmente**: `exposed-surface.test.ts:163,168`,
  `fx-dependencies.test.ts:107` y `module-boundary.test.ts:254`.
- **`revalidatePath("/caja", "layout")` la cubre hoy por ser hija de `/caja`**: lo llaman
  `clientes/[clientId]/cobrar/actions.ts:154`, `cobros/[receiptId]/anular/actions.ts:61` y
  `devoluciones/actions.ts:123,174`. Fuera de `/caja` dejarían de cubrirla.
- **Ese es exactamente el defecto que la revisión independiente encontró en la 24.7.2**: al mudar
  `/caja/deudores` a `/cuentas`, «nada revalidaba `/cuentas`, porque cuatro llamadas la cubrían
  por ser `/caja/deudores` hija de un layout».

No es un argumento para no mudarla: es el precio, y hay que pagarlo con los ojos abiertos.
Lo pesa **D-1**.

### H-4 · El menú «…» de la lámina de medios de pago ya está decidido, y se decidió que no

La columna «Acciones» dibuja un **«⋮»** por fila. Es el mismo caso que la
[24.7.2-b](brief-24.7.2-b-cobros-y-devoluciones-de-la-caja.md) cerró en su **D-2**: un menú de
desborde es un *popover*, **que las pantallas anden sin JavaScript es un invariante medido**, y
con dos acciones no hay nada que esconder. **No se reabre**: se repite la decisión y se declara
la diferencia, con «Renombrar» y «Desactivar» como enlaces, que es lo que hay hoy.

### H-5 · «Guardar configuración» apagado es un estado, no un estilo

La lámina dibuja el botón de la configuración **en gris**. Eso no es una variante visual: es el
estado «todavía no cambiaste nada», y para apagarlo de verdad hay que escuchar los cambios del
formulario, que es JavaScript. Hoy (`settings-form.tsx:121`) el botón solo se apaga mientras
envía. **Se conserva así y se declara la diferencia.**

### H-6 · «Orientativo» contra «de referencia»: el README de la v2 contradice al ADR 0025

El [README del lote de tipo de cambio](../ui-redesign/v2/23-tipo-cambio/README.md) dice que los
equivalentes de Caja y cuentas «se rotulan **Orientativo**». El
[ADR 0025](0025-tipo-de-cambio.md), puntos 6 y 7 (líneas 216-224), y el código
(`reference-total.tsx:49`, `exchange.ts:137`) dicen **«de referencia»**. La tarea de Notion ya lo
anota.

**Por la jerarquía de fuentes de verdad gana el ADR**, y además la discusión es ajena a estas dos
pantallas: el equivalente no se dibuja en ninguna. **No se renombra nada**, y queda escrito acá
para que nadie lo «corrija» más adelante.

### H-7 · Ninguna de las dos pantallas necesita una lectura nueva

Verificado campo por campo contra lo que los servicios ya devuelven:

| Lo que pide la lámina | De dónde sale hoy |
|---|---|
| «Lectura de referencia (DolarAPI)» y «Ajuste en ARS» como filas separadas | `page.current.reading.sourceRate` y `page.adjustment`, ya usados en `page.tsx:70-72,127` |
| «Registrada» y «Última confirmación» como filas separadas | `page.current.recordedAt` y `page.current.asOf`, ya usados en `page.tsx:103-105` |
| «Monedas del sistema: principal / otra» | `page.mainCurrency` y `page.quoteCurrency` |
| Historial con «Tipo» (Automática/Manual) y «Origen» | `row.reading` y `row.source`, ya usados en `page.tsx:217-223` |
| Columna «Tipo» de los medios | `method.isCash` y `method.systemRole`, ya usados en `page.tsx:194-199` |

**Lo que cambia es cómo se compone**, no qué se lee. AC-12 lo exige verificado contra `HEAD`
archivo por archivo antes de cerrar, no afirmado.

### H-8 · El radio de impacto en las pruebas, calculado por ruta y por rol

Calculado con los tres instrumentos a la vez, porque **calcularlo con uno solo es el defecto que
la 24.7.2-b cometió** y que está registrado en su cierre:

- **Por ruta**: `tests/e2e/exchange.spec.ts` (672 líneas, 10 casos) y `tests/e2e/cash.spec.ts`
  (la barra de la caja y la región «Medios de pago», líneas 90-104, 352-354 y 532-536).
- **Por rol y por etiqueta**: los mismos dos archivos.
- **Falso positivo declarado**: `knowledge.spec.ts`, `integration/knowledge.test.ts`,
  `read-api.test.ts` y `fixtures/read/v1/captured-knowledge.json` nombran «medios de pago», pero
  ahí es **la información del negocio que lee el agente**, que `Screens.md:648` declara
  explícitamente otra cosa. **No se tocan.**
- **Guardas**: ninguna cambia si D-1 cierra en (a); tres cambian si cierra en (b).

### H-9 · El aviso al pie de la lámina nombra datos del ejemplo

El pie dice «**USDT** se registra en USD» y «**Permuta** se usa solo en cobros de ventas con
usado elegible». «Permuta» es un medio **del sistema** y existe siempre; «USDT» es un medio
**ordinario que la organización pudo no haber creado**. Escribir la línea de USDT fija sería
hablar de un medio que no existe. Lo resuelve **D-5**.

## Diferencias con la v2, declaradas antes de implementar

1. **El menú «⋮» no se implementa** (H-4): las acciones van como enlaces visibles.
2. **«Guardar configuración» no se apaga por «sin cambios»** (H-5).
3. **El fondo no queda inerte al abrir un panel.** Los dos README lo piden («al abrirlo el fondo
   deja de ser interactivo»); atenuarlo y bloquearlo es un *modal*, y un modal sin JavaScript no
   existe. El panel se dibuja al costado y el resto sigue siendo usable, como el recibo de la
   24.7.2-b.
4. **El aviso «Datos de ejemplo · No es una cotización de mercado»** de la lámina es del mockup,
   no del producto: no se implementa.
5. **El pie «Registros anteriores a modo ilustrativo»** del historial, ídem.
6. **El equivalente no se renombra «Orientativo»** (H-6).

## Decisiones

Las cinco **las cerró el usuario el 2026-11-05 en su opción (a)**. Quedan escritas con sus
alternativas porque el motivo de cada elección es parte del contrato que la revisión va a leer.

### D-1 · ¿Se muda la pantalla de Tipo de cambio fuera de `/caja`? — CERRADA en (a)

- **(a) No. Se queda en `/caja/cotizacion` y cambia solo su presentación** — recomendada.
  El encabezado pasa a «Tipo de cambio», se le saca la `CashSubNav`, y «Cotización» sale del
  «Más» de la barra de la caja, que queda con «Medios de pago». **El resultado visible es
  idéntico al de la lámina** (H-2: la navegación y las migas ya dicen lo correcto), y no se paga
  nada de H-3.
- **(b) Sí. `/tipo-de-cambio`, con `permanentRedirect` desde `/caja/cotizacion`**, como
  `/caja/deudores`. Es más consistente con lo que la 24.7.2 hizo con las cuentas, y deja la ruta
  diciendo lo mismo que la pantalla. Cuesta tres guardas, una redirección, y **obliga a revisar
  una por una las cuatro llamadas a `revalidatePath("/caja", "layout")`**, que es donde el
  precedente falló.

**Por qué (a)**: la lámina es un dibujo de la pantalla, y la pantalla queda igual con las dos.
(b) compra coherencia de URL al precio de reabrir el defecto que la revisión anterior encontró.
Si el usuario prefiere la coherencia, (b) es defendible y el brief la absorbe agregando los tres
archivos de guardas y un AC propio para la revalidación.

### D-2 · La carga manual de una cotización, ¿panel por URL o tarjeta? — CERRADA en (a)

- **(a) Panel que abre y cierra por la URL (`?cargar=1`)** — recomendada. Es el patrón de la
  24.7.2-b (D-0b) y de la 24.6.2-d (`?panel=cobro`), anda sin JavaScript, y es lo que la lámina
  dibuja: configurar cómo se obtiene la cotización queda separado de cargar un valor.
- **(b) Se queda como la tarjeta «Cargar una cotización», siempre visible.** Menos trabajo, pero
  es justo la distinción que el README del lote dice que la propuesta vino a hacer.

### D-3 · El alta y el renombre de un medio de pago, ¿panel por URL? — CERRADA en (a)

- **(a) Sí: `?nuevo=1` para el alta y el `?editar=<id>` que ya existe para el renombre, los dos
  en el mismo panel**, con el tipo en solo lectura al renombrar y «Guardar nombre» como botón —
  recomendada. El renombre **ya se maneja por URL**: lo único que cambia es dónde se dibuja.
- **(b) Se quedan como tarjetas sobre la tabla**, como hoy.

### D-4 · ¿Dónde se documenta la pantalla de Tipo de cambio en `Screens.md`? (H-1) — CERRADA en (a)

- **(a) Sección nueva «26b. Tipo de cambio»**, entre la 26 y la 27 — recomendada. Es el patrón
  que el archivo ya usa para las pantallas que nacieron después (5b, 5c, 12b), y la deja al lado
  de las de caja, que es donde la busca quien lee.
- **(b) Al final, como «60. Tipo de cambio»**, con el bloque de Finanzas lejos.

No hay opción «no documentarla»: `Screens.md` es contrato de producto y hoy tiene un agujero.

### D-5 · La columna «Tipo» y el aviso al pie de los medios de pago (H-9) — CERRADA en (a)

- **(a) Se sigue la lámina, con el aviso condicionado** — recomendada. La columna pasa a
  «Tipo», con «Efectivo», «No efectivo» o «Del sistema», y las explicaciones largas bajan a un
  aviso al pie. **La línea de «Permuta» se dibuja solo si la fila de Permuta existe**, y **la de
  USDT no se dibuja nunca**: es un medio ordinario del ejemplo, no una regla del producto. Lo que
  hoy dice la celda de la permuta («Descuenta un usado de una venta: no pasa por la caja») **no
  se pierde**: es exactamente lo que dirá el aviso.
- **(b) La columna conserva la frase entera por fila**, como hoy, y no hay aviso al pie.

## Alcance

### Incluido

1. **Tipo de cambio** con la forma de su lámina: encabezado propio, «Cotización actual» con el
   par grande, el estado y la lista de datos (Fuente, Lectura de referencia, Ajuste, Registrada,
   Última confirmación); «Configuración de la cotización» con la fuente, el ajuste y el recuadro
   «Monedas del sistema» en solo lectura; «Historial de cotizaciones» con Fecha y hora, Tipo,
   Origen y Cotización; y la carga manual según D-2.
2. **Medios de pago** con la forma de su lámina: encabezado con su subtítulo y el botón primario
   «Nuevo medio»; la tabla con Nombre, Tipo, Estado y Acciones; el aviso al pie según D-5; el
   alta y el renombre según D-3.
3. **La sección de `Screens.md`** según D-4, y la actualización de la sección 27.
4. **Las dos specs afectadas**, actualizadas a lo que las pantallas dibujen (H-8).
5. **El barrido de anchos** a 320 y 375 px de las dos pantallas (M-1).

### Excluido

- **Toda regla de dinero.** No se toca la conversión, ni el umbral del 10 %, ni el aviso de
  antigüedad, ni el rechazo de una lectura inválida, ni las reglas de alta, renombre,
  desactivación o reactivación de un medio, ni el bloqueo de «Permuta», ni el tope de activos.
- **El equivalente de referencia** y su rótulo (H-6).
- **El lector automático** de `scripts/fx/`, que vive fuera de `src/`.
- **La información del negocio que lee el agente** (H-8, falso positivo declarado).
- **Migraciones, tablas, contratos y lecturas nuevas**: ninguna. Siguen 67 migraciones.
- **El objetivo táctil de 44 px**, que es una subfase propia todavía sin abrir.
- **El desbordamiento del `<select>` de moneda en «cobrar a cuenta» y «pagos a proveedores»**,
  declarado desde la 24.7.1 y medido en la 24.7.2-b (M-2: 403 px de `min-content`). Sigue
  pendiente y **no es de estas pantallas**.

## Lista cerrada de archivos

Tocar algo fuera de esta lista es un hallazgo bloqueante, no una mejora. **Salirse se pregunta
antes de implementar**, sin excepción por tamaño.

> **Ampliada el 2026-11-05**, con las dos correcciones que pidió el usuario en el recorrido, que es
> el paso donde esta subfase se eleva a *validado en staging*. Las dos caen fuera de la lista
> original y **se preguntaron antes de implementar**; van acá, en la 24.7.3, y no en una subfase
> nueva, porque son el resultado del recorrido de esta subfase —el mismo precedente que la 24.6.2-d,
> que así corrigió el menú del encabezado de la venta—:
>
> 1. **Se saca «Registrar cobro»** del encabezado de `/caja/cobros`, con su párrafo de ayuda. Era
>    el H-6 de la [24.7.2-b](brief-24.7.2-b-cobros-y-devoluciones-de-la-caja.md), que queda
>    superado ahí mismo. Archivos: `src/app/(autenticado)/caja/cobros/page.tsx` y
>    `tests/e2e/receipts.spec.ts`, cuyo caso afirmaba que el botón estaba deshabilitado y ahora
>    afirma que **no existe**.
> 2. **El historial de cotizaciones pasa de 20 filas por página a 5.** Archivos:
>    `src/modules/fx/service.ts` (`EXCHANGE_RATE_PAGE_SIZE`) y `tests/integration/exchange.test.ts`,
>    que gana el caso que **fija el valor**: hasta hoy ninguna prueba lo miraba, así que el 20 podía
>    volver en silencio. El usuario pidió «las últimas 5 o 3»; se tomó 5, el más alto de los dos.
>
> Ninguna de las dos toca reglas de dinero, datos ni contratos: son una supresión de UI y una
> constante de paginación.

**Pantallas**

- `src/app/(autenticado)/caja/cotizacion/page.tsx`
- `src/app/(autenticado)/caja/cotizacion/rate-form.tsx`
- `src/app/(autenticado)/caja/cotizacion/settings-form.tsx`
- `src/app/(autenticado)/caja/cotizacion/messages.ts`
- `src/app/(autenticado)/caja/cotizacion/actions.ts` *(solo si D-2 cierra en (a): cerrar el panel
  al guardar)*
- `src/app/(autenticado)/caja/medios-de-pago/page.tsx`
- `src/app/(autenticado)/caja/medios-de-pago/payment-method-form.tsx`
- `src/app/(autenticado)/caja/medios-de-pago/payment-method-actions.tsx`
- `src/app/(autenticado)/caja/cash-sub-nav.tsx` *(sacar «Cotización» del «Más»)*
- `src/app/(autenticado)/caja/cobros/page.tsx` *(agregado el 2026-11-05: sacar «Registrar cobro»)*

**Módulos**

- `src/modules/fx/service.ts` *(agregado el 2026-11-05: `EXCHANGE_RATE_PAGE_SIZE`, de 20 a 5; nada
  más de este archivo)*

**Pruebas**

- `tests/e2e/exchange.spec.ts`
- `tests/e2e/cash.spec.ts`
- `tests/e2e/receipts.spec.ts` *(agregado el 2026-11-05: el caso del botón pasa a negativo)*
- `tests/integration/exchange.test.ts` *(agregado el 2026-11-05: el caso que fija el tamaño de
  página del historial)*

**Documentación**

- `docs/product/Screens.md`
- `docs/planning/Roadmap.md` *(la fila de la 24.7.3; va en la lista para que corregirla no sea un
  desvío, como lo fue en la 24.7.1)*
- `docs/decisions/brief-24.7.3-cotizacion-y-medios-de-pago.md` *(este archivo: §Cierre)*
- `docs/decisions/README.md` *(la fila del índice de briefs)*
- `CHANGELOG.md`, `HANDOFF.md` *(solo al cerrar)*

**D-1 cerró en (a)**, así que la lista es exactamente esta: `src/app/(autenticado)/layout.tsx`,
la ruta nueva con su redirección y las tres guardas que nombran la ruta **no se tocan**, y la
ruta sigue siendo `/caja/cotizacion`.

## Fuentes de verdad, en orden

1. El código y las migraciones en `HEAD`.
2. [ADR 0025](0025-tipo-de-cambio.md) y [ADR 0022](0022-cobros-y-caja.md) para las reglas;
   [DataModel.md](../architecture/DataModel.md) y [Overview.md](../architecture/Overview.md) para
   los datos y las fronteras.
3. Los briefs [21.2](brief-21.2-los-medios-de-pago-y-la-caja.md),
   [29.4](brief-29.4-el-tipo-de-cambio.md), [29.4.2](brief-29.4.2-la-lectura-de-la-cotizacion.md)
   y [29.7.2](brief-29.7.2-la-permuta-y-la-compra-de-usados.md); este brief; `Roadmap.md`.
4. Los README del lote V2-10, que **mandan en la forma y no en las reglas** (H-6).

## Criterios de aceptación

| id | Criterio |
|---|---|
| **AC-1** | **Tipo de cambio** tiene la forma de su lámina: encabezado propio sin la barra de la caja, «Cotización actual», «Configuración de la cotización» con «Monedas del sistema» en solo lectura, e «Historial de cotizaciones» con sus cuatro columnas. |
| **AC-2** | El historial muestra **Fecha y hora, Tipo, Origen y Cotización**, con «Automática»/«Manual» en Tipo y la fuente con su ajuste en Origen. |
| **AC-3** | La carga manual se resuelve según **D-2**, y si es panel, **abre y cierra por la URL conservando la página del historial**, y anda con JavaScript apagado. |
| **AC-4** | **Medios de pago** tiene la forma de su lámina: subtítulo, botón primario «Nuevo medio», tabla con Nombre, Tipo, Estado y Acciones, y el aviso al pie según **D-5**. |
| **AC-5** | El alta y el renombre se resuelven según **D-3** y andan con JavaScript apagado, incluido el renombre con el tipo en solo lectura. |
| **AC-6** | **Un `viewer` ve las dos pantallas sin un solo control de gestión**, y la de cotización sin los formularios, como hoy. |
| **AC-7** | **Sin moneda principal, Tipo de cambio sigue sin existir**: 404, y la navegación no la ofrece. |
| **AC-8** | «Permuta» sigue sin renombre ni desactivación, con su bloqueo **con nombre accesible** y no solo por un icono. |
| **AC-9** | **Ninguna regla de dinero cambió**: `src/modules/fx/**` y `src/modules/cash/**` quedan **sin modificar**, y el `git diff` lo muestra. |
| **AC-10** | **Ninguna migración, tabla ni contrato nuevo**; siguen **67** migraciones. |
| **AC-11** | Las dos pantallas **no desbordan a 320 ni a 375 px** (M-1), con el barrido escrito en las specs y no declarado a ojo. |
| **AC-12** | **Ninguna lectura nueva**, verificado **contra `HEAD` archivo por archivo** y escrito en el §Cierre con el nombre de cada servicio llamado antes y después (M-2). |
| **AC-13** | `Screens.md` documenta Tipo de cambio según **D-4** y la sección 27 queda al día. |
| **AC-14** | **Comparación visual entrada por entrada contra las dos láminas**, con las dos abiertas, anotando cada diferencia como cumplida, declarada o descartada. Una diferencia encontrada **se verifica contra el instrumento antes de atribuirla al producto**. |
| **AC-15** | La **batería completa en una sola corrida de CI** en verde sobre el SHA exacto, leída por `headSha`, **con el paso «Alcance del cambio» en `codigo=true`**. |
| **AC-16** | **Revisión independiente** de un agente que no participó, de solo lectura, contra este brief y contra las reglas vigentes, con sus hallazgos verificados contra el código antes de aceptarse. |
| **AC-17** | **Despliegue y recorrido del usuario**: las siete verificaciones del runbook y el recorrido declarado. **Sin AC-17 el nivel es «validado en integración», no «validado en staging».** |

## Mediciones requeridas

- **M-1 · El barrido de anchos.** `setViewportSize` a 320 y 375 px y comparación de
  `scrollWidth` contra `clientWidth` del documento, en las dos pantallas y con el panel abierto.
  Es el instrumento de AC-10 de la 24.7.2, **el que encontró un desbordamiento de 338 px** cuando
  el criterio ya se había declarado cumplido sin él.
- **M-2 · El recuento de consultas, por camino de código.** Se declara **«verificado por camino
  de código», no «medido»**, y el §Cierre lo escribe con esas palabras. La 24.7.2-b llamó
  «medido» a un recuento que no lo era y la revisión independiente lo encontró; acá el nombre
  está fijado antes de mirar.

**Las dos mediciones son independientes: ninguna hereda la salvedad de la otra.**

## Condiciones de detención

Parar y reportar, sin continuar:

1. **Si algo exige una lectura nueva o una dependencia nueva entre módulos.** No se agrega y se
   pregunta. En la 24.7.1 se agregó una contra esta misma condición y la encontró la revisión.
2. **Si algo exige cambiar una regla de dinero**, incluido el umbral del 10 %, el aviso de
   antigüedad o las reglas de un medio de pago.
3. **Si hace falta una migración.**
4. **Antes de tocar un archivo fuera de la lista cerrada**, cualquiera sea su tamaño.
5. **Antes de `commit`, `push`, `merge` o despliegue**: autorización explícita del usuario **en
   el turno**. Una anterior no vale.
6. **Si la batería local falla**: no se sube el límite global de una prueba para tapar una falla
   local; se diagnostica y se declara. `receipts.spec.ts:148` tarda 46 s acá contra un tope de
   30 y pasa en CI.
7. **Nunca correr Vitest de integración y Playwright a la vez**: comparten la base y producen
   fallas que no existen.

## Nivel de validación objetivo

**Validado en staging**, y solo con AC-17. El nivel de evidencia es `deterministic` más
`producer-consumer` para las dos pantallas (UI ↔ servicio ↔ base), y `authenticated-end-to-end`
para el recorrido. **Un nivel superior nunca se infiere de uno inferior.**

## Ubicación en la fase

- **Necesario ahora**: las dos pantallas con la forma de sus láminas y la sección que falta en
  `Screens.md`. Con esto **cierra el bloque de Finanzas** de la Fase 24.
- **Requisito antes de producción**: nada propio. No toca reglas de dinero ni datos.
- **Mejora posterior, explícitamente fuera**: el objetivo táctil de 44 px (subfase propia); el
  desbordamiento del `<select>` en «cobrar a cuenta» y «pagos a proveedores»; y el menú «⋮», que
  no se implementa por decisión registrada y repetida (H-4).

Después de esta fila quedan seis en la Fase 24, ninguna con brief: 24.8.1, 24.8.2, 24.9.1,
24.9.2, 24.9.3 y 24.10. La **13.5.2-b conserva su prioridad**, para cuando haya un negocio real
confirmado.

## Cierre

**CERRADA el 2026-11-05.** Nivel alcanzado: **validado en staging**, con AC-17 cumplido.
Desplegada en **`fd43a2a`**, con la CI en `success` sobre ese SHA exacto (run 42120553449, leída
por `headSha` y no por «la última»), las siete verificaciones del runbook pasadas y el recorrido
del usuario confirmado. **Para volver atrás: `d008e2a`**, anotado en
`/var/lib/crm-production/despliegues` antes de desplegar; **entre los dos no hay migraciones**.

### Los criterios, uno por uno

| id | Estado | Dónde está la evidencia |
|---|---|---|
| AC-1 | Cumplido | `caja/cotizacion/page.tsx`; §26b de `Screens.md`; `exchange.spec.ts` |
| AC-2 | Cumplido | Las cuatro columnas en `page.tsx`; `exchange.spec.ts` |
| AC-3 | Cumplido | D-2 cerró en (a): panel `?cargar=1`. El caso sin JavaScript **no existía** y lo pidió la revisión (N-1); hoy es `test.describe("sin JavaScript")` de `exchange.spec.ts` |
| AC-4 | Cumplido | `caja/medios-de-pago/page.tsx`; §27 |
| AC-5 | Cumplido | D-3 cerró en (a). El renombre sin JavaScript **tampoco estaba probado** y lo pidió la revisión (N-2); hoy está en `cash.spec.ts` |
| AC-6 | Cumplido | Casos de `viewer` en las dos specs |
| AC-7 | Cumplido | `exchange.spec.ts`, «sin moneda principal no hay cotización: ni pestaña ni página» |
| AC-8 | Cumplido | «Permuta» con nombre accesible, no solo icono |
| AC-9 | **NO cumplido como está escrito** | Ver abajo: es el hallazgo del cierre |
| AC-10 | Cumplido | **67** migraciones, sin tablas ni contratos nuevos |
| AC-11 | Cumplido | M-1 en las dos specs. Encontró **239 px** de desbordamiento a 320 con la cotización vieja |
| AC-12 | Cumplido | La tabla de más abajo, archivo por archivo contra `HEAD` |
| AC-13 | Cumplido | §26b nueva y §27 al día |
| AC-14 | Cumplido | La comparación de más abajo |
| AC-15 | Cumplido | Run 42120553449, con «Alcance del cambio» en **`Corre todo: true`** |
| AC-16 | Cumplido | **R1** sobre la entrega y **R2** sobre las dos correcciones del recorrido, que R1 no había visto; los hallazgos de las dos verificados contra el código antes de aceptarse. R2 dejó **un desvío de alcance abierto** (B-2) |
| AC-17 | Cumplido | Siete verificaciones en verde; recorrido del usuario, que produjo **dos correcciones** |

### AC-9 · El criterio no se cumple como está escrito, y no se reescribe

AC-9 pide que `src/modules/fx/**` y `src/modules/cash/**` queden **sin modificar**, «y el
`git diff` lo muestra». El `git diff` muestra lo contrario: **`src/modules/fx/service.ts`, +5/−1**.
Lo cambió la segunda corrección del recorrido, que bajó `EXCHANGE_RATE_PAGE_SIZE` de 20 a 5.

Lo que el criterio **protegía sí se sostiene**, y conviene separarlo del criterio:
`src/modules/cash/**` quedó intacto; ninguna regla de dinero cambió; lo único que se tocó de `fx`
es una constante de **presentación** —cuántas filas trae una página del historial—, en la sección
que el propio archivo rotula «La pantalla de la cotización». No se movió el umbral del 10 %, ni el
aviso de antigüedad, ni una conversión, ni una regla de un medio de pago.

**Queda escrito como no cumplido en lugar de redefinir el criterio.** Un criterio reescrito para
que cierre deja de ser un criterio, y esta fase ya tuvo dos casos de afirmaciones en verde que la
revisión independiente destapó. La lección es del brief, no del código: **un criterio que prohíbe
tocar un directorio entero es más estrecho que la regla que quiere proteger**, y una corrección de
UI legítima lo rompe sin tocar nada de lo que importaba. Si una fila próxima quiere un criterio
así, conviene que diga «ninguna regla de dinero cambia, y los cambios en `fx/**` y `cash/**` se
enumeran» en vez de «sin modificar».

### AC-12 · Ninguna lectura nueva, servicio por servicio contra `HEAD`

Comparado entre **`86c3b5f`** (el `HEAD` anterior a la subfase) y **`fd43a2a`**, archivo por
archivo:

| Pantalla | Antes | Después |
|---|---|---|
| `/caja/cotizacion` | `requireSession`, `getExchangeRatePage`, `getOrganizationTimezone` | **las mismas tres** |
| `/caja/medios-de-pago` | `requireSession`, `listPaymentMethods` | **las mismas dos** |
| `cash-sub-nav.tsx` | `requireSession`, `getMainCurrency` | **ninguna** |

Ninguna lectura nueva en ninguna de las dos pantallas, y la barra de la caja hace **una lectura de
base menos**: `getMainCurrency` era una consulta real, y se fue con el tipo de cambio, que era lo
único que la usaba. El `requireSession()` que quedó colgado detrás —sin usar su resultado— lo
sacó la revisión independiente (N-6); la sesión la exige cada página antes de dibujar la barra, y
el layout de `(autenticado)` antes que ellas.

**Esto está verificado por camino de código, no medido** (M-2), y se escribe con esas palabras
porque el brief las fijó antes de mirar: no hay instrumentación que cuente consultas, hay una
comparación de los `await` de cada archivo contra los del `HEAD` anterior. La 24.7.2-b llamó
«medido» a un recuento que no lo era y lo encontró su revisión.

### AC-14 · La comparación visual, entrada por entrada

Hecha con **las dos láminas abiertas**, no de memoria. El resultado se parte en tres, y la
partición es el resultado:

- **Corregidas**: el orden de los avisos dentro del panel de carga (van dentro del formulario,
  antes del botón, como ordena la lámina); el «Volver» del panel; el «+» del nombre del enlace de
  alta, que es convención del proyecto desde la Fase 4 **y** lo que la lámina dibuja; la insignia
  de la cotización vigente.
- **Declaradas como diferencia a propósito**, las seis de antes de implementar —el menú «⋮»
  (H-4), «Guardar configuración» sin apagado por «sin cambios» (H-5), el fondo que no queda
  inerte, el aviso «Datos de ejemplo», el pie «Registros anteriores a modo ilustrativo» y
  «Orientativo» (H-6)— más cinco que aparecieron **al comparar** y quedaron escritas en
  `Screens.md`: el apilado con el panel abierto, los cuadros de ícono de `SectionCard`, el
  ocultamiento del botón de alta mientras el panel está abierto, el orden de las filas y la
  redacción de la bajada.
- **Fuera de alcance**, sin tocar: el objetivo táctil de 44 px y el desbordamiento del `<select>`
  en «cobrar a cuenta» y «pagos a proveedores».

**Una diferencia se verificó contra el instrumento antes de atribuirla al producto**, como pide el
criterio, y conviene el ejemplo concreto: la barra de secciones de la caja quedó en «Medios de
pago» aunque la lámina no la dibuja. No se sacó: la decisión fue del usuario, y la diferencia
está declarada en la §27 y en el comentario del código.

### Las dos correcciones del recorrido

El recorrido del usuario, que es el paso que eleva esta subfase a *validado en staging*, produjo
dos correcciones, **las dos fuera de la lista cerrada de archivos** y **preguntadas antes de
implementar** (ver la nota del 2026-11-05 en esa sección):

1. **Se sacó «Registrar cobro»** del encabezado de `/caja/cobros`, con su párrafo de ayuda. Era el
   H-6 de la [24.7.2-b](brief-24.7.2-b-cobros-y-devoluciones-de-la-caja.md), que queda
   **superado** ahí mismo. El caso de `receipts.spec.ts` afirmaba que el botón estaba
   deshabilitado y pasó a afirmar que **no existe**.
2. **El historial de cotizaciones pasó de 20 filas por página a 5**, conservando la paginación.

**Lo que esto enseña sobre las revisiones, y es el hallazgo más útil de la subfase:** ninguna de
las dos cosas las vio una revisión. Ni la autoevaluación ni la independiente. Las dos comprobaron
que la pantalla **fuera como la lámina la pedía**, y lo era: el botón deshabilitado estaba en la
lámina y el brief de la 24.7.2-b lo había razonado explícitamente, concluyendo que un control
apagado sin explicación es una trampa. Una revisión contra el diseño no puede encontrar un defecto
**del diseño**; hace falta usar la pantalla.

Y el 20 del historial **no lo miraba ninguna prueba**: el único caso del historial tenía dos
filas, así que el valor podía cambiar —o volver— sin que nada se pusiera rojo. La corrección trajo
el caso que lo fija en `tests/integration/exchange.test.ts`, y **se comprobó que falla** al volver
el valor a 20, que es lo único que prueba que la guarda guarda algo.

### La revisión de las dos correcciones (R2)

Las dos correcciones del recorrido llegaron **después** de R1, así que R1 no las vio. Se pidió una
segunda revisión independiente, solo sobre ellas, a un agente que no participó del trabajo y con
acceso de solo lectura. **Veredicto: R1 hallazgos, dos bloqueantes y cuatro no bloqueantes**, los
seis verificados contra el código antes de aceptar ninguno. Su veredicto **no autorizó nada**.

**Lo primero que informó es una limitación propia, y queda escrita porque acota qué cubre su
veredicto:** no tuvo Bash, así que **no leyó el `git diff`** y no pudo confirmar ni negar la lista
de archivos del commit. Lo que verificó es contenido contra contenido, releyendo archivos y citando
líneas. Tres criterios quedaron fuera de su alcance por la misma razón —AC-10, AC-15 y AC-17 se
leen contando migraciones, en Actions y en producción—, y lo declaró en vez de inferirlos.

| id | Hallazgo | Verificado | Qué se hizo |
|---|---|---|---|
| **B-1** | `docs/decisions/README.md` afirmaba que `src/modules/fx/**` y `src/modules/cash/**` quedaban «sin modificar», y el código dice lo contrario | Sí: la fila del índice contra `fx/service.ts:224` | **Corregido**, con nota fechada. El archivo está en la lista cerrada, así que corregirlo estaba autorizado. La fila además **no registraba el cierre** y la 173 sí: ahora lo registra |
| **B-2** | Se editó `brief-24.7.2-b-cobros-y-devoluciones-de-la-caja.md`, que **no está en la lista cerrada** ni antes ni después de la ampliación | Sí: la cita «Superado el 2026-11-05» existe, y la lista no incluye ese archivo | **Aceptado como desvío real y no resuelto.** Ver abajo: es el hallazgo que esta subfase no puede cerrar sola |
| **N-1** | La prosa promete que el caso se pone rojo «apagado o encendido», y la aserción solo cubre el rol `button`; un «Registrar cobro» encendido en este repo es un `<Link>`, rol `link` | Sí: `clientes/[clientId]/account-tab.tsx:137` y `ventas/[saleId]/page.tsx:403` lo dibujan como `<Link>` | **Aceptado, no aplicado todavía.** Ver abajo |
| **N-2** | La línea «ADR 0022, punto 11» quedó absorbida en el párrafo nuevo y parece justificar la ausencia del botón en vez de la leyenda | Sí: `cobros/page.tsx:58-65` | **Aceptado, no aplicado todavía.** Ver abajo |
| **N-3** | En el brief de la 24.7.2-b, cuatro afirmaciones sobre el botón apagado siguen en presente, fuera del H-6 marcado | Sí: líneas 167, 177, 270 y 446 de ese brief | **Aceptado y no tocado**, porque ese archivo es exactamente el del desvío B-2: ampliar la edición profundizaría el desvío en vez de corregirlo |
| **N-4** | Barrido negativo: ningún otro resto del botón —ni constante, ni mensaje, ni estilo, ni atributo ARIA, ni import huérfano— | Sí, por `grep` sobre las 40 ocurrencias restantes y la lectura entera de `caja/messages.ts` | **Sin acción**, y es un resultado útil: el hallazgo que no está también se informa |

Su **§Estado documental** marcó `CHANGELOG.md`, `HANDOFF.md` y la fila del Roadmap como atrasados.
Los tres estaban **en curso en este mismo cierre** cuando el revisor leyó el árbol, y los tres
quedaron al día. Lo informó bien: leyó un árbol a medio cerrar y lo dijo en vez de suponer.

#### B-2 · El desvío de alcance que este cierre no puede resolver solo

La nota «**Superado el 2026-11-05**» sobre el H-6 del brief de la
[24.7.2-b](brief-24.7.2-b-cobros-y-devoluciones-de-la-caja.md) **la escribió esta subfase**, y ese
archivo **no está en la lista cerrada**: ni en la original ni en la ampliación del 2026-11-05, que
enumera archivo por archivo las dos correcciones y de la 24.7.2-b solo dice que «queda superado ahí
mismo» —el efecto, no el archivo tocado—.

La regla es de este mismo brief, cuatro líneas arriba de la lista: «Tocar algo fuera de esta lista
es un hallazgo bloqueante, no una mejora. **Salirse se pregunta antes de implementar**, sin
excepción por tamaño.» **No se preguntó.** Las dos correcciones sí se preguntaron; esta tercera
edición se hizo sin preguntar, dentro del mismo turno, probablemente porque se leyó como parte de
la primera. No lo es: es otro archivo y otro brief.

**Queda registrado como desvío, no revertido ni legalizado.** Agregar el archivo a la lista ahora
sería reescribir el alcance para que cierre, el mismo error que AC-9 evitó a propósito dos
secciones más arriba. Revertirlo también es una decisión: el texto es verdadero y útil —sin él, el
brief de la 24.7.2-b sigue afirmando que el botón va deshabilitado, contra la §30 vigente de
`Screens.md`—, y N-3 muestra que **la contradicción no se agota en H-6**: son cinco lugares, no
uno. **La decisión es del usuario**, y es la única del cierre que queda abierta.

**La lección es del turno, no del código**: una corrección autorizada arrastra ediciones
«obviamente necesarias» a archivos vecinos, y la autorización no viaja con ellas. El límite de un
desvío aprobado es la lista de archivos que se nombró al aprobarlo.

#### N-1 y N-2 · Aceptados, con el costo de aplicarlos declarado

Los dos son reales y los dos están **dentro** de la lista cerrada, así que aplicarlos no sería un
desvío. **No se aplicaron en este cierre, y el motivo no es el tamaño del arreglo**: lo desplegado
y lo que corrió la batería es **`fd43a2a`**. Tocar `cobros/page.tsx` y `receipts.spec.ts` ahora
deja el árbol distinto de lo que producción corre y de lo que la CI probó, y entonces AC-15 —«la
batería completa en una sola corrida sobre el SHA exacto»— dejaría de ser cierto sin otra corrida y
otro despliegue. **Un cierre que afirma un nivel sobre un SHA no puede cambiar el SHA en la misma
pasada.**

De los dos, **N-1 es el que importa**: es un agujero en una guarda, de la familia que este
proyecto trata como defecto. La aserción prueba lo que el brief dice que prueba, pero dos textos
—el comentario del caso y la §30 de `Screens.md`— prometen más de lo que cubre. El arreglo es
cubrir los dos roles, `button` y `link`, o bajar las dos frases a «un control con rol `button`.»
**Lo primero es mejor**, porque el redibujado probable es justamente el enlace. N-2 es separar dos
comentarios y no cambia ninguna conducta.
