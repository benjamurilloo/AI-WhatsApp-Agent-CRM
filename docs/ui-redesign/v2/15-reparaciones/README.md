# Reparaciones y técnicos — V2-06

Fecha: 27 de octubre de 2026. Once imágenes con datos ficticios, distribuidas por módulo. Se amplía el rango orientativo del plan para representar equipos de clientes, unidades propias y reclamos de garantía sin mezclar sus flujos. Se conserva la identidad violeta aprobada.

| # | Vista | Imagen |
|---|---|---|
| 01 | Órdenes, filtros y próximo paso | [Listado operativo](desktop/01-ordenes-servicio-v2.png) |
| 02 | Recepción de un equipo de cliente | [Nueva orden](desktop/02-nueva-orden-recepcion-v2.png) |
| 03 | Preparación del presupuesto | [Precio al cliente y costo interno](desktop/03-presupuesto-aprobacion-v2.png) |
| 04 | Orden reparada y siguiente acción | [Ficha resumida](desktop/04-ficha-reparacion-siguiente-paso-v2.png) |
| 05 | Recepción imprimible y revisión de entrega | [Documento y confirmación](desktop/05-comprobante-revision-entrega-v2.png) |
| 06 | Tipos y precios por modelo | [Lista y edición](desktop/06-lista-reparaciones-precios-v2.png) |
| 07 | Técnicos vinculados a proveedores | [Listado y panel](../16-tecnicos/desktop/07-tecnicos-proveedor-v2.png) |
| 08 | Reparación de una unidad propia | [Costos y regreso a revisión](desktop/08-reparacion-unidad-propia-v2.png) |
| 09 | Reclamo vinculado a una reparación anterior | [Garantía](desktop/09-reclamo-garantia-v2.png) |
| 10 | Ficha de reparación móvil | [Resumen y entrega](mobile/10-ficha-servicio-mobile-v2.png) |
| 11 | Decisiones y validaciones | [Estados de servicio y garantía](estados/11-estados-servicio-garantia-v2.png) |

## Base revisada y límites

Además del [relevamiento visual](../../00-auditoria-actual/inventario-pantallas-v2.md), se consultaron en modo lectura los briefs de [equipos de clientes](../../../decisions/brief-29.6-las-reparaciones-de-equipos-de-clientes.md), [unidades propias](../../../decisions/brief-29.6.2-las-reparaciones-de-unidades-propias.md) y los formularios, textos y esquema actuales de Reparaciones. Esa consulta permitió reconocer también el reclamo de garantía ya presente en el proyecto. No se ejecutó la aplicación, no se consultaron registros de clientes ni se modificaron archivos de código durante este lote. Los briefs antiguos contienen decisiones de su momento; los flujos descritos aquí incorporan lo observado en los archivos actuales, sin afirmar que se comprobó cada caso en producción.

Las imágenes son propuestas de interfaz, no una instrucción de cambiar entidades, permisos o transiciones. Filtros combinados, métricas, paneles, fotos/observaciones adicionales y comprobaciones de entrega son mejoras de UX cuya persistencia y soporte deben confirmarse. La etiqueta Lista para entregar describe una orden Reparada: no crea otro estado de dominio.

## Arquitectura de la sección

Reparaciones abre Órdenes de servicio, la tarea cotidiana. Lista de reparaciones conduce a configuración y precios por modelo. Técnicos es un acceso filtrado a proveedores marcados como técnicos, sin una entidad nueva. La ficha de proveedor y sus pagos siguen en Abastecimiento. Se conserva el contexto de búsqueda y filtros al volver desde una orden.

El listado permite reconocer tipo, cliente o unidad, equipo, estado, próximo paso e importe sin abrir cada fila. Toda la fila abre el detalle y el próximo paso lleva a la sección correspondiente, sin ejecutar una transición directamente. Nueva orden crea únicamente una orden de equipo de cliente. La orden de unidad propia nace desde su unidad; el reclamo nace desde su origen elegible. No se ofrece un selector que permita omitir esos vínculos.

En curso incluye órdenes de cliente/reclamo sin terminar y órdenes propias que siguen en el técnico, excluyendo entregadas, canceladas y órdenes propias ya reparadas. Para presupuestar comprende equipos de clientes enviados al técnico que aún no tienen presupuesto guardado. Listas para entregar incluye reparadas de cliente/reclamo, nunca unidades propias. Garantías abiertas cuenta reclamos abiertos. Los contadores deben definir su ámbito y responder de forma coherente a los filtros; no se calculan solo sobre una página de resultados.

En la muestra hay seis órdenes: cinco en curso y una entregada. Una está pendiente de presupuesto, una lista para entregar y un reclamo abierto. Las tarjetas se superponen deliberadamente: no se suman para obtener el total. Precio pendiente, No aplica y Sin cargo al cliente tienen significados distintos y no se reemplazan por cero. Tampoco se suman presupuestos de tipos o monedas diferentes.

## Equipo de cliente: recepción y presupuesto

La recepción pide cliente, modelo y reporte; el IMEI es opcional según el flujo actual. El equipo no se incorpora al inventario del negocio. Su IMEI no debe bloquearse por la misma regla de unicidad de una unidad comercial. Una posible coincidencia se puede mostrar como contexto sin asignar propiedad ni fusionar registros.

Observaciones del estado, accesorios y fotografías son mejoras propuestas: si no existen, no se simula que se guardaron. Se deben añadir únicamente con una solución real de almacenamiento y permisos; el reporte no se usa como campo oculto para codificar esos datos. No se solicita una contraseña, PIN o cuenta personal en el formulario general. Cliente y modelo permanecen identificables durante el resto del flujo.

Al guardar se crea la orden Recibida y se habilita el comprobante. El envío selecciona un proveedor activo habilitado como técnico y confirma que la orden pasará a En el técnico. Ese formulario no tiene una imagen independiente; utiliza el panel de selección con contexto y revisión. No es un envío de mensaje al proveedor ni al cliente.

El presupuesto de la imagen 03 es un borrador de OS-000313: una reparación de batería para iPhone 14, ARS 75.000 al cliente y ARS 45.000 de costo del técnico. Técnico y modelo son contexto de solo lectura en ese paso. Se añaden líneas bajo demanda y cada servicio seleccionado debe tener importes válidos. Una selección no marcada no puede alterar el total por conservar valores escritos. La fila de servicio admite eliminación del borrador, no borrado del historial.

La moneda del cliente y la del técnico se eligen separadamente. Dentro de cada total no se mezclan monedas de líneas. Si no hay precio por modelo se puede completar manualmente según las reglas actuales; Sin configurar no es gratuito. No se calcula un margen restando ARS y USD sin una conversión explícita.

Guardar presupuesto fija sus líneas. La aprobación o el rechazo se registra después, con el total y los servicios claramente visibles. La confirmación debe decir Registrar aprobación del cliente, para evitar confundirla con una aceptación automática o un mensaje enviado. No se atribuye evidencia de autorización si el sistema no la guarda. Esta confirmación positiva no tiene captura independiente; la imagen 03 representa la preparación, y la 11 la rama de rechazo.

El flujo de cliente conserva Recibida → En el técnico → Presupuestada → Aprobada o Rechazada. Desde Aprobada se marca Reparada y después se entrega. Desde Rechazada se devuelve sin reparar y sin venta. No se habilitan pasos posteriores por anticipado. Las líneas guardadas no se editan en silencio: en el comportamiento actual un presupuesto distinto exige otra orden y resolver la anterior cuando aún pueda cancelarse. No se propone una nueva versión de presupuesto editable sobre una orden cerrada.

## Ficha, documento y entrega

Resumen sitúa la próxima acción antes del historial. Equipo y reporte, presupuesto, técnico, documentos y una cronología compacta permiten trabajar sin recorrer una página larga. Actividad contiene la auditoría completa. La barra cronológica debe reflejar la rama real: no muestra Aprobada como completada cuando hubo rechazo. Ver revisión final es una propuesta de acceso a comprobaciones disponibles; no promete un checklist persistido que no exista.

OS-000312 corresponde a Nicolás Vega, iPhone 13, IMEI ficticio terminado en 3478. Se recibe el 23 de octubre, se envía el 24, se presupuesta y aprueba el 25 y se repara el 27. El importe aprobado es ARS 65.000 y el costo del técnico ARS 40.000. La venta todavía no está emitida. Estos ejemplos son distintos del cliente Lucía/REP-0248 de V2-03; no se reinterpretan aquellos registros ilustrativos como órdenes reales del sistema.

Preparar entrega abre una revisión con equipo, orden, importe aprobado y efectos. La confirmación Entregar y emitir venta conserva el comportamiento actual: marca Entregada y emite una venta por el importe aprobado, sin movimiento de inventario del equipo de cliente. No registra un cobro automáticamente. Después se ofrece abrir la venta y registrar el pago mediante el módulo financiero. Con presupuesto rechazado se usa Entregar sin reparar, sin venta; no se añade un cargo de diagnóstico que el flujo actual no admite.

La imagen 05 combina la copia del comprobante de recepción y la revisión de entrega para mostrar dos destinos relacionados. No es un nuevo comprobante de salida. La fecha del documento sigue siendo la recepción del 23 de octubre. Imprimir o descargar solo afecta a esa copia, no confirma la entrega. La impresión final contiene el documento, sin sidebar, acciones ni información interna. Su leyenda se conserva: Comprobante de recepción del equipo. No es una factura. Los IMEI de muestra se ocultan; la presentación de un documento operativo real debe usar los identificadores autorizados de su titular y el patrón vigente, sin sustituirlos por datos ficticios.

El comprobante para el cliente no incluye técnico ni costos internos. La garantía debe presentar los datos realmente calculados por el sistema: el texto de referencia de la imagen se sustituye por cobertura, fechas y estado efectivos cuando estén disponibles, sin inventar duraciones. No se crea una condición legal a partir del diseño.

Una entrega concurrente recupera la venta existente y no emite una segunda. Ante respuesta de red incierta se comprueba el resultado antes de reenviar. La anulación posterior de la venta se gestiona desde Ventas; no debe hacer parecer que la orden dejó de estar Entregada ni habilitar una nueva venta desde el mismo botón. La ficha debe mostrar que la venta vinculada fue anulada.

## Lista de reparaciones y técnicos

Precios por modelo evita una matriz de docenas de columnas: se elige un modelo y se muestran tipo, precio al cliente, costo estimado, estado y edición. Tipos de reparación administra nombre, orden y activación; Garantía agrupa la configuración de cobertura del servicio. La imagen 06 representa precios y edición; el alta/renombrado/activación de tipos reutiliza el panel simple, sin pantalla independiente en este lote. Desactivar un tipo no borra presupuestos históricos.

En iPhone 13 la batería cuesta ARS 65.000 al cliente y ARS 40.000 al técnico; pantalla ARS 120.000 y ARS 80.000; pin de carga está sin configurar. Cambiar la lista propone nuevos valores a futuras órdenes y no modifica líneas ya guardadas. El costo estimado de la lista no se presenta como un pago realizado ni como el saldo del proveedor.

Técnicos muestra Laboratorio Sur y Tecno Centro, ambos activos, cada uno con dos órdenes en curso de la muestra. El panel presenta datos de proveedor, órdenes y acceso a cuenta. La marca de técnico se edita en la ficha de proveedor, no en una casilla de este panel: al implementar, mostrar una etiqueta de lectura en lugar de un checkbox que parezca interactivo. Habilitado como técnico no es una certificación profesional ni un usuario con acceso al CRM.

La deuda con el técnico se registra al marcar Reparada una orden con costo, no al emitir el presupuesto ni al pagar el cliente. Los pagos se registran en la cuenta de proveedor y se aplican por las reglas existentes; no se inventa un pago directo imputado a una orden puntual. Su cuenta puede incluir otras deudas y créditos: no se calcula el saldo total sumando solo las órdenes visibles. Cuenta, pagos y edición completa del proveedor continúan en V2-11.

Los roles de consulta no deben recibir identidad del técnico, sus costos ni su cuenta si las reglas actuales los restringen. Se eliminan secciones, filtros y columnas correspondientes, además de proteger servidor, búsqueda, exportaciones y documentos. Las imágenes muestran el rol Administradora. Solo administración es una explicación visual, no un sustituto de la autorización real.

## Unidad propia

La orden se inicia desde una unidad disponible o en revisión con modelo y técnico válidos. No se acepta una reservada, vendida o dada de baja. Una unidad solo puede tener una orden propia abierta. El formulario de envío debe identificar unidad, IMEI, modelo, técnico y problema; al confirmar pasa a En reparación según las reglas de inventario. No se crea desde Nueva orden de equipo de cliente.

La imagen 08 muestra OS-000315 de U-0201, en el técnico. Al registrar Cambio de batería por USD 25, el costo de la unidad pasa de USD 300 a USD 325. La moneda sigue la del costo de la unidad; no hay conversión automática. La orden queda Reparada y la unidad En revisión. No hay cliente, presupuesto al cliente, venta, comprobante de recepción ni entrega. Reparada es final para la orden propia.

Liberar a la venta es una operación posterior desde la unidad, tras revisar y corregir los datos admitidos, como batería y grado. No se libera automáticamente al finalizar el trabajo. Cancelar una orden propia abierta devuelve la unidad a revisión sin añadir costo; la cancelación tiene motivo y explicación del efecto. La selección de servicios y costos corresponde al trabajo efectivamente realizado y debe evitar registrar dos veces el mismo retorno.

Precisión respecto a V2-05: sus cinco existencias físicas incluyen una unidad en revisión, mientras que el saldo operativo actual solo cuenta disponibles y reservadas. En aquel ejemplo serían cuatro en el saldo operativo y cinco bajo custodia física. No se prescribe cambiar esa regla ni generar otro movimiento de saldo al dar de baja una unidad que ya estaba fuera de él. El retiro ilustrado en V2-05 debe interpretarse como resolución trazable de custodia/estado, usando las operaciones admitidas, nunca como restar nuevamente del saldo vendible.

## Reclamo de garantía

El reclamo nace desde una unidad vendida o una reparación entregada que el sistema considere elegible, con cliente y origen vinculados. El ejemplo OS-000316 procede de la reparación OS-000290 de Valentina Costa, iPhone 13, IMEI ficticio terminado en 9042. Elegibilidad verificada al abrir indica el resultado guardado al inicio, no una promesa de cobertura perpetua ni una aceptación de cualquier avería posterior. Se consulta el origen y sus condiciones efectivas.

El formulario de alta reutiliza el reporte del cliente con el origen visible y de solo lectura. El detalle representado ya está En el técnico. No existe presupuesto ni aprobación de precio al cliente en esta rama. Se registra lo reparado y si el técnico cobró; la muestra tiene ARS 15.000 de costo interno y ningún cargo al cliente. Reparado sin cargo se refiere al técnico: el cliente no paga en ambas opciones. Al elegirlo deben ocultarse importes no aplicables y explicar que no se genera deuda con el técnico por esa reparación.

El flujo actual es Recibida → En el técnico → Reparada → Entregada. Entregar sin cobrar solo se ofrece desde Reparada y no emite una venta. No se suma el costo del reclamo al costo de una unidad ya vendida. Si hay un reclamo abierto del mismo origen se abre el existente, sin duplicarlo.

Si el reclamo no está cubierto, la cancelación usa el motivo admitido y expone su alcance. Una eventual reparación paga se tramita en una orden común, explícita y vinculada por contexto cuando el sistema lo permita; no se convierte en cobro oculto del reclamo. La pantalla de alta de reclamo y su entrega final reutilizan patrones, pero no tienen imágenes independientes en este lote.

La configuración de garantía requiere un valor válido según el sistema. La lámina no recomienda ninguna duración. Se conserva el significado real de cero si está permitido, y vacío no equivale a cero. La validación especifica el rango admitido y mantiene lo escrito. Cambios de configuración no alteran las coberturas ya registradas; se muestra su alcance sobre futuras operaciones. No se confunde cobertura pendiente de consultar, vencida y sin configuración.

## Móvil, estados y accesibilidad

La ficha móvil prioriza estado, equipo, importe y entrega, con documentos e historial accesibles sin una tabla reducida. Más permanece activo en la navegación global. El Más de las pestañas abre Documentos y Actividad de la orden; debe tener nombre accesible Secciones de la orden para distinguirlo del Más global y del menú de acciones. A 320 px, los tres datos comerciales se apilan en filas, aunque la imagen amplia los muestre en columnas.

Preparar entrega conserva espacio inferior y área segura. Los formularios móviles ocupan una columna; el teclado no tapa errores, importes o confirmación. En una operación enfocada se retira la barra global si compite con el formulario. El listado usa tarjetas por orden con tipo, estado y próximo paso; esta adaptación del listado no tiene una imagen independiente aquí.

La lámina incluye rechazo, entrega concurrente, precio sin configurar, unidad reservada, reclamo existente y error de garantía. Son situaciones alternativas: U-0201 reservada en esa tarjeta no es el mismo instante de la orden propia que está en el técnico. La recuperación de una venta existente solo se ofrece si el tipo de orden realmente la genera; para reclamos o rechazos entregados se abre la orden.

Se reutilizan los patrones globales para carga, vacío, filtros sin resultados, fallos de red, permisos y protección de borradores. Cancelar edición vuelve a la consulta sin cancelar la orden; si hay cambios se informa antes de descartarlos. Cancelar orden/reclamo permanece en el menú secundario, pide motivo y permite revisar el efecto; una orden de cliente Reparada no se cancela por ese acceso.

Verificar contraste AA, zoom al 200 %, reflujo a 320 px, foco visible, teclado completo, estados anunciados, labels persistentes, errores asociados y objetivos táctiles de 44 px. Los paneles modales gestionan foco, fondo inerte y retorno al disparador; los no modales no atrapan el foco. La interfaz conserva texto e iconos además del color. Las imágenes no constituyen pruebas de esos comportamientos.

## Producción y cobertura visual

Herramienta: ImageGen integrada. Se generó una imagen por pieza y se realizaron tres ediciones dirigidas: presupuesto (fecha, estado, contexto de lectura y filas), unidad propia (estados, contexto y cancelación) y garantía (estado, contacto ficticio, técnico de lectura y cancelación). Se revisaron importes, cronología y próximos pasos. Los originales permanecen en la carpeta de generación.

Se conserva el logotipo oficial y el conjunto de iconos del producto; las variaciones menores entre imágenes no proponen un reemplazo. En implementación se usan colores planos y los tokens aprobados aunque el render tenga leves variaciones. No se cambiaron código, configuración, datos, mensajes ni despliegues. Solo se añadieron imágenes, documentación y enlaces de índices bajo docs/ui-redesign/v2.

El índice enumera las once vistas efectivamente producidas. No afirma que cada modal, permiso y transición tenga una captura propia. Los patrones reutilizados y destinos diferidos se indican arriba; su consistencia se revisará en V2-13. Prompts y rutas originales: [V2-06](prompts-v2-06.md).

Próximo lote: V2-07 — Usados y permutas.
