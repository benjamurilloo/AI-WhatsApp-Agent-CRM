# Inventario y ficha de producto — V2-05

Continuación relacionada: [Reparaciones y técnicos — V2-06](../15-reparaciones/README.md), incluyendo el tratamiento de unidades propias. Precisión: las cinco existencias físicas de este ejemplo incluyen una en revisión; el saldo operativo del sistema cuenta solo las tres disponibles y la reservada. Retirar la unidad en revisión no debe restar nuevamente del saldo operativo.

Fecha: 27 de octubre de 2026. Siete imágenes de propuesta con datos ficticios. Complementan el [catálogo V2-04](README.md), sin reemplazarlo. Se conserva la paleta violeta aprobada.

| # | Vista | Imagen |
|---|---|---|
| 09 | Resumen operativo y disponibilidad | [Ficha de producto](desktop/09-ficha-producto-resumen-v2.png) |
| 10 | Unidades, IMEI y detalle individual | [Listado y panel de unidad](desktop/10-unidades-ficha-imei-v2.png) |
| 11 | Movimientos y revisión de ajuste | [Trazabilidad del inventario](desktop/11-movimientos-ajuste-trazable-v2.png) |
| 12 | Precio de venta, historial y cambio | [Precios](desktop/12-precios-historial-v2.png) |
| 13 | Costos por unidad y margen estimado | [Costos y margen](desktop/13-costos-margen-v2.png) |
| 14 | Ficha individual en móvil | [Unidad móvil](mobile/14-unidad-mobile-v2.png) |
| 15 | Errores, conflictos y control por cantidad | [Estados de inventario](estados/15-estados-inventario-v2.png) |

## Jerarquía y acciones

La ficha se divide en Resumen, Unidades, Movimientos, Precios y Costos. Se mantiene el producto y el contexto al cambiar de pestaña. Volver a productos recupera filtros, grupo expandido y posición del catálogo. En móvil, las pestañas de producto pueden desplazarse horizontalmente con indicación visible y acceso por teclado; el detalle de unidad tiene solo Detalle e Historial.

Resumen responde qué se puede ofrecer y qué está pendiente. Ver unidades es su acción principal; cada contador abre la lista filtrada. Editar producto modifica sus datos comerciales, no unidades físicas. El menú de desbordamiento contiene acciones secundarias según permisos; desactivar no borra movimientos ni ventas históricas.

Unidades reúne búsqueda por IMEI o identificador, filtros y el acceso a recepción. Seleccionar una fila abre el detalle. El resaltado de la fila abierta y la selección múltiple deben ser estados separados: la casilla dibujada no debe implicar una operación masiva sin barra de acciones y alcance explícito. Una unidad reservada muestra el pedido asociado; una unidad en revisión muestra el pendiente y el acceso a su checklist. No se fuerza una venta desde este panel.

Recibir unidades conduce al flujo existente de recepción según su origen: compra o usado/permuta. No abre una entrada genérica que omita proveedor, costo o trazabilidad. Los formularios correspondientes pertenecen a V2-07 y V2-11. Las fichas de venta y pedido se desarrollan en V2-09.

## Datos consistentes del ejemplo

El producto comercial de muestra conserva el SKU IP13-128-MN-A usado en V2-04. Tiene cinco unidades físicas: tres disponibles, una reservada y una en revisión. El catálogo anterior mostraba tres disponibles para esta presentación; no hay contradicción con las cinco físicas.

| Unidad | Sufijo IMEI ficticio | Batería | Estado | Costo de ejemplo |
|---|---|---|---|---|
| U-0101 | 1421 | 91 % | Disponible | USD 350 |
| U-0102 | 1422 | 88 % | Disponible | USD 360 |
| U-0103 | 1423 | 87 % | Disponible | USD 370 |
| U-0104 | 1424 | 90 % | Reservada · PED-0182 | USD 355 |
| U-0105 | 1425 | 84 % | En revisión | USD 365 |

REC-0081 es una recepción ficticia de cinco unidades del 26 de octubre de 2026. La corrección de costo de U-0102 ocurre ese día a las 11:00. La reserva y la revisión son del 27 de octubre. Las imágenes son ejemplos independientes de interacción: el retiro de U-0105 y el nuevo precio de USD 460 están todavía sin guardar, por lo que las demás vistas conservan cinco unidades y USD 450. La lámina de estados presenta situaciones alternativas; su tarjeta de cinco reservadas no describe el estado simultáneo de esta ficha.

Se conserva la advertencia de V2-04: grado y SKU por grado son una hipótesis de presentación, no una propuesta de migración. Si el grado pertenece a cada unidad en el sistema real, se retira del producto y se usa como agrupación o filtro de disponibilidad. No se duplican productos para reproducir literalmente las imágenes.

Disponible debe tener una única definición según las reglas reales: existencias vendibles sin reserva. Reservadas y en revisión son grupos excluyentes en esta muestra; si existen más dimensiones o almacenes, las cifras se adaptan sin sumar dos veces una misma unidad. Una reserva afecta disponibilidad, no la existencia física. Un error de consulta no equivale a stock cero. Los datos antiguos se identifican con su fecha y no habilitan una venta sin comprobar disponibilidad actual.

## Identificación, estado y garantía

La unidad concentra IMEI/serie, grado, batería, checklist, origen, relaciones e historial. Los IMEI están enmascarados y son ficticios. Mostrar revela temporalmente solo con permiso; Copiar debe indicar si copia el identificador completo y anunciar el resultado, sin copiar los puntos de la máscara. No se requiere otra confirmación para copiar cuando el usuario ya dispone de acceso. No se muestran identificadores completos en mensajes de error, exportaciones o registros visibles a roles sin permiso.

Editar unidad reutiliza esos grupos con etiquetas persistentes. La obligatoriedad y los formatos de IMEI/serie dependen del dispositivo: un accesorio no requiere IMEI y un teléfono puede tener más de un identificador. No se sustituye silenciosamente la identidad de una unidad con historial. La validación de duplicados consulta el inventario pertinente y vuelve a comprobarse al guardar; abrir la coincidencia conserva el borrador. La edición detallada y los casos de múltiples IMEI no tienen imagen independiente en este lote.

Batería y checklist deben conservar fecha, responsable y origen de la inspección; un porcentaje vacío es Sin medir, no cero. Verificado debe abrir las comprobaciones y sus resultados, no constituir una certificación automática. El grado es estético y no acredita funcionamiento, autenticidad ni cobertura.

Garantía Por confirmar expresa falta de datos. No significa Sin garantía. La cobertura debe mostrar la política realmente aplicable, documento y fechas verificadas cuando existan. Ausencia de una venta asociada no determina por sí sola la cobertura de compra, del fabricante o comercial. No se propone duración ni condición legal. La ficha de una unidad vendida deberá enlazar su venta y la cobertura registrada; este lote muestra una unidad en stock con datos de garantía pendientes. El tratamiento de garantías de reparación continúa en V2-06.

## Movimientos y ajustes

El historial distingue recepción, reserva, cambio de estado, venta, devolución y ajuste según los tipos disponibles. Cada entrada permite consultar referencia, unidad, responsable, fecha y motivo. No todos los eventos cambian existencias: una reserva o una revisión no deben parecer una entrada/salida física. El orden de la muestra es cronológico ascendente; se recomienda ofrecer orden descendente por defecto y conservar la elección del usuario.

Para equipos con control individual, ajustar requiere seleccionar las unidades concretas. La imagen muestra un retiro de U-0105 por deterioro: antes cinco físicas y después cuatro; las tres disponibles y la reserva no cambian. Registrar ajuste es la confirmación final del ejemplo revisado, no una operación ya ejecutada. El documento adjunto es ilustrativo y su obligatoriedad debe seguir las reglas existentes. Si Retiro por deterioro no existe como tipo de movimiento, se adapta a la operación equivalente autorizada; no se crea una eliminación física de la unidad ni se borra su historial.

Una unidad reservada no puede retirarse omitiendo su pedido; primero debe resolverse esa dependencia mediante el flujo correspondiente. Un ajuste tampoco debe crear una venta o un asiento de caja en silencio. Las consecuencias contables siguen las reglas reales y se exponen cuando correspondan. El ejemplo de deterioro no prescribe ningún tratamiento contable.

Para control por cantidad, la tarjeta del cable muestra stock actual 12, recuento 10 y diferencia −2. Revisar ajuste debe llevar a una revisión con producto, ubicación si existe, motivo y efecto final antes de registrar. No se permite aplicar ese campo numérico a teléfonos serializados. Los movimientos confirmados se corrigen mediante operaciones trazables según el sistema, no editando el saldo o borrando filas del historial.

Antes de confirmar se valida disponibilidad, versión y permisos. Si otra persona cambia la unidad se conserva el borrador, se muestran las diferencias y se exige revisar la situación actual. Actualizar datos tampoco descarta el borrador. Si la respuesta de guardado se pierde, se comprueba el resultado antes de reenviar para evitar movimientos duplicados. Esta lógica es una propuesta funcional a contrastar con backend, no soporte verificado.

## Precios y costos

Precios separa valor vigente, fecha y cambios anteriores. La actualización de ejemplo pasa de USD 450 a USD 460, con motivo y vista previa del incremento de USD 10. Solo se aplica al guardar. No altera importes ya registrados en ventas o pedidos; cualquier recotización de una operación existente debe ser explícita. Si existen borradores que usan precios actuales se debe explicar cómo se actualizan al reabrirlos.

La moneda es parte del importe. Se muestran primero las monedas habilitadas por el negocio, con búsqueda si hace falta. Nunca se interpretan USD y ARS como equivalentes ni se convierte sin tasa, fecha y regla explícitas. Precio no definido no es precio cero. Deben distinguirse vacío, formato inválido, valor no admitido y conflicto de actualización, conservando lo escrito.

Costos y margen requiere permiso específico tanto en la interfaz como en las respuestas del servidor, exportaciones y búsquedas. Solo administración es una etiqueta de rol ilustrativa; no impone un rol nuevo. La falta de permiso tiene una explicación y retorno al resumen; no se filtran importes a través de tarjetas, HTML oculto o cálculos visibles. En uso normal la pestaña se omite a quien no tiene acceso; el estado de restricción sirve para enlaces directos o permisos revocados.

El cálculo seleccionado incluye únicamente las tres disponibles: USD 350 + 360 + 370 = USD 1.080; costo promedio USD 360. Frente a USD 450, la diferencia es USD 90 por unidad y el margen sobre venta es (450 − 360) / 450 = 20 %. No se confunde con el recargo sobre costo, que sería 25 %. Los porcentajes individuales son 22,2 %, 20,0 % y 17,8 %. Reservada y en revisión quedan fuera de esta base y se identifican en una tarjeta aparte.

Es una estimación con los costos registrados de muestra, antes de gastos e impuestos; no es ganancia neta, resultado contable ni beneficio realizado. Si el sistema capitaliza otros componentes, usa otra valoración o mezcla monedas, la base y los componentes deben explicarse. No se recomienda cambiar el método de valoración mediante este mockup. Costo desconocido se muestra como pendiente y no se sustituye por cero para calcular margen. Con precio cero o base insuficiente el porcentaje no se calcula. Margen negativo se presenta con importe, texto e icono, no solo rojo.

Actualizar costo debe abrir un formulario con unidad, costo vigente, nuevo importe/moneda, motivo, respaldo y revisión del efecto. Se registra quién cambió qué y cuándo; no se sobrescriben costos históricos de ventas cerradas desde la ficha del inventario. Si existe una corrección con impacto contable, necesita su operación propia y alcance explícito. Este lote representa la consulta y el historial, no un formulario independiente de corrección de costo ni todas sus variantes.

## Móvil y accesibilidad

La unidad móvil utiliza tarjetas y dos pestañas en lugar de reducir una tabla. Más permanece seleccionado. El botón fijo Editar unidad reserva espacio inferior; la barra de navegación y el área segura no cubren contenido. Al entrar a edición se usa una columna, acciones accesibles con teclado abierto y protección del borrador. No se mantienen dos barras fijas cuando compiten con el formulario.

Estados representados: sin disponibilidad por reservas, fallo con dato antiguo, IMEI duplicado, cambio concurrente, costos restringidos y ajuste por cantidad. Carga, vacío inicial y protección de borradores reutilizan V2-01; los listados sin resultados conservan sus filtros y ofrecen restablecer búsqueda y filtros. No se anuncian errores o éxitos hasta tener resultado confirmado.

Verificar al implementar contraste AA, reflujo a 320 px, zoom al 200 %, foco visible, teclado, etiquetas y errores asociados, objetivos táctiles de 44 px, cabeceras de tabla y anuncios de cambios. Disponible usa verde, Reservada azul y En revisión ámbar, siempre acompañados de texto; la selección usa violeta. Los paneles deben definir si son modales: si lo son, fondo inerte, foco contenido y retorno al disparador; si son paneles no modales, navegación y foco coherentes sin atrapar al usuario. Las imágenes no certifican esos comportamientos.

## Producción y límites

Herramienta utilizada: ImageGen integrada. Siete imágenes finales, revisadas visualmente, y tres correcciones dirigidas: colores en Unidades, fecha/colores y texto auxiliar en Costos, mensaje de error en la lámina de estados. Se conservaron los originales en la carpeta de generación. Las variaciones del logotipo, iconos o leves tonos del render no sustituyen los activos ni tokens aprobados; los fondos y botones se implementan con colores planos.

Solo se añadieron imágenes y documentación bajo docs/ui-redesign/v2 y enlaces en sus índices. No se modificó código, configuración ni datos del CRM. El relevamiento previo es la base; no se verificó el soporte del backend para cada propuesta durante este lote. Las pantallas de edición, recepción, documentos e historial completo reutilizan patrones o se desarrollan en los lotes indicados: este índice enumera exactamente las vistas generadas, sin dar por cubierta toda variante posible.

Prompts completos y rutas de origen: [V2-05](prompts-v2-05.md). Próximo lote: V2-06 — Reparaciones y técnicos.
