# Pedidos — V2-09

Fecha: 27 de octubre de 2026. Ocho imágenes de Pedidos y seis de [Ventas](../20-ventas/README.md): catorce piezas en total para el lote. Se amplía el rango orientativo del plan para representar por separado reserva, entrega, emisión, señas, cobro y anulación. Todas usan datos ficticios.

| # | Vista de Pedidos | Imagen |
|---|---|---|
| 01 | Listado y filtros por estado | [Pedidos](desktop/01-listado-pedidos-v2.png) |
| 02 | Alta y selección de equipos | [Nuevo pedido](desktop/02-nuevo-pedido-unidades-v2.png) |
| 03 | Ficha pendiente y revisión de reserva | [Confirmar pedido](desktop/03-pedido-pendiente-confirmar-v2.png) |
| 04 | Señas, recibo previo y previsión del registro | [Registrar seña](desktop/04-pedido-sena-v2.png) |
| 05 | Confirmado y revisión de entrega | [Entregar](desktop/05-pedido-confirmado-entrega-v2.png) |
| 06 | Entregado y revisión de emisión | [Emitir venta](desktop/06-pedido-entregado-emitir-venta-v2.png) |
| 07 | Ficha operativa en móvil | [Pedido móvil](mobile/07-ficha-pedido-mobile-v2.png) |
| 08 | Conflictos y decisiones compartidas | [Estados de pedidos y ventas](estados/08-estados-pedidos-ventas-v2.png) |

El resto del lote está en el [índice de Ventas](../20-ventas/README.md): listado, alta de mostrador, ficha/cobro con permuta, anulación, comprobante y alta móvil. [Prompts completos del lote](prompts-v2-09.md). [Índice global V2](../manifest-v2.md).

## Base y alcance

Se parte del [inventario de pantallas](../../00-auditoria-actual/inventario-pantallas-v2.md) y del [plan de lotes](../../00-auditoria-actual/plan-lotes-v2.md). Se consultaron solo en lectura el [ADR del pedido](../../../decisions/0020-el-pedido.md), el [ADR de la venta](../../../decisions/0021-la-venta.md), el [ADR de cobros y caja](../../../decisions/0022-cobros-y-caja.md), el [brief de unidades en pedidos y ventas](../../../decisions/brief-29.5.2-las-unidades-en-pedidos-y-ventas.md), y las pantallas, formularios, mensajes y servicios locales de orders, sales y cash.

Las decisiones se contrastaron con el código actual: las notas antiguas de los ADR o briefs sobre limitaciones del agente pueden haber sido reemplazadas por fases posteriores. El rediseño conserva el origen Agente y las unidades que ya trae un pedido; no vuelve a imponer la restricción antigua de no admitir pedidos de unidades desde el agente.

Durante este lote no se recorrió otra vez la aplicación desplegada ni se leyeron registros reales. No se ejecutaron la aplicación, pruebas o migraciones, y no se modificó código, configuración o datos del CRM. La evidencia funcional es local y puede cambiar con el desarrollo en curso.

## Navegación y prioridad de acciones

Comercial agrupa Pedidos y Ventas. El listado de pedidos tiene una acción principal, Nuevo pedido; cada fila abre su ficha. No se llenan las filas con botones Confirmar, Entregar, Señar y Cancelar. El número identifica el pedido, el estado explica el compromiso y el origen indica si empezó en el equipo o en el agente.

La ficha reúne Resumen, Señas y Actividad. Se conserva cliente, número, moneda y estado al cambiar de pestaña. El siguiente paso depende del estado:

| Estado | Acción principal | Acciones complementarias |
|---|---|---|
| Pendiente | Confirmar pedido | Registrar seña si corresponde; cancelar en menú |
| Confirmado | Marcar entregado | Registrar seña si corresponde; cancelar en menú |
| Entregado sin venta vigente | Emitir venta | Consultar señas e historial |
| Entregado con venta vigente | Ver venta | Consultar historial |
| Cancelado | Consultar historial/cuenta | Sin reapertura ni edición |

Señas y cancelación no compiten visualmente con el siguiente paso operativo. Las confirmaciones abiertas tienen una única acción primaria; el botón que las abrió queda deshabilitado o se oculta hasta cerrar la revisión. En un panel modal el fondo es inerte; en una confirmación en línea no deben quedar dos botones activos que ejecuten la misma transición.

Volver al listado conserva filtros, página y posición. Los filtros actuales de Pedidos son número, cliente y estado; no se añade aquí un filtro de fecha como si ya existiera. Los contadores por estado son una propuesta de lectura y deben usar el mismo ámbito de cliente/número que el listado; no sumar monedas ni incluir cancelados como ventas.

## Crear y seleccionar equipos

Un pedido requiere cliente existente y activo y al menos una línea válida. Se propone un formulario compacto con buscador de producto y resumen lateral. Una sola línea agrupa cada producto. Agregar producto y quitar una línea son operaciones del borrador; no editan un pedido ya creado.

Los productos por unidad se identifican mediante sus equipos. La cantidad es la cantidad de unidades elegidas. El selector muestra IMEI, grado, batería y precio de venta de cada unidad; admite selección múltiple y búsqueda. Los productos por cantidad conservan su campo numérico y no piden IMEI. El servicio no admite productos de reparación/servicio en este formulario: se cobran desde su orden de servicio.

La selección visual es provisional y no reserva stock. Usar selección modifica el formulario; Crear pedido guarda un único pedido Pendiente. Las unidades deben estar disponibles al crear y se vuelven a comprobar al confirmar. Un campo de escaneo/entrada permite agregar el IMEI completo; las fichas y chips del diseño lo muestran enmascarado. La implementación trabaja con identificadores reales y completos, nunca envía los puntos de la máscara como si fueran un IMEI. Debe ofrecer Mostrar/Copiar según los permisos y patrones de inventario.

El selector en panel, los chips y el resumen lateral son mejoras propuestas respecto del formulario actual con IMEI por renglón y lista de disponibles. La entrada manual y el lector de códigos deben seguir funcionando, incluyendo el recorrido sin JavaScript. No se incorpora cámara como función existente; el icono de escaneo no certifica acceso a cámara.

Precio por unidad significa su precio propio, si existe, o el precio vigente del producto. El ejemplo usa el precio del producto para las tres disponibles. Si hay precios distintos se muestran por equipo y se suma el total de la línea; no se fuerza un único precio promedio ni se confunde costo con precio.

La moneda viene de la primera línea y debe coincidir con los demás precios. No se agregan descuentos, impuestos, conversión de las líneas, envío o formas de pago al alta. Se conservan los límites y decimales del dominio; el sistema calcula el total definitivo con aritmética exacta.

Un cambio de precio detectado al crear devuelve el dato actualizado y exige revisar antes de reintentar. El dibujo USD 450 → 460 de la lámina corresponde a un borrador no guardado. Nunca recalcula el precio de P-000204 ya creado.

## Estado, reserva y entrega

| Operación | Equipo | Stock y dinero |
|---|---|---|
| Crear pendiente | Sigue disponible | No reserva, no registra dinero |
| Confirmar | Disponible → Reservada | Reserva exactamente los equipos guardados; no descuenta existencia física ni cobra |
| Cancelar pendiente | No cambia | No había reserva; las señas siguen su tratamiento de cuenta |
| Cancelar confirmado | Reservada → Disponible | Libera reserva; no devuelve dinero automáticamente |
| Entregar | Reservada → Vendida | Registra salida y libera reserva; no registra cobro |
| Emitir venta del entregado | Sigue vendida | Copia importes/equipos; no descuenta stock otra vez |

La reserva es íntegra: si una unidad dejó de estar disponible, no se confirma una parte del pedido. Se identifica la unidad y se mantiene Pendiente. Consultar disponibilidad no permite cambiar la unidad de las líneas guardadas. Para modificar cliente, líneas, equipos o cantidades de un pedido se cancela y se crea otro.

Confirmar usa los precios fijados al crear; no vuelve a cotizar silenciosamente. Cancelar o entregar un confirmado permite resolver sus reservas aunque un producto se haya desactivado, según las reglas actuales.

Entregado y Cancelado son finales. Entregar no exige que se haya señado o cobrado el total; el rediseño informa lo que falta, pero no añade ese bloqueo. El panel de entrega identifica cliente, equipo y efecto antes del cambio irreversible. Sus etiquetas Confirmado → Entregado son estados del pedido; el estado físico del equipo cambia de Reservada a Vendida. La implementación debe rotular esas dimensiones explícitamente, sin tratar Confirmado como estado de unidad.

Emitir venta está disponible desde un entregado sin venta vigente. La revisión copia cliente, líneas, unidades y total del pedido. La seña cuenta en esa venta y solo falta cobrar la diferencia. El número V se asigna al confirmar; no se anticipa un número garantizado ni se combina emitir y cobrar en una misma acción. Si ya existe una venta vigente se enlaza, sin emitir otra.

## Señas y cuenta del cliente

Un pedido Pendiente o Confirmado puede recibir señas hasta el importe que falta. Tener una seña no confirma ni reserva el pedido. El listado de recibos distingue vigentes y anulados; lo anulado no suma al total señado.

La propuesta mantiene la moneda del pedido y muestra medio, importe, lectura del monto y resumen antes de registrar. La seña de ejemplo usa Transferencia, por lo que no supone una sesión de efectivo ni produce una transferencia bancaria. Efectivo exige la sesión de caja abierta; las alternativas y las conversiones habilitadas por el sistema se detallan en el siguiente lote financiero. No se elimina esa capacidad porque no aparezca en el ejemplo.

Permuta no está disponible para señas. El crédito de un usado solo se aplica mediante un cobro de una venta elegible. No se incorpora como descuento, seña ni dinero que entra a caja.

La seña queda retenida para el pedido hasta emitir su venta, incluso si ya se entregó. Cancelar el pedido pasa lo señado a la cuenta del cliente: se aplica primero a sus ventas con saldo y el remanente queda a favor. No debe afirmarse que todo el importe se puede devolver o que siempre queda saldo a favor. La devolución de dinero, si corresponde, es una operación aparte.

Falta del total significa la parte no cubierta del pedido, no una obligación de señar el cien por ciento. El panel separa dato actual y previsión; no muestra el cambio como registrado hasta el éxito del servidor. Si el importe pendiente cambia mientras se carga, se conserva el formulario y se revisa el tope vigente.

## Móvil y accesibilidad

La ficha móvil conserva número, cliente, estado, siguiente acción y situación económica. El menú Más contiene Cancelar; no se ubica una acción irreversible junto al botón principal sin contexto. Inicio, Chats, Clientes, Ventas y Más forman la navegación global; Más queda seleccionado porque el destino actual es Pedidos. El contenido necesita espacio bajo la barra fija.

Los formularios y paneles deben admitir teclado, lector de pantalla, foco visible, etiquetas persistentes y errores asociados. Los chips de equipos se anuncian con producto, IMEI y precio; Quitar identifica la unidad afectada. Cada diálogo identifica la operación y sus efectos. El foco vuelve al disparador al cerrar. En cancelación la prioridad inicial es Conservar pedido.

Objetivos a verificar al implementar: contraste AA, zoom al 200 %, reflujo a 320 px, objetivos táctiles de al menos 44 px, filtros y tablas navegables, estado anunciado con texto e icono y mensajes de carga/error que no borren el borrador. Las imágenes no certifican estos comportamientos.

Admin crea y gestiona; viewer consulta lista, detalle, equipos, precios y recibos, sin botones de gestión. No se muestran costos. Los datos de contacto mantienen las restricciones existentes, sin ampliarlas por dibujar una ficha nueva.

## Datos ficticios y secuencia

Base del listado: martes 27 de octubre de 2026, antes de las 11:15, Buenos Aires (UTC−3).

| Pedido | Cliente | Equipo/total | Estado del listado | Origen |
|---|---|---|---|---|
| P-000204 | Nadia Castro | iPhone 13, 128 GB, Medianoche, usado; U-0102, IMEI …1422; USD 450 | Pendiente | Equipo |
| P-000203 | Tomás Quiroga | iPhone 14, un equipo; USD 560 | Confirmado | Agente, confirmado por una persona |
| P-000202 | Inés Vidal | iPhone 15, un equipo; USD 650 | Entregado | Equipo |
| P-000201 | Leonel Sosa | iPhone 12, un equipo; USD 320 | Cancelado | Equipo |

P-000204 fue creado el 27 oct a las 09:40 por Carla Méndez. R-000180, Transferencia, USD 100, se registró a las 10:00. Total 450 menos 100 = 350 por cubrir. En la imagen de señas se prepara otro ingreso de USD 50: después quedarían USD 150 señados y USD 300 por cubrir, pero ese registro no se guardó.

Las imágenes son momentos de interacción y no capturas simultáneas: el alta precede a P-000204; la ficha Pendiente conserva la situación base; la ficha Confirmado representa el paso posterior de las 11:15; la revisión de entrega ocurre a las 11:20; el entregado de las 11:25 se revisa para emitir su venta a las 11:30. La seña adicional de USD 50 queda fuera de esa secuencia y no cambia el depósito de USD 100 en las demás pantallas.

U-0101/…1421/91 %, U-0102/…1422/88 % y U-0103/…1423/87 % conservan los ejemplos de [Inventario V2-05](../05-productos/README-v2-05.md); grado A y precio USD 450. Al principio están disponibles. Se elige solo U-0102. El [borrador de turno de Nadia del lote anterior](../18-turnos/README.md) tampoco reservaba esa unidad: no garantiza que siga disponible después de estos pasos.

Los conflictos de la lámina son alternativas, no cambios ocurridos en la base: U-0102 reservada por otro pedido impide confirmar P-000204; cancelar P-000203 ejemplifica una reserva y una seña que deben resolverse; P-000202 ya se vincula a V-000219. El precio nuevo de USD 460 no se aplica a pedidos guardados.

## Cobertura y continuidad

La lámina compartida muestra unidad no disponible, cambio de precio al crear, cancelación, venta ya existente, cobro rechazado y efectos de anulación por origen. Vacío inicial, filtros sin resultados, carga, error de red y falta de permisos reutilizan los patrones globales. Productos inactivos/sin precio, monedas incompatibles, IMEI repetido, cliente inactivo, datos borrados y conflicto de estado se especifican funcionalmente; no tienen una imagen independiente para cada rechazo.

Actividad reutiliza la cronología con actor, fecha y cambio; no inventa una edición de líneas ni muestra secretos de la credencial del agente. El origen Agente describe la creación, no quién confirmó o entregó después.

Próximo lote: V2-10 — Caja y cuentas de clientes, con sesiones, devoluciones, saldos, cambio de moneda y medios de pago. El detalle financiero de estas funciones no se da por rediseñado completo en este lote.

Sistema visual, producción y dimensiones: [Ventas V2-09](../20-ventas/README.md#sistema-visual-y-producción). Prompts y correcciones: [V2-09](prompts-v2-09.md).

