# Prompts de ImageGen — Pedidos y ventas V2-09

Fecha: 27 de octubre de 2026. Herramienta ImageGen integrada. Una llamada por pieza; datos ficticios. No se modifica código.

## Base común

```text
Use case: ui-mockup. Asset: one high fidelity Vixora CRM Spanish desktop interface, landscape1672x941, edge to edge app screenshot, no browser/device frame, no perspective. Premium calm usable SaaS for iPhone retail, no decorative marketing. Approved system: Manrope, flat #F6F5FB canvas, white panels, LIGHT #F1EEFB sidebar about245px, ink#17142E, secondary#5A5573, border#E3DFF0 1px, primary solid#6D28D9, selection#EDE7FE,12px corners, restrained shadows. No gradients, glassmorphism, darksidebar. Vixora official wordmark in violet top left; original icons remain official, no rebranding. Slim global search/topbar. Sidebar Inicio; Atención collapsed; Catálogo e inventario collapsed; Servicio técnico collapsed; Comercial EXPANDED with Pedidos and Ventas (select requestedmodule); Finanzas/Abastecimiento/Administración collapsed. Bottom Carla Méndez · Administradora. Clean readable typography, ample44px controls, labels always visible. Breadcrumb Comercial > requestedmodule. One dominant primary action, outlinedsecondaryactions, destructiveactions inoverflow andred only in concrete confirmation. Badgesincludeiconandtext: Pendienteamber/Confirmadoviolet/Entregadogreen/Canceladogray; saleVigentegreen,Anuladagray; paymentPendienteamber/Parcialamber/Cobradagreen. Physicalstock and money are DIFFERENT statuses. All data fictitious, footer Datos ficticios · Propuesta de diseño. Date27oct2026 BuenosAiresUTC−3. All names use real spaces. No multi-currency sums, editing issued lines, discounts, taxes, shipping, auto notifications or invented features. No cost/margin columns. Prices and totals exact. For unittracked products quantityderivedfromselectedIMEIs, quantitytrackedproducts acceptquantity. Pendingorders do NOTreserve; confirmingreservesexactunits; deliveryremovesstock; issuingorder'ssale doesNOTremoveagain. Counter sale removesstock whenissued; collectionseparate. 
```

## 01 — Listado de pedidos

Destino: `19-pedidos/desktop/01-listado-pedidos-v2.png`.

Prompt efectivo: base común seguida de este texto; OVERRIDE sustituye formato/composición.

```text
SelectPedidos. HeadingPedidos subtitleReservas y entregas de clientes. Primary+Nuevo pedido. Compact contextual linkVer ventas. Search'Buscar número de pedido', clientfilterTodos los clientes, clearfilters. StatechipsTodos4selected/Pendientes1/Confirmados1/Entregados1/Cancelados1. One spacious whitetable columnsPedido/Cliente/Resumen/Estado/Origen/Total/Acción:
P-000204,Nadia Castro,iPhone13 ·1equipo,Pendiente,Equipo,USD450,Ver;
P-000203,Tomás Quiroga,iPhone14 ·1equipo,Confirmado,Agente,USD560,Ver;
P-000202,Inés Vidal,iPhone15 ·1equipo,Entregado,Equipo,USD650,Ver;
P-000201,Leonel Sosa,iPhone12 ·1equipo,Cancelado,Equipo,USD320,Ver.
Eachnumberlink; date27octunder204/203;26octunder202/201. No bulkcheckboxes, no inlineconfirmdelivercancel repeatedrows. Smallreadonlylegend 'Pendiente: sin reserva · Confirmado: stock reservado · Entregado: salida registrada'. Pagination4pedidos ·Página1de1. No datefilterunsupportedorders, no charts/revenuereport, no summedtotal includingcancelled. No claimsAgentconfirmedautomatically.
```

## 02 — Alta de pedido y selección de unidades

Destino: `19-pedidos/desktop/02-nuevo-pedido-unidades-v2.png`.

Prompt efectivo: base común seguida de este texto; OVERRIDE sustituye formato/composición.

```text
SelectPedidos. TitleNuevo pedido,backVolver a pedidos. Show editable form mainwidth750px plus 430pxrightunitpicker OPEN and centeredflow. ClientpickerNadia Castro required. Productpicker'iPhone13 ·128GB ·Medianoche ·Usado' withreadonlypriceUSD450. One chosenunit chip'U-0102 ·IMEI…1422' withremoveX,derivedCantidad1equipo,subtotalUSD450. Inputlabel'Escanear o agregar IMEI' placeholder'Ingresá el IMEI completo' (empty; maskingisdisplayonly). LinkElegir unidadesopensrightpanel. OutlineAgregar producto. SummaryTotal estimadoUSD450; primaryCrear pedido (panelopen backgroundprimarymuted). Notice'El pedido se crea pendiente. Elegir un equipo no lo reserva.' No publicnumberbeforecreation/no upfrontpayment/no createandconfirmcombo.
Rightpanel'Elegir unidades' headercloseX,productiPhone13,searchIMEI. Threewhitecheckboxrowsavailable:
U-0101 ·…1421 ·GradoA ·Batería91% ·USD450 unchecked;
U-0102 ·…1422 ·GradoA ·Batería88% ·USD450 CHECKEDviolet;
U-0103 ·…1423 ·GradoA ·Batería87% ·USD450 unchecked.
'3 disponibles ·1 seleccionada' andfooterprimary'Usar selección' secondaryVolver. Allthreepricesfromproduct,noownunitoverride,no costs. No reservedU0104/reviewU0105offered. Checkboxesonlyinunitpicker, notordinarylist. SinglefictitiouspendingdraftbeforeP204creation, notsaved. Clearseparationpanelandform.
```

## 03 — Pedido pendiente y confirmación

Destino: `19-pedidos/desktop/03-pedido-pendiente-confirmar-v2.png`.

Prompt efectivo: base común seguida de este texto; OVERRIDE sustituye formato/composición.

```text
SelectPedidos. DetailheaderP-000204 ·Nadia Castro,badgePendiente,primaryConfirmar pedido,outlineRegistrar seña,overflow… forCancelar pedido. TabsResumen selected/Señas/Actividad. ThreecompactreadonlysummarycardsTotalUSD450/SeñadoUSD100/FaltaUSD350; don'tcalldebtglobal. Alert'Pendiente ·Todavía no reserva stock.' WhiteitemtableoneproductiPhone13 ·128GB ·Medianoche ·Usado;lineunitU-0102 ·IMEI…1422 ·Disponible;Cantidad1;precioUSD450;totalUSD450. RightSiguiente paso explains'Confirmar reservará este equipo. Se volverá a comprobar su disponibilidad.' ReferenceoriginEquipo ·Carla Méndez ·27oct09:40.
Below compactwhiteconfirmationOPEN'¿Confirmar el pedido P-000204?' readonly'U-0102 ·…1422 ·USD450' and'Reservará 1 equipo. El stock físico no cambia y no se registra un cobro.' footerVolveroutline/Confirmar reservaprimary. Demoteheaderprimarywhileconfirmationopen. Tiny'Precios fijados al crear el pedido'. No editinglines,no changeunitsmodalconfirm,no newprice450->460. Currentseña100fromR000180exists,no additional50registered.
```

## 04 — Señas y revisión del registro

Destino: `19-pedidos/desktop/04-pedido-sena-v2.png`.

Prompt efectivo: base común seguida de este texto; OVERRIDE sustituye formato/composición.

```text
SelectPedidos. P-000204 NadiaCastro Pendiente, tabsResumen/SeñasSELECTED/Actividad. Whitecentral summaryTotalUSD450/SeñadoUSD100/FaltaUSD350. ExistingreceipttableR-000180 ·27oct2026 10:00 ·Transferencia ·USD100 ·Vigente ·Ver. Info'La seña queda retenida para este pedido hasta emitir su venta. No reserva stock.' no stateconfirmorder.
Right430pxpanel'Registrar seña',readonlyP-000204/Nadia Castro,monedaUSD. RadioMedio de pago withTransferenciaSELECTED andEfectivo(unselected) (noPermuta). EditableImporteUSD50.00;readable'Se lee: cincuenta dólares.' ReadonlyreviewcurrentSeñado100/Falta350;estimadodespuésSeñado150/Falta300. Tiny'El registro aún no se guardó.' Info'Confirmá que el dinero se recibió. Registrar no ejecuta una transferencia.' BottomVolveroutline/Registrar señaPRIMARY. NoRnumberproposed,no cashsessionwarningsbecausebanktransferselected,no automaticinvoicing,no sum100+50incorrect. Backgroundactionsinactivewhilepanelopen.
```

## 05 — Pedido confirmado y entrega

Destino: `19-pedidos/desktop/05-pedido-confirmado-entrega-v2.png`.

Prompt efectivo: base común seguida de este texto; OVERRIDE sustituye formato/composición.

```text
SelectPedidos. DetailP-000204 NadiaCastro Confirmado,headerprimaryMarcar entregado mutedbecause430pxdrawerOPEN. MainwhitecardoneproductiPhone13 ·128GB ·Medianoche ·Usado,lineU-0102 ·IMEI…1422 badgeReservada,quantity1,USD450. summaryTotal450/Señado100/Falta350allUSD. HorizontaltimelineCreado27oct09:40,Confirmado27oct11:15,Entregadofutureempty. Context 'El equipo está reservado para este pedido.' SecondaryRegistrar seña andoverflowcancelonly.
Rightpanel'Revisar entrega',P-000204/Nadia Castro,equipmentU0102…1422,statuscurrentConfirmado→Entregadopreview. Notice'Se registrará la salida de 1 equipo y se liberará su reserva. Este paso no se puede deshacer.' Separateinfo'La venta se emite después. La entrega no registra un cobro.' ReadonlyreviewmoneyFaltaUSD350 (doNOTblockdeliveryforunpaiddebt). BottomVolveroutline/Confirmar entregaprimary. 'Cambio aún sin guardar'. Dateclocktop27oct11:20 tobeafterconfirmation. No signature/shipping/address/fiscalinvoice/notstockdoubleexit.
```

## 06 — Pedido entregado y emisión de venta

Destino: `19-pedidos/desktop/06-pedido-entregado-emitir-venta-v2.png`.

Prompt efectivo: base común seguida de este texto; OVERRIDE sustituye formato/composición.

```text
SelectPedidos. DetailP-000204 NadiaCastro Entregado,topprimaryEmitir venta mutedbehind430pxrightreviewpanel. MainitemtableU0102IMEI…1422iPhone13USD450;summaryTotalUSD450/Seña retenidaUSD100;info'Equipo entregado27oct11:25. La salida de stock ya está registrada.' TabsResumen/Señas/Actividad,summaryactive. Nocanceloreditdelivered.
Rightpanel'Emitir venta del pedido',readonlyP-000204/clientNadiaCastro,totalUSD450;existingseñaUSD100;preview'Faltará cobrar USD350'. ChecklistREADONLY 'Copia cliente, equipos y precios del pedido' / 'No vuelve a descontar stock' / 'La seña contará en la venta'. Notice'La venta emitida no se edita ni se borra.' 'El número se asigna al confirmar.' ButtonsVolveroutline/Emitir ventaprimary. Dateclock27oct11:30. No generatedVnumberuntilsuccess,no chargingbutton combined,no changingprices or selectingunitsagain. Thisislatersnapshotofsameordernotlistbaseline.
```

## 07 — Listado de ventas

Destino: `20-ventas/desktop/01-listado-ventas-v2.png`.

Prompt efectivo: base común seguida de este texto; OVERRIDE sustituye formato/composición.

```text
SelectVentas. HeadingVentas subtitleComprobantes y cobros. Primary+Nueva venta; secondarylinkVer pedidos. Filterrownumbersearch,Desde24/10/2026,Hasta27/10/2026,ClienteTodos;statuschipsTodas4/Vigentes4selected/Anuladas0. Show tablecolumnsVenta/Cliente/Origen/Total/Cobros/Acción:
V-000221,Mateo Salas,Mostrador,ARS480.000,Parcial ·ARS280.000 por cobrar,Ver;
V-000220,Consumidor final,Mostrador,ARS80.000,Cobrada,Ver;
V-000219,Inés Vidal,Pedido P-000202,USD650,Cobrada,Ver;
V-000218,Mateo Salas,Mostrador,ARS500.000,Parcial ·ARS380.000 por cobrar,Ver.
SmallVigentegreenbadgeunder eachVnumber separatefrompaymentstate. dates27octfor221/220,26oct219/218. No summedARS+USDtotal no netrevenuefigure. No bankverifiedclaim, no fiscalfactura. No bulkcancelbuttons. Footer'Importes por moneda. Emitir una venta y registrar su cobro son pasos separados.' 4ventasPágina1de1. Clearsearchfilters,pagination.
```

## 08 — Venta de mostrador

Destino: `20-ventas/desktop/02-nueva-venta-mostrador-v2.png`.

Prompt efectivo: base común seguida de este texto; OVERRIDE sustituye formato/composición.

```text
SelectVentas. FocusedformtitleNueva venta,subtitleVenta sin pedido. BackVolver a ventas. LeftclientpickerMateo Salas selected,labelCliente(opcional),helper'Sin cliente: Consumidor final'. ProductsearchlabelBuscar producto o escanear código;selectediPhone14 ·128GB ·Azul ·Usado,chosenunitU-0403 ·IMEI…2403 ·GradoA ·Batería89%,priceARS480.000,quantity1derived,subtotalARS480.000. Smallreadonlyline'Precio vigente del producto'; removeunitsecondaryicon,emptyIMEIscaninputlabelEscanear o agregar IMEI,linkElegir unidad,secondaryAgregar producto. No inventorycosts or discount/tax/salesagentfields.
Rightreviewwhitecard'Antes de emitir':MateoSalas,1equipo,totalestimadoARS480.000; 'Al emitir: el equipo pasa a vendido y sale del stock.' separate 'El cobro se registra después.' 'La venta emitida no se edita.' PrimaryEmitir venta/secondaryVolver sin guardar. No Vnumberuntilsuccess,no bankmethodfields/no Cobrar automatic/no stockreservationfirst,no actualR182yet. MainproductpriceinARSnotconvertedUSD450previousproduct. ExistingusedPU82notappliedhere. One dominantprimary.
```

## 09 — Ficha de venta y cobro con permuta

Destino: `20-ventas/desktop/03-ficha-venta-cobro-permuta-v2.png`.

Prompt efectivo: base común seguida de este texto; OVERRIDE sustituye formato/composición.

```text
SelectVentas. DetailV-000221 MateoSalas, badgeVigente (commercial) andParcial(payment). secondaryVer comprobante/overflowAnular venta, tabsResumen/CobrosSELECTED/Actividad. Centralwhite summaryTotalARS480.000/CobradoARS200.000/FaltaARS280.000. SmallunitreferenceU-0403 ·IMEI…2403 ·iPhone14 ·128GB ·Azul. ExistingonlyonepaymentR-000182,27oct2026,Transferencia,ARS200.000,Vigente,Ver. LinkVer cuenta del cliente withoutclaimingcurrentaccountbalance.
Open430pxrightpanel'Registrar cobro' readonlyV221/MateoSalas. RadiochoicesTransferencia,Efectivo,Permuta con PU-000082SELECTED. Permuta readonlycontext'Valor reconocido ARS200.000 / Ya aplicado ARS120.000 / Disponible ARS80.000'. 'Mismo cliente y moneda ·Sin movimiento de caja'. EditableImporteARS80.000. Reviewpreview'Cobrados después: ARS280.000 / Faltará: ARS200.000 / Disponible del usado después: ARS0'. Caption'Previsión. El cobro todavía no se registró.' ButtonsVolver/Registrar cobroPRIMARY. Do not sumpricevaluetocash, noFX, no automatictransfer, no permissiondivider/no futureRnumber. Makescurrent200distinctpreview280; PU82prior120belongsotherV218, notthisreceipt. Backgroundprimarydemoted.
```

## 10 — Anulación revisable de venta

Destino: `20-ventas/desktop/04-anular-venta-sin-pedido-v2.png`.

Prompt efectivo: base común seguida de este texto; OVERRIDE sustituye formato/composición.

```text
SelectVentas. V-000220 ·Consumidor final, badgesVigente/Cobrada, backVolver a ventas. WhitebackgroundsingleitemFunda protectora ·2unidadesquantitytrackingNOTIMEI ·ARS40.000each ·totalARS80.000. PaymentR-000181TransferenciaARS80.000. Open large centeredreviewcardorrightpanel'Anular venta V-000220', no actiondone. Four requiredradiosMotivo:Error de cargaSELECTED/Operación no concretada/Cliente equivocado/Otro. No unsupportedfreetextreason.
Readonlyeffectreview 'Venta de mostrador sin pedido' / 'Se reponen 2 unidades al stock' / 'Se conserva el cobro de ARS80.000' / 'Quedará ARS80.000 a devolver porque no tiene cliente'. Notice'Anular la venta no devuelve dinero ni anula el recibo. La devolución se registra aparte.' 'Se genera un comprobante de anulación. No se puede deshacer.' FooterConservar ventaoutlinefocused andAnular ventaRED. No purpledestructive,no banktransferexecuted,no alreadyvoidedbadge. Do notgeneralizeeffecttoorderorservice,specificcountergoods.
```

## 11 — Comprobante imprimible

Destino: `20-ventas/desktop/05-comprobante-venta-v2.png`.

Prompt efectivo: base común seguida de este texto; OVERRIDE sustituye formato/composición.

```text
SelectVentas. HeaderV-000221 ·Comprobante, primaryImprimir, secondaryVolver a la venta. MaincenterlargewhiteA4ishdocumentpreview within app notmultiplepages, withheader'iPhone Demo' and 'Documento no válido como factura'. RightVenta V-000221 /27octubre2026 /BuenosAiresUTC−3. ClientMateoSalas, origenVenta sin pedido. TableProducto/Cantidad/Precio/Total: iPhone14 ·128GB ·Azul ·Usado; beneathunitU-0403 ·IMEI ficticio350000000002403;quantity1;ARS480.000price;ARS480.000total. TotalARS480.000large. Documentendclear'DOCUMENTO NO VÁLIDO COMO FACTURA'. Do notshowPAIDstamp,Rreceipts/paymenttable,legalclauses,fiscalCUITorQR, madeupwarrantyperiod.
SeparateNONPRINTINGrightcontextcard 'Situación de cobro' Parcial, CobradoARS200.000/FaltaARS280.000 andVer cobros link, small'Este panel no se imprime'. Printingonlydocumentnotnavigationorcontext. Originalsaleunmodified/no proposedpermuta80yet.
```

## 12 — Ficha de pedido móvil

Destino: `19-pedidos/mobile/07-ficha-pedido-mobile-v2.png`.

Prompt efectivo: base común seguida de este texto; OVERRIDE sustituye formato/composición.

```text
OVERRIDE mobile941x1672portraitoneappscreen,no deviceframe,nosidebar. Vixora slimtop, backPedidos, titleP-000204,NadiaCastro,Pendientebadge. PrimaryConfirmar pedido large top, outlineRegistrar seña, ellipsisCancelar. TabResumenactive/Señas/Actividad. ReadonlycardsTotalUSD450/SeñadoUSD100/FaltaUSD350. Notice'Todavía no reserva stock'. WhiteequipmentcardiPhone13 ·128GB ·Medianoche ·Usado; U-0102 ·IMEI…1422,Disponiblegreen,GradoA,Batería88%,Cantidad1,PrecioUSD450. ContextOrigenEquipo ·CarlaMéndez,Creado27oct09:40; note'Precios fijados al crear.' Lower'Siguiente paso' explains'Confirmar reserva este equipo. La disponibilidad se comprueba otra vez.' ClearlinkVer cliente. BottomnavInicio/Chats/Clientes/Ventas/MásSELECTED. Safeareanotcovercontent. No two primaryCTAs, no confirmationalreadydone, no paymentautomatically. Allnamesusespaces.
```

## 13 — Alta de venta móvil

Destino: `20-ventas/mobile/06-nueva-venta-mobile-v2.png`.

Prompt efectivo: base común seguida de este texto; OVERRIDE sustituye formato/composición.

```text
OVERRIDE mobile941x1672portraitform,no sidebarnodeviceframe,no globalbottomnavduringfocusedform. TitleNueva venta backVolver. SubtitleVenta sin pedido. PersistentlabelCliente(opcional)selectedMateoSalas;helperVacío:Consumidorfinal. ProductfieldiPhone14 ·128GB ·Azul ·Usado; inputEscanear o agregar IMEI emptyplaceholderIngresá el IMEI completo; linkElegir unidad. WhitechosenunitcardU-0403 ·IMEI…2403 /GradoA /Batería89% /PrecioARS480.000 /1equipo;removeunitquieticonwithlabel. No secondunitreference/productduplication,no fakeextracolors. OutlineAgregar producto. LargewhiteAntes de emitirsummaryTotalestimadoARS480.000;notice'Al emitir sale 1 equipo del stock. El cobro se registra después.' Tiny'Se comprueban disponibilidad y precios antes de emitir.' StickybottomprimaryEmitir venta andsecondaryVolver sin guardar. No futureVnumber,no paymentmethods,nopromisedstockreservation. Keyboardandsafeareabehaviornotdepicted,fitcontentwithamplefont. SmallDatosficticios.
```

## 14 — Estados y decisiones de pedidos y ventas

Destino: `19-pedidos/estados/08-estados-pedidos-ventas-v2.png`.

Prompt efectivo: base común seguida de este texto; OVERRIDE sustituye formato/composición.

```text
OVERRIDE intentional UXstateboard1672x941, slimVixora ·Pedidos y ventas / Estados y decisiones, sixwhitecomponentcardsin2rows3columns onapprovedlavenderbackground,nofullsidebar. ReadableSpanish,not sixfullscreens.
Card1'El equipo ya no está disponible' / 'U-0102 ·IMEI…1422 ·Reservada en otro pedido' / 'P-000204 sigue pendiente. No se reservó ninguna unidad.' linkVer disponibilidad. Don'tofferreplaceunitexistingorder; note'Para cambiar equipos, cancelá y creá otro pedido.'
Card2'Cambió el precio' / 'Antes USD450 ·Ahora USD460' / 'Revisá el total antes de volver a crear el pedido.' actionRevisar precios. Thisisnewunsaveddraft,notrepriceexistingissuedorder.
Card3'¿Cancelar P-000203?' /'Pedido confirmado ·Se liberará 1 equipo reservado.' /'La seña pasa a la cuenta del cliente. No se devuelve dinero automáticamente.' safeConservarpedidooutlinefocused/Cancelarpedidored. Noguaranteedcreditbalance.
Card4'Este pedido ya tiene venta' /'P-000202 →V-000219' /'No se emite una segunda venta vigente.' actionVer venta existing.
Card5'Cobro rechazado' /'El importe supera lo que falta o cambió el disponible de la permuta.' /'Conservamos los datos. Revisá los importes actualizados antes de reintentar.' actionRevisar cobro. Nofakemoneyregistered.
Card6'Anulación según el origen' threecompactREADONLYrows'Mostrador: repone stock' /'Pedido: no cambia stock; sigue entregado' /'Servicio: no tiene stock'. Separate'Los cobros conservan su registro. Con cliente pasan a su cuenta; sin cliente queda a devolver.' Tinymuted'Vista de consulta: sin botones de gestión.' No fiscalcreditnotes,no inventoryphysicalreturnworkflows. Allcomponentstatesalternativeexamplesnotcurrentmainrecords.
```

## Precisiones añadidas a la base durante la producción

Las piezas 02 y 03 usaron la base común más este texto (después de producir la primera imagen):

```text
Calendar accuracy: 27 October 2026 is TUESDAY, render 'Mar 27 oct2026' or omit weekday. Never label this date Monday/Lunes.
```

Desde la pieza 04 hasta la 14 se usaron ambas precisiones, incluida la siguiente:

```text
For every masked IMEI in this brief render ONLY 'IMEI …1422', 'IMEI …1421', 'IMEI …1423', or 'IMEI …2403' as specified. Never invent or expand a masked suffix into a full IMEI. Only the print document explicitly requesting a full fictional IMEI may show full digits. When a review/picker panel is open, all background primary buttons must be pale muted lavender, not saturated purple.
```

## Correcciones dirigidas

Cada entrada es una llamada independiente de edición con referenced_image_paths y transparent_background false. Se ordenan por pieza; algunas llamadas independientes se ejecutaron en paralelo. Raíz común de originales y variantes: `C:/Users/benja/.codex/generated_images/01a1412b-553e-7060-8d8b-7317f5b80bdf/`.

### Fecha del listado

Objetivo: `exec-338fcddc-f28e-4f91-a753-3af658ffd98b.png`. Resultado: `exec-98322c4c-3cb9-404b-aa3d-8086bf238469.png`. Seleccionado como final de su pieza.

```text
Use case: ui-mockup, precise text-only correction. Preserve this attached Vixora desktop orders list exactly, all rows, data, colors, typography and1672x941 composition. Change ONLY the top-right date weekday 'Lun 27 oct2026' to 'Mar 27 oct2026', because27October2026isTuesday. Keep timezoneunchanged. Do not change anything else.
```

### Selección e IMEI

Objetivo: `exec-a3fd1c96-d491-4522-9bef-a5e78f9691f6.png`. Resultado: `exec-cb1741d1-39a2-4c67-ae4b-f435e755ca78.png`. Seleccionado como final de su pieza.

```text
Use case: ui-mockup, targeted functional correction. Preserve this attached Vixora neworder with unitpicker1672x941. Replace the full fictitious IMEI values in ALL displaypositions with masked suffixes: U-0101 'IMEI …1421', U-0102 'IMEI …1422', U-0103 'IMEI …1423'; the selectedchipU-0102alsojust'IMEI …1422'. Keep unitIDs,grade,battery,USD450each unchanged. Empty scaninputstillrequestsfullIMEI. Also make the BACKGROUND 'Crear pedido' button pale mutedlavender with lowemphasis, as formbackgroundinertbehindopenpicker. Keep 'Usar selección' as the ONLY saturatedvioletprimary. No other layout/datachanges,no new fields,no duplicatedunits. This removescompetitionbetweenpickerandform,keepallcontent.
```

### Confirmación e IMEI

Objetivo: `exec-f0c0147b-d85f-4b3c-8b67-cf0d67477811.png`. Resultado: `exec-b759c081-176f-4bca-88ab-86f4b40e0fad.png`. Seleccionado como final de su pieza.

```text
Use case: ui-mockup, targeted functional correction. Preserve this attached Vixora P-000204 pendingorder screenshot, its exactcurrentlandscapeframingand allmoneyfigures. Replace BOTH displayedfullIMEIvalues forU-0102with EXACT 'IMEI …1422', keepingU-0102unchanged. Make the header 'Confirmar pedido' button PALE mutedlavender andinactive-looking while the inlineconfirmationisopen; keep ONLY the bottom 'Confirmar reserva' button solidvioletprimary. No other changes. Don'tinventnewIMEIs,don't changeUSD450total100deposit350remaining.
```

### Saldo pendiente sin obligación de seña total

Objetivo: `exec-3ee7fe11-0cd6-4e4e-aaad-9ff968d5dabf.png`. Resultado: `exec-6643d1dc-43c2-4b75-9b56-ac594efe6a32.png`. Seleccionado como final de su pieza.

```text
Use case: ui-mockup, precise textcorrection. Preserve attached Vixora deposit screenexactly1672x941 includingallamountsandlayout. In ALL THREE places replace label 'Falta por señar' with 'Falta del total'. This is unpaidpartofordertotal, NOT a requirement todeposit100percent. Keep valuesUSD350current,USD300preview andeveryothertextfieldunchanged. No changes toamount50orUSD100existingdeposit.
```

### Fecha y origen del pedido

Objetivo: `exec-b41eb5cd-e210-4ee8-9373-3b1d32d57086.png`. Resultado: `exec-5f1430b4-4f9b-48b8-a445-bcb85b66a452.png`. Seleccionado como final de su pieza.

```text
Use case: ui-mockup, precise headercorrection. Preserve attached Vixora delivered P-000204 review screen1672x941 and ALL product, money,delivery27oct11:25,paneldataexactly. Correct ONLY the smallleftheadercontext row belowtitle: keep Nadia Castro; change '15 oct2026' to '27 oct2026'; replace inventedbranch 'Tienda Centro' anditsstoreiconwith 'Origen: Equipo' andsimplepersonicon. ThisCRMdoesnothavethebranchshown. All othercompositionanddataunchanged. Do not change timezone,prices,unit or deliverytime.
```

### Saldo actual de la venta

Objetivo: `exec-05bf2697-23af-42ae-8836-0d1b0ef1f77e.png`. Resultado: `exec-54ebdabe-0732-4151-a95d-ce6961f374ff.png`. Intento no seleccionado: el importe no se corrigió.

```text
Use case: ui-mockup, precise numericalcorrection. Preserve the attached Vixora sale V-000221 collectionwithpermuta1672x941screen. Change ONLY the MAIN BACKGROUND SUMMARY card labeled 'Falta' from 'ARS80.000' to EXACT 'ARS280.000'. Currenttotal480000 minuscollected200000 equals280000. Keep the RIGHTPANEL availableusedARS80.000andinputARS80.000 unchanged. Keep previewcollectedafter280000,faltará200000,usedavailableafter0unchanged. No otherchanges, nopaymentregistered.
```

### Jerarquía y contexto móvil

Objetivo: `exec-cd33b3e2-8f44-4f8a-9a99-ef83d3a882ee.png`. Resultado: `exec-446ddc42-ee01-42f2-97cd-d746e38066a8.png`. Seleccionado como final de su pieza.

```text
Use case: ui-mockup, targeted mobile clarity correction. Preserve attached Vixora P-000204 mobile941x1672 allamounts,client,IMEIsuffix1422,gradeA,battery88,layoutandnavigation. Change the small label 'Origen del equipo' aboveCarlaMéndez to 'Pedido creado por', as shecreatedtheorder,nottheequipment. REMOVE the entire repeated bottom lavender 'Siguiente paso' block currentlyclippedbybottomnavigation; its reserveexplanationisalreadygivenintheprominentambernoticeabove. Keep 'Ver cliente' as lastcontentcard withampleclearspaceabovestickybottomnav,navstillInicioChatsClientesVentasMásselected. Replace the secondarytopbutton '… Cancelar' with '… Más' so cancellationremainsincontextualmenu. Nootherdataoractionsadded. Keep primaryConfirmarpedido andoutlinedRegistrarseña,don'tshowalreadyconfirmed.
```

### Modelo coherente en los estados

Objetivo: `exec-3ed504d3-d7bc-4ad3-8ade-d022f49dc598.png`. Resultado: `exec-ee0368f4-9dab-40ed-8ad7-ae1369de928f.png`. Seleccionado como final de su pieza.

```text
Use case: ui-mockup. Targeted productidentity correction to attached Vixora stateboard1672x941. The topLEFT card contains U-0102 IMEI…1422, which is iPhone13 128GB Medianoche Usado, NOTiPhone15. Change its productcaption to exactly 'iPhone 13 ·128GB ·Medianoche ·Usado'. The topMIDDLE pricechange card should use the same caption 'iPhone 13 ·128GB ·Medianoche ·Usado' instead ofiPhone15Rosa. Replace just the two phone thumbnails with small neutralphoneoutlineicons ifneeded toavoidshowingincorrecthardware. Keep allunitIDs,suffix1422,all money450→460,all othercards,states,text, layoutandcolors exactlyunchanged. No new records, no alteredfinancialmath.
```

### Saldo actual, segunda corrección

Objetivo: `exec-54ebdabe-0732-4151-a95d-ce6961f374ff.png`. Resultado: `exec-de9a1c74-bb8e-4c27-b348-f3178be54b21.png`. No seleccionado: el importe permaneció incorrecto.

```text
Use case: ui-mockup. Edit a single text region in this exact1672x941 screenshot. The third card of the CURRENT MAIN SUMMARY on LEFT, directly below label 'Falta', at approximately rectangle x980–1140,y390–425, currently reads 'ARS 80.000'. ERASE that numerictext and replace it with EXACT 'ARS 280.000' (TWO HUNDRED EIGHTY THOUSAND PESOS). The full three current summary values must become TotalARS480.000 / CobradoARS200.000 / FaltaARS280.000. Redraw this number at a slightlysmallerfont ifneeded tofit. This missingleading2is the ONLYrequestedchange. Do NOT change any 'ARS80.000' in the RIGHT sidebar: thosearevalidusedcreditandpaymentamounts. DoNOTchange previewnumbers280.000and200.000 inrightpanel. No otherchanges. Keep allscreencontentandgeometryunchanged.
```

### Rediseño del resumen para separar el saldo actual

Objetivo: `exec-de9a1c74-bb8e-4c27-b348-f3178be54b21.png`. Resultado: `exec-50a3ae37-91fb-4c3a-90a5-798e0b16a5c0.png`. Versión final de la ficha de cobro.

```text
Use case: ui-mockup. Redesign ONE COMPONENT in this Vixora1672x941 screen: REMOVE the entire horizontal 3-column MAIN SUMMARY STRIP at left under thetabs, including the incorrect third Falta80.000. Replace that component with a clean white panel titled 'Resumen actual' containing a vertical definitionlist of THREE rows, withlabelsleftandboldvaluesright: row1 'Total de la venta' = 'ARS 480.000'; row2 'Cobros registrados' = 'ARS 200.000'; row3 'Saldo pendiente actual' = 'ARS 280.000'. Thirdrowamberbackgroundforclarity. Use exact280.000 in the thirdrow (twohundredeightythousand), NOT80.000. Newcomponentabout150pxtall, allthreeamountsclearlylegible. Shift the existing Pagos registrados andReferencia de la venta panels DOWN ifnecessary withreducedverticalgapstofit. Keep RIGHT REGISTERCOBRO PANEL EXACTLY unchanged because its80.000usablecreditandallpreviewvaluesarecorrect. Keep customerMateoSalas,V221,R182,unitU0403,andallotherdataunchanged. This is a structural replacement of the LEFT current-summary component, NOT a request tochange the rightpermutacredit. No extra cards or numbers, nopaidsuccess,nocobroregistered. Maintain overallapprovedpaletteandlayout.
```

## Trazabilidad de las catorce piezas

| Destino | Generación inicial | Archivo final copiado |
|---|---|---|
| 19-pedidos/desktop/01-listado-pedidos-v2.png | exec-338fcddc-f28e-4f91-a753-3af658ffd98b.png | exec-98322c4c-3cb9-404b-aa3d-8086bf238469.png |
| 19-pedidos/desktop/02-nuevo-pedido-unidades-v2.png | exec-a3fd1c96-d491-4522-9bef-a5e78f9691f6.png | exec-cb1741d1-39a2-4c67-ae4b-f435e755ca78.png |
| 19-pedidos/desktop/03-pedido-pendiente-confirmar-v2.png | exec-f0c0147b-d85f-4b3c-8b67-cf0d67477811.png | exec-b759c081-176f-4bca-88ab-86f4b40e0fad.png |
| 19-pedidos/desktop/04-pedido-sena-v2.png | exec-3ee7fe11-0cd6-4e4e-aaad-9ff968d5dabf.png | exec-6643d1dc-43c2-4b75-9b56-ac594efe6a32.png |
| 19-pedidos/desktop/05-pedido-confirmado-entrega-v2.png | exec-1e2a5178-a714-4ddc-922b-cb5aaa5c130c.png | exec-1e2a5178-a714-4ddc-922b-cb5aaa5c130c.png |
| 19-pedidos/desktop/06-pedido-entregado-emitir-venta-v2.png | exec-b41eb5cd-e210-4ee8-9373-3b1d32d57086.png | exec-5f1430b4-4f9b-48b8-a445-bcb85b66a452.png |
| 20-ventas/desktop/01-listado-ventas-v2.png | exec-80bf6790-b914-47b4-82fb-d4384f05ed49.png | exec-80bf6790-b914-47b4-82fb-d4384f05ed49.png |
| 20-ventas/desktop/02-nueva-venta-mostrador-v2.png | exec-58974d10-2984-430c-a72a-02740e804ca3.png | exec-58974d10-2984-430c-a72a-02740e804ca3.png |
| 20-ventas/desktop/03-ficha-venta-cobro-permuta-v2.png | exec-05bf2697-23af-42ae-8836-0d1b0ef1f77e.png | exec-50a3ae37-91fb-4c3a-90a5-798e0b16a5c0.png |
| 20-ventas/desktop/04-anular-venta-sin-pedido-v2.png | exec-49033de1-7613-4fbc-95f3-7bc40ea18500.png | exec-49033de1-7613-4fbc-95f3-7bc40ea18500.png |
| 20-ventas/desktop/05-comprobante-venta-v2.png | exec-5a0dae27-d6fe-4174-b739-dcaf496bb817.png | exec-5a0dae27-d6fe-4174-b739-dcaf496bb817.png |
| 19-pedidos/mobile/07-ficha-pedido-mobile-v2.png | exec-cd33b3e2-8f44-4f8a-9a99-ef83d3a882ee.png | exec-446ddc42-ee01-42f2-97cd-d746e38066a8.png |
| 20-ventas/mobile/06-nueva-venta-mobile-v2.png | exec-eb80fd7b-7f38-4bc8-80a0-72fa57ecbd18.png | exec-eb80fd7b-7f38-4bc8-80a0-72fa57ecbd18.png |
| 19-pedidos/estados/08-estados-pedidos-ventas-v2.png | exec-3ed504d3-d7bc-4ad3-8ade-d022f49dc598.png | exec-ee0368f4-9dab-40ed-8ad7-ae1369de928f.png |


