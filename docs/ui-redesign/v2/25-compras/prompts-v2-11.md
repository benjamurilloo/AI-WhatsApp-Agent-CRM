# Prompts V2-11 — Compras y proveedores

28 de octubre de 2026. ImageGen integrada. Una llamada por pieza; datos ficticios. La instrucción enviada es la base concatenada con cada especificación. La pieza móvil sustituye el lienzo y la navegación de escritorio; el tablero de estados los omite.

## Base literal

```text
Use case: ui-mockup. Produce one polished, legible Spanish Vixora CRM desktop screenshot, landscape 1672×941, no device frame, no collage, no watermark. Professional iPhone retail ERP, consistent with approved V2. Manrope typography, flat #F6F5FB background, white surfaces, pale #F1EEFB 240px sidebar, #17142E main text, #5A5573 secondary, #E3DFF0 thin borders, #6D28D9 solid primary, #EDE7FE selection, 12px radius, subtle shadow. Never dark sidebar, gradients or glass. Clear dense but spacious hierarchy, large readable type, realistic outline icons, status labels plus icons, focus outline if relevant. Header global search, date 28 oct 2026 12:30 Buenos Aires, avatar CM. Sidebar Vixora wordmark, Inicio, Atención, Catálogo e inventario, Servicio técnico, Comercial, Finanzas, Abastecimiento EXPANDED with Compras, Recepciones, Pagos, Proveedores, then Administración. User Carla Méndez / Administradora below. Context header and internal navigation Órdenes de compra / Recepciones / Pagos / A pagar / Proveedores. Select relevant item only. One dominant violet primary action; secondary actions outlined or text, destructive under overflow. If overlay open, background inert and muted with no competing primary. Clear monetary currency code on every group, no sum across currencies. Footer Datos ficticios · Propuesta de diseño. No invented communications, integrations, due dates, IVA breakdown, source code or developer annotations. Render only specified screen, fit layout cleanly. 
```

## 01 — Órdenes de compra

Destino: `25-compras/desktop/01-ordenes-compra-v2.png`.

```text
List page title Órdenes de compra, subtitle Planificá las compras. El stock ingresa al recibir. Primary Nueva orden. Filters Buscar número OC, Proveedor Todos, Estado Todas. Compact explanatory strip Orden → Recepción → Pago, each with labels Compromiso / Stock y costo / Cuenta. Table four rows: OC-000057 | Nexo Mobile | 28/10/2026 | USD 1.500,00 | Abierta | Ver; OC-000056 | Accesorios Delta | 27/10/2026 | ARS 120.000,00 | Cerrada · Completa | Ver; OC-000055 | Nexo Mobile | 26/10/2026 | USD 500,00 | Cancelada | Ver; OC-000054 | Accesorios Delta | 25/10/2026 | ARS 80.000,00 | Cerrada · Con faltante | Ver. No payment or stock button in rows. Four results, clean table navigation. No counts that imply unavailable list data.
```

## 02 — Nueva orden

Destino: `25-compras/desktop/02-nueva-orden-compra-v2.png`.

```text
Full page form Nueva orden de compra. Back Órdenes de compra. Two-part spacious layout, main editable card and right review summary. Supplier Nexo Mobile chosen, currency USD — dólar estadounidense. Product iPhone 14 · 128 GB · Azul · Nuevo, SKU IP14-128-AZ-N, tracking Por unidad. One table line quantity 3, Costo unitario esperado USD 500,00, Total USD 1.500,00, remove icon with label. Secondary Agregar producto. Helpers Costo con IVA incluido and Los IMEI se cargan al recibir los equipos. Summary supplier Nexo Mobile, 1 producto, 3 unidades, total USD 1.500,00. Clear note Crear la orden no incorpora stock ni registra un pago. Bottom Cancelar and primary Crear orden. No OC number assigned yet, no editable notes, no purchase due date, no IMEI entry.
```

## 03 — Orden parcial

Destino: `25-compras/desktop/03-orden-parcial-v2.png`.

```text
Detail OC-000057 with badge Abierta, Nexo Mobile, created 28/10/2026 09:00 Carla Méndez. Primary Recibir mercadería, secondary Imprimir and overflow Más. No edit or pay order button. Progress 2 de 3 unidades recibidas, Falta recibir 1. Table product iPhone 14 · 128 GB · Azul · Nuevo; Pedidas 3, Recibidas 2, Pendientes 1, Costo esperado USD 500,00, Total esperado USD 1.500,00. Receipt section RC-000091 dated28/10 09:30 Vigente, 2 unidades, USD 1.020,00, Ver recepción. Quiet explanatory note El costo recibido puede diferir del esperado. El pago se registra desde la recepción o la cuenta del proveedor. Side summary ordered USD1.500, received USD1.020, pending1 unit NOT subtraction of money. Bottom activity Creada09:00/Recepción parcial09:30. Overflow OPEN anchored with Imprimir and Cerrar con faltante; no Cancelar because receipt exists. Closing not yet performed.
```

## 04 — Recepciones

Destino: `26-recepciones/desktop/01-recepciones-compra-v2.png`.

```text
List title Recepciones de compra, subtitle Entradas de mercadería y su costo. Primary Nueva recepción. Secondary flow label Con orden o sin orden, same entry chooser. Filters Número RC, Proveedor Todos, Estado Todas. Table RC-000091 Nexo Mobile OC-000057 28/10/2026 USD1.020,00 Vigente Ver; RC-000090 Accesorios Delta Sin orden 27/10 ARS40.000,00 Anulada Ver; RC-000088 Nexo Mobile OC-000052 27/10 ARS120.000,00 Vigente Ver. Note Vigencia del documento y pago se consultan por separado. Do NOT falsely label a receipt pending or completed based on stock/payment. No summing different currencies. Lower small contextual help La orden es opcional. Registrar una recepción incorpora stock; el pago se registra aparte.
```

## 05 — Recibir IMEI

Destino: `26-recepciones/desktop/02-recibir-imei-con-orden-v2.png`.

```text
Full form Recibir mercadería, against OC-000057, Nexo Mobile and USD read-only. This is prepared not saved, no assigned RC number. Step indicator 1 Mercadería / 2 Revisión with step1 active. Optional Remito o factura del proveedor input NX-00284. Product iPhone14 128GB Azul Nuevo. Falta recibir1, cantidad editable1, costo esperadoUSD500 shown read-only reference, Costo unitario recibido input505,00 USD. Open serial card label IMEI o número de serie, one input350000000005103, counter1 de1 cargado, validated check. No battery/grade fields here. Side summary Una unidad nueva, Costo de la unidad USD505,00, Total USD505,00. Warning Esta recepción completaría la orden y la cerraría. No registra un pago. Footer Volver and primary Revisar recepción. No scanner/camera integration implied. Do not invent saved unit number.
```

## 06 — Sin orden

Destino: `26-recepciones/desktop/03-recepcion-sin-orden-v2.png`.

```text
Form Nueva recepción · Sin orden. Supplier Accesorios Delta, currency ARS — peso argentino, optional remito AD-0087. Product Funda de silicona iPhone14, SKU FUN-IP14-SIL, tracking Por cantidad. Quantity20, costo unitario ARS4.000,00 with IVA incluido. TotalARS80.000,00. No IMEI field. Summary card 1 producto,20 unidades, costo recibidoARS4.000,00, totalARS80.000,00. Clear notice Al registrar, se incorporan20 unidades y el costo vigente del producto pasa a ARS4.000,00. El precio de venta no cambia. Secondary Agregar producto; footer Cancelar / Revisar recepción primary. Compact alert if sales currency USD: El precio de venta está en USD. Con un costo en ARS no se calcula el margen entre monedas. Do not auto-convert cost or assign a number yet.
```

## 07 — Anular recepción

Destino: `26-recepciones/desktop/04-detalle-anulacion-recepcion-v2.png`.

```text
Receipt detail RC-000091 behind a focused review dialog, background pale inert. Visible base Nexo Mobile, OC-000057, USD1.020,00, received2 units, paidUSD300, remainingUSD720. Foreground large modal Anular recepción RC-000091. Select closed reason Error de carga. Two unit rows U-000501 IMEI …5101 Disponible and U-000502 IMEI …5102 Disponible, each costUSD510. Summary Al confirmar: se dan de baja las2 unidades; se retira USD1.020 de la deuda; el pago vigente USD300 pasa a la cuenta del proveedor. Note El costo no se restaura. La orden permanece abierta y vuelve a tener3 unidades pendientes. No se devuelve dinero ni se anula el pago. Safe secondary Volver with visible keyboard focus, red Anular recepción. No success state yet. All effects conditional, no partial annul, no unsupported refund shortcut.
```

## 08 — Pagos

Destino: `27-pagos-proveedores/desktop/01-pagos-detalle-v2.png`.

```text
List Pagos a proveedores and right drawer open PP-000073; background dimmed and primary muted. Filters supplier/currency/vigencia. Drawer full-height wide 560px with close, badge Vigente; Nexo Mobile, Recepción RC-000091, 28/10/2026 10:00 Carla Méndez, medio Transferencia. Three visually separate rows Aplicado a la recepción USD300,00; Salida registrada ARS450.000,00; Cotización guardada 1 USD = ARS1.500. Note No afecta el efectivo de caja. Print outline and Más overflow closed containing annul entry only on demand. Receipt remainsUSD720. Background another row PP-000072 Nexo Mobile RC-000088 Efectivo ARS30.000 27oct. Drawer footer Este comprobante registra el pago; no ejecuta una transferencia bancaria. No current FX substituted for stored rate. No void yet.
```

## 09 — Pago convertido

Destino: `27-pagos-proveedores/desktop/02-pago-recepcion-conversion-v2.png`.

```text
Full review form Pagar recepción RC-000091 · Nexo Mobile. Alternative PREPARED payment, not an additional stored payment: receipt totalUSD1.020, pendingBEFORE USD1.020, appliedinputUSD300, selectedTransferencia, currency of payout ARS and rate1.500 illustrative. Summary EXACT three bold rows: Aplicar a la recepción USD300,00 / Registrar salida ARS450.000,00 / Pendiente después USD720,00. Show rate 1USD = ARS1.500 and toggle Cotización actual / Acordada, actual selected; stale warnings absent because fresh. Clear guidance El límite se valida contra el saldo pendiente al confirmar. Esto registra un pago; no ordena una transferencia. Bottom secondary Volver, primary Registrar pago. No PPnumber yet. No cashsession shown as required for transfer. No Permuta option.
```

## 10 — A pagar

Destino: `27-pagos-proveedores/desktop/03-cuentas-a-pagar-v2.png`.

```text
List A pagar, subtitle Deuda actual por proveedor y moneda. Currency filter Todas, contextual link Ver cuentas con saldo a favor rather than include them as debt. Two currency summary tiles USD720,00 and ARS150.000,00. Main table Nexo Mobile USD720,00 oldest28/10/2026 1 comprobante Ver cuenta; Nexo Mobile ARS90.000,00 oldest27/10/2026 1 comprobante Ver cuenta; Laboratorio Prisma ARS60.000,00 oldest28/10/2026 1 trabajo Ver cuenta. Total reference USD820,00 at illustrative1USD=ARS1.500. No crosscurrency numerical totalwithoutconversion. No due dates/overdue badges; label Antigüedad del comprobante rather than Vencimiento. Note Incluye recepciones vigentes y trabajos reparados de técnicos. El saldo a favor del negocio se consulta en cada cuenta. No per-row supplierinactive flag guaranteed.
```

## 11 — Cuenta proveedor

Destino: `28-proveedores/desktop/02-estado-cuenta-v2.png`.

```text
Nexo Mobile · Estado de cuenta, generated28oct12:30. Back proveedor, primary Registrar pago a cuenta and secondary Imprimir. Currency selector Todas. Two cards Se le debe USD720,00 and Se le debe ARS90.000,00; referenceUSD780,00 at1500. Tab/table Imputación actual: RC-000091 USD total1.020, pago directo300, desde cuenta0, pendiente720; RC-000088 ARS total120.000, directo30.000, desde cuenta0, pendiente90.000. Separate lower table Comprobantes newest first PP-000073 appliedUSD300 / salidaARS450.000, RC-000091 USD1.020, PP-000072 ARS30.000, RC-000088 ARS120.000. No runningbalancecolumn. Note Las aplicaciones se calculan por moneda con la cuenta actual; no representan un saldo histórico después de cada fila. No tax/timeline charts. Rows link their own detail.
```

## 12 — Pago a cuenta

Destino: `27-pagos-proveedores/desktop/04-pago-a-cuenta-v2.png`.

```text
Review form Pago a cuenta · Nexo Mobile. Currency appliedUSD selected, methodTransferencia, payoutcurrencyUSD, amountinput800,00, prepared not saved. CurrentUSDowed720 andARSowed90.000 in subdued distinct cards. Preview USD800 payment automatically appliesUSD720 to RC-000091 and leavesUSD80 A favor del negocio. ARS90.000 Sigue pendiente, no FX offset. Main review total Registrar salida USD800,00. Callout Lo que exceda queda a favor del negocio y se aplica a futuros comprobantes en USD. No devolución del proveedor ni pago contra OC. Table one automaticallocationrow and separate leftover. Footer Volver and violet Registrar pago a cuenta. No manual checkboxes selecting debts, no ceiling at720, no PPnumber yet. Preview may change beforeconfirm.
```

## 13 — Proveedores

Destino: `28-proveedores/desktop/01-proveedores-v2.png`.

```text
List Proveedores with primary Nuevo proveedor. Search Nombre, filterEstado Activos and Tipo Todos/Proveedores/Técnicos. Table Nexo Mobile Activo Proveedor Sin teléfono Sin email Ver; Accesorios Delta Activo Proveedor Sin teléfono Sin email Ver; Laboratorio Prisma Activo Técnico Sin teléfono Sin email Ver. No fake real contact addresses or CUIT needed. State label Sin datos instead of arbitrary hyphens. Clear type badge and optional technician filter, no copied technicianentity. Contextual link Ver cuentas a pagar and note Los proveedores inactivos conservan su historial y pueden recibir pagos. Filters/order alphabetic, no stock aggregate or hidden debt totals generated without reading account. Expandedsidebar Proveedores selected. Footer3 proveedores.
```

## 14 — Técnico proveedor

Destino: `28-proveedores/desktop/03-ficha-tecnico-v2.png`.

```text
Provider detail Laboratorio Prisma, badges Activo and Técnico. Header primary Registrar pago a cuenta, outlineEditar and Más. No Nueva reparación here as primary; contextual Ver reparaciones. Contact card phone/email/CUIT Sin cargar. Tabs Resumen / Cuenta / Compras / Actividad. Summary Cuenta ARS60.000,00 Se le debe, linkVer estado de cuenta. Trabajo reparado OS-000315, 28oct10:30, iPhone12 · Cambio de batería, Costo técnico ARS60.000, pendienteARS60.000. Card links to serviceorder, no directpayagainstOSbutton (payaccountonly). Callout Los trabajos reparados generan deuda en la cuenta del técnico. El pago a cuenta se aplica con la misma regla que a las recepciones. Activity Alta de proveedor, Marcado como técnico, Trabajo reparado. No client personaldataor phone. No new duplicate technicalstaffprofile. Roleadministrator clear.
```

## 15 — Alta proveedor

Destino: `28-proveedores/desktop/04-alta-edicion-proveedor-v2.png`.

```text
Focused full page form Nuevo proveedor, breadcrumb Proveedores. Three sections: Datos del proveedor with Nombre obligatorio input Taller Aurora, Teléfono optional blank with placeholder +54..., Email optional blank; Identificación with CUIT optional blank hint11 dígitos con verificador; Servicio técnico with checkbox Es técnico checked and helper Habilita su selección en órdenes de reparación. All fields persistentlabels, fieldtarget44px. Quiet note El nombre y el CUIT no pueden repetirse, incluso con proveedores inactivos. No notes/address/taxcondition fields. Side short summary Alta como proveedor activo · También disponible como técnico. Footer Cancelar safeoutline and primary Crear proveedor. Editing shares this layout, do not include two screens or labelleddeveloperinstructions. No forced contact/ID, no importingCSV. Manrope spacious elegantform.
```

## 16 — Recepción móvil

Destino: `26-recepciones/mobile/05-recibir-imei-mobile-v2.png`.

```text
OVERRIDE canvas: ONE PORTRAIT mobile screenshot 941×1672, not landscape. No desktop sidebar or desktop header. Full-screen mobile form Recibir mercadería with back arrow and step1de2, OC-000057 Nexo Mobile USD read-only card. Product iPhone14 128GB Azul Nuevo, Falta1. Quantity input1 and costunitreceivedUSD505,00, expectedUSD500 note. Label IMEI o número de serie, singlefield350000000005103 with1de1, optional remito NX-00284. Warning Completará y cerrará la orden. No registra un pago. Bottom sticky white safearea bar totalUSD505,00, primary Revisar recepción, secondary Guardar absent because no draftfeature. No global bottomnav whileformactive, enoughbottompadding, labelsreadable and touch44px. Datafictitious footer abovebar. No cameraiconor scanner claim. Violetflatpalette, Manrope, twelvepxcorners.
```

## 17 — Estados

Destino: `25-compras/estados/04-estados-compras-proveedores-v2.png`.

```text
ONE landscape design reference board, 6 neatly separated functional panels, title Compras y proveedores · Estados y decisiones. Not a full app screenshot; omit desktop sidebar to grant panels room, same approvedwhite/lilacdesign. Panel1 focusmodal Cerrar OC-000057 con faltante, 2 recibidas/1 pendiente, No modifica las recepciones ni los pagos. No admite nuevas recepciones, safeVolver and redCerrar con faltante. Panel2 IMEI duplicado inline error350000000005103 Ya está activo en otra unidad, Revisar IMEI. Panel3 No se puede anular RC-000091 · U-000502 Reservada, No se guardó ningún cambio, Ver unidad. Panel4 Anular PP-000072 · motivo El pago no se hizo, restoresARS30.000 to originalsessionC-000046 if stillopen; closedoriginal doesn't changeanothercashsession, shortexacttext La sesión original está cerrada. Esta anulación no modifica el cierre ni la caja actual. SafeVolver redAnular pago. Panel5 Proveedor inactivo blocksneworder andreceive but Puede recibir pagos; outlineReactivar. Panel6 No pudimos leer la cuenta, preservevaliddata, Reintentar; notzeroamount. Small footer also note La revisión no ejecuta las operaciones. Clear concise text no overcrowding, no successfulannulstatesimultaneously.
```

## Ajustes y bases especiales

Las piezas 16 (móvil) y 17 (estados) se generaron con esta base breve en lugar de la base de escritorio, seguida de su especificación:

```text
Use case: ui-mockup. High-fidelity Spanish Vixora CRM. Manrope, white surfaces, #F6F5FB background, #F1EEFB secondary panels, #17142E ink, #5A5573 secondary, #E3DFF0 borders, solid #6D28D9 primary, #EDE7FE selection. 12px corners, minimal shadows, no gradients, dark sidebar or watermark. Readable text and outline icons. 
```

### Corrección de pieza 6

```text
Edit this Vixora reception form only. Preserve layout, palette, amounts, quantities, supplier, product, warning, actions. Add the missing required labeled currency selector Moneda de la recepción with selected ARS — peso argentino, next to Proveedor and Remito. The receipt without order must explicitly let user choose currency. Replace Seguimiento dropdown with plain noninteractive badge Por cantidad; this is the existing product's tracking and cannot be changed here. Keep all other Spanish text, crisp typography and canvas dimensions.
```

### Corrección de pieza 7

```text
Edit this Vixora annulment review only. Preserve modal, amounts, costs, conditions, unit IDs, buttons and every effect. In BOTH visible foreground and background tables replace first IMEI with exactly 350000000005101 and second with exactly 350000000005102. Replace background receipt status Recibida with Vigente. Change sidebar active item from Compras to Recepciones. In background header remove direct Anular recepción button, retain Imprimir and overflow ellipsis (annul is accessed through overflow); foreground redconfirm remains. Preserve dimmed inert backdrop and focused safeVolver, no other changes.
```

### Corrección de pieza 8

```text
Edit only the date/time of PP-000072 in the background table, from 27/10/2026 16:20 to 27/10/2026 11:00. This cash payment already belongs to the previous day's 12:30 scenario. Preserve PP-000073, drawer, amounts, method, saved rate, all other text, proportions, colors and layout exactly.
```

### Corrección de pieza 7

```text
Make a single precise text edit to this existing image. In ALL foreground and background IMEI cells for U-000501, show the MASKED value «…5101»; for U-000502 show «…5102». Do not display any long IMEI numbers anywhere in the image. These are abbreviated identifiers, so ellipsis plus last four digits only. Preserve unit IDs, all other wording, monetary amounts, colors, layout and modal exactly.
```

### Corrección de pieza 11

```text
Edit this Vixora statement only; preserve top balances, imputation table and actions. Replace the LOWER Comprobantes table with a simpler clean five-column table: Comprobante | Fecha y hora | Moneda aplicada | Importe aplicado o del documento | Salida registrada. EXACT FOUR ROWS newest first: PP-000073 | 28/10/2026 10:00 | USD | 300,00 | ARS 450.000,00; RC-000091 | 28/10/2026 09:30 | USD | 1.020,00 | No aplica; PP-000072 | 27/10/2026 11:00 | ARS | 30.000,00 | ARS 30.000,00; RC-000088 | 27/10/2026 10:00 | ARS | 120.000,00 | No aplica. Keep document numbers as links. No additional Aplicado column, no runningbalance. Move reference text out of the USD-only card into a thin separate line below BOTH currency cards, exact text «Total de referencia: USD 780,00 · 1 USD = ARS 1.500 · Cotización ilustrativa». It describes the combined account, not USD720 alone. Preserve rest of screen.
```

### Corrección de pieza 17

```text
Edit this existing Vixora six-panel board, keep its panel arrangement, typography, colors and most content. Correct ONLY these domain mistakes: PANEL3 delete the suggestion to first release the reservation; replace with «Revisá el pedido vinculado. No se cambia ninguna reserva desde esta anulación.» Keep blocking and Ver unidad. PANEL4 title «4. Anular un pago de una sesión cerrada». Replace the motive textarea with a single-line SELECT control, label Motivo, chosen «El pago no se hizo», visible dropdown arrow; delete 18/200 counter. Replace BOTH conflicting cash notes with ONE note «La sesión original C-000046 está cerrada. Esta anulación no modifica el cierre ni la caja actual. La cuenta del proveedor se recalcula.» Keep PP-000072 and safeVolver/redAnular pago. PANEL5 replace provideridentity with «Proveedor de ejemplo» and remove CUIT and address, gray Inactivo badge. PANEL6 remove all advice to complete data manually and remove Seguir editando button; exact message «No pudimos leer la cuenta. Los datos anteriores se conservan. Reintentá la consulta.» Keep Reintentar as onlyaction and don't showzero. PANEL1 keep2received1pending with closingwarning; no otherchanges.
```

### Corrección de pieza 16

```text
Edit this portrait mobile Vixora form only, preserve portrait941×1672 layout, fields, supplier, order, amounts, serial, button and all spacing. Replace order badge Sin cerrar with Abierta, in amber. Remove the bottom-right invented timestamp Hoy,10abr2025 and Usuario:JuanPérez entirely. Instead put one small neutral footer above the stickybar: «Datos ficticios · Propuesta de diseño». Keep bottom-left reception context only if it fits, no new date/user. Top deviceclock may stay9:41 as device chrome. Make primary button solid #6D28D9 without gradient. No otherchanges.
```

La primera llamada de edición de la pieza 07 no produjo imagen; el mismo prompt se reintentó. Se conservan los originales y solo se selecciona el resultado revisado. Los IMEI del detalle de anulación se abreviaron finalmente para mantener identificadores legibles y coherentes.


