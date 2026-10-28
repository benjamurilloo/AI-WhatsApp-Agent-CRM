# Prompts — V2-05: Inventario y ficha de producto

Fecha: 27 de octubre de 2026. Herramienta: ImageGen integrada, modo ui-mockup. Siete imágenes finales, una llamada por imagen y tres ediciones dirigidas. Referencias del sistema visual: V2-04. Datos ficticios. No se modificó código.

## 1. Resumen operativo de producto

Destino: desktop/09-ficha-producto-resumen-v2.png

```text
Use case: ui-mockup. Create one high-fidelity Spanish Vixora CRM UI screen, beautifully crisp and readable, professional calm enterprise SaaS for iPhone retail. Flat orthographic screen only, no laptop frame, no presentation title outside UI. Match approved visual system: Manrope, background #F6F5FB, white cards, light sidebar #F1EEFB width 230px, ink #17142E, muted #5A5573, primary solid #6D28D9, selected #EDE7FE, 1px #E3DFF0 borders, 12px corners, minimal shadow. No dark sidebar, no gradients, no decorative charts. Icons outlined, status text plus icon, ample whitespace, clear labels and large click targets. Desktop landscape 16:9. Sidebar Vixora wordmark; Inicio; Atención; Catálogo e inventario expanded with Productos selected, Modelos, Grados, Usados; Servicio técnico; Comercial; Finanzas; Abastecimiento; Administración; footer Carla Méndez / Administradora. Topbar breadcrumb Productos and global search. Product header iPhone 13 · 128 GB · Medianoche, subtitle Usado · Grado A · SKU IP13-128-MN-A, outline Editar producto and overflow menu. Under header tabs Resumen / Unidades / Movimientos / Precios / Costos. Fictional demo data only. Keep currency USD explicit, never invent ARS conversion. No standalone delete button. Active tab Resumen. Header small back link Volver a productos. Four summary cards: Disponibles 3 / Reservadas 1 / En revisión 1 / Precio de venta USD 450. Small note Existencias físicas: 5 · Actualizado hace 1 min. Main large left card Inventario por estado with three clean horizontal rows: Disponible 3 Ver unidades; Reservada 1 Ver reserva; En revisión 1 Revisar unidad. Availability note Disponibles excluye reservas y unidades no vendibles. Right card Datos del producto: Modelo iPhone 13, Capacidad 128 GB, Color Medianoche, Condición Usado, Control Por unidad, Grado A. Bottom card Pendiente de revisión, unit U-0105, IMEI •••• 1425, batería 84 %, heading Checklist pendiente, secondary button Abrir unidad. Bottom slim card Últimos movimientos with Recepción REC-0081 · +5 unidades · 26 oct, Reserva PED-0182 · U-0104 · 27 oct, En revisión · U-0105 · 27 oct, link Ver movimientos. Top-right under tabs dominant action Ver unidades. Tiny footer Datos ficticios · Propuesta de diseño. Do not show margin/cost in this summary.
```

## 2. Unidades y ficha individual

Destino: desktop/10-unidades-ficha-imei-v2.png

```text
Use case: ui-mockup. Create one high-fidelity Spanish Vixora CRM UI screen, beautifully crisp and readable, professional calm enterprise SaaS for iPhone retail. Flat orthographic screen only, no laptop frame, no presentation title outside UI. Match approved visual system: Manrope, background #F6F5FB, white cards, light sidebar #F1EEFB width 230px, ink #17142E, muted #5A5573, primary solid #6D28D9, selected #EDE7FE, 1px #E3DFF0 borders, 12px corners, minimal shadow. No dark sidebar, no gradients, no decorative charts. Icons outlined, status text plus icon, ample whitespace, clear labels and large click targets. Desktop landscape 16:9. Sidebar Vixora wordmark; Inicio; Atención; Catálogo e inventario expanded with Productos selected, Modelos, Grados, Usados; Servicio técnico; Comercial; Finanzas; Abastecimiento; Administración; footer Carla Méndez / Administradora. Topbar breadcrumb Productos and global search. Product header iPhone 13 · 128 GB · Medianoche, subtitle Usado · Grado A · SKU IP13-128-MN-A, outline Editar producto and overflow menu. Under header tabs Resumen / Unidades / Movimientos / Precios / Costos. Fictional demo data only. Keep currency USD explicit, never invent ARS conversion. No standalone delete button. Active tab Unidades. Content under tabs has search Buscar IMEI o unidad, Estado Todos, battery filter, secondary Recibir unidades. Counters 5 físicas · 3 disponibles · 1 reservada · 1 en revisión. Clean table columns Unidad / IMEI / Batería / Grado / Estado. Rows U-0101 ••••1421 91% A Disponible; U-0102 ••••1422 88% A Disponible; U-0103 ••••1423 87% A Disponible; U-0104 ••••1424 90% A Reservada; U-0105 ••••1425 84% A En revisión. U-0101 selected. Right detail drawer width 470px overlays right portion but keeps identifiers/table partly visible, title Unidad U-0101, subtitle iPhone 13 · 128 GB · Medianoche, close icon. Small green badge Disponible. Group Identificación with IMEI •••• •••• ••• 1421 and icon-only reveal/copy named visually Mostrar and Copiar, Serie Sin registrar. Group Estado del equipo: Grado A, Batería 91 %, Checklist Verificado, link Ver checklist. Group Origen: Recepción REC-0081 · 26 oct 2026, link Ver recepción. Group Garantía: Por confirmar, document No hay documento de venta asociado, link Revisar política. Small note El grado estético no acredita funcionamiento ni cobertura. Footer secondary Editar unidad and primary Ver historial. Mark IMEI oculto · Datos ficticios. No active sale action for this drawer, no selling reserved units.
```

## 3. Movimientos y revisión de ajuste por unidad

Destino: desktop/11-movimientos-ajuste-trazable-v2.png

```text
Use case: ui-mockup. Create one high-fidelity Spanish Vixora CRM UI screen, beautifully crisp and readable, professional calm enterprise SaaS for iPhone retail. Flat orthographic screen only, no laptop frame, no presentation title outside UI. Match approved visual system: Manrope, background #F6F5FB, white cards, light sidebar #F1EEFB width 230px, ink #17142E, muted #5A5573, primary solid #6D28D9, selected #EDE7FE, 1px #E3DFF0 borders, 12px corners, minimal shadow. No dark sidebar, no gradients, no decorative charts. Icons outlined, status text plus icon, ample whitespace, clear labels and large click targets. Desktop landscape 16:9. Sidebar Vixora wordmark; Inicio; Atención; Catálogo e inventario expanded with Productos selected, Modelos, Grados, Usados; Servicio técnico; Comercial; Finanzas; Abastecimiento; Administración; footer Carla Méndez / Administradora. Topbar breadcrumb Productos and global search. Product header iPhone 13 · 128 GB · Medianoche, subtitle Usado · Grado A · SKU IP13-128-MN-A, outline Editar producto and overflow menu. Under header tabs Resumen / Unidades / Movimientos / Precios / Costos. Fictional demo data only. Keep currency USD explicit, never invent ARS conversion. No standalone delete button. Active tab Movimientos. Toolbar filters Tipo Todos, Período Últimos 30 días, search Buscar referencia, outlined Exportar, primary Ajustar inventario. Ledger table columns Fecha / Tipo / Unidad / Referencia / Responsable: 26 oct 10:20 Recepción +5 REC-0081 Carla;27 oct 09:10 Reserva U-0104 PED-0182 Carla;27 oct 09:35 Cambio de estado U-0105 Checklist pendiente Carla. Note Reservar cambia disponibilidad, no existencias físicas. Overlay right-side adjustment drawer title Revisar ajuste, eyebrow Control por unidad. Prominent warning outlined amber icon Se retirará una unidad del inventario. Fields Unidad U-0105 · IMEI ••••1425, Estado actual En revisión, Tipo Retiro por deterioro, Motivo Equipo dañado durante almacenamiento, Documento de respaldo acta-interna-027.pdf attached. Summary Antes 5 físicas · 3 disponibles · 1 reservada · 1 en revisión; Después 4 físicas · 3 disponibles · 1 reservada · 0 en revisión. Note No registra una venta ni modifica pedidos. Readonly Responsable Carla Méndez · 27 oct 2026. Footer Cancelar and primary Registrar ajuste. Not recorded yet, no success toast. No freely editable quantity for serialized phones. Clearly preserve traceability.
```

## 4. Precio de venta y revisión del cambio

Destino: desktop/12-precios-historial-v2.png

```text
Use case: ui-mockup. Create one high-fidelity Spanish Vixora CRM UI screen, beautifully crisp and readable, professional calm enterprise SaaS for iPhone retail. Flat orthographic screen only, no laptop frame, no presentation title outside UI. Match approved visual system: Manrope, background #F6F5FB, white cards, light sidebar #F1EEFB width 230px, ink #17142E, muted #5A5573, primary solid #6D28D9, selected #EDE7FE, 1px #E3DFF0 borders, 12px corners, minimal shadow. No dark sidebar, no gradients, no decorative charts. Icons outlined, status text plus icon, ample whitespace, clear labels and large click targets. Desktop landscape 16:9. Sidebar Vixora wordmark; Inicio; Atención; Catálogo e inventario expanded with Productos selected, Modelos, Grados, Usados; Servicio técnico; Comercial; Finanzas; Abastecimiento; Administración; footer Carla Méndez / Administradora. Topbar breadcrumb Productos and global search. Product header iPhone 13 · 128 GB · Medianoche, subtitle Usado · Grado A · SKU IP13-128-MN-A, outline Editar producto and overflow menu. Under header tabs Resumen / Unidades / Movimientos / Precios / Costos. Fictional demo data only. Keep currency USD explicit, never invent ARS conversion. No standalone delete button. Active tab Precios. Large left card Precio de venta with USD 450 and helper Vigente desde el 27 oct 2026 · 10:00. Information callout Solo para nuevas operaciones. Clean history table Fecha / Precio anterior / Nuevo precio / Responsable / Motivo:27 oct 2026 USD430 USD450 Carla Méndez Revisión comercial;20 oct 2026 USD420 USD430 Carla Méndez Actualización. Right 450px editing panel title Actualizar precio. Persistent labels Moneda select USD, Precio actual read-only 450, Nuevo precio input 460, Motivo Revisión comercial, Aplicación Al guardar. Review box USD 450 → USD 460, Cambio +USD 10, note No cambia ventas ni pedidos ya registrados. Footer Cancelar and primary Guardar precio. No cost/margin on this permission-separated page. No exchange rate selector or hundreds of currency options; USD relevant and ARS alternative only when dropdown open (do not open). Small footer Datos ficticios · Cambio todavía sin guardar.
```

## 5. Costos y margen por unidad

Destino: desktop/13-costos-margen-v2.png

```text
Use case: ui-mockup. Create one high-fidelity Spanish Vixora CRM UI screen, beautifully crisp and readable, professional calm enterprise SaaS for iPhone retail. Flat orthographic screen only, no laptop frame, no presentation title outside UI. Match approved visual system: Manrope, background #F6F5FB, white cards, light sidebar #F1EEFB width 230px, ink #17142E, muted #5A5573, primary solid #6D28D9, selected #EDE7FE, 1px #E3DFF0 borders, 12px corners, minimal shadow. No dark sidebar, no gradients, no decorative charts. Icons outlined, status text plus icon, ample whitespace, clear labels and large click targets. Desktop landscape 16:9. Sidebar Vixora wordmark; Inicio; Atención; Catálogo e inventario expanded with Productos selected, Modelos, Grados, Usados; Servicio técnico; Comercial; Finanzas; Abastecimiento; Administración; footer Carla Méndez / Administradora. Topbar breadcrumb Productos and global search. Product header iPhone 13 · 128 GB · Medianoche, subtitle Usado · Grado A · SKU IP13-128-MN-A, outline Editar producto and overflow menu. Under header tabs Resumen / Unidades / Movimientos / Precios / Costos. Fictional demo data only. Keep currency USD explicit, never invent ARS conversion. No standalone delete button. Active tab Costos. Permission chip Solo administración. Header Costos y margen, small secondary link Ver historial de costos. Selector Base de cálculo: Disponibles (3); moneda USD. Four clean metric cards Precio de venta USD 450; Costo promedio USD 360; Ganancia bruta estimada USD 90; Margen bruto estimado 20 %. Below plain formula (450 − 360) ÷ 450 × 100 = 20 %. Note Estimación antes de gastos e impuestos · No es ganancia neta. Table Costo por unidad with columns Unidad / Estado / Costo registrado / Precio de referencia / Ganancia estimada / Margen. Rows U-0101 Disponible USD350 USD450 USD100 22,2%; U-0102 Disponible USD360 USD450 USD90 20,0%; U-0103 Disponible USD370 USD450 USD80 17,8%. Subtotal Base: 3 disponibles · Costo total USD 1.080. Right narrow card Otras existencias: U-0104 Reservada USD355, U-0105 En revisión USD365; note Excluidas del cálculo seleccionado. Bottom pale card Historial de costos with U-0102 · USD355 → USD360 · Carla Méndez · Documento REC-0081, reason Costo de recepción corregido, link Ver trazabilidad. Top action Actualizar costo opens review only, no inline cost editing cells. Footer No modifica costos de ventas cerradas. No fabricated profit charts.
```

## 6. Ficha de unidad en móvil

Destino: mobile/14-unidad-mobile-v2.png

```text
Use case: ui-mockup. One crisp portrait 9:16 mobile Vixora CRM screenshot with no physical phone frame, Spanish enterprise UI, Manrope, background #F6F5FB, white cards, ink#17142E, muted#5A5573, solid violet#6D28D9, border#E3DFF0,12px corners,no gradients. Top mobile status bar09:41. Header back arrow Unidades, title Unidad U-0101, overflow menu. Subtitle iPhone 13 · 128 GB · Medianoche and green icon+text Disponible. Two tabs Detalle selected, Historial. Card Identificación: IMEI •••• •••• ••• 1421 with separate outline buttons Mostrar and Copiar, small text Datos ficticios; Serie Sin registrar. Card Estado del equipo with two-column labeled values Batería91%, GradoA; Checklist Verificado link Ver checklist. Card Origen: Recepción REC-0081,26 oct2026, link Ver recepción. Card Garantía: Por confirmar, text Sin documento de venta asociado, small link Revisar política. Small note El grado es una clasificación estética. Generous spacing and44px touch targets. Fixed footer above bottom navigation with single large violet Editar unidad button. Bottom nav Inicio / Chats / Clientes / Ventas / Más with Más selected. Footer and nav have safe areas and don't cover content. No cost or margin. No horizontal table.
```

## 7. Estados críticos de inventario

Destino: estados/15-estados-inventario-v2.png

```text
Use case: ui-mockup. A polished landscape 16:9 design-system state board for Vixora CRM, Spanish. Title Inventario · Estados y validaciones, subtitle Propuestas de interacción · Datos ficticios. Six separate UI cards in neat 3-column by2-row grid, generous whitespace, readable Manrope. Palette white cards on#F6F5FB,ink#17142E,muted#5A5573,borders#E3DFF0,violet#6D28D9,12px corners,no gradients. Each card shows a distinct useful state with specific real UI text, not generic lorem ipsum. Card1 Sin unidades disponibles, physical5,reservadas5,disponibles0; outline Ver reservas. Card2 No se pudo consultar el inventario, No mostramos cero cuando falla la consulta. Último dato conocido:3 disponibles · hace10min; violet Reintentar. Card3 IMEI ya registrado, input IMEI ficticio••••1421 outlined red, Ya pertenece a U-0101. Revisá la unidad existente. link Abrir U-0101, secondary Volver al formulario. Card4 Inventario actualizado por otra persona, La unidad U-0104 acaba de reservarse. Revisá los cambios antes de continuar. violet Actualizar datos; secondary Conservar borrador. Card5 Costos restringidos, lock icon, Tu rol no tiene acceso a costos y margen. button Volver al resumen. No underlying cost values visible. Card6 Ajuste por cantidad, example Cable USB-C · 1m, Stock actual12, Cantidad contada10, Diferencia−2, Motivo Recuento físico. violet Revisar ajuste. Small footer unit-based products require selecting each unit; example quantity form is only for quantity control. No success messages for unsubmitted forms. No destructive bright-red giant CTAs.
```

## Correcciones dirigidas

### Unidades y ficha individual

Imagen original: C:\Users\benja\.codex\generated_images\01a1412b-553e-7060-8d8b-7317f5b80bdf\exec-662dba83-6861-459e-a404-17382ac1ec82.png

```text
Edit only the status colors in this Spanish Vixora inventory screen. Preserve the complete image layout, all wording, typography, every number, all table rows and drawer content. Use the same green for Disponible; use BLUE for Reservada in the summary and U-0104 row; use AMBER for En revisión in the summary and U-0105 row. These are inventory status colors, distinct from violet selection. Do not change any other part.
```

### Costos y margen por unidad

Imagen original: C:\Users\benja\.codex\generated_images\01a1412b-553e-7060-8d8b-7317f5b80bdf\exec-69f12eff-3082-4ecb-b710-ad7fada9de33.png

```text
Make these precise small corrections only to this Spanish Vixora screen, keeping the whole layout, cards, tables, wording, all costs, margin figures and formulas unchanged. In the bottom Historial de costos row replace the erroneous date 12/08/2024 10:24 with 26/10/2026 11:00. In Otras existencias use BLUE dot for Reservada and AMBER dot for En revisión. Remove the tiny instructional caption under Actualizar costo (Abre revisión, no edita directamente.), leaving whitespace. Preserve every other detail.
```

### Estados críticos de inventario

Imagen original: C:\Users\benja\.codex\generated_images\01a1412b-553e-7060-8d8b-7317f5b80bdf\exec-8ac3f46e-64c9-4031-b3fd-03b146ab1cb1.png

```text
Edit only the explanatory sentence in the top middle card No se pudo consultar el inventario. Replace No mostramos cero cuando falla la consulta. with this exact customer-facing copy: Inventario sin actualizar. Reintentá para consultar la disponibilidad actual. Preserve title, last-known value 3 disponibles hace 10 min, Reintentar button and every other element of all six cards, typography, colors, numbers and layout. Do not change anything else.
```

## Originales seleccionados

- desktop/09-ficha-producto-resumen-v2.png: C:\Users\benja\.codex\generated_images\01a1412b-553e-7060-8d8b-7317f5b80bdf\exec-c5b3199f-a07e-4b68-9006-eddbe7584447.png
- desktop/10-unidades-ficha-imei-v2.png: C:\Users\benja\.codex\generated_images\01a1412b-553e-7060-8d8b-7317f5b80bdf\exec-50680fa4-8b37-405f-bac7-b8d062b533f5.png
- desktop/11-movimientos-ajuste-trazable-v2.png: C:\Users\benja\.codex\generated_images\01a1412b-553e-7060-8d8b-7317f5b80bdf\exec-1905e510-b903-427b-9b95-c370d5e61cb3.png
- desktop/12-precios-historial-v2.png: C:\Users\benja\.codex\generated_images\01a1412b-553e-7060-8d8b-7317f5b80bdf\exec-0a6c4f79-dbb1-4669-b7ff-3059dfd419dc.png
- desktop/13-costos-margen-v2.png: C:\Users\benja\.codex\generated_images\01a1412b-553e-7060-8d8b-7317f5b80bdf\exec-6ab6b863-bad9-4cfd-b3b7-4c627f0dc593.png
- mobile/14-unidad-mobile-v2.png: C:\Users\benja\.codex\generated_images\01a1412b-553e-7060-8d8b-7317f5b80bdf\exec-749c4c24-a02a-4667-b9b2-e8563d7f42ef.png
- estados/15-estados-inventario-v2.png: C:\Users\benja\.codex\generated_images\01a1412b-553e-7060-8d8b-7317f5b80bdf\exec-87622b0a-3424-4677-ba58-169ff9bfea7b.png

