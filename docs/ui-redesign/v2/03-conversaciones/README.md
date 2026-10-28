# Conversaciones y atención — V2-02

Fecha: 27 de octubre de 2026. Seis mockups con datos ficticios, generados con ImageGen integrada. Se conserva el sistema violeta de V2-01. No se implementaron funcionalidades ni se cambiaron datos del CRM.

| Pantalla | Archivo |
|---|---|
| Bandeja de escritorio | [01 · Bandeja](desktop/01-bandeja-conversaciones-v2.png) |
| Conversación y contexto | [02 · Chat activo](desktop/02-chat-activo-v2.png) |
| Bandeja móvil | [03 · Bandeja móvil](mobile/03-bandeja-mobile-v2.png) |
| Chat móvil | [04 · Chat móvil](mobile/04-chat-mobile-v2.png) |
| Notas y control del agente | [05 · Atención humana](desktop/05-notas-control-agente-v2.png) |
| Estados operativos | [06 · Estados](estados/06-estados-atencion-v2.png) |

## Qué cambia y por qué

La bandeja sirve para decidir qué atender; el hilo sirve para responder. En escritorio se propone una lista con vista previa, seguida de un espacio de conversación enfocado con contexto lateral. Esto evita comprimir menú, lista, historial y ficha en cuatro columnas estrechas. Un clic abre la vista previa; Abrir conversación entra al hilo. Enter sobre una fila enfocada abre directamente el hilo. Se preservan búsqueda, filtros y desplazamiento al volver.

Los controles del agente viven en una franja estable debajo del nombre. El estado Abierta/Pendiente/Resuelta pertenece al hilo; Agente activo/Pausado pertenece a la automatización. No deben mezclarse. Tomar conversación pausa la respuesta automática y, tras confirmación del servidor, habilita el envío humano. Una nota interna no cambia ese estado. Resolver no reactiva al agente de forma implícita.

Responder y Nota interna tienen pestañas, etiquetas, iconos y botones distintos. El editor público dice Mensaje por WhatsApp y Enviar mensaje. El privado dice Nota para el equipo, explica su alcance y usa Guardar nota. Los borradores se guardan por conversación y por modo; cambiar de pestaña nunca convierte una nota en mensaje público. La pestaña privada se anuncia al lector de pantalla.

El contexto muestra información relacionada realmente disponible: ficha del cliente, reparación, turno y etiquetas. No se infiere que una reparación está lista por el contenido de un mensaje: el estado procede de la orden de servicio. No se confirma stock, precio ni reserva desde el texto del chat. Crear turno o pedido abre el formulario con cliente preseleccionado y requiere revisión antes de guardar.

En móvil la lista se transforma en tarjetas. El hilo oculta la navegación global y ofrece volver a Chats, menú Más y Ver contexto. Este último abre un panel accesible con los mismos datos del escritorio; la reparación seleccionada tiene su propio enlace de detalle. El editor se adapta al teclado y al área segura, y el historial mantiene espacio inferior suficiente para no quedar tapado.

## Controles y estados

- Resolver permanece arriba; el menú Más reúne cambio a Pendiente, historial de control del agente y otras acciones secundarias permitidas. En móvil Resolver se encuentra en Más. No se incorporan acciones de eliminación en este lote.
- Tomar conversación y Reactivar agente son cambios explícitos, limitados al hilo actual y sujetos a permisos. La tarjeta de confirmación de la imagen 05 ilustra el efecto; si no hay un envío en curso ni otra condición relevante, puede resolverse con un clic y aviso, sin confirmar cada cambio rutinario.
- Antes de ceder al agente con un borrador público, se explica qué ocurrirá y se conserva el texto. La pausa requiere coordinación con los envíos automáticos en curso; no basta con cambiar una etiqueta local.
- Sin leer se refiere a conversaciones con al menos un mensaje sin leer. El contador de cada fila representa mensajes sin leer. Los números de ejemplo no pretenden representar todos los registros y el listado muestra solo cinco de doce.
- El filtro Atención humana selecciona automatización pausada para atención, independientemente del estado del hilo. Los filtros se pueden combinar, se muestran activos y se pueden limpiar.
- La vista previa no debe marcar como leído automáticamente ni vaciar contadores antes de que se alcance el criterio de lectura definido. Nunca se presenta En línea a partir de datos no disponibles.
- Un mensaje distingue Enviando, Enviado, Entregado, Leído y Fallido únicamente si el proveedor confirma cada etapa. Los dobles checks ilustrativos del mockup no sustituyen esa confirmación; Entregado no significa Leído.
- Reintentar envío reutiliza el identificador de operación y consulta primero si el mensaje fue aceptado. Una respuesta incierta de red se presenta como Estado por confirmar, evitando duplicados.
- Sin conexión se bloquea enviar, pero se conserva la edición del borrador y el trabajo interno disponible. La imagen 06 simplifica el compositor deshabilitado: el campo de redacción debe seguir siendo editable. Revisar conexión abre la configuración solo para personas autorizadas; el resto ve instrucciones para contactar a administración.
- Reabrir restaura el hilo sin alterar la automatización. La política de reapertura por un nuevo mensaje entrante debe definirse explícitamente; no se presupone en el mockup.

## Alcance actual y propuestas

El relevamiento previo identificó bandeja, hilo, notas, pausa del agente y cambio de estado. Los filtros combinados, contadores nuevos, vista previa, accesos contextuales, bloqueo coordinado entre agente y persona, adjuntos y comportamiento de reintento son propuestas a contrastar con las capacidades del sistema antes de implementar. No se presupone que existan asignaciones, SLA, omnicanalidad o plantillas de WhatsApp. No se añadieron esos elementos al flujo principal.

El contenido sobre retiro de equipos y documentación es demostrativo: no define una política comercial ni un requisito legal. Los datos de contacto son ficticios.

## Accesibilidad y criterios visuales

Mantener foco visible, navegación de lista y pestañas con teclado, encabezados semánticos, controles con nombre accesible y áreas táctiles de 44 px. Anunciar nuevos mensajes sin robar el foco ni leer todo el historial de nuevo. Si la persona está leyendo mensajes anteriores, mostrar un acceso Nuevos mensajes en lugar de moverla al final. Diferenciar nota y respuesta por texto e icono, además del color.

A 320 px se apilan título y conexión; las pestañas no comprimen el texto hasta hacerlo ilegible. Los filtros largos pueden usar desplazamiento horizontal con indicación visible. La imagen móvil es una composición de referencia, no una verificación del reflujo. Conservar el logotipo original y usar tokens de color planos; ligeras variaciones del render no proponen un cambio de marca.

Revisión realizada: legibilidad, notas frente a mensajes, contexto del negocio y coherencia de navegación. Se corrigió una variante oscura del lateral y un texto contradictorio sobre el agente. Las imágenes no certifican contraste ni comportamiento de teclado: se validarán al implementar.

Prompts: [Especificaciones del lote](prompts-v2-02.md). Siguiente lote: V2-03 — Clientes 360.
