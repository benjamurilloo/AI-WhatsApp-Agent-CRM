# Prompts de ImageGen — Caja y cuentas V2-10

27 de octubre de 2026. Herramienta ImageGen integrada. Una llamada por pieza. Datos y cotizaciones ficticios, sin tocar código ni datos del CRM.

## Base común

```text
Use case: ui-mockup. One polished high fidelity Vixora CRM desktop screenshot1672x941landscape, Spanish, edge-to-edge app no browser/deviceframe/perspective. ApprovedlightSaaS design Manrope, background#F6F5FB, white surfaces, LIGHTlavendersidebar#F1EEFBabout245px, darkink#17142E, muted#5A5573, border#E3DFF0 1px, flatprimary#6D28D9, selection#EDE7FE,12pxcorners,littleshadow, no gradients/glass/darksidebar. OfficialVixora wordmarkviolet,norebranding;slimglobal search/topbar. SidebarInicio,Atención,Catálogoeinventario,Servicio técnico,Comercialcollapsed;FinanzasEXPANDEDwithCaja/Cuentas de clientes/Tipo de cambio;Abastecimiento/Administracióncollapsed. BottomCarla Méndez Administradora. Selectrelevantmodule. One dominantprimary, secondaryoutlined, destructiveoperationonlyredafterconcretereview. WhenpanelopenbackgroundbuttonsMUTEDandbackgroundinert. Persistentlabels,spacious44pxcontrols,readablebalancedspacing,statusiconANDtext. DateTUESDAY27oct2026BuenosAiresUTC−3, normally12:30unlessspecified. DataALLFICTIONAL,noactualmarketquotes. Smallfooter'Datos ficticios · Propuesta de diseño'. No costs,bankintegration,sendmessages,autodebits,overdraft,convertingproductprices. SeparatecurrentdataandUNSAVEDpreviews. Exactamountsandcurrencycodes,neveraggregatecurrencieswithoutexplicitreferenceconversion. AmountformatSpanishgrouping/decimalcomma. Tinygraphicsunnecessary. Do not inventextraamounts,names,locationsorrecords.
Sharedfixturewhenrelevant: opencashsessionC-00004627oct09:00CarlaMéndez. OpeningARS100000andUSD50. Actualcashflows:receiptR-000183Paula MéndezappliedUSD100receivedARS150000rate1500;R-000184USD50cash;aporteARS20000;retiroARS10000;refundD-000012ARS20000cash;supplierspaymentPP-000072ARS30000cash;usedpaymentPPU-000042ARS40000cash. ExpectedC46ARS170000andUSD100. TransfersandPermutaexcludedfromcash. Illustrativecurrentrate1USD=ARS1500,referencecashUSD213.33. Valuesnotlive.
```

## 01 — Caja abierta y efectivo por moneda

Destino: `21-caja/desktop/01-caja-abierta-v2.png`. Prompt efectivo: base común más texto siguiente; OVERRIDE sustituye formato o composición.

```text
SelectCaja. HeadingCaja subtitleEfectivo del negocio. TabsCajaactualselected/Sesiones/Cobros/Devoluciones/Más. Primarysecondarysized'Registrar movimiento' oneviolet, outline'Preparar cierre'. HeaderC-000046Abiertagreen,27oct09:00CarlaMéndez. MAINwhitefinancialtableConcepto/ARS/USD withrowsInicial100.000,00/50,00;Cobrosenefectivo+150.000,00/+50,00;Aportes+20.000,00/0,00;Retiros−10.000,00/0,00;Devoluciones−20.000,00/0,00;Pagosaproveedores−30.000,00/0,00;Pagosdeusados−40.000,00/0,00;Esperado170.000,00/100,00BIG. HeadertextcodecurrenciesvisibleavoidaddingARStoUSDcolumn. Belowseparatereferencestrip'Equivalente orientativo USD213,33 ·1USD=ARS1.500 ·Cotización ilustrativa12:00'. Alert'El efectivo se controla por moneda. Las transferencias y permutas no integran esta caja.' Lowercompactrecentmovements3rowsR183CobroARS150k,R184CobroUSD50,PPU42PagousadoARS40k withVerlinks, allinfixture. No metricTotalingresosmisleading. No expected meanscountedactual. No otherfigures. Cardsorrowsnotcharts.
```

## 02 — Abrir caja

Destino: `21-caja/desktop/02-apertura-caja-v2.png`. Prompt efectivo: base común más texto siguiente; OVERRIDE sustituye formato o composición.

```text
SelectCaja. FocusedformAbrir caja,backVolver a caja. ThisisEARLIERsnapshot27oct08:55,boxclosedbeforeC46opened, noassignedC46numberyet. Largewhiteform'Contá el efectivo inicial' editablecurrencyrowsUSD selected50,00 andARS100.000,00;labelsMoneda/Monto inicial;each44pxtargetandreadable. SecondaryAgregar moneda;zeroallowedhelper'Podés declarar cero. Cada moneda se carga una sola vez.' Rightreadonlysummary 'Antes de abrir':USD50/ARS100000; 'Estos importes son lo que hay físicamente al iniciar. No se copian automáticamente del cierre anterior.' PrimaryAbrir caja, outlineVolver. No sessionnumberpromised,no transfers/bankbalance/cardpaymentfields,no newcashopeningmovementexpense, no summixedcurrencies. No quote213.33asopening (thatistodayexpectednotinitial). Fakefooter.
```

## 03 — Aportes y retiros

Destino: `21-caja/desktop/03-movimiento-efectivo-v2.png`. Prompt efectivo: base común más texto siguiente; OVERRIDE sustituye formato o composición.

```text
SelectCaja,C46Abierta. PageRegistrar movimiento, twosegmentoptionsAporte/Retiroselected. FieldsMonedaARS,Importe50.000,00,Motivorequiredclosedselect'Retiro del dueño'. NoteallowedreasonsbutNOunsupportedfree-textnotefield. Rightwhite'Revisión del retiro' read-only 'Efectivo esperado actual ARS170.000 / Retiro por registrar ARS50.000 / Esperado después ARS120.000'. Info'No registra una compra ni un pago a proveedor. El dinero se retira físicamente.' Small'La disponibilidad se vuelve a comprobar al guardar.' PrimaryRegistrar retiro andVolveroutline. No moneyalreadydeducted. USD100untouchedsmallseparatecaption. LabelsourceC46clear. No checkingaccounttransferorstock, no automaticallygenerateledgerexpense. Actualoriginalretiro10kstillcurrent,noproposednewnumber.
```

## 04 — Conteo y revisión del cierre

Destino: `21-caja/desktop/04-cierre-arqueo-v2.png`. Prompt efectivo: base común más texto siguiente; OVERRIDE sustituye formato o composición.

```text
SelectCaja. Date27oct18:30. Cerrar cajaC-000046 ·Paso2de2Revisión. TopbackCorregirconteooutline. WhiteleftreviewtableMoneda/Esperado/Contado/Diferencia:
ARS170.000,00/168.000,00/Faltante2.000,00amber;
USD100,00/100,00/Sindiferenciagreen.
Header'Lo contado es físico; la diferencia no se compensa entre monedas.' Contextopened27oct09Carla. Rightwhite'Revisar antes de cerrar' valuesARS168kcontados,USD100contados,referenceUSD212,00at1500(withcaptionOrientativo), warning'El arqueo se guarda y la sesión cerrada no se edita ni reabre.' 'El faltante no genera un retiro automático.' 'Si entra otro movimiento, hay que revisar otra vez.' ButtonsCorregir lo contadooutlinefocused andCerrar cajared. No primaryvioletduplicate/no closealreadydone. No datefilter, no moneyreturned, noapprovalrequiresbalancezero. No proposed5000error;differenceexact2000.
```

## 05 — Sesiones y arqueo conservado

Destino: `21-caja/desktop/05-sesiones-arqueo-historico-v2.png`. Prompt efectivo: base común más texto siguiente; OVERRIDE sustituye formato o composición.

```text
SelectCaja,tabSesionesactive. HeadingSesiones de caja, searchNúmero de sesiónC-,noinventeddatefilters. Mainwhitelisttwo rowsC-00004627oct09:00AbiertawithVer;C-00004526oct09:00–19:00CerradawithVer. Secondrowselectedopens430pxrightpanel'Arqueo ·C-000045',badgeCerrada,abrióCarlaMéndez26oct09,cerróCarla26oct19. ReadonlytableMoneda/Esperado/Contado/Diferencia:ARS80.000/80.000/Sindiferencia;USD40/40/Sindiferencia. Small'Valores guardados al cierre. Una anulación posterior no reescribe este arqueo.' TabsResumenactive/Movimientos/Actividadwithinpanel. SecondaryImprimir arqueobutton, linkAbrir sesióncompleta. No reabrir/edit/recomputeatnewquote, no170kfromtodayinoldsession,no bankbalances. No inventednewsessionnumbers. ActiveC46existsnotopensnewprimary.
```

## 06 — Cobros y recibo con conversión

Destino: `21-caja/desktop/06-cobros-recibo-conversion-v2.png`. Prompt efectivo: base común más texto siguiente; OVERRIDE sustituye formato o composición.

```text
SelectCaja,tabCobros. TitleCobros, filterNúmeroR andClienteTodos, no unimplementeddatefiltersneeded. Mainlistrows:
R-000184 ·VentaV-000223 ·Efectivo ·USD50 ·Vigente;
R-000183 ·Paula Méndez ·VentaV-000222 ·Efectivo ·AplicadoUSD100 ·Vigente selected;
R-000182 ·Mateo Salas ·VentaV-000221 ·Transferencia ·ARS200000 ·Vigente.
Open430pxright'ReciboR-000183' Vigente. BusinessiPhoneDemo, 'Documento no válido como factura'. FieldClientePaulaMéndez,DestinoVentaV222,MedioEfectivo,SesiónC46,Fecha27oct11:40. Twoexplicitwhiteblocks 'Aplicado a la venta:USD100,00' and 'Recibido físicamente:ARS150.000,00'. 'Cotización usada1USD=ARS1.500 ·copiada al registrar'. Small'La deuda baja en USD; la caja recibe ARS.' OutlineImprimir, overflowAnular recibo. No actualfxmarket, no amountdoublecounting, noautomaticbankvalidation. Don'tshowaUSD100cashdepositforR183. Noprimarynewcollectiongenericwithoutdestination, linkRegistrar cobroopensdestinationselectoroptionalnotdrawn.
```

## 07 — Devolución de dinero

Destino: `21-caja/desktop/07-devolucion-venta-sin-cliente-v2.png`. Prompt efectivo: base común más texto siguiente; OVERRIDE sustituye formato o composición.

```text
SelectCaja,tabDevoluciones. FocusedpageRegistrar devolución, backVentaV-000220. ThisisLATERalternativeoflastbatch:V220wasannulledbyA-000011,customerConsumidorfinal,originalcollectedARS80000transfer,currentA devolverARS80000. Leftwhitecontextsaleandannulmentlinks,info'Sin cliente: la devolución se registra sobre la venta anulada'. FieldsMedio de pagoTransferenciaselected/ Efectivoalternative, Moneda que saleARSreadonly,ImporteARS80.000,00. Rightreadonlyreview'A devolver actualARS80.000 / Por devolver ahoraARS80.000 / Quedará por devolverARS0'. Caption'Previsión. La devolución aún no se registró.' Warning'Confirmá que el dinero fue entregado. Registrar no ejecuta una transferencia.' PrimaryRegistrar devolución andVolveroutline. No Dnumberbeforeguardado. No stockreturn, no reopeninginvoice. ThisplannednoncashrefundnotaffectcashC46. No customernameinvented,no creditoalclienteaquí.
```

## 08 — Clientes con deuda

Destino: `22-cuentas-clientes/desktop/01-deudores-por-moneda-v2.png`. Prompt efectivo: base común más texto siguiente; OVERRIDE sustituye formato o composición.

```text
SelectCuentas de clientes. TitleCuentas de clientes, tabsCondeudaselected/Buscarcliente (newproposednavigationjustnotclaimdataset). FilterMonedaTodas, optionalclientsearchproposed. OnecleanwhitegroupedtableCliente/Moneda/Debe/Ventas con saldo/Más antigua/Acción.
GroupARS:Mateo SalasARS660.000,2ventas,V00021826oct,Ver cuenta;Paula MéndezARS120.000,1venta,V00021024oct,Ver cuenta.
GroupUSD:Paula MéndezUSD300,1venta,V00022227oct,Ver cuenta.
Sidebarreadonly 'Resumen orientativo enUSD' ARS780.000÷1500=USD520;deudaUSD300;TOTALUSD820,00. source1USDARS1500cotizacionilustrativa12:00. Caption'Las deudas conservan su moneda. El equivalente no convierte la cuenta.' Small '3 saldos ·2 clientes'. No billssendbuttons,nooverduerisk/interests/creditlimits, no contactnumbers. No globaldebt780300ARS+USDwrong. No newpaymenteffectPU82stillproposednotregistered.
```

## 09 — Estado de cuenta

Destino: `22-cuentas-clientes/desktop/02-estado-cuenta-cliente-v2.png`. Prompt efectivo: base común más texto siguiente; OVERRIDE sustituye formato o composición.

```text
SelectCuentasdeclientes. BreadcrumbFinanzas>Cuentas>PaulaMéndez. HeadingEstado de cuenta ·Paula Méndez. PrimaryCobrar a cuenta, outlinedImprimir. Headerseparatecurrencycards 'Debe USD300,00' and 'Debe ARS120.000,00', smallreference 'Equivalente orientativo USD380,00 ·1USDARS1.500'. TabsResumenactive/Comprobantes. CurrencyselectorUSDselected/ARS. WhiteUSDdetaildefinitionlist 'Ventas vigentesUSD400 / Cobros netosUSD100 / Saldo:DebeUSD300'. TableImputaciónactual: V-00022227octTotalUSD400/CobradodirectoUSD100/Dela cuentaUSD0/FaltaUSD300. ReceiptbelowR-000183Efectivo appliedUSD100 recibidoARS150000, linkVer recibo. Inline'La deuda enARS pertenece a V-000210 y se consulta por separado'. Note'Los cobros a cuenta se aplican automáticamente a las ventas con saldo más antiguas de la misma moneda.' No editableallocationcheckbox,norunningbalancecolumn, no due dates. NosaldoafavorrefundbuttonbecausePaulaowes. Allfigurescurrentnotpreview350.
```

## 10 — Cobro a cuenta y aplicación prevista

Destino: `22-cuentas-clientes/desktop/03-cobro-a-cuenta-imputacion-v2.png`. Prompt efectivo: base común más texto siguiente; OVERRIDE sustituye formato o composición.

```text
SelectCuentasdeclientes. FocusedpageCobrar a cuenta ·Paula Méndez, Paso2Revisión. Readonlycontext 'Deuda enUSD actualUSD300'. Previousdatareadonly Moneda aplicadaUSD/Moneda recibidaUSD/MedioTransferencia/ImporteUSD350,00. Mainwhite'Revisión de la aplicación' tworeadonlyrows 'A V-000222:USD300,00' and 'Quedará a favor enUSD:USD50,00'. Explicit'No es una selección manual de ventas. Se aplica de la más antigua a la más reciente.' Note'ARS120.000seguiránpendientes; este cobro no cruza monedas.' Warning'Es una previsión de la cuenta actual. La aplicación se vuelve a calcular al registrar.' Rightnotice 'Registrar no ejecuta una transferencia.' FooterCambiar datosoutline andRegistrar cobroprimary. No Rnumberuntilsuccess/no alreadyrecordedcredit50. Allowamountgreaterthandebt,no fakeoverpaymenterror. No permutaorFXhere. No accountbalance400mathconfusion currentUSDdebt300 isafterR183.
```

## 11 — Cotización, fuente e historial

Destino: `23-tipo-cambio/desktop/01-cotizacion-fuente-historial-v2.png`. Prompt efectivo: base común más texto siguiente; OVERRIDE sustituye formato o composición.

```text
SelectTipo de cambio. TitleTipo de cambio, smallbanner'Datos de ejemplo ·No es una cotización de mercado'. Mainleftwhitecurrent '1USD=ARS1.500,00',FuenteDolarAPIblueventa+ajuste;sourceillustrativoARS1485+ajuste15=1500;registrada27oct09:00,últimaconfirmación12:00,smallfreshmarker. LeftsecondcardCONFIGfieldsFuente radioDolarAPIselected/Carga manual;Ajuste enARS input15,00;helper'Puede ser cero o negativo;se aplica en la próxima lectura'. BackgroundGuardar configuraciónMUTEDbecausemanualdraweropen. Importantreadonly 'Moneda principalUSD ·Otra monedaARS' no editablepairpicker. Compacthistoryrows27oct09:00Automática1500;26oct18:00Manual1490;26oct15:00Automática1480. Explicitpastrowsillustrativesnofullrealquote. Attribution'Fuente:DolarApi(dolarapi.com)+ajuste de la organización'.
Right430pxpanel'Cargar cotización manual' persistentlabel'1USD=ARS',editable1530,00;readback'1USD=ARS1.530,00'. Note'Pasa a ser la vigente al guardar. Las operaciones anteriores conservan su cotización.' Warning'Con fuente automática, una próxima lectura puede reemplazarla. Usá Carga manual para mantenerla.' primaryGuardar cotización andVolveroutline. No livefetchbutton, no ratesbuyandsellseparate, no productrepricing, no autoexportmarketnumbers. Clearlycurrent1500/proposed1530.
```

## 12 — Medios de pago

Destino: `24-medios-pago/desktop/01-medios-pago-configuracion-v2.png`. Prompt efectivo: base común más texto siguiente; OVERRIDE sustituye formato o composición.

```text
SelectCaja, breadcrumbFinanzas>Caja>Medios de pago. TitleMedios de pago, background+Nuevo mediooutline. ListwhitecolumnsNombre/Tipo/Estado/Acciones6rows:
Efectivo/Efectivo/Activo/ellipsis;
Transferencia/No efectivo/Activo/ellipsis;
Tarjeta/No efectivo/Activo/ellipsis;
USDT/No efectivo/Activo/ellipsis;
Permuta/Del sistema/Activo/lockSinedición;
Cheque/No efectivo/Inactivo/ReactiVar.
SmallcontextUSDTse registraenUSD;Permutase usasoloencobrosdeventasconusadoelegible. No isCashcheckboxintable,no connectionsorbanklogos. Selectedordinarymethodsupportsrenombrar/desactivarbutnotdeletions.
Right430pxpanel'Nuevo medio de pago',Nombreinput'Link de pago',helpHasta40caracteres/nombresúnicos;requiredradio'¿Es efectivo?' No:no pasa por la cajaSELECTED/Si:entra a la caja, helper'Este tipo no se puede cambiar después de crearlo.' PrimaryCrear medio andCancelaroutline. Notyetinthesixrowlist, no realpaymentlinkgenerated, nofeescommissionsadvanced. Allreadonlybackgroundwhenpanelopen, oneprimaryonly.
```

## 13 — Caja móvil

Destino: `21-caja/mobile/08-caja-mobile-v2.png`. Prompt efectivo: base común más texto siguiente; OVERRIDE sustituye formato o composición.

```text
OVERRIDE one mobile941x1672portraitapp,no deviceframe,nosidebar. TopVixorasearchavatar, breadcrumbFinanzas/Caja. TitleCaja,C-000046Abierta,27oct09:00CarlaMéndez. PrimaryRegistrar movimiento, secondaryPreparar cierre, overflow. TabsResumenactive/Movimientos. TWOverticalcurrencycards:
ARS:Inicial100.000/Cobros150.000/Aportes20.000/Salidas100.000/Esperado170.000big.
USD:Inicial50/Cobros50/Esperado100big.
ARS Salidas100k iswithdraw10+refund20+supplier30+used40. ShortlinkVer desgloseatARS. Separatecard'Equivalente orientativoUSD213,33 /1USD=ARS1.500 ·Dato ilustrativo12:00'. Note'Solo efectivo. Transferencias y permutas no integran esta caja.' BottomnavInicio/Chats/Clientes/Ventas/Másselected; safebottomspace, no contenthidden. No newthirdcurrency, no charts,totalcashnomixing,the figuresareexpectednotcounted. Persistentlegiblelabels.
```

## 14 — Estados, rechazos y anulación de recibo

Destino: `21-caja/estados/09-estados-caja-cuentas-v2.png`. Prompt efectivo: base común más texto siguiente; OVERRIDE sustituye formato o composición.

```text
OVERRIDE intentional UXstateboard1672x941 onapprovedlavender, no sidebar, sixlargewhitecomponentcards2rows3columns,slimheaderVixora ·Caja y cuentas /Estados y decisiones. Not sixfullscreens.
Card1'Caja cerrada' 'Para usar efectivo, abrí una sesión. Los medios no efectivos siguen su flujo.' outlineAbrir caja.
Card2'Cambió el esperado' 'Entró un movimiento mientras revisabas el cierre. Conservamos lo contado.' primaryRevisar arqueo. No closeautomatically.
Card3'No alcanza el efectivo' 'EsperadoARS170.000 ·Retiro solicitadoARS200.000' 'No se registró la salida.' outlineCorregir importe.
Card4'¿Anular R-000183?' 'AplicadoUSD100 ·RecibidoARS150.000 ·EfectivoC-000046abierta' closedreasonchoiceMotivo'La plata no entró'. 'Deja de contarUSD100 para la venta y restaARS150.000 de esta caja. No devuelve dinero.' safeConservar recibooutlinefocused/Anular reciboRED. No newFXrate,nogenericcashreopening.
Card5'Cotización con aviso' twoinfoareas 'Antigua: mostrar fecha y advertencia; no bloquear solo por antigüedad.' / 'Sin cotización: no se convierte. Elegí moneda del destino o cargá una vigente.' outlineRevisar cotización. No silentlyuse0ornewfakequote.
Card6'No hay saldo a favor' 'La deuda y las señas retenidas no son importes disponibles para devolver.' muted'La cuenta conserva su moneda. Consultá el estado actualizado.' linkVer cuenta. bottomsmall'Consulta: sin acciones de gestión.' No automaticmessageorcollections. Eachcardindependentnotcurrentallatonce.
```

## Correcciones y cierre del lote

Producción iniciada el 27 de octubre de 2026 y finalizada el 28 de octubre de 2026. Las fechas del escenario ficticio se mantienen en el 27; no son una lectura actual de producción.

Se realizaron seis correcciones mediante ImageGen con referenced_image_paths y transparent_background false. Los originales se conservaron. La primera generación móvil salió horizontal y se descartó como versión final; se generó otra pieza con un prompt independiente exclusivamente móvil, sin la base de escritorio.

Raíz común de originales: `C:/Users/benja/.codex/generated_images/01a1412b-553e-7060-8d8b-7317f5b80bdf/`.

### Horarios coherentes de recibos

Objetivo: `exec-28606f22-96fe-4d6b-a0d2-fa56e0b44223.png`. Resultado final: `exec-2ee774cc-6447-4158-8d9c-30e12e81cbe9.png`.

```text
Use case: ui-mockup, targeted time-only correction. Preserve attached Vixora1672x941Caja screenshot exactly including allmoneyvalues andlayout. In the bottom Movimientos recientes table, change ONLY R-000183 timefrom09:15to11:40, and R-000184 timefrom09:40to11:50. Keep date27/10/2026,PPU-000042time11:20,top12:30andopened09:00unchanged. These two receipts occur after the prior batch receipts and match their detail. No otherchanges.
```

### Hora del borrador de apertura

Objetivo: `exec-4e539ab1-ddf2-422a-9033-ebafd9eeb892.png`. Resultado final: `exec-76dfdc4b-f1b5-4826-a543-264ac318f9f3.png`.

```text
Use case: ui-mockup. Precise header timecorrectiononly. In attached Vixora Abrir caja1672x941, change ONLY top-rightclock12:30to08:55. ThisisabeforeopeningsnapshotofTuesday27oct2026,sessionlateropens09:00. Keep weekday/date/timezone,allUSD50/ARS100000values,all fields andlayoutunchanged. No sessionnumberadded, no financialchanges.
```

### Moneda de referencia del arqueo

Objetivo: `exec-9953cf39-0210-4637-a9e9-16275bd78cee.png`. Resultado final: `exec-5565cdd9-066d-494a-8fad-4cc8097411c8.png`.

```text
Use case: ui-mockup. Targeted label-only correction. Preserve attached Vixora Cerrar caja1672x941 andallvaluesexactly. In RIGHT reviewcard change label 'Equivalente en ARS (orientativo)' to EXACT 'Equivalente en USD (orientativo)'. Itsvalue212,00USD isalreadycorrectandmustremainunchanged. LefttableexpectedARS170000,counted168000,difference2000,USD100allunchanged. Keep clock18:30 andeverythingelse. Do not recalculateanyamount.
```

### Navegación y jerarquía del recibo

Objetivo: `exec-92f9adfc-7160-4b34-b339-b2c18d94a21b.png`. Resultado final: `exec-0516fe2f-bdf4-4be3-8a77-7a054c277b4b.png`.

```text
Use case: ui-mockup. Targeted interface consistency correction. Preserve attached Vixora CobroswithreceiptR-0001831672x941 allrecords,currencies,amounts,timesandpanelgeometryexactly. Replace mainleftmodule tabbar 'Movimientos / Cobros / Aportes y retiros / Pagos / Devoluciones' with canonical 'Caja actual / Sesiones / Cobros / Devoluciones / Más', CobrosSELECTEDviolet. Change panelbrandcaption 'Business iPhone Demo' to simply 'iPhone Demo'. Make BACKGROUND '+Registrar cobro' button pale mutedlavenderandinertwhilethereceiptpanelisopen. Preserve panelImprimir,overflowAnular recibo,allappliedUSD100/receivedARS150000/rate1500and11:40time. Do not add newmodules or change transactions.
```

### Moneda del destino de la devolución

Objetivo: `exec-110d3194-f6b5-4293-87f9-76160d5c1c25.png`. Resultado final: `exec-d2f45747-2d4a-48dd-9931-978ff63a1dae.png`.

```text
Use case: ui-mockup. Targeted text corrections to attached Vixora refundscreen1672x941. Under Moneda que sale, replace helper 'La moneda se determina por el cobro original de la venta.' with EXACT 'Esta venta está emitida en ARS.' The destinationcurrencycomesfromsale,nottheoriginaltender. Also replace annulmentcontext 'Motivo: Anulada por error' with EXACT 'Motivo: Error de carga'. Preserve ALLamountsARS80000and0,fields,dates,V-000220,A-000011,Transferenciaselection,layoutandwarningsunchanged. No conversionorothercurrencyadded,no actualrefundregistered.
```

### Antigüedad coherente de la cotización

Objetivo: `exec-20a9e07f-3774-48e2-9587-0d50f22c7f9b.png`. Resultado final: `exec-d6866f43-5933-48f7-9132-412a776d1c55.png`.

```text
Use case: ui-mockup. Precise date-timecorrectiononly. Preserve attached Vixora stateboard1672x941 exactlyallcardsandmoney. In bottomMIDDLE 'Cotización con aviso' card change ONLY stalequote time 'Antigua:26 de octubre de2026 16:20' to 'Antigua:26 de octubre de2026 08:00'. The sheetnowis27oct12:30so08:00previousdayismorethan24hours,16:20wasnot. Preserve 'Hace más de24horas' andallothercontent unchanged. No changes toheaderdate, cashamounts,anulacionR183ormodules.
```

### Nueva generación de Caja móvil

No usa la base común ni imagen de referencia. Sustituye la pieza horizontal no seleccionada `exec-0f526295-571d-4669-bbde-b242055a27d6.png`. Resultado final: `exec-9ccbfe73-445c-4beb-8291-3324796a9ddd.png`.

```text
Use case: ui-mockup. Create ONE MOBILE APP SCREEN ONLY, vertical PORTRAIT941x1672pixels, tall9:16. Absolutely NO desktop sidebar, NO desktop layout, NO landscape. All content in ONE COLUMN. No phoneframe, no browserframe.
Vixora CRM Spanish, Manrope typography, background#F6F5FB, whitesurfaces, darktext#17142E, muted#5A5573, flatviolet#6D28D9, lavender#EDE7FE,12pxcorners,light1pxborders. Premium usableSaaS.
TopcompactVixorawordmark searchiconavatar. BreadcrumbFinanzas/Caja. BigtitleCaja, metadataC-000046 ·Abierta ·27oct09:00 ·Carla Méndez. PrimaryvioletRegistrar movimiento fullwidth. SecondaryoutlinedPreparar cierre. TabsResumenactive/Movimientos.
STACKEDcard1 fullwidth 'ARS ·Peso argentino' definitionrowsInicialARS100.000 /CobrosARS150.000 /AportesARS20.000 /SalidasARS100.000. Bottomemphasized 'Esperado ARS170.000'. SmallVer desglose.
STACKEDcard2 fullwidth 'USD ·Dólar estadounidense',rowsInicialUSD50/CobrosUSD50/bottom'EsperadoUSD100'. No salidasUSD.
Belowthirdseparatecompactreferencecard 'Equivalente orientativo USD213,33' /'1USD=ARS1.500 ·Dato ilustrativo12:00'. Infotext'Solo efectivo. Transferencias y permutas no integran esta caja.'
TinyDatos ficticios ·Propuesta de diseño. FixedbottomnavInicio/Chats/Clientes/Ventas/Másselectedviolet. Ampleclearbottomsafearea nohiddencontent.
Allnameswithspaces. Show a genuinelymobiletallportraitscreenwith2currenciesSTACKED, nevercolumns. No transactiontable atall, no randomreceiptnumbers/times, no otherrecords or money. 27oct2026isTuesday. ValuesareEXPECTEDnotcounted. FinalimageMUSTbe941x1672portrait.
```

## Archivos finales y trazabilidad

| Destino | Original inicial | Final copiado |
|---|---|---|
| 21-caja/desktop/01-caja-abierta-v2.png | exec-28606f22-96fe-4d6b-a0d2-fa56e0b44223.png | exec-2ee774cc-6447-4158-8d9c-30e12e81cbe9.png |
| 21-caja/desktop/02-apertura-caja-v2.png | exec-4e539ab1-ddf2-422a-9033-ebafd9eeb892.png | exec-76dfdc4b-f1b5-4826-a543-264ac318f9f3.png |
| 21-caja/desktop/03-movimiento-efectivo-v2.png | exec-13ae8fbe-01ae-43c0-b33f-dd908e9d93c3.png | exec-13ae8fbe-01ae-43c0-b33f-dd908e9d93c3.png |
| 21-caja/desktop/04-cierre-arqueo-v2.png | exec-9953cf39-0210-4637-a9e9-16275bd78cee.png | exec-5565cdd9-066d-494a-8fad-4cc8097411c8.png |
| 21-caja/desktop/05-sesiones-arqueo-historico-v2.png | exec-b5d9eea0-a3dc-4fb5-a5ca-a04ee10f3463.png | exec-b5d9eea0-a3dc-4fb5-a5ca-a04ee10f3463.png |
| 21-caja/desktop/06-cobros-recibo-conversion-v2.png | exec-92f9adfc-7160-4b34-b339-b2c18d94a21b.png | exec-0516fe2f-bdf4-4be3-8a77-7a054c277b4b.png |
| 21-caja/desktop/07-devolucion-venta-sin-cliente-v2.png | exec-110d3194-f6b5-4293-87f9-76160d5c1c25.png | exec-d2f45747-2d4a-48dd-9931-978ff63a1dae.png |
| 22-cuentas-clientes/desktop/01-deudores-por-moneda-v2.png | exec-3e342c1e-8ec0-4632-94a0-1253b0f487af.png | exec-3e342c1e-8ec0-4632-94a0-1253b0f487af.png |
| 22-cuentas-clientes/desktop/02-estado-cuenta-cliente-v2.png | exec-42756f20-e722-4c37-8da3-03abcc64b791.png | exec-42756f20-e722-4c37-8da3-03abcc64b791.png |
| 22-cuentas-clientes/desktop/03-cobro-a-cuenta-imputacion-v2.png | exec-0b045bcc-35ef-4dda-8d6f-c4ff2e690495.png | exec-0b045bcc-35ef-4dda-8d6f-c4ff2e690495.png |
| 23-tipo-cambio/desktop/01-cotizacion-fuente-historial-v2.png | exec-7dde85f3-130d-4585-9c63-7c1d3fce962e.png | exec-7dde85f3-130d-4585-9c63-7c1d3fce962e.png |
| 24-medios-pago/desktop/01-medios-pago-configuracion-v2.png | exec-08c15506-5518-4358-a425-3ed0fe8879c9.png | exec-08c15506-5518-4358-a425-3ed0fe8879c9.png |
| 21-caja/mobile/08-caja-mobile-v2.png | exec-0f526295-571d-4669-bbde-b242055a27d6.png | exec-9ccbfe73-445c-4beb-8291-3324796a9ddd.png |
| 21-caja/estados/09-estados-caja-cuentas-v2.png | exec-20a9e07f-3774-48e2-9587-0d50f22c7f9b.png | exec-d6866f43-5933-48f7-9132-412a776d1c55.png |

Control final: catorce PNG, nueve en Caja, tres en Cuentas, uno en Tipo de cambio y uno en Medios de pago. Dimensiones: doce horizontales de 1672 × 941, apertura de 1671 × 941 y móvil de 941 × 1672. Los encuadres originales se preservan sin estirar ni recortar. Solo se escribieron imágenes y documentación en docs/ui-redesign/v2; no se ejecutaron operaciones del CRM ni pruebas de la aplicación.


