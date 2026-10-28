# Clientes 360 — V2-03

Fecha: 27 de octubre de 2026. Ocho mockups para el negocio de venta y servicio de iPhone, con datos ficticios y la paleta aprobada. Se amplió este lote respecto del rango orientativo del plan para cubrir listado y ficha móvil por separado.

| # | Vista | Archivo |
|---|---|---|
| 01 | Listado de clientes | [Escritorio](desktop/01-listado-clientes-v2.png) |
| 02 | Alta y estructura de edición | [Formulario](desktop/02-alta-edicion-cliente-v2.png) |
| 03 | Ficha: Resumen | [Ficha 360](desktop/03-ficha-resumen-v2.png) |
| 04 | Ficha: Operaciones | [Relaciones comerciales y servicio](desktop/04-operaciones-relacionadas-v2.png) |
| 05 | Ficha: Cuenta corriente | [Cuenta y cobro](desktop/05-cuenta-corriente-cobro-v2.png) |
| 06 | Listado móvil | [Tarjetas](mobile/06-listado-mobile-v2.png) |
| 07 | Ficha móvil | [Resumen móvil](mobile/07-ficha-mobile-v2.png) |
| 08 | Etiquetas, actividad y estados | [Vistas complementarias](estados/08-etiquetas-actividad-estados-v2.png) |

## Decisión central

La ficha deja de ser una página extensa con todas las relaciones apiladas. Cuatro pestañas separan intenciones: Resumen para decidir qué atender; Operaciones para encontrar registros; Cuenta corriente para consultar movimientos y cobrar; Actividad para reconstruir interacciones. El contexto del cliente y los accesos principales se mantienen en la misma ubicación.

El primer bloque del Resumen es la próxima atención disponible, no una métrica comercial. El ejemplo combina una reparación lista y un turno de retiro. Si hay varias acciones, se ordenan por vencimiento o fecha y se muestra Ver todas. Si no hay pendientes, ese bloque se reemplaza por un estado neutral; no se inventa una recomendación. La fecha del turno y el estado de reparación provienen de sus módulos.

## Listado y búsqueda

El listado muestra nombre, contacto, etiquetas, operaciones abiertas y saldo por moneda. El nombre abre la ficha. La búsqueda conserva texto y filtros al volver. Las vistas Todos, Con saldo y Con reparaciones son filtros combinables con etiquetas y actividad; sus contadores se calculan sobre un ámbito definido, no sobre la página visible.

Los saldos positivos se rotulan Pendiente, sin afirmar que estén vencidos. ARS y USD no se suman. Si una persona tiene ambas monedas, se muestran en líneas separadas o se permite seleccionar la moneda. Sin saldo pendiente solo se muestra tras una consulta válida; un error se presenta como No disponible. Las columnas financieras se ocultan para roles sin permiso, sin revelar los importes en tooltips o exportaciones.

Las casillas del listado permiten selección para una acción concreta, como aplicar o quitar etiquetas. Al seleccionar se muestra una barra contextual con cantidad, alcance y Cancelar selección. No hay eliminación masiva propuesta. El menú de fila reúne Ver ficha, Editar y Gestionar etiquetas, según permisos. No se cambian datos por hacer clic en una tarjeta.

## Alta y edición

El formulario propone nombre y teléfono como mínimos para una ficha conectada a WhatsApp; los requisitos reales deben conservar las reglas del negocio, incluyendo clientes sin WhatsApp si están permitidos. Correo, documento, domicilio y observaciones son opcionales salvo necesidad explícita del flujo. La sección de identificación se despliega con tipo y número de documento; domicilio con dirección, localidad y provincia, solo para campos disponibles en el sistema. No se agregan campos al modelo de datos por el solo hecho de aparecer en esta propuesta.

La edición reutiliza las secciones y cambia el título a Editar cliente y la acción a Guardar cambios. Cambiar el teléfono de una ficha con conversaciones requiere revisar la vinculación; no se reasignan historiales por coincidencia de texto. Los errores conservan los valores, identifican el campo y llevan el foco al resumen de errores al intentar guardar. La imagen 08 muestra un botón deshabilitado de forma ilustrativa: preferir permitir el intento de validación y explicar los errores, evitando un control inactivo sin motivo accesible.

La detección de duplicados es una mejora propuesta. Primero se normaliza el teléfono y se comprueban coincidencias; un nombre parecido no basta para fusionar. La advertencia ofrece consultar la ficha existente y volver al formulario con el borrador intacto. No se fusionan registros automáticamente. La unicidad y las excepciones para teléfonos compartidos se validan con las reglas del negocio.

## Operaciones y equipos

La pestaña reúne ventas, pedidos, reparaciones, turnos y recepciones de usados vinculados al cliente. Cada tipo tiene su estado propio y un enlace a su ficha de origen. Nueva operación despliega únicamente las opciones disponibles para el rol, preselecciona al cliente y abre un formulario; no registra nada directamente.

Los importes son referencias de operaciones diferentes: no se suman compras de usados, ventas, pedidos y reparaciones en un total engañoso. Una operación asociada con otra puede aparecer como registro relacionado sin duplicar su impacto contable. El saldo depende del libro de cuenta, no de sumar la tabla de Operaciones.

La consulta por IMEI usa las unidades realmente vinculadas. Equipos comprados se encuentra mediante Ventas y su detalle de unidades; no presupone propiedad actual del equipo ni garantía vigente. Los vínculos con reparaciones y usados se muestran con su procedencia. Los registros se ordenan por fecha descendente de forma predeterminada; la flecha de orden ilustrativa debe reflejar ese orden.

## Cuenta corriente y cobro

El ejemplo es consistente: saldo inicial ARS 0, cargo ARS 65.000, cobro registrado ARS 30.000 y saldo pendiente ARS 35.000. El cobro de ARS 35.000 que se redacta en el panel todavía no forma parte del libro. La previsión de ARS 0 se rotula estimada hasta la confirmación.

Registrar cobro es la acción principal de esta pestaña para roles autorizados; Abrir conversación se mantiene como acceso secundario al operar en Finanzas. El mockup muestra el panel abierto, por lo que su disparador queda fuera de ese estado. El panel se trata como diálogo: fondo inerte, foco contenido, cierre accesible y regreso al disparador. En móvil ocupa la pantalla y conserva el borrador al volver.

Revisar cobro muestra un resumen con cliente, moneda, importe, medio y destino antes de Confirmar cobro. Guardar se ejecuta una sola vez y no se repite ante respuestas de red inciertas sin consultar el estado. Si el saldo cambió mientras se completaba el panel, se actualiza la revisión antes de confirmar. Se validan importes positivos, decimales y permisos. Un excedente debe explicarse como posible crédito a favor y depender de las reglas admitidas, no descartarse silenciosamente.

Cuenta de destino representa el medio/cuenta disponible en Caja; no exige crear integración bancaria. Una transferencia registrada manualmente no equivale a una transferencia verificada. La sesión de caja, fecha y comprobante siguen las reglas del módulo financiero. La revisión final, el comprobante y otros estados financieros se desarrollarán en V2-10.

## Etiquetas y actividad

Gestionar etiquetas abre la administración para personas autorizadas; Editar etiquetas en la ficha solo cambia la asignación a ese cliente. Color, texto e iconos no sustituyen el nombre. Renombrar una etiqueta actualiza sus apariciones; quitarla de un cliente no borra la etiqueta global. La eliminación de una etiqueta utilizada requiere informar el alcance y conservar registros históricos según el sistema.

Actividad es una cronología con autor, fecha, origen y enlace al registro. Integra interacciones autorizadas y cambios operativos, evitando mezclar auditoría técnica detallada con el resumen diario. El panel 05 de la imagen 08 ilustra esta pestaña; no es un historial exhaustivo. Los eventos solo aparecen si la fuente los proporciona. No mostrar notas privadas ni movimientos financieros a personas sin acceso a ellos.

## Móvil y accesibilidad

El listado se convierte en tarjetas, sin una tabla comprimida. La ficha conserva las cuatro pestañas; a 320 px pueden desplazarse horizontalmente con indicación visible y manteniendo la seleccionada a la vista. Los formularios pasan a una columna, mantienen etiquetas persistentes y muestran Guardar encima del teclado o en un pie que no cubra contenido. Un registro financiero usa una vista enfocada, sin dos barras fijas en competencia.

Verificar al implementar: contraste AA, reflujo, zoom, foco visible, orden de lectura, nombres accesibles de copiar/editar, tablas con encabezados asociados, estados anunciados y objetivos táctiles de al menos 44 px. Los avisos de guardado no roban el foco. La carga muestra skeleton; un error parcial no convierte valores desconocidos en cero ni bloquea toda la ficha.

## Alcance y revisión

El relevamiento identificó listado, alta/edición, ficha, etiquetas, cuenta corriente/cobro y relaciones con operaciones. La navegación por cuatro pestañas, la tabla unificada, los filtros/contadores, los accesos contextuales y la prevención de duplicados son propuestas de UX sujetas a las capacidades reales. No se implementó ni verificó su soporte en el backend durante este lote.

Se generaron ocho imágenes con ImageGen integrada y dos correcciones dirigidas: coherencia de la cronología y texto de ayuda del formulario. Se revisaron importes, estados, legibilidad y ubicación de acciones. El logotipo definitivo sigue siendo el activo original; variaciones de la V o leves tonos del render no proponen reemplazarlo ni cambiar la paleta. Ninguna imagen constituye certificación de accesibilidad.

Solo se añadieron imágenes y documentación en docs/ui-redesign/v2. Los originales V1 permanecen intactos. Prompts completos: [V2-03](prompts-v2-03.md).

Próximo lote: V2-04 — Catálogo, modelos y grados.
