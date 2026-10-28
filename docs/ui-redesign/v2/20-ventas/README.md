# Ventas — V2-09

Fecha: 27 de octubre de 2026. Seis imágenes de Ventas, dentro del lote de catorce piezas compartido con [Pedidos](../19-pedidos/README.md). Datos ficticios y paleta aprobada. Solo se añaden imágenes y documentación.

| # | Vista de Ventas | Imagen |
|---|---|---|
| 01 | Listado, período, cliente, vigencia y cobros | [Ventas](desktop/01-listado-ventas-v2.png) |
| 02 | Alta de mostrador con equipo y revisión | [Nueva venta](desktop/02-nueva-venta-mostrador-v2.png) |
| 03 | Ficha, cobros previos y permuta por registrar | [Cobro con permuta](desktop/03-ficha-venta-cobro-permuta-v2.png) |
| 04 | Efectos de anulación y motivo | [Anular venta](desktop/04-anular-venta-sin-pedido-v2.png) |
| 05 | Comprobante y contexto de cobro que no se imprime | [Comprobante](desktop/05-comprobante-venta-v2.png) |
| 06 | Alta móvil | [Nueva venta móvil](mobile/06-nueva-venta-mobile-v2.png) |

Vistas relacionadas: [Emisión desde pedido entregado](../19-pedidos/desktop/06-pedido-entregado-emitir-venta-v2.png), [estados compartidos](../19-pedidos/estados/08-estados-pedidos-ventas-v2.png). [Índice de Pedidos](../19-pedidos/README.md). [Prompts completos y correcciones](../19-pedidos/prompts-v2-09.md). [Índice global](../manifest-v2.md).

## Base y alcance

Se leyeron los [ADR de venta](../../../decisions/0021-la-venta.md) y [cobros/caja](../../../decisions/0022-cobros-y-caja.md), el [brief de unidades](../../../decisions/brief-29.5.2-las-unidades-en-pedidos-y-ventas.md), la [compra/permuta de usados](../../../decisions/brief-29.7.2-la-permuta-y-la-compra-de-usados.md), y las pantallas, formularios y servicios locales de ventas, pedidos, cobros y devoluciones. Las lecturas fueron de archivos, sin consultar registros reales ni volver a verificar el despliegue en producción. El código y la documentación pueden cambiar mientras continúa el desarrollo.

El rediseño propone pestañas de ficha, resúmenes antes de emitir/cobrar, filtros y situación de cobro en el listado y paneles de revisión. No implica que ya existan nuevas rutas, agregaciones o validaciones. El flujo actual de emisión y registro de cobro se conserva como operaciones distintas. No se añadieron impuestos, facturación fiscal, descuentos, crédito financiero ni cambios de permisos.

Este lote cubre la interacción comercial con el cobro y la anulación. Sesiones de efectivo, devolución de dinero, estado de cuenta, imputaciones, tipos de cambio, medios de pago y comprobantes de recibos/devoluciones se desarrollarán en V2-10.

## Listado y ficha

Vigente/Anulada pertenece al comprobante; Pendiente/Parcial/Cobrada describe cuánto está cubierto. Una venta puede estar vigente y no cobrada. Anulada no es un estado de cobro y no debe presentarse como una deuda cero recién pagada.

El listado reúne número, fechas, cliente y estado. Nueva venta es la acción principal; cada fila abre su ficha. No se colocan anulaciones, devoluciones y cobros como botones repetidos por fila. El origen separa mostrador y pedido; las ventas de reparaciones deben indicar su orden de servicio cuando el módulo componga ese contexto, sin tratar todo Sin pedido como mercadería de mostrador.

La columna de cobros y los contadores son propuestas de lectura adicionales al listado actual. Deben calcularse con los recibos vigentes, las señas que corresponden y las imputaciones reales; no con la suma bruta de todos los documentos. El período filtra la fecha de emisión de las ventas. Un importe cobrado en otro período no debe redefinir sin explicación las métricas de ese período.

Se evita un total único entre ARS y USD. Los importes conservan moneda visible. Los filtros de cliente y número no prometen buscar por IMEI dentro del listado; la búsqueda global y los accesos desde unidades tienen su propio alcance.

La ficha conserva número, cliente, vigencia, estado de cobro y accesos al comprobante y a la cuenta. Resumen muestra equipos y origen; Cobros muestra lo registrado y lo pendiente; Actividad muestra acciones auditadas. Registrar cobro se destaca si la venta vigente admite más importe. Anular queda en Más. Una venta cobrada ofrece consulta e impresión; no un botón de cobro innecesario.

## Venta de mostrador

Nueva venta crea una venta sin pedido. Cliente es opcional: vacío significa Consumidor final; si se elige, debe ser un cliente existente y activo. Un pedido, en cambio, requiere cliente. No se crea una ficha de persona implícita al escribir un nombre.

Las líneas se arman con los mismos patrones de producto, cantidad o equipos de Pedidos. Un producto aparece una sola vez; las unidades elegidas determinan su cantidad. Cada unidad usa su precio propio o el vigente del producto. Una línea con unidades de distinto precio conserva el desglose y total reales. Se mantienen entrada manual y lector de códigos como alternativas al selector propuesto. No se permite inventar stock ni vender unidades reservadas, en revisión o reparación.

El resumen Antes de emitir identifica cliente, equipos y total estimado. El servidor comprueba precios y disponibilidad antes de emitir. Un cambio devuelve datos actualizados para revisar; no confirma silenciosamente un precio diferente. Las líneas de monedas distintas se rechazan según las reglas actuales; no se convierten con un tipo de cambio implícito.

Al emitir la venta sin pedido se registra la salida física y sus unidades pasan a Vendida. Emitir no reserva primero ni registra dinero. Un error conserva el borrador; durante el envío no se permite duplicar la operación. El número V se asigna al emitir con éxito, sin anticiparlo en el borrador.

No se ofrece editar una venta emitida ni borrar sus líneas. Las correcciones siguen los procedimientos vigentes de anulación y nueva emisión. La emisión desde un pedido entregado conserva las líneas e importes de ese pedido y no repite la salida de stock. Si una venta de pedido se anuló puede emitirse otra vigente vinculada como reemplazo según el servicio existente; esa cadena no significa editar el documento anterior.

## Cobros y permuta

El panel Registrar cobro identifica la venta y su saldo actual. Se elige un medio por recibo, con importe positivo y límite actualizado. Cobrar con varios medios requiere registros separados; no se dibuja una operación conjunta atómica que el servicio no tenga. Registrar describe un dinero ya recibido: no ejecuta transferencias ni verifica automáticamente la acreditación del banco.

El ejemplo muestra Transferencia y Efectivo como medios ordinarios activos. Efectivo requiere una sesión abierta en la moneda que entra a caja. La UI debe advertirlo y ofrecer el acceso correspondiente sin borrar lo cargado. Las conversiones admitidas por la organización mantienen su revisión explícita y se detallarán en el siguiente lote. No se elimina la posibilidad por usar un ejemplo sin conversión.

Permuta se ofrece solo con una recepción elegible del mismo cliente, en la misma moneda, con importe disponible. Debe ser menor o igual tanto al saldo de la venta como al disponible del usado. No entra dinero a caja y no se aplica a una seña ni a un recibo genérico a cuenta. El valor de compra de un usado no se convierte en crédito de permuta.

El panel separa la situación actual de una previsión después del registro. La confirmación vuelve a comprobar los topes y solo después agrega el recibo al historial. Si otro operador cobró o aplicó el usado, el rechazo conserva datos y explica qué cambió. No se registra parcialmente un cobro rechazado.

Una cuenta con crédito o una seña pueden cubrir una venta según las reglas de imputación existentes. El resumen debe distinguir lo efectivamente recibido, la seña incluida y lo imputado desde la cuenta cuando corresponda. La imagen de Mateo no tiene imputaciones adicionales; Cobros registrados de ARS 200.000 coincide con su único recibo vigente. No se generaliza esa simplificación a todas las ventas.

## Anulación y dinero

La revisión identifica la venta completa y el efecto específico antes de confirmar. Los motivos actuales son Error de carga, Operación no concretada, Cliente equivocado y Otro; no se agrega un campo de texto libre obligatorio inexistente. Conservar venta tiene foco y salida segura; Anular venta usa tratamiento destructivo.

| Origen de la venta | Stock al anular | Dinero |
|---|---|---|
| Mostrador con mercadería | Repone sus cantidades/unidades mediante el movimiento correspondiente | No anula recibos ni ejecuta una devolución |
| Pedido entregado | No cambia; el pedido sigue Entregado | Los cobros siguen su tratamiento de cuenta |
| Reparación/servicio | No hay stock de mercadería que reponer; la orden sigue entregada | No ejecuta devolución ni genera otra reparación |

La anulación emite otro documento, con prefijo A y número propio, y afecta la venta entera. No es una edición ni una devolución parcial. No se inventa el número del comprobante antes de guardarlo. La anulación no se deshace.

Con cliente, lo cobrado pasa a su cuenta: primero se aplica a ventas con saldo y solo lo restante queda a favor. No se promete que todo se puede devolver ni que el saldo a favor existe. Sin cliente, lo cobrado queda a devolver sobre la venta; la devolución se registra por separado. Los recibos conservan su registro y pueden tener sus propias anulaciones, que no se disparan automáticamente al anular la venta.

El ejemplo V-000220 es una venta sin cliente de dos fundas: se repondrían dos unidades de producto por cantidad y quedarían ARS 80.000 a devolver. El modal no confirmó todavía la anulación, por eso el fondo conserva Vigente/Cobrada y el listado sigue mostrando cuatro vigentes. La devolución de este importe pertenece al lote financiero.

Anular mercadería puede ser rechazado si el IMEI vendido volvió al local como otra unidad, por ejemplo por una recepción de usado. Debe explicarse la coincidencia sin reponer una unidad duplicada y sin anular nada. También se conservan los rechazos por límites o una anulación ya existente. No se propone una devolución física de equipos nueva: las devoluciones de dinero y los movimientos físicos tienen reglas distintas.

## Comprobante e impresión

El comprobante conserva negocio, número V, fecha/zona, cliente o Consumidor final, líneas, cantidades, precios, total, referencias al pedido/reemplazo cuando existan e IMEI de las unidades. Los importes se fijaron al emitir o se copiaron del pedido; el nombre visible de un producto puede ser el actual según la lectura existente y debe indicarse fuera de la impresión cuando corresponda.

Se mantiene la leyenda real Documento no válido como factura. No se añaden QR fiscal, CUIT inventado, condiciones legales, plazos de garantía o firma como requisitos nuevos. La referencia completa al IMEI pertenece al documento, según el dominio y los permisos actuales. Las miniaturas generadas son ilustrativas: se usan activos reales del catálogo o un icono neutro si no existe una imagen.

La situación de cobro es un panel de contexto fuera del documento y no se imprime. No se añade un sello Pagada a una venta con cobro parcial ni se mezcla su total original con el saldo. Imprimir excluye navegación, botones, panel de cobro y cualquier overlay. El documento de anulación conserva la referencia al original y los equipos; no tiene una imagen independiente en este lote.

## Datos ficticios y consistencia

| Venta | Cliente | Origen / fecha de emisión | Total | Situación actual |
|---|---|---|---|---|
| V-000221 | Mateo Salas | Mostrador, 27 oct | ARS 480.000 | R-000182 Transferencia ARS 200.000; pendiente ARS 280.000 |
| V-000220 | Consumidor final | Mostrador, 27 oct | ARS 80.000 | R-000181 Transferencia ARS 80.000; cobrada |
| V-000219 | Inés Vidal | P-000202, emitida 27 oct; pedido del 26 oct | USD 650 | Cobrada; recibo no representado en la imagen |
| V-000218 | Mateo Salas | Mostrador, 26 oct | ARS 500.000 | R-000173 Permuta ARS 120.000; pendiente ARS 380.000 |

V-000221 vende un iPhone 14 de 128 GB Azul usado, unidad ficticia U-0403, grado A, batería 89 %, precio de venta ARS 480.000. Su IMEI ficticio completo en el comprobante es 350000000002403; en las fichas se muestra …2403. Es una presentación de ejemplo distinta del iPhone 13 con precio USD 450: no representa una conversión entre monedas ni una propuesta de recotizar el catálogo.

El formulario de nueva venta es el borrador anterior a V-000221, todavía sin número y sin cobro. Las fichas posteriores contienen solo R-000182 de ARS 200.000. La permuta de ARS 80.000 está preparada y aún no registrada; la impresión conserva los mismos datos actuales.

PU-000082 corresponde al [usado de Mateo del lote V2-07](../17-usados/README.md): valor reconocido ARS 200.000, aplicado antes ARS 120.000 a V-000218 mediante R-000173 y disponible ARS 80.000. En el panel de V-000221 se propone aplicar esos ARS 80.000. La previsión es cobrado ARS 280.000, pendiente ARS 200.000 y disponible del usado ARS 0. El saldo actual de la venta sigue siendo ARS 280.000 hasta confirmar. Ninguna imagen da esa previsión por realizada.

La diferencia entre disponible del usado y pendiente de la venta se calcula explícitamente: 480.000 − 200.000 = 280.000; luego 280.000 − 80.000 = 200.000. Los ARS 120.000 anteriores no se suman otra vez a V-000221. No se muestra una deuda global del cliente porque incluye otras operaciones.

La anulación de V-000220 y los estados de conflicto son alternativas pendientes de confirmar; no cambian el listado base. No se deducen nuevos clientes, equipos, pagos o saldos reales de estas representaciones.

## Sistema visual y producción

Se conservan Manrope y los tokens aprobados: fondo #F6F5FB, blanco, lateral #F1EEFB, texto #17142E, secundario #5A5573, borde #E3DFF0, primario #6D28D9 y selección #EDE7FE. Pendiente usa ámbar, Confirmado violeta, Entregado y Cobrada verde; Cancelado y Anulada gris. Los estados físicos mantienen el vocabulario de Inventario. Reservada debe unificarse al azul de ese sistema; el ámbar del render de entrega no define un cambio del token. Las alertas de una unidad no disponible pueden usar ámbar por su función de advertencia.

El logotipo, los iconos y las fotos definitivos conservan los activos originales de Vixora/catálogo. Las variaciones de letras, símbolos, encuadres, miniaturas o tonos de los renders no proponen reemplazarlos. Los botones y fondos se implementan planos aunque una imagen generada introduzca una variación tonal.

Móvil usa una columna, acciones legibles y teclado adecuado para IMEI e importes. Durante el alta se omite la barra global; el área de acciones respeta teclado, scroll y zona segura. Objetivos a verificar: contraste AA, 200 % de zoom, reflujo a 320 px, controles de al menos 44 px, foco visible, etiquetas persistentes, errores asociados y mensajes anunciados. Las imágenes no certifican accesibilidad ni la impresión real. Admin gestiona; viewer consulta sin acciones de gestión ni costos. No se amplían permisos de contacto, dinero o inventario por reorganizar la vista.

Se generó una imagen por pieza con ImageGen integrada y se conservaron los originales. Se hicieron diez llamadas de corrección dirigidas sobre ocho piezas; dos intentos de corregir el saldo de la ficha no lo cambiaron y no se usan como finales. El resumen se rediseñó finalmente como una lista de Total, Cobros registrados y Saldo pendiente actual, con importes correctos. También se corrigieron fecha, contexto, enmascarado de IMEI, prioridad de botones, etiquetas y espacio del móvil.

Las catorce versiones finales están copiadas en estas dos carpetas. Dimensiones: diez imágenes horizontales a 1672 × 941; la ficha pendiente de Pedidos a 1602 × 982; Señas a 1671 × 941; dos móviles a 941 × 1672. Se preserva el encuadre de los originales sin estirarlos ni recortarlos. Se verifican cantidad, dimensiones y enlaces locales; no se ejecutan pruebas de aplicación para este lote visual.

## Cobertura y siguiente lote

Hay seis vistas propias de Ventas y una lámina compartida. La ficha cerrada sin panel reutiliza Resumen/Cobros; el cobro ordinario reutiliza el formulario de señas con su destino Venta. No se produjo una captura aparte de cada medio de pago, combinación de monedas, documento anulado, cadena de reemplazos, venta de reparación, cuenta sin saldo o rol de consulta.

Las funciones de garantía se conservan en sus módulos existentes; no se inventan períodos ni una acción de reclamo que el dominio no habilite. La consistencia completa con Reparaciones y Usados se revisará también en el lote transversal.

El siguiente lote es V2-10 — Caja y cuentas de clientes: sesiones, cobros, devoluciones, estado de cuenta, cotización y medios de pago.

