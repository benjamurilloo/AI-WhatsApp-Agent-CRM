# Vixora — Mockups V2

Serie iniciada el 27 de octubre de 2026, ampliada el 28 de octubre de 2026: 14 lotes, 145 imágenes y 26 carpetas de módulos o referencias. Los trece lotes originales se complementan con Análisis V2-14.

[Entrega final](README.md) · [Índice completo de imágenes](indice-final-v2.md) · [Criterios de implementación](criterios-implementacion-v2.md) · [Cobertura y variantes sin PNG independiente](cobertura-final-v2.md).

Propuestas visuales con datos ficticios. Generadas con la herramienta integrada ImageGen, revisadas visualmente y guardadas sin reemplazar V1. No constituyen implementación ni certificación de accesibilidad.

| # | Pantalla | Archivo |
|---|---|---|
| 01 | Navegación agrupada de escritorio | [Ver](00-arquitectura-global/desktop/01-navegacion-agrupada-v2.png) |
| 02 | Menú móvil Más | [Ver](00-arquitectura-global/mobile/02-menu-mas-v2.png) |
| 03 | Dashboard operativo de escritorio | [Ver](02-dashboard/desktop/03-dashboard-operativo-v2.png) |
| 04 | Dashboard móvil | [Ver](02-dashboard/mobile/04-dashboard-mobile-v2.png) |
| 05 | Búsqueda global | [Ver](00-arquitectura-global/desktop/05-busqueda-global-v2.png) |
| 06 | Estados y accesibilidad | [Ver](00-arquitectura-global/estados/06-estados-accesibilidad-v2.png) |

## Decisiones funcionales

- Inicio abre el dashboard operativo. El mapa del espacio de trabajo es una vista auxiliar accesible desde Más o el selector de módulos; no reemplaza el dashboard.
- Los grupos del menú se expanden de manera independiente, recuerdan su estado y mantienen abierta la sección actual. El contenido central tiene su propio desplazamiento. El menú lateral puede desplazarse sin perder el acceso al usuario.
- Técnicos es un acceso propuesto a una vista filtrada de proveedores/técnicos: no implica crear otra entidad duplicada. Cuentas de clientes, Horarios, Recepciones y Pagos son accesos directos a funciones existentes o vistas propuestas, sujetos a permisos.
- En móvil, Inicio, Chats, Clientes y Ventas permanecen en la barra inferior. Más contiene todos los destinos restantes, incluido Pedidos bajo Comercial, aunque quede fuera del recorte mostrado en el mockup. Los acordeones permiten acceder a todos sus hijos. La barra fija respeta el área segura y nunca tapa contenido.
- Una acción principal por pantalla. En Inicio se destaca Nueva venta; Recibir equipo y Nuevo turno son secundarios. Los favoritos son opcionales y dependen del rol. Recibir equipo abre un selector explícito Reparación / Usado o permuta para evitar ambigüedad.
- Cada pendiente del dashboard abre el listado correspondiente con su filtro aplicado. Equipos listos son reparaciones listas para entregar; pedidos pendientes son pedidos de clientes. Los contadores y la lista deben usar la misma definición.
- La fecha del dashboard filtra ventas, caja y turnos del período indicado. Reparaciones abiertas y alertas de stock son una fotografía actual y deben indicarlo al cambiar de fecha. Caja muestra moneda y sesión; con varias monedas muestra saldos separados, sin sumarlos sin una conversión explícita.
- Los ingresos cobrados se presentan separados de ventas registradas. El gráfico tiene alternativa de tabla. Los datos del mockup son ilustrativos y no fueron extraídos de clientes reales.
- La búsqueda funciona con nombre, teléfono, IMEI y número de operación; agrupa resultados por entidad y respeta permisos. Ctrl/Cmd+K abre, flechas recorren, Enter abre y Esc cierra. El foco queda dentro del diálogo y vuelve al disparador al cerrar. En móvil abre una vista de pantalla completa.
- Carga, vacío inicial, filtros sin coincidencias, error y falta de permiso son estados diferentes. Un error de red no debe sustituir datos válidos por ceros ni borrar el formulario.
- En una confirmación de pérdida de cambios, el foco inicial y la prioridad segura corresponden a Seguir editando. Descartar cambios debe tener tratamiento de acción destructiva secundario; el panel visual es ilustrativo y su botón violeta no define esa prioridad final.

## Sistema visual y accesibilidad

Se conservan los tokens de V1: fondo #F6F5FB, blanco, lateral #F1EEFB, texto #17142E, secundario #5A5573, borde #E3DFF0, primario #6D28D9 y selección #EDE7FE. Tipografía Manrope, bordes de 1 px y radios de 12 px. El logotipo definitivo sigue siendo el activo original de Vixora; las variaciones de la V en imágenes generadas no proponen reemplazarlo. En implementación se aplican colores planos a cabeceras y botones, aunque el render tenga leves variaciones tonales.

Objetivos a verificar al implementar: contraste AA, zoom al 200 %, reflujo a 320 px, objetivos táctiles de al menos 44 px, foco visible, estados con icono y texto, etiquetas persistentes, errores asociados al campo, anuncios de carga/guardado, teclado completo y reducción de movimiento. Las imágenes por sí solas no verifican estos comportamientos.

## Producción

Herramienta: ImageGen integrada. Se generó una imagen por pieza y se hicieron dos correcciones dirigidas: semántica/fechas del dashboard y fondo coherente de la búsqueda. Los originales permanecen en la carpeta de imágenes generadas. Solo se añadieron mockups y documentación a docs/ui-redesign/v2.

Prompts y criterios: [Lote V2-01](prompts-lote-v2-01.md).

## Lote V2-02 — Conversaciones y atención

Seis imágenes: bandeja de escritorio, chat con contexto, bandeja móvil, chat móvil, notas/control del agente y estados operativos.

Índice, decisiones funcionales y límites: [Conversaciones V2](03-conversaciones/README.md). Prompts: [V2-02](03-conversaciones/prompts-v2-02.md).

## Lote V2-03 — Clientes 360

Ocho imágenes: listado, alta/edición, ficha resumida, operaciones relacionadas, cuenta corriente/cobro, listado móvil, ficha móvil y etiquetas/actividad/estados.

Índice, decisiones funcionales y límites: [Clientes 360 V2](04-clientes/README.md). Prompts completos: [V2-03](04-clientes/prompts-v2-03.md).

## Lote V2-04 — Catálogo, modelos y grados

Ocho imágenes organizadas en carpetas de Productos, Modelos y Grados: catálogo agrupado, alta/edición de producto, listado/alta de modelos, ficha de modelo, atributos, grados/garantía, catálogo móvil y estados.

Índice y decisiones: [V2-04](05-productos/README.md). Módulos: [Modelos](13-modelos/README.md), [Grados](14-grados/README.md). Prompts completos: [V2-04](05-productos/prompts-v2-04.md).

## Lote V2-05 — Inventario y ficha de producto

Siete imágenes: resumen operativo, listado y detalle de unidades/IMEI, movimientos con revisión de ajuste, precios e historial, costos y margen, ficha de unidad móvil y estados críticos. Se conservan las tres unidades disponibles del ejemplo de catálogo; cinco existencias físicas incluyen una reserva y una unidad en revisión.

Índice, decisiones y límites: [Inventario V2-05](05-productos/README-v2-05.md). Prompts completos: [V2-05](05-productos/prompts-v2-05.md).

## Lote V2-06 — Reparaciones y técnicos

Once imágenes: órdenes, recepción de equipo de cliente, preparación de presupuesto, ficha operativa, comprobante/revisión de entrega, precios por modelo, técnicos/proveedores, reparación de unidad propia, reclamo de garantía, móvil y estados. Se amplía el lote para separar los tres tipos de orden presentes en el proyecto.

Índice, decisiones y límites: [Reparaciones V2-06](15-reparaciones/README.md). Módulo relacionado: [Técnicos](16-tecnicos/README.md). Prompts completos: [V2-06](15-reparaciones/prompts-v2-06.md).

## Lote V2-07 — Usados y permutas

Once imágenes: recepciones, equipo/checklist, valor/destino y confirmación, compra/pago, permuta y aplicaciones, cotizador orientativo, administración del checklist, reglas/márgenes, comprobante, ficha móvil y estados. Se distinguen vigencia del documento, estado físico de la unidad y situación del valor.

Índice, decisiones y límites: [Usados V2-07](17-usados/README.md). Prompts completos: [V2-07](17-usados/prompts-v2-07.md).

## Lote V2-08 — Turnos

Diez imágenes: calendario semanal, agenda diaria, alta con revisión, solicitud del agente, registro de atención, duración/cupo, motivos, agenda móvil, alta móvil y estados/conflictos. Se distingue la disponibilidad de la franja del estado del turno y se conservan las reglas actuales de confirmación, atención y cancelación.

Índice, decisiones funcionales y límites: [Turnos V2-08](18-turnos/README.md). Prompts completos: [V2-08](18-turnos/prompts-v2-08.md).

## Lote V2-09 — Pedidos y ventas

Catorce imágenes en dos carpetas: listado/alta de pedidos, selección de equipos, confirmación, señas, entrega, emisión desde pedido, listado/alta de ventas, cobro con permuta, anulación, comprobante, dos vistas móviles y estados compartidos. Reserva, salida física, emisión y cobro se presentan como pasos distintos.

Índices y decisiones: [Pedidos V2-09](19-pedidos/README.md) y [Ventas V2-09](20-ventas/README.md). Prompts completos y correcciones: [V2-09](19-pedidos/prompts-v2-09.md).

## Lote V2-10 — Caja y cuentas de clientes

Catorce imágenes en cuatro carpetas: caja abierta, apertura, movimiento, cierre, historial, cobros/recibo convertido, devolución, deudores, estado de cuenta, aplicación de cobro a cuenta, cotización/fuente/historial, medios de pago, caja móvil y estados compartidos. Los importes físicos, aplicados y orientativos se muestran separados.

Índice general y decisiones: [Caja V2-10](21-caja/README.md). Módulos relacionados: [Cuentas de clientes](22-cuentas-clientes/README.md), [Tipo de cambio](23-tipo-cambio/README.md) y [Medios de pago](24-medios-pago/README.md). Prompts completos: [V2-10](21-caja/prompts-v2-10.md).

## Lote V2-11 — Compras y proveedores

Diecisiete imágenes en cuatro carpetas: listado/alta/detalle de órdenes de compra, recepciones con IMEI y sin orden, revisión de anulación, listado/detalle de pagos, pago convertido, cuentas a pagar, pago a cuenta, proveedores, cuenta de proveedor, ficha de técnico, alta/edición, recepción móvil y estados compartidos. Se separan compromiso de compra, entrada física y pago; los trabajos reparados se integran a la cuenta del técnico.

Índice general y decisiones: [Compras V2-11](25-compras/README.md). Módulos: [Recepciones](26-recepciones/README.md), [Pagos y cuentas a pagar](27-pagos-proveedores/README.md), [Proveedores y técnicos](28-proveedores/README.md). [Prompts completos](25-compras/prompts-v2-11.md) y [verificación](25-compras/produccion-v2-11.md).

## Lote V2-12 — Información, horarios y usuarios

Catorce imágenes en tres carpetas: listado/alta/ficha de entradas, vigencia y actividad, semana de atención, alta y revisión de baja de día especial, usuarios, alta y cambio de rol, credencial inicial, primer ingreso, dos vistas móviles y estados compartidos. Se distinguen contenido vigente, horario estructurado y acceso de las personas, conservando los roles actuales.

Índice general: [Información V2-12](29-informacion/README.md). Módulos: [Horarios y días especiales](30-horarios/README.md), [Usuarios y primer ingreso](31-usuarios/README.md). [Prompts completos](29-informacion/prompts-v2-12.md) y [verificación](29-informacion/produccion-v2-12.md).

## Lote V2-13 — Consistencia, accesibilidad e índice final

Siete imágenes: sistema visual y estados, ubicación de acciones, validación de formularios, confirmaciones específicas, vacíos/carga/fallos, búsqueda con foco y teclado, formulario móvil con teclado abierto. Se mantiene la identidad violeta y se refuerza el contorno funcional de los controles; no se rediseña cada PNG anterior.

[Referencias V2-13](32-consistencia-accesibilidad/README.md) · [Prompts exactos](32-consistencia-accesibilidad/prompts-v2-13.md) · [Producción y verificación](32-consistencia-accesibilidad/produccion-v2-13.md).

Al cierre de V2-13 se habían entregado los 13 lotes del [plan general](../00-auditoria-actual/plan-lotes-v2.md), con 133 PNG reales. La ampliación V2-14 se registra a continuación. La cobertura distingue los patrones reutilizados y las variantes sin representación independiente; la implementación y la verificación de accesibilidad en la aplicación quedan pendientes.

## Lote V2-14 — Análisis y métricas del negocio

Ampliación solicitada después del cierre original: doce imágenes de resumen analítico, ventas, ranking de productos e inventario, fichas de producto/cliente con métricas, compradores y recurrencia, conversaciones y agente, servicio y turnos, finanzas y compras, desglose/definición, móvil y estados. Se propone Análisis junto a Inicio y pestañas contextuales, conservando el dashboard operativo.

[Propuesta e imágenes](33-analisis-metricas/README.md) · [Diccionario y dependencias](33-analisis-metricas/diccionario-metricas-v2-14.md) · [Escenario reconciliado](33-analisis-metricas/escenario-v2-14.md) · [Prompts](33-analisis-metricas/prompts-v2-14.md) · [Producción](33-analisis-metricas/produccion-v2-14.md).

Total actualizado: 145 PNG. V2-14 mantiene los 133 anteriores intactos y añade doce. Solo imágenes y documentación; las consultas nuevas, los permisos y la medición adicional se especifican sin implementarlos.
