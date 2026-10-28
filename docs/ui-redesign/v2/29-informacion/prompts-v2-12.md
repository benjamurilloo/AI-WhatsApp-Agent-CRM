# Prompts V2-12 — Información, horarios y usuarios

28 de octubre de 2026. ImageGen integrada, una llamada por pieza. Estado: completo y verificado. Datos ficticios; no se modifican código ni datos del CRM. Las piezas 01–10 usan base de escritorio; la 11 (primer ingreso), las móviles 12–13 y estados 14 usan la base breve para evitar navegación de administración fuera de contexto.

## Base de escritorio literal

```text
Use case: ui-mockup. Produce ONE high-fidelity desktop Vixora CRM interface, landscape 1672×941, crisp readable Spanish, no device frame or collage. Approved professional iPhone retail ERP V2: Manrope, white cards, flat #F6F5FB background, pale #F1EEFB sidebar, ink #17142E, secondary #5A5573, 1px #E3DFF0 borders, solid primary #6D28D9, selection #EDE7FE, 12px corners, minimal shadows. No gradients, glass, darksidebar or newbrand. Sidebar Vixora wordmark, Inicio, Atención, Catálogo e inventario, Servicio técnico, Comercial, Finanzas, Abastecimiento, Administración EXPANDED children Información, Horarios, Usuarios. Select correct child. Top global search, 28 oct 2026 12:30 · Buenos Aires, CM avatar. Carla Méndez / Administradora at sidebarfoot. One dominant primary per screen, secondary outlined, destructive in Más then focusedreview. Dialog background inert/dim with primarymuted; safe option has focus. Persistent labels, large tap targets, text plusicon statuses. Footer Datos ficticios · Propuesta de diseño. Fake domain email@example.com only. Do not invent contact data, integrations, permissions, role types, password resets, email invitations, autosave, sessionmonitoring, tax or pricing. Display only specified screen, no developerannotations. 
```

## Base breve literal

```text
Use case: ui-mockup. High-fidelity Spanish Vixora CRM, approved V2 design. Manrope, white surfaces, #F6F5FB background, #F1EEFB secondary, #17142E text, #5A5573 secondary, #E3DFF0 borders, solid #6D28D9 primary, #EDE7FE selection. 12pxcorners, verysubtleshadows, crisp readabletext, outlineicons, no gradients/darksidebar/watermark. 
```

## 1 — Base de conocimiento

Destino: `29-informacion/desktop/01-base-conocimiento-v2.png`.

```text
Title Información del negocio, subtitle Contenido que el agente puede consultar. Tabs Entradas selected / Horarios. Primary Nueva entrada, secondary Ver horario de atención. Search Buscar en título, categoría y contenido, Estado Todas filter. Table5rows: Retiro de equipos | Atención | Vigente green | Sin límite | Ver; Entrega especial de noviembre | Entregas | Programada violet |01/11/2026–07/11/2026|Ver; Atención de septiembre |Atención|Vencida gray|01/09/2026–30/09/2026|Ver; Atención por WhatsApp|Horarios|Vigente green|Sin límite|Ver; Catálogo anterior|General|Inactiva gray|Sin límite|Ver. Clear quiet notice Solo las entradas vigentes se ofrecen al agente. Las fechas usan la zona del negocio. No published/draft state, no AItraining/sync progress, no editiconon everyrow, no categorycounts needed.
```

## 2 — Nueva entrada y vigencia

Destino: `29-informacion/desktop/02-nueva-entrada-v2.png`.

```text
Full page Nueva entrada, 2-column mainform and previewcard. Required title input Retiro con autorización, category input Atención with editable suggestedcategoriesnotfixedtaxonomy. Large PLAIN TEXT textarea exactcontent: Si retira otra persona, consultá previamente con el local y presentá el comprobante de recepción. Helper Texto plano · Hasta 4.000 caracteres, no richtexttoolbar. Optional validfrom01/11/2026 and validuntil07/11/2026, endinclusive, timezoneBuenosAires read-only. Previewpanel titled Vista previa · Sin guardar with same title, badge Programada, Será vigente del1al7denoviembre. Note Crear la entrada no envía mensajes. El agente solo consulta contenido vigente. Bottom Cancelar and primary Crear entrada. No enabledswitch fornewentry, no PublishorDraftbutton, no livechat answer simulation, no numberedrecord.
```

## 3 — Detalle y actividad

Destino: `29-informacion/desktop/03-detalle-entrada-v2.png`.

```text
Detail Retiro de equipos, categoryAtención, badgeVigente green, Vigencia Sin límite, primary Editar entrada and secondaryMás with menuclosed. Main full plaintextcontent: Para retirar un equipo, presentá el comprobante de recepción. Si retira otra persona, consultá previamente con el local. Separate side card Disponible para el agente · Vigente en la fecha local, not a deliveryguarantee or syncstamp. Tabs Contenido selected / Actividad; belowcompact activity Adminonly: Creada27oct09:00CarlaMéndez, Contenido actualizado28oct09:15DiegoLuna. No versionrestore. Notice El historial conserva los cambios; no reemplaza la vigencia. Más opensdesactivación onlyonrequest, notinforeground. No titlechange editing here no delete/print/export needed.
```

## 4 — Horario semanal

Destino: `30-horarios/desktop/01-horario-semanal-v2.png`.

```text
Title Horarios de atención, tabs Semana selected / Días especiales / Actividad. Zone America/Argentina/Buenos_Aires read-only and badge Abierto ahora · Cierra13:00 ·28oct12:30. Editable weeklytable with persistent columnlabels Día / Estado / Primer tramo abre-cierra / Segundo tramo abre-cierra. Mon,Tue,Wed,Thu,Fri each10:00–13:00 and16:00–19:00. Saturday10:00–13:00, no secondslot; SundayCerrado with fieldsdisabled. Eachopenrow can clearsecondslotvia labelledQuitartramo, onlyup to2, no perdaySave. Footer helper La semana se guarda completa. No admite tramos que crucen medianoche. Mainprimary Guardar semana, secondary Cancelar cambios. Separate small amber warning Existe una entrada vigente de texto: Atención por WhatsApp. Revisala para evitar contradicciones, linkVer entrada. Note Cambiar horarios no reprograma ni cancela turnos existentes; Revisar agenda link. No independentzoneeditinghere.
```

## 5 — Días especiales y alta

Destino: `30-horarios/desktop/02-dia-especial-v2.png`.

```text
Page Días especiales with tablebehinddialog,31/10/2026 Cerrado Inventario and03/11/2026 11:00–13:00 Atención especial; eachMásforremove, no Editar. ActiveHorario nav. Centerwide modal Agregar día especial, dateinput07/11/2026, optional Motivo Capacitación, radio Cerrado todo el día / Horario especial selectedHorarioespecial. Firstslot10:00–12:00, secondary Agregar segundo tramo. Summary Este horario reemplaza al semanal solo el7denoviembre. Horario habitualsábado10:00–13:00 → Especial10:00–12:00. Warning Revisá los turnos de esa fecha; no se mueven automáticamente. ZoneBuenosAires noneditable. Bottom safeVolver and primary Agregar día especial, no currentexistingdateasnewduplicate, no editexistingexception or autosave, no fakeholidaycalendar.
```

## 6 — Quitar excepción y auditoría

Destino: `30-horarios/desktop/03-quitar-dia-historial-v2.png`.

```text
PageHorarios Díasespeciales in dimmedbackground, with visible lowerhistorycard Actividad entries28oct08:00CarlaMéndez Agregó31/10 cerrado Inventario;27oct17:00CarlaMéndez Confirmósemana10–13/16–19. Foreground reviewdialog Quitar día especial del31/10/2026. Existing Closedallday ·MotivoInventario. Two explicit cards Ahora: Sábado31oct Cerrado / Al quitar: Se aplica horario semanal 10:00–13:00. Text Esto no borra el historial ni modifica turnos ya creados. No automaticrebook. Bottom secondaryVolver with focus, redQuitar día especial. No reasonnewinput, no massdelete, no editbutton. This reviewnotexecuted; keeporiginalhistoryandexceptionvisiblebehind. No arbitrarychangedweeklyhours.
```

## 7 — Usuarios

Destino: `31-usuarios/desktop/01-usuarios-v2.png`.

```text
List Usuarios, subtitle Acceso al CRM y roles del equipo, primaryNuevo usuario. SearchPor nombre o email, RolTodos, EstadoTodos. Fourtable rows Carla Méndez (vos) |carla.mendez@example.com|Administración ·admin|Activo|Ver; Diego Luna|diego.luna@example.com|Administración ·admin|Activo|Ver; Felipe Arias|felipe.arias@example.com|Consulta ·viewer|Activo|Ver; Lucía Moreno|lucia.moreno@example.com|Consulta ·viewer|Inactivo|Ver. Namealphabetic. Quietfooter4usuarios,2administradoresactivos (derivedillustrativescenario). Clearhelpcard Los roles definen el acceso. Desactivar impide ingresar y cierra las sesiones abiertas. No lastlogin/online/passwordcolumn, no invitationspending, no bulkdelete, no perrole granularpermissions. AdminsidebarUsuariosselected.
```

## 8 — Alta y alcance de roles

Destino: `31-usuarios/desktop/02-nuevo-usuario-v2.png`.

```text
Form Nuevo usuario, NameinputPaula Ríos and emailpaula.rios@example.com, two accessible radio cards with exact labels Consulta (viewer) SELECTED / Administración (admin) unselected. Viewerhelper Consulta pantallas habilitadas; sin administración de usuarios, compras ni costos. Adminhelper Gestiona operación, configuración y usuarios; accede a compras y costos. The roles are SINGLEchoice, no toggle forindividualmodules. Right summary Alta como usuario activo ·RolConsulta. Separatecalm securitynote Al crear, se genera una contraseña inicial. Se muestra una sola vez y debe cambiarse al ingresar. No se envía un email. Bottom Cancelar and primaryCrear usuario. No passwordentryonadminform, no selectorg/supplierrole/technicianrole. Thisispreparednotcreated.
```

## 9 — Ficha y cambio de rol

Destino: `31-usuarios/desktop/03-ficha-cambio-rol-v2.png`.

```text
Detail Felipe Arias, emailfelipe.arias@example.com read-only, badgeActivo, headerMássecondary includesdeactivateviaoverflowbutclosed. Section Datos de la cuenta: nameandemailread-only, no generalEditarDatosbutton. Rolactual Consulta(viewer). Editable rolecards draft Administración(admin) selected and Consulta unselected. Side preview Cambio sin guardar: Consulta → Administración; La cuenta accederá a gestión de usuarios, compras y costos al guardar. Primary Guardar rol, secondaryCancelar cambios groupedbelowrolecard. Separate subdued EstadodeaccesoActivo with explanatorydesactivateinsidemenúMás, no switchthatpersistswhileeditingrole. No passwordreset/reveal, no lastlogin, no sessionmonitor. Thispreparedrolechangehasnotoccurredinuserslist.
```

## 10 — Credencial inicial

Destino: `31-usuarios/desktop/04-credencial-inicial-v2.png`.

```text
Standalone successstate within desktopCRMUsuarios. Title Usuario creado, Paula Ríos, badgeConsulta(viewer). Focused centralcard Contraseña inicial, show ONLY obviousnonworkingdemo token EJEMPLO-NO-VALIDO inmonospace, buttonCopiar contraseña secondary, small label Credencial de demostración · Sin acceso real. Essentialcopy No se volverá a mostrar. Deberá cambiarla al ingresar. Entregala a la persona por el canal que acuerden. No se envía un email. Primary Entendido, volver a Usuarios, can conciseEntendidoconhelper. No fakeexpires24h, no regenerate/retrieve, no emailbutton, no print/export, no savedpasswordhistory, no reusablesecret. Renderclearlyonesuccessscreen, no createformbehind. Thisrepresentshypotheticalsuccessonly, no liveaccountactuallycreated.
```

## 11 — Primer ingreso

Destino: `31-usuarios/desktop/05-primer-ingreso-v2.png`.

```text
OVERRIDEdesktopchrome: ONE landscape1672×941 authentication page, no appsidebar/menu/contentbehind. Vixora wordmarktop, centered whitecard about600pxwide againstflat#F6F5FB. Smallstep iconshield. Title Elegí tu contraseña, subtitle Cambiá la contraseña inicial para continuar. Two persistentlabels Nueva contraseña / Repetir nueva contraseña, empty passwordfields with accessibleeyeicons Mostrar. Helper Entre12y128caracteres. Primaryfullwidth Guardar y continuar, secondaryCerrar sesión linkbelow. Do not ask currentpassword (alreadyinrequiredchangeflow), do notshowactualpassword, no strengthmeterarbitraryrulesoruppercase/symbolrequirements, no passwordsmailed, no skipstep, no admincredentials panel. TinyfooterDatosficticios Propuesta de diseño. RoleviewerPaula, no adminpermission displayed.
```

## 12 — Información móvil en consulta

Destino: `29-informacion/mobile/04-informacion-consulta-mobile-v2.png`.

```text
ONE PORTRAIT mobile screenshot941×1672. No desktopsidebar/header. Mobileheader Información del negocio, profileFAFelipeArias ·Consulta. Tabs Entradas / Horarios withEntradasactive. Searchtítulo,categoríaycontenido; EstadoVigentes. Two stacked cards Retiro de equipos ·Atención ·Vigente ·Sin límite and Atención por WhatsApp ·Horarios ·Vigente ·Sin límite. FirstcardEXPANDEDinline shows Para retirar un equipo, presentá el comprobante de recepción. Si retira otra persona, consultá previamente con el local. LinkVer detalle ifneeded. Text Solo las entradas vigentes se ofrecen al agente. Viewerreadonly: no plus,Nuevaentrada,Editar,Desactivar,Actividadprivileged. BottomnavInicio,Chats,Clientes,Ventas,Másselected, safeareaandbottompadding. Nothing hiddenbehindbar. FooterDatosficticios Propuesta de diseño. Smallstatusno datesinvented.
```

## 13 — Usuarios móvil

Destino: `31-usuarios/mobile/06-usuarios-mobile-v2.png`.

```text
ONE PORTRAIT mobile screenshot941×1672. Adminmobileheader Usuarios with avatarCM, simple primaryNuevo usuario. SearchNombreoemail, filtersRolTodos EstadoTodos. Fourcleanstackedcards CarlaMéndez(vos)carla.mendez@example.com Administración(admin)Activo Ver;DiegoLuna diego.luna@example.com Administración(admin)Activo Ver;FelipeArias felipe.arias@example.com Consulta(viewer)Activo Ver;LucíaMoreno lucia.moreno@example.com Consulta(viewer)Inactivo Ver. No percarddangerbuttonorcolumnscrammedtable. BottomnavInicio Chats Clientes Ventas Másselected, safearea. FooterDatosficticios Propuesta de diseño. 4usuarios 2adminsactivos. No loginstatuses/passwords/emailinvites. Touch44pxandclearlabels, foregroundoneprimaryonly.
```

## 14 — Estados y decisiones

Destino: `29-informacion/estados/05-estados-administracion-v2.png`.

```text
ONE landscape1536×1024 referenceboard 6panels, no appchrome. Title Administración · Estados y decisiones. Approvedpaletteandspaciousreadablecards. Panel1 Vigencia inválida: Desde01/11/2026 Hasta31/10/2026 with field errorLa fecha final debe ser igual o posterior a la inicial;Conservarformulario. Panel2 Horarios superpuestos:10:00–13:00 and12:00–19:00, errorEl segundo tramo debe empezar después del primero;no Guardaréxito. Panel3 Fecha ya utilizada:31/10/2026 Ya existe un día especial. Ver día especial;no overwritebutton. Panel4 Último administrador:No se puede quitar el rol ni desactivar al último administrador activo. NoticeEscenarioalternativo (notbaseline2admins). Panel5 review¿Desactivar tu propia cuenta? CarlaMéndez;Se cierra tu sesión. Otro administrador deberá reactivarte. SafeVolverfocused and redDesactivar mi cuenta. ThisalternativehasanotheractiveadminDiego, notlastadminpanel. Panel6 Reactivar entrada inactiva con período vencido: escenario alternativo Atención de septiembre está Inactiva y su vigencia terminó30/09/2026; al reactivarla conserva las fechas y pasa a Vencida. Show current badge Inactiva and projected badge Vencida, never Vigente. SafeVolver andsecondaryReactivar, linkEditar vigencia. No automaticvalidityreset, no actualoperationsperformed. FooterDatos ficticios · Propuesta de diseño. Do not invent nationalholidaycalendar, resettingsecrets, personaldata or newroles.
```

## Correcciones dirigidas

### Pieza 2

```text
Edit this Vixora new-entry form only. In the helper below Contenido, replace the mixed-language text with exactly «Texto plano · Hasta 4.000 caracteres.» Remove «no rich text» completely. Preserve all other content, form fields, preview, dates, actions, navigation, typography and dimensions.
```

### Pieza 3

```text
Edit this Vixora information detail only. Fix navigation: breadcrumb must read Administración > Información > Retiro de equipos, not Atención. Sidebar Administración stays expanded with Información highlighted; Atención must be unselected. Add the category label Atención as simple metadata next to the entry title/status. In right lower card remove the duplicate Contenido/Actividad tabs and instead use a plain heading «Actividad reciente», preserving both timeline items and explanatory note. Keep main Contenido/Actividad tabs only once. Keep all other text, amounts(none), dates, content, palette and layout.
```

### Pieza 4

```text
Edit this Vixora weekly hours form only. The Saturday row has no second interval. Replace its two disabled empty second-interval inputs with an outlined button «Agregar segundo tramo», fitting entirely within that cell; keep Saturday first interval10:00–13:00. Other five weekdays keep both intervals and Quitar tramo; Sunday remains closed. This button only prepares form fields, not autosave. Preserve every other label, note, value, layout and the sole primary Guardar semana.
```

### Pieza 6

```text
Edit this Vixora remove-special-day review only. Preserve foreground modal EXACTLY, including31/10, closed-to10:00–13:00 effect, safeVolver and redQuitar. Correct the visible background list so it has ONLY these TWO rows:31/10/2026 Sábado Cerrado Inventario;03/11/2026 Martes11:00–13:00 Atención especial. Remove invented24/12and25/12rows. Preserve history entries and allothercontent. Do not change date of reviewedexception. No newholidayrows, no operationperformed.
```

### Pieza 14

```text
Precise text edit of this existing Vixora administration reference board. Change ONLY the organization scope in panel4 Último administrador. In its description replace «último administrador activo del sistema» with «último administrador activo de esta organización». In its blue alternative-scenario note replace «un administrador activo en el sistema» with «un administrador activo en esta organización». Keep every other panel, field, date, error message, button, color, font and dimension unchanged. No newrole, no accountoperation performed.
```


