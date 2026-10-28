# Usados y permutas — V2-07

Fecha: 27 de octubre de 2026. Once imágenes de propuesta con datos ficticios y la paleta aprobada. Se amplía el rango orientativo del plan para mostrar por separado la compra, la permuta y la cotización, además de su configuración y documentos.

| # | Vista | Imagen |
|---|---|---|
| 01 | Recepciones, estado físico y situación del valor | [Listado](desktop/01-recepciones-usados-v2.png) |
| 02 | Equipo, cliente y checklist | [Recepción: primer paso](desktop/02-recepcion-equipo-checklist-v2.png) |
| 03 | Valor, compra/permuta y efectos al confirmar | [Recepción: segundo paso](desktop/03-valor-destino-confirmacion-v2.png) |
| 04 | Compra, pagos previos y revisión de nuevo pago | [Ficha y pago](desktop/04-ficha-compra-pago-v2.png) |
| 05 | Permuta aplicada y disponible | [Aplicaciones a ventas](desktop/05-permuta-aplicaciones-v2.png) |
| 06 | Cálculo orientativo y desglose | [Cotizador](desktop/06-cotizador-orientativo-v2.png) |
| 07 | Puntos obligatorios y reparación asociada | [Checklist: listado y edición](desktop/07-checklist-configuracion-v2.png) |
| 08 | Batería, rango, redondeo y margen | [Reglas de cotización](desktop/08-reglas-margenes-cotizacion-v2.png) |
| 09 | Recepción imprimible | [Comprobante PU](desktop/09-comprobante-usado-v2.png) |
| 10 | Equipo, revisión y pagos en móvil | [Ficha móvil](mobile/10-ficha-usado-mobile-v2.png) |
| 11 | Rechazos, conflictos y anulación | [Estados y decisiones](estados/11-estados-usados-permutas-v2.png) |

## Base y alcance

Se parte del [inventario visual](../../00-auditoria-actual/inventario-pantallas-v2.md). Para respetar los recorridos actuales se consultaron, solo en lectura, los briefs de [recepción](../../../decisions/brief-29.7-la-recepcion-de-usados.md), [compra y permuta](../../../decisions/brief-29.7.2-la-permuta-y-la-compra-de-usados.md), formularios y mensajes de Usados, y las reglas de cotización. No se ejecutó la aplicación ni se leyeron registros reales de clientes durante este lote. No se verificó de extremo a extremo su estado desplegado.

Las imágenes reorganizan funciones existentes y proponen mejoras de presentación: recepción en dos pasos, filtros combinados, contadores, pestañas de ficha y revisión de pago en panel. No prescriben tablas nuevas, cambios de permisos, conversiones monetarias ni migraciones de inventario. El formulario actual de recepción es único; dividirlo conserva un solo borrador y una sola confirmación final, no dos documentos ni una recepción parcial guardada.

## Navegación y jerarquía

Usados está bajo Catálogo e inventario. Recepciones concentra el trabajo diario; Cotizar evalúa un equipo sin guardarlo; Checklist administra las comprobaciones; Configuración mantiene las reglas y márgenes. Las últimas tres secciones respetan los permisos administrativos existentes. No se mezclan configurar el negocio y recibir un equipo en la misma pantalla.

La ficha tiene Resumen, Pagos o Aplicaciones según el destino, Documentos y Actividad. Se conserva cliente, equipo, número y estado al cambiar de pestaña. Cada fila abre la ficha; las acciones peligrosas quedan en el menú secundario. Volver al listado recupera búsqueda, filtros y posición. Preparar pago aparece en una compra con importe pendiente y permiso; Ver ventas del cliente es el acceso principal en una permuta con disponible.

El listado distingue tres dimensiones: vigencia de la recepción, estado de la unidad y situación del valor. Vigente no significa Disponible para vender ni Pagado. Disponible para ventas en una permuta es un importe financiero, no una unidad vendible. Los contadores se calculan sobre un ámbito definido y comparten filtros con el listado; sus categorías se superponen y no se suman para obtener un total.

## Datos de muestra y consistencia

| Recepción | Cliente / equipo | Destino | Unidad | Valor y situación |
|---|---|---|---|---|
| PU-000081 · 26 oct 2026 | Sofía Ferraro · iPhone 12, 64 GB, Negro | Compra | U-0301 · En revisión | ARS 290.000; pagado 100.000; pendiente 190.000 |
| PU-000082 · 26 oct 2026 | Mateo Salas · iPhone 11, 64 GB, Blanco | Permuta | U-0302 · En revisión | ARS 200.000; aplicado 120.000; disponible 80.000 |
| PU-000083 · 25 oct 2026 | Laura Prado · iPhone 12, 64 GB, Negro | Compra | Disponible | ARS 250.000 pagados |
| PU-000080 · 24 oct 2026 | Julián Torres · iPhone 11, 64 GB, Negro | Compra anulada | Baja | Sin operaciones financieras vigentes |

El listado tiene tres recepciones vigentes, dos unidades en revisión y una compra con saldo por pagar. Las imágenes 02–03 reconstruyen el borrador previo de la recepción de Sofía; en ese momento no hay número confirmado, unidad creada ni pago. Las fichas posteriores ya tienen el pago PPU-000041 de ARS 100.000. El pago de ARS 190.000 del panel todavía no está registrado: ARS 0 es una previsión, no el saldo actual.

El iPhone 12 del ejemplo tiene batería 78 %, grado propuesto B e IMEI ficticio terminado en 5821. Los seis puntos configurados pasan la revisión. La batería es un dato separado del checklist. Son seis puntos ilustrativos de una configuración reducida, no una propuesta de reemplazar o eliminar los puntos reales del negocio. El umbral de 80 % es una regla ficticia configurada para cotizar, no un criterio técnico oficial ni una regla automática de aceptación.

## Recibir un usado

El primer paso agrupa cliente activo, producto usado activo con control por unidad, IMEI/serie, batería, grado y resultados del checklist. La selección del producto identifica dónde se creará la unidad; modelo, capacidad y color vienen de ese producto. El grado propuesto pertenece a la unidad y no obliga a crear otro SKU por grado. El formulario debe explicar qué falta si no hay producto compatible o grado activo, con acceso a su configuración para roles autorizados.

El IMEI de las imágenes está oculto por ser una demostración; una entrada real necesita el identificador completo y verificable. La máscara no es un valor válido para guardar. La validación conserva los formatos admitidos por el dispositivo y el sistema; no se impone que todo número de serie sea un IMEI de 15 dígitos. Batería requiere un entero válido entre 0 y 100 según el flujo actual; vacío no se convierte en cero. No se añaden observaciones libres, contraseñas o archivos al comprobante, que no forman parte de la recepción actual.

Los puntos obligatorios muestran su nombre y condición. Un punto obligatorio que no pasa bloquea la recepción y se identifica en el error. El resumen 6 de 6 es información de lectura, nunca un control para aprobar todo sin comprobar. La interfaz puede empezar sin selecciones y ofrecer un intento de continuar con errores claros, sin un botón inactivo inexplicable. Marcar un punto afirma que se comprobó, no que el CRM lo verificó automáticamente. Si no existe checklist configurado se conserva la regla real del sistema y se explica la ausencia; no se inventa una prohibición que el backend no tiene.

Continuar valida el paso sin emitir nada y conserva todas las respuestas. Volver a revisión no borra el valor ni el destino escrito en el paso siguiente. El segundo paso pide valor positivo y moneda, y permite elegir Compra del equipo o Permuta. El resumen expone cliente, producto, identidad, batería, grado y resultados antes de la confirmación final.

Destino del valor explica un uso financiero, no dónde se guarda el teléfono. No cambia una vez confirmado. Cambiar de idea después sigue el proceso vigente de anulación y nueva recepción, solo si se cumplen sus condiciones; no se habilita un selector editable sobre el documento emitido. Los importes respetan los decimales de cada moneda y no se convierten por seleccionar otra sin informar el cambio.

Confirmar recepción crea el PU y una unidad en revisión con el valor reconocido como costo inicial, sin cobro de venta ni pago al cliente. La unidad está bajo custodia pero fuera del saldo operativo vendible hasta su liberación. Una batería bajo umbral puede sugerir reparación, pero no crea una orden técnica automáticamente. Corregir, enviar a reparar y liberar se realizan desde la unidad, con los flujos de [V2-05](../05-productos/README-v2-05.md) y [V2-06](../15-reparaciones/README.md).

## Compra y pago al cliente

La ficha de compra muestra valor reconocido, pagos vigentes y cuánto falta. El panel de la imagen 04 revisa un pago manual por transferencia de ARS 190.000 sobre un pendiente igual. Cliente y recepción son contexto de solo lectura, con contraste normal: no deben parecer controles deshabilitados ilegibles. El medio y el importe se editan antes de la revisión final; se ofrece volver a esos datos sin perderlos. Registrar pago confirma el registro, no envía dinero ni verifica una transferencia.

Se vuelve a comprobar vigencia, destino Compra, saldo, medio y permisos al confirmar. Si otra persona paga mientras se prepara el formulario se actualiza la revisión y se conserva el borrador, sin permitir pagar de más. Si la respuesta es incierta se consulta el resultado antes de reenviar. No se muestra un número PPU nuevo ni éxito hasta tener confirmación.

Efectivo requiere sesión abierta y fondos suficientes en la moneda que sale. Pago en otra moneda usa el flujo y tasa admitidos por Caja, identificando importe aplicado, importe entregado y cotización; la muestra no lo representa ni propone conversión implícita. El medio de sistema Permuta no sirve para pagar una compra de usado. Un pago no libera la unidad a la venta y no modifica su costo inicial.

La ficha lista pagos y sus anulaciones con estado y enlaces. Anular un pago no es registrar una devolución bancaria efectiva. La restitución a una sesión de caja depende de si esa sesión sigue abierta, según las reglas actuales. Comprobantes PPU/APPU, medios, efectivo y conversión se completan con los patrones de V2-10; este lote muestra la consulta y revisión principal del pago, no todas sus variantes.

## Permuta y aplicación a ventas

La permuta no genera un PPU. Se aplica con el medio de sistema Permuta desde Registrar cobro de una venta del mismo cliente y en la misma moneda. El importe está limitado por el disponible del usado y por el pendiente de la venta. No funciona como seña de un pedido, cobro genérico a cuenta o conversión de monedas. Ver ventas del cliente navega a la selección de venta; no crea un cobro al pulsarlo.

PU-000082 tiene ARS 200.000 reconocidos; el cobro R-000173 de V-000218 aplica ARS 120.000 y deja ARS 80.000 disponibles. Cada aplicación permite abrir cobro y venta. Un cobro anulado se identifica con su documento de anulación y no consume disponible. No se borra de la historia. La revisión del cobro con Permuta se detalla en V2-09/V2-10; no está representada por un segundo formulario financiero dentro de Usados.

La anulación de una venta no anula automáticamente su cobro con Permuta. Se debe conservar el comportamiento de cuenta corriente existente y mostrar el estado real; no se anuncia que el usado quedó libre por anular solo la venta. Anular el cobro es una acción distinta. Los límites y permisos del circuito financiero no se cambian a partir de estas imágenes.

## Cotizador orientativo

Cotizar no persiste una tasación, recepción, acuerdo o reserva. Solicita producto, batería y checklist y muestra el resultado de las reglas actuales. La referencia viene del precio del producto, no de un precio universal de todo el modelo ni de una cotización de mercado externa. El margen sí se configura por modelo. No se solicita el cliente para este cálculo ni se guardan sus datos.

En la muestra: precio de referencia ARS 400.000 − costo de batería ARS 40.000 − margen del modelo ARS 60.000 = valor orientativo ARS 300.000. El margen es un importe fijo, no un porcentaje ni el margen bruto financiero de V2-05. Con rango de 10 %, el extremo inferior es ARS 270.000; ambos extremos se redondean hacia abajo a múltiplos de ARS 5.000. Aquí los extremos ya son múltiplos y no varían. El valor reconocido de ARS 290.000 es un acuerdo ilustrativo independiente, no un resultado guardado automáticamente del cotizador ni un límite obligatorio impuesto al operador.

La batería 78 % está por debajo del umbral ficticio 80 % y añade Cambio de batería una vez. Cada tipo de reparación necesario se cuenta una sola vez aunque varios puntos lo disparen. Fallos obligatorios impiden cotizar según las reglas actuales. Referencia, costos de reparación, margen y paso de redondeo deben coincidir en moneda: no se resuelve una incompatibilidad convirtiendo importes silenciosamente.

Falta de referencia, margen no configurado, reparación sin costo, reparación de batería sin asociar, moneda incompatible y resultado no positivo se muestran como causa concreta, no rango cero. Un margen configurado en cero sigue siendo un valor válido si el sistema lo permite, distinto de Sin configurar. Si un punto que falla carece de asociación se explica el tratamiento real y la limitación de la estimación; no se inventa un costo.

Cambiar producto, batería o checklist marca el resultado anterior como pendiente de recalcular y evita presentarlo como actualizado. Calcular conserva los datos y anuncia el nuevo resultado. El resumen del checklist no debe ser una casilla de selección global aunque su icono generado tenga esa forma. No se preaprueban todos los puntos al entrar. Consultar el cotizador desde la recepción conserva el borrador; no se envían datos ni se registra una compra por seguir el enlace.

## Checklist y reglas de configuración

Checklist permite añadir, renombrar, ordenar, activar/desactivar, indicar obligatoriedad y asociar una reparación. Su tabla evita editar toda la configuración a la vez; el panel muestra un punto y su efecto. Nuevo punto usa ese mismo panel vacío. Los controles subir/bajar son una alternativa accesible al arrastre y deben tener nombres con el punto afectado. No se borra un punto ya utilizado: se desactiva para futuras recepciones. Las antiguas conservan copia del nombre, obligatoriedad y resultado al emitirse.

La reparación asociada conecta un fallo con el costo por modelo configurado en Servicio técnico; no duplica sus precios en Usados. Los ejemplos Cámara trasera, Cámara frontal, Táctil → Cambio de pantalla y Face ID muestran relaciones ficticias configuradas. Señal e iCloud obligatorios no tienen reparación asociada en la muestra. La batería se gestiona con su umbral y tipo de reparación, fuera de los puntos.

Configuración separa Reglas y Márgenes por modelo. Reglas reúne umbral, reparación de batería, porcentaje del rango, paso y moneda de redondeo. Cada guardado tiene alcance explícito y no persiste cambios de margen de otras filas. El resumen de márgenes muestra iPhone 12 ARS 60.000 e iPhone 11 Sin configurar; su edición debe pedir importe y moneda, permitir cero cuando corresponda y conservar el valor ante error. Ese formulario y el listado completo de márgenes reutilizan el panel, sin imagen independiente en este lote.

Los campos muestran unidades: porcentaje para umbral/rango, importe para margen/paso. En listados con monedas distintas cada fila muestra su código; el encabezado ARS de la muestra solo es apropiado si todas las filas del ámbito usan ARS. Cambiar reglas no revaloriza unidades ni modifica recepciones ya emitidas. El origen y fecha del precio utilizado deben seguir disponibles al calcular sin prometer un histórico persistido de cotizaciones que el sistema no guarda.

## Comprobante, anulación y estados

El documento PU muestra recepción, cliente, equipo, checklist histórico, valor y destino. No certifica que se pagó. Su impresión excluye menú lateral, acciones y tarjeta de contexto. La leyenda Documento no válido como factura corresponde al patrón existente; no se añaden cláusulas, firmas ni términos de garantía inventados. Identidad del cliente y permisos siguen las reglas actuales de impresión: DNI no registrado se expresa así, sin impedir una recepción donde sea opcional. La muestra utiliza teléfono ficticio e IMEI oculto; una copia operativa debe usar los datos autorizados y verificables de su titular.

Anular permanece en el menú secundario y abre una revisión con documento, unidad, motivo y efectos. El motivo procede de la lista admitida. Se valida que la unidad siga en revisión o disponible y que no tenga pagos vigentes ni cobros con Permuta que la utilicen. La tarjeta PU-000084/U-0304 es otro caso sin pagos: no describe una anulación ya realizada ni una recepción adicional del listado de cuatro ejemplos.

Un bloqueo enlaza al pago/cobro correspondiente para revisarlo, sin anularlo de forma encadenada. Si se permite anular se emite el APU y se da de baja la unidad con la regla de saldo apropiada: desde revisión ya estaba fuera del saldo operativo; desde disponible afecta ese saldo. No se resta dos veces. Una unidad reservada, en reparación, vendida o ya dada de baja sigue las restricciones reales. La confirmación repite las comprobaciones ante concurrencia y no borra la recepción original.

Un IMEI vendido en el pasado no se trata como una colisión automática con una unidad que sigue en el local: el sistema permite su reingreso como otro registro conservando la historia. La búsqueda y el error deben identificar el caso correcto y la unidad actual. La imagen muestra una colisión con U-0301 que sí está en revisión. No se fusionan ambas unidades por el texto del IMEI.

## Roles, móvil y accesibilidad

Las imágenes muestran el rol Administradora. El rol de consulta conserva el alcance actual: recepción y checklist histórico sin valor reconocido, costos, pagos, disponible de permuta ni datos personales restringidos. No basta con esconder un número en pantalla: tablas, contadores financieros, documentos, búsqueda y respuestas del servidor deben aplicar la misma autorización. No se agrega un permiso nuevo por el solo hecho de dibujar una etiqueta Solo administración.

La ficha móvil usa tarjetas con importes apilados. El Más de secciones abre Documentos y Actividad; se diferencia del Más global con el nombre accesible Secciones de la recepción. Las acciones de unidad se abren desde su ficha. Preparar pago conserva área segura y espacio inferior; en formularios enfocados se evita que navegación y teclado oculten acciones o errores. Listado móvil y formularios completos en una columna reutilizan los patrones globales, sin capturas independientes en este lote.

Distinguir carga, falta de resultados, vacío inicial, datos antiguos y errores. Un fallo no sustituye importes o cantidades por cero. Guardar/confirmar informa del resultado confirmado sin robar el foco y conserva el borrador tras un rechazo. Cerrar el panel de pago no anula ningún pago previo. Descartar cambios requiere un aviso con opción segura de continuar editando cuando haya modificaciones.

Verificar contraste AA, reflujo a 320 px, zoom al 200 %, foco visible, etiquetas persistentes, errores asociados, teclado y objetivos táctiles de 44 px. Cada checkbox debe incluir el nombre de su comprobación; Aprobado no es un nombre accesible suficiente. El paso activo se anuncia, los errores llevan al campo o resumen pertinente y los paneles modales gestionan foco/fondo inerte/retorno al disparador. Las imágenes no certifican estos comportamientos.

## Producción y próximos pasos

Herramienta: ImageGen integrada. Once imágenes finales y cuatro ediciones dirigidas: destino del valor, controles/referencia del cotizador, contexto del comprobante y título de pagos en móvil. Se revisaron cifras, fechas, estados y ubicación de acciones. Se conservaron los originales de generación. Logotipo, iconos y colores planos definitivos siguen los activos y tokens aprobados, pese a variaciones menores del render.

Solo se añadieron imágenes, documentación y enlaces bajo docs/ui-redesign/v2. No se modificaron código, configuración, datos ni despliegues y no se registraron operaciones en el CRM. El índice enumera exactamente las vistas generadas; no afirma que todas las variantes de moneda, rol, impresión o modal tengan imagen propia. Los patrones reutilizados y formularios diferidos se indican arriba y se revisarán transversalmente en V2-13.

Prompts completos y rutas originales: [V2-07](prompts-v2-07.md). Próximo lote: V2-08 — Turnos.
