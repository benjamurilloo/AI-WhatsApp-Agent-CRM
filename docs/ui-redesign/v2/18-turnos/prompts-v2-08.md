# Prompts de ImageGen — Turnos V2-08

Fecha: 27 de octubre de 2026. Herramienta integrada ImageGen; una llamada por imagen. Datos ficticios. Los prompts contienen decisiones de diseño, no instrucciones para modificar código.

## Base común

```text
Use case: ui-mockup. Asset type: one high fidelity Vixora CRM Spanish desktop screen, 1672x941 landscape, edge to edge app screenshot, crisp legible Manrope type, no browser chrome, no perspective or device frame. Mature premium usable SaaS for iPhone retail. Approved design: flat background #F6F5FB, white surfaces, light lavender sidebar #F1EEFB about 240px, dark ink #17142E, muted #5A5573, border #E3DFF0 1px, flat primary #6D28D9, selection #EDE7FE, radius12, restrained shadows, no gradients. Vixora wordmark top left (existing brand, no reinvention), slim global search/header. Sidebar Inicio; Atención expanded with Conversaciones, Clientes, Turnos SELECTED; collapsed groups Catálogo e inventario, Servicio técnico, Comercial, Finanzas, Abastecimiento, Administración. Carla Méndez Administradora at bottom. Breadcrumb Atención > Turnos. Module tabs Calendario / Configuración. Only one dominant primary button per view. Secondary outline buttons and contextual links. Statuses with text and icons: Pedido amber, Confirmado violet, Atendido green, Ausente gray, Cancelado gray. Availability is separate: Libre, Completa, Ya empezó, Cerrado, not same as appointment status. Clear persistent labels, ample44px targets, strong contrast. All names and records fictitious. Tiny footer Datos ficticios · Propuesta de diseño. No charts or extra functionality. Business timezone Buenos Aires UTC−3. Unless noted simulation clock Tuesday 27 October2026 11:05, configured30minute slots and1appointment per slot, hours MonFri10–13 and16–19; Sat10–13; Sunclosed. No employee assignments, rooms, reminders, sending buttons, stock reservations, payment creation, editing/rescheduling by drag. No invented sequential appointment numbers. 
```

## 01 — Calendario semanal

Archivo: `desktop/01-calendario-semanal-v2.png`.

Prompt efectivo: base común anterior seguida de este texto. Las indicaciones OVERRIDE reemplazan dimensiones o composición cuando corresponde.

```text
Show Turnos heading/subtitle Agenda de visitas al local. top primary + Nuevo turno. tabsCalendario active Configuración. Toolbar prev chevron, Hoy outline, '26 oct – 1 nov 2026', nextchevron; segmented Día/Semana with Semana selected. metadata 'Franjas de 30 min · Cupo 1 · Buenos Aires (UTC−3)'. One spacious seven-column WEEK GRID, Monday26 Tuesday27 today highlighted Wednesday28 Thursday29 Friday30 Saturday31 Sunday1nov. Time axis half-hour10:00,10:30,11:00,11:30,12:00,12:30, collapsed horizontal lunch band '13:00–16:00 · Cerrado',16:00,16:30,17:00,17:30,18:00,18:30. Each appointment occupies ONE correct30minute row, not stretched. Tue27:10JulietaPaz Atendido;11ValentinaCosta Confirmado;12BrunoAcosta Pedido;16EmiliaTorres Confirmado. Wed28:10GabrielMedina Confirmado. Sat31:11RenataDíaz Confirmado. Use spaces in all personal names. Tuesday11:30 outlined hover slot 'Libre · Dar turno'; Wed11 slot 'Libre' no appointment. Monday26 historical muted cells no booking affordance. Sundaysclosed all day, Sat afternoonclosed. Tuepastcellsnotbookable even if finalstatusfreesoccupancy. Compact legend 'Pedido / Confirmado / Atendido' withiconlabels, single footer 'Pedido y confirmado ocupan cupo. Los horarios cerrados no se pueden reservar.' All6appointments correct slots. Show all7days and fullbusinesshours without tiny dense type. No madeupweeklytotals.
```

## 02 — Agenda diaria

Archivo: `desktop/02-agenda-diaria-v2.png`.

Prompt efectivo: base común anterior seguida de este texto. Las indicaciones OVERRIDE reemplazan dimensiones o composición cuando corresponde.

```text
Show Turnos primary + Nuevo turno, module tabsCalendario active/Configuración. ToolbarHoy,27octubre2026,arrows,Día selected/Semana. 'Martes · Buenos Aires (UTC−3) · Actualizado 11:05'. Main content two complementary white columns: 'Turnos del día' wide and 'Franjas del día' narrow. Wide header chips 'Todos 4' selected / 'Pedidos 1' / 'Confirmados 2' / 'Atendidos 1'. Four spacious event rows with chronologically ordered time and client, motivo and state, origin:
10:00–10:30 Julieta Paz / Retirar un equipo / Atendido / Equipo.
11:00–11:30 Valentina Costa / Reparación o diagnóstico / Confirmado / Equipo / 'En horario' small.
12:00–12:30 Bruno Acosta / Ver o comprar un equipo / Pedido / 'Pedido por el agente'.
16:00–16:30 Emilia Torres / Entregar un usado / Confirmado / Equipo.
Every row just 'Ver turno' link; no repeated confirmation/buttons per row. Right 'Franjas de 30 min · Cupo1' list11:00–11:30 'Ya empezó · 1/1';11:30–12:00 'Libre · 0/1' linkDar turno;12:00–12:30 'Completa · 1/1';12:30–13:00 'Libre · 0/1';13:00–16:00Cerrado;16:00–16:30Completa1/1;16:30–17:00Libre0/1; bottom 'Ver todas las franjas'. Add smalllegend: 'Las franjas pasadas no admiten altas.' Availabilitycountsnotfilter-dependent. No sales/repairprocesscreation.
```

## 03 — Nuevo turno

Archivo: `desktop/03-nuevo-turno-v2.png`.

Prompt efectivo: base común anterior seguida de este texto. Las indicaciones OVERRIDE reemplazan dimensiones o composición cuando corresponde.

```text
Focused newappointment form inside app, titleNuevo turno, backVolver al calendario, no header primary. Single editable form two-thirds width plus sticky readonly review one-third. Date28/10/2026 Miércoles, dateinput calendar, secondary'Consultar disponibilidad'; sourcehint 'Hasta 90 días · Horas del local'. Clientselected 'Nadia Castro' picker and linkCrear cliente (opensClients preservingdraft). Motivo select'Ver o comprar un equipo'. Readonly reference card 'Equipo (IMEI) · U-0102 · …0102' withcaption'Acceso desde la ficha de unidad. El turno no reserva stock.' DO NOT alsoassignproductreference. Gridradio slotsunder'Franja disponible' morning10:30–11:00 free,11:00–11:30 SELECTED,11:30–12:00free,12:00–12:30free,12:30–13:00free; afternooncollapsed 'Ver horarios de la tarde'.10:00slotnotshown becauseGabrieloccupiesit. noteoptionaltextarea 'Quiere ver el equipo antes de decidir.' characterhintMáximo500. Review'Antes de guardar':NadiaCastro,miércoles28oct2026,11:00–11:30,30min,Verocomprarunequipo,referenceU0102. StatepreviewConfirmado, 'Ocupará 1 lugar en la franja.' small 'Se vuelve a comprobar la disponibilidad al guardar.' footerprimary'Dar turno confirmado' secondary'Volver sin guardar'. No draftappointmentnumber,noautonotification,nofakeconfirmationalreadydone. Persistentfieldlabels, stepflowunnecessary.
```

## 04 — Turno pedido por el agente

Archivo: `desktop/04-turno-pedido-agente-v2.png`.

Prompt efectivo: base común anterior seguida de este texto. Las indicaciones OVERRIDE reemplazan dimensiones o composición cuando corresponde.

```text
Appointment detail Bruno Acosta, subtitleMartes27oct2026 ·12:00–12:30, badgePedido amber, primaryConfirmar turno top right andsecondaryellipsis forCancelar turno. BackVolver a la agenda. Module detail tabsResumen active/Actividad. Hero compact review strip 'Pendiente de confirmación' and 'El pedido ya ocupa 1 lugar. Confirmarlo conserva esa misma franja.' White leftmaincard'Datos del turno':ClienteBrunoAcosta clickable;MotivoVer o comprar un equipo;OrigenAgente · WhatsApp;referencetypeProducto value'iPhone13 ·128GB ·Medianoche ·Usado';Nota'Quiere comparar las opciones de 128 y 256 GB.' Right white'Siguiente paso':titleRevisar y confirmar; checklist-styleREADONLYsummary27oct12–12:30,cap1;explanation'La confirmación queda registrada en el CRM. El local debe avisarle al cliente por su canal habitual.' No sendmessagebutton/no openwhatsapp/no checkbox consent. Origincontextsmall'Pedido por el agente' and'Solicitado26oct2026,17:10'. Below activitytimeline oneevent26oct17:10'Pedido recibido · Agente · WhatsApp'; no confirmationyet. Smallmuted'Para cambiar día u hora, cancelá este turno y cargá uno nuevo.' No edits/reschedule, no timerexpiry. No inventedappointmentnumber.
```

## 05 — Turno confirmado y registro de atención

Archivo: `desktop/05-turno-confirmado-atencion-v2.png`.

Prompt efectivo: base común anterior seguida de este texto. Las indicaciones OVERRIDE reemplazan dimensiones o composición cuando corresponde.

```text
Appointment detail Valentina Costa at27oct2026 11:05, subtitleHoy11:00–11:30,badgeConfirmado, topprimary'Marcar atendido',secondary'Marcar ausente',overflowcontainscancel. Mainlargewhitecard'Datos del turno':ClienteValentinaCosta;MotivoReparación o diagnóstico;OrigenEquipo;ReferenciaSin referencia;Nota'Consulta por una falla intermitente de carga.' Small11:00'El turno ya empezó'. Rightcontextreviewpanel open 'Registrar atención' occupying430px; clearly a pending confirmationNOTcompleted:
ClienteValentinaCosta
27oct2026 ·11:00–11:30
EstadoactualConfirmado
NuevoestadoAtendidogreenpreview
'Se registrará que la persona fue atendida. Este cambio es final.'
subtleinfo'No crea una reparación ni una venta.'
panelbottombuttonsVolver outline andConfirmar atenciónprimary. Backgroundactivity26oct16:20'Turno dado y confirmado · Carla Méndez'. Avoidduplicatetopprimaryvisuallydominantwhilepanelopen:backgroundbuttonmuted. No upcomingfutureattendance, no financialdata, no prescriptiontreatment. CaptionCambio aún sin guardar.
```

## 06 — Configuración de agenda

Archivo: `desktop/06-configuracion-agenda-v2.png`.

Prompt efectivo: base común anterior seguida de este texto. Las indicaciones OVERRIDE reemplazan dimensiones o composición cuando corresponde.

```text
ModuleTurnos, tabsCalendario/Configuraciónselected. TitleConfiguración de turnos, supporting'Definí la duración y el cupo de las visitas al local.' Configurationinner tabsAgenda selected/Motivos. Whiteformcard'Duración y cupo':persistentselectlabelDuración de cada franja selected30min withhelper'Opciones:15,20,30,45,60,90 y120min'. Label'Cupo por franja' numericstepper1, helper'De1a20 turnos simultáneos en cada franja'. These valuesALREADYCONFIRMED,no Delperfilbanner. Info 'El cupo corresponde al local, no a un técnico o empleado.' Adjacentwhitepreviewmini'Así se verá la grilla' three rows10–10:30,10:30–11,11–11:30allcapacity1. Lowerwhitecard'Horario del local' readonlyLunesaviernes10–13y16–19;Sábado10–13;DomingoCerrado;zoneBuenosAiresUTC−3. Link'Editar horarios y excepciones' (noprimary) toInformación > Horarios. Ambernotice'Los cambios no mueven ni cancelan turnos existentes. Los que queden fuera de horario o sobre el cupo necesitarán revisión.' Saveprimary'Guardar configuración' beneathform, canceloutline. Do not duplicate editablebusinesshours inappointments, no staff/servicespecificdurations, no automaticbulkrepair.
```

## 07 — Motivos de visita

Archivo: `desktop/07-motivos-turnos-v2.png`.

Prompt efectivo: base común anterior seguida de este texto. Las indicaciones OVERRIDE reemplazan dimensiones o composición cuando corresponde.

```text
Turnos Configuraciónactive, inner tabsAgenda/Motivos selected. TitleMotivos de visita. Supporting'Ordená los motivos que se ofrecen al dar o pedir un turno.' One clean white table undersecondary +Nuevo motivo button, one open430pxrighteditingpanel means +buttonnotprimary.
ColumnsOrden/Motivo/Estado/Acciones. Five rows:
1Ver o comprar un equipo Activo
2Entregar un usado Activo
3Reparación o diagnóstico Activo
4Retirar un equipo Activo
5Otro Activo.
Everyrow has up/downoutlineiconbuttonswithaccessiblelabels, ellipsis forRenombrar/Desactivar. Firstupdisabled lastdowndisabled. Do not show dragas-onlyway.
Rightpanel 'Editar motivo', persistentlabel'Nombre del motivo' editablevalue'Retirar un equipo'. Small 'Cambiar el nombre conserva los turnos asociados.' separatecriticalcontext'Desactivar lo quita de nuevas reservas; los turnos anteriores lo conservan.' Secondary'Desactivar motivo' quietdangerlink separated fromfooter; no delete. FooterCancelar outline/Guardar nombreprimary. No auto-close/hiddensteps, no durationsorpricingperreason. No checkbox statusautoediting ifunsaved. Whitepanels clearcloseX.
```

## 08 — Agenda diaria móvil

Archivo: `mobile/08-agenda-diaria-mobile-v2.png`.

Prompt efectivo: base común anterior seguida de este texto. Las indicaciones OVERRIDE reemplazan dimensiones o composición cuando corresponde.

```text
OVERRIDE desktopdimensions:single941x1672portraitmobileapp screenshot,no deviceframe,no sidebar. Large legible type withcomfortableverticalspacing, compacttopbrandVixora,searchavatar. BreadcrumbAtención / Turnos. HeadingTurnos, primary+Nuevo turno. DateTuesday27oct2026 toolbarHoy,left/rightarrows,segmentedDía selected/Semana. SmallBuenosAiresUTC−3,updated11:05. TabsTurnos selected/Franjas. chipsTodos4 selected/Pedidos1/Confirmados2/Atendidos1 wrapnicely. Four roomywhiteeventcards fullwidth:
10:00–10:30 Julieta Paz,Atendidogreen,Retirar un equipo,Equipo,Ver turno;
11:00–11:30 Valentina Costa,Confirmadoviolet,Reparación o diagnóstico,Equipo,Ver turno;
12:00–12:30 Bruno Acosta,Pedidoamber,Ver o comprar un equipo,Pedido por el agente,Ver turno;
16:00–16:30 Emilia Torres,Confirmadoviolet,Entregar un usado,Equipo,Ver turno.
No duplicated actionbutton percard. Stickybottomnav Inicio/Chats/Clientes/Ventas/Más, Másselected. Enoughsafebottomspaceandreadablelastcard. Singlecolumn,badgesnotcoloronly,nohorizontalgrid. FooterDatosficticios. No appointmentschanged,noallcalendarforcedonmobile.
```

## 09 — Alta móvil

Archivo: `mobile/09-nuevo-turno-mobile-v2.png`.

Prompt efectivo: base común anterior seguida de este texto. Las indicaciones OVERRIDE reemplazan dimensiones o composición cuando corresponde.

```text
OVERRIDE single941x1672portraitmobileform,no sidebar,nodeviceframe,noglobalbottomnavwhileformfocused. Topback Volver, titleNuevo turno. Persistentlabelsonecolumn. ClientpickerNadia Castro. MotivoselectVer o comprar un equipo. Dateinput28/10/2026andmiércoles. SecondaryConsultar disponibilidad. 2columnlarge44pxplusradiotiles10:30–11:00,11:00–11:30SELECTED,11:30–12:00,12:00–12:30,12:30–13:00 plusVer tardeoutline. ReferenceREAdONLY 'Equipo (IMEI): U-0102 · …0102' note'El turno no reserva stock.' Notalsoaproductreference. TextareaNota(opcional) 'Quiere ver el equipo antes de decidir.' summarystrip'28oct ·11:00–11:30 ·30min ·Confirmado al guardar'. Info 'La disponibilidad se comprobará otra vez al guardar.' StickybottomactionareaDar turno confirmado primarylargeandVolver sin guardartext. Safearea,nevercoverfields, verticalscrollhintifneeded. No keyboardinpicture,nofakegeneratednumber. Fitswithouttinytype.
```

## 10 — Estados y conflictos

Archivo: `estados/10-estados-conflictos-turnos-v2.png`.

Prompt efectivo: base común anterior seguida de este texto. Las indicaciones OVERRIDE reemplazan dimensiones o composición cuando corresponde.

```text
OVERRIDE intentional UXstateboard, one landscape1672x941sheet of SIX clearlyseparatedwhitecards in2rows3columns onapprovedlightlavenderbackground, slimtopVixora ·Turnos / Estados y decisiones, no fullsidebar. Not sixfullscreens, six enlargedUIcomponentexamples.
Card1'Sin horario del local', text'Primero cargá los horarios para generar franjas.' outline'Ir a Horarios'. Not dailyclosed.
Card2'No hay lugar ese día',date28oct,notice'No hay franjas disponibles. Probá otra fecha.' secondary'Cambiar fecha'. Don'tclaimnoappointments.
Card3'La franja se ocupó recién',formerror'11:00–11:30 ya no está disponible.' 'Conservamos cliente, motivo y nota.' action'Recargar franjas'. Nocreatingduplicate.
Card4'Turnos que necesitan revisión' withtwoindependentalertrows 'Fuera de horario · Emiliano Roca ·29oct19:00–19:30' and 'Sobre el cupo ·30oct16:00–16:30 ·2/1'; note'No se movieron ni cancelaron turnos.' secondary'Revisar turnos'. Noautofix.
Card5 modal '¿Cancelar este turno?' BrunoAcosta27oct12–12:30, 'Se libera su lugar. El cambio es final y el CRM no envía avisos.' safeoutline'Conservar turno' visiblyfocusedandquietdangerred'Cancelar turno'. No mandatoryreasonfieldunsupported. No violetdestructivebutton.
Card6 'Estados finales y permisos' three compactreadonlybadgesAtendido green/Ausentegray/Canceladogray; note'Sin reapertura. Atendido o ausente, desde la hora de inicio.' separateborderstrip'Vista de consulta · Puede ver calendario e historial; sin acciones de gestión.' smallnote'Carga y error de red conservan los datos previos.' No hover-onlycontrols or pointlessnewmetrics. Datafictionalscenariosindependentofmainagenda.
```

## Correcciones dirigidas

Los originales no se sobrescribieron. Las siguientes llamadas usan la imagen indicada como objetivo de edición.

### Corrección 1

Entrada: `exec-0ae2a463-bcfe-44da-b995-38010ec15baa.png`. Salida: `exec-151bb5b0-c5c9-40a6-be35-0a12919d8033.png`.

```text
Use case: ui-mockup targeted correction. Edit the attached Vixora mobile form, preserving its 941x1672 portrait single-screen composition, exact fields, colors, typography and all data. REMOVE the entire extra block headed 'Referencia de producto' with iPhone15/SKU. That block is invalid: this appointment has ONLY the readonly Equipo (IMEI) U-0102 · …0102 reference. Do not replace it with any other product field or related product card. Move Nota and summary/action area upward naturally using the freed space, with ample breathing room. Correct the note character counter to exactly '38/500' for 'Quiere ver el equipo antes de decidir.'. Keep unit reference, selected28oct11–11:30, no stockreservation, all other content unchanged. No new fields. Keep one mobile screen, no deviceframe.
```

### Corrección 2

Entrada: `exec-22ee1ea9-87e1-42c6-9ed0-cb324e43530f.png`. Salida: `exec-c951f160-904e-47d7-bf99-f524e8fba95e.png`.

```text
Use case: ui-mockup. Targeted text-only correction to attached Vixora desktop Nuevo turno. Preserve exact 1672x941 composition, fields, values, layout, controls, palette, all text. Change ONLY the tiny textarea character counter at bottom right from '35 / 500' to '38 / 500'. The note is 'Quiere ver el equipo antes de decidir.' which has38characters. Do not alter anything else, no new fields or references.
```

### Corrección 3

Entrada: `exec-c951f160-904e-47d7-bf99-f524e8fba95e.png`. Salida: `exec-6e862b73-cb7e-49e9-87a9-34e0b33213df.png`.

```text
Use case: ui-mockup. Precise text correction only. In this attached Vixora desktop Nuevo turno, the same inventory unit U-0102 from the approved previous inventory mockups has fictitious IMEI ending1422. Replace BOTH occurrences of the masked IMEI suffix '…0102' with '…1422'. Keep unit identifier U-0102 unchanged in BOTH occurrences. Preserve everything else exactly including 1672x941 format, note38/500, selectedslot28oct11–11:30, all fields, layout and color. No additional changes.
```

### Corrección 4

Entrada: `exec-151bb5b0-c5c9-40a6-be35-0a12919d8033.png`. Salida: `exec-28a04d0b-b1d1-48fa-ab7a-bb5568011fd0.png`.

```text
Use case: ui-mockup. Precise text-only correction to this attached Vixora mobile form. The readonly unit reference must be 'Equipo (IMEI): U-0102 · …1422', because U-0102 from the prior inventory mockups has IMEI ending1422. Replace ONLY the masked suffix …0102 by …1422. Keep unitID U-0102 unchanged. Keep 941x1672 portrait, all fields, selecteddate28/10/2026and11–11:30, note38/500, layout, spacing and palette exactly unchanged. Do not add productreference or any newblocks.
```

## Archivos finales

Raíz de originales y variantes: `C:/Users/benja/.codex/generated_images/01a1412b-553e-7060-8d8b-7317f5b80bdf/`.

| Destino en este lote | Original final |
|---|---|
| desktop/01-calendario-semanal-v2.png | exec-8caeebc8-a56f-462a-9da7-ea092346a5b3.png |
| desktop/02-agenda-diaria-v2.png | exec-faa601d2-50e5-4d98-89b4-0bff11123537.png |
| desktop/03-nuevo-turno-v2.png | exec-6e862b73-cb7e-49e9-87a9-34e0b33213df.png |
| desktop/04-turno-pedido-agente-v2.png | exec-a85f1c60-17e3-4d89-a297-d7682852e157.png |
| desktop/05-turno-confirmado-atencion-v2.png | exec-db630cb6-63bc-464c-b10f-7831ba862b16.png |
| desktop/06-configuracion-agenda-v2.png | exec-87988fa1-9f80-4a59-b508-8d6e96bba87e.png |
| desktop/07-motivos-turnos-v2.png | exec-521fbe22-27c3-4119-8443-252169dfc50b.png |
| mobile/08-agenda-diaria-mobile-v2.png | exec-ec41bb60-e1e9-4c64-9232-88c406adf68c.png |
| mobile/09-nuevo-turno-mobile-v2.png | exec-28a04d0b-b1d1-48fa-ab7a-bb5568011fd0.png |
| estados/10-estados-conflictos-turnos-v2.png | exec-37b0dcc5-5fcf-442d-8b07-c2b56c37cd43.png |


