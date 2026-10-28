# Prompts del lote V2-01

Herramienta utilizada: ImageGen integrada. Categoría: ui-mockup. Cada bloque recoge el prompt final de diseño, incorporando las correcciones aceptadas. Son especificaciones reutilizables para generar variantes; el resultado sigue requiriendo revisión visual.

## Base compartida

Create a high-fidelity, realistic shippable Vixora CRM UI mockup for an iPhone retail and repair business, in accurate Spanish. Manrope typography. Background #F6F5FB, white surfaces, sidebar #F1EEFB, ink #17142E, muted #5A5573, borders #E3DFF0, primary #6D28D9, selected #EDE7FE. Flat 1px borders, 12px corners, restrained shadows. Clear hierarchy, comfortable touch targets, status icon plus text. Full app canvas without device frame, browser chrome or watermark. Data is fictional. Preserve the original brand identity; generated logo variations are placeholders for the original asset.

## 01 — Navegación de escritorio

Wide 16:9 screen. Left sidebar 270px with Vixora, Inicio active; Atención expanded (Conversaciones badge 8, Clientes, Turnos); Catálogo e inventario expanded (Productos, Modelos, Grados, Usados); collapsed Servicio técnico, Comercial, Finanzas, Abastecimiento, Administración. User Carla Méndez / Administradora at bottom. Top bar breadcrumb Inicio / Espacio de trabajo, global search Buscar cliente, IMEI, venta o reparación… and Ctrl K, notification bell, CM avatar. Heading Espacio de trabajo, subtitle Cada operación, en su lugar. Six main group cards list all destinations: Atención; Catálogo e inventario; Servicio técnico (Reparaciones, Técnicos); Comercial (Pedidos, Ventas); Finanzas (Caja, Cuentas de clientes, Tipo de cambio); Abastecimiento (Compras, Recepciones, Pagos, Proveedores). Administration strip Información, Horarios, Usuarios. Optional favorites Nueva venta, Recibir equipo, Nuevo turno. Personalizar accesos secondary button.

## 02 — Más móvil

Tall 9:16 single screen. Header Vixora and Buscar. Heading Más, subtitle Todos tus módulos, organizados. Search Buscar un módulo. Large accordion rows: expanded Catálogo e inventario (Productos, Modelos, Grados, Usados), Servicio técnico (Reparaciones, Técnicos), Atención (Turnos). Collapsed Finanzas, Abastecimiento, Administración. User block Carla Méndez / Administradora. Fixed bottom nav Inicio, Chats, Clientes, Ventas, Más selected. Comfortable rows and no overlap. Additional destinations remain available through scroll.

## 03 — Dashboard de escritorio

Wide 16:9 operational dashboard. Same grouped sidebar, Atención and Servicio técnico expanded. Header Tu negocio, hoy; Martes 27 de octubre · iPhone Demo. Today date control and primary Nueva venta split button. Secondary Recibir equipo, Nuevo turno, Registrar cobro. Four KPI cards: Ventas de hoy ARS 2.450.000 / 6 operaciones; Turnos de hoy 8 / 3 por atender; Reparaciones abiertas 14 / 4 listas para entregar; Caja ARS 780.000 / Sesión abierta. Dominant Requiere atención list: 3 presupuestos por aprobar; 4 equipos listos para entregar; 2 variantes con stock bajo; 5 pedidos pendientes with description Pedidos de clientes por preparar o entregar. Aligned action links. Upcoming appointments: 14:30 Lucía Gómez / Cambio de batería / Confirmado; 15:00 Martín Ruiz / Retiro de equipo / Confirmado; 15:30 Ana López / Diagnóstico / Pendiente. Bottom Cobros de los últimos 7 días, Ingresos cobrados, total ARS 12.840.000, values 1.620.000, 2.180.000, 1.950.000, 2.760.000, 1.890.000, 1.240.000, 1.200.000; labels Mié 21, Jue 22, Vie 23, Sáb 24, Dom 25, Lun 26, Mar 27. Recent activity sale, repair, used intake. Footer Datos ilustrativos.

## 04 — Dashboard móvil

Tall 9:16 single screen. Header Vixora, search, bell. Tu negocio, hoy; Mar 27 oct · iPhone Demo. Primary Nueva venta; secondary Recibir equipo and Nuevo turno. Two by two KPI cards match desktop amounts and counts. Requiere atención list with 3 presupuestos por aprobar, 4 equipos para entregar, 2 variantes con stock bajo. Próximo turno 14:30 Lucía Gómez, Cambio de batería, Confirmado, Ver agenda. Link Ver métricas comerciales. Fixed bottom nav Inicio selected, Chats, Clientes, Ventas, Más. Large readable mobile type and comfortable controls.

## 05 — Búsqueda global

Wide 16:9 screen using dashboard 03 as gently dimmed background. Centered white command dialog title Buscar en Vixora, Esc and close control. Focused search contains Lucía. Subtitle Clientes, equipos, ventas, reparaciones y turnos. Filter chips Todos (4), Clientes (1), Equipos / IMEI (0), Operaciones (3). Group CLIENTES: Lucía Gómez / Cliente · +54 11 5555 0182, selected soft violet row, Abrir ficha. REPARACIONES: REP-0248 · iPhone 13 / Lucía Gómez · Cambio de batería, Listo para entregar. TURNOS: 27 oct · 14:30 / Lucía Gómez · Cambio de batería, Confirmado. VENTAS: VTA-0106 · iPhone 13 128 GB / Lucía Gómez · 23 oct / ARS 820.000. Footer 4 resultados · Solo contenido al que tenés acceso; keyboard hints arrows Navegar, Enter Abrir, Esc Cerrar. Keep modal text unchanged when aligning the background with dashboard 03.

## 06 — Estados comunes

Wide 16:9 design board titled Vixora · Estados y accesibilidad. Six panels in a 3x2 grid. Cargando: skeleton and Cargando reparaciones…; Sin resultados: No encontramos coincidencias, Probá otro nombre, IMEI o número, Limpiar filtros; Error recuperable: No pudimos cargar los turnos, Tus cambios guardados siguen disponibles, Reintentar / Volver; Sin permiso: No tenés acceso a esta sección, Consultá con la persona administradora, Ir al inicio; Formulario accesible: persistent labels, invalid phone 11 555 and Ingresá un teléfono completo, focused Nombre with Lucía Gómez; Confirmación y cambios: Cambios guardados toast and ¿Salir sin guardar?, Tenés cambios pendientes, Seguir editando / Descartar cambios. Bottom goals Contraste AA, Teclado completo, Estado con icono y texto, Áreas táctiles de 44 px, Avisos para lector de pantalla. Safe interaction priority and final destructive button styling are specified in manifest-v2.md.
