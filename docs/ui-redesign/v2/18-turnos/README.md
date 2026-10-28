# Turnos — V2-08

Fecha: 27 de octubre de 2026. Diez imágenes de propuesta con datos ficticios y la paleta aprobada. Se amplía el rango orientativo del plan para separar agenda semanal, trabajo diario, solicitudes del agente, atención, configuración y dos vistas móviles.

| # | Vista | Imagen |
|---|---|---|
| 01 | Calendario de lunes a domingo | [Semana](desktop/01-calendario-semanal-v2.png) |
| 02 | Turnos y disponibilidad del día | [Agenda diaria](desktop/02-agenda-diaria-v2.png) |
| 03 | Cliente, motivo, franja, referencia y revisión | [Nuevo turno](desktop/03-nuevo-turno-v2.png) |
| 04 | Solicitud del agente pendiente de confirmación | [Ficha de turno pedido](desktop/04-turno-pedido-agente-v2.png) |
| 05 | Confirmado, acciones y revisión de atención | [Registrar atención](desktop/05-turno-confirmado-atencion-v2.png) |
| 06 | Duración, cupo y acceso al horario | [Configuración de agenda](desktop/06-configuracion-agenda-v2.png) |
| 07 | Listado, orden y edición de motivos | [Motivos de visita](desktop/07-motivos-turnos-v2.png) |
| 08 | Agenda de tarjetas y acceso a franjas | [Agenda móvil](mobile/08-agenda-diaria-mobile-v2.png) |
| 09 | Alta con selección táctil y resumen | [Nuevo turno móvil](mobile/09-nuevo-turno-mobile-v2.png) |
| 10 | Falta de horario, falta de lugar, concurrencia, conflictos, cancelación y permisos | [Estados y decisiones](estados/10-estados-conflictos-turnos-v2.png) |

## Base y alcance

Se parte del [inventario visual](../../00-auditoria-actual/inventario-pantallas-v2.md), el [plan de lotes](../../00-auditoria-actual/plan-lotes-v2.md) y los diseños anteriores. Se consultaron solo en lectura los briefs de [Turnos](../../../decisions/brief-29.10-los-turnos.md) y [Turnos para el agente](../../../decisions/brief-29.10.2-los-turnos-para-el-agente.md), las pantallas de Calendario, Nuevo turno, Detalle y Configuración, y los servicios, mensajes y esquema de appointments. Para reutilizar U-0102 se contrastó el [inventario V2-05](../05-productos/README-v2-05.md).

Este lote no accedió a clientes reales ni volvió a recorrer la versión desplegada. Su evidencia funcional procede del código y la documentación locales, que pueden cambiar mientras continúa el desarrollo. No se ejecutó la aplicación, pruebas ni migraciones y no se modificó código, configuración o datos del CRM.

Son propuestas de presentación: grilla semanal, filtros y contadores diarios, resumen antes de guardar, panel de revisión de atención, pestañas internas Agenda/Motivos y retorno al formulario desde Clientes. No se prescriben tablas nuevas ni cambios de reglas o contratos. Los contadores, la preservación de borradores entre rutas, la actualización de disponibilidad y las alertas agregadas requieren su implementación y verificación posterior.

## Organización y jerarquía

Turnos se mantiene bajo Atención, junto a Conversaciones y Clientes. Calendario es el acceso operativo; Configuración queda para administración. Nuevo turno es una única acción principal en la agenda, sin repetirla como pestaña y botón a la vez.

La semana sirve para ubicar visitas y huecos. El día combina dos lecturas: quién viene y cuándo puede reservarse. No se repiten acciones de gestión en cada fila: Ver turno abre una ficha con contexto. Una franja libre puede precargar fecha y hora en Nuevo turno. Cambiar de vista conserva la fecha; volver de una ficha recupera la fecha, los filtros y la posición anteriores. Hoy se calcula en la zona del negocio.

El calendario semanal muestra siete días. Un bloque corresponde a una sola franja de 30 minutos; los cierres y el intervalo entre tramos se distinguen de la falta de lugar. En el mockup compacto se ven nombre, hora y estado; al abrir el turno se encuentra el motivo completo. Para teclado y lector de pantalla, cada bloque debe anunciar fecha, rango, cliente, motivo, origen y estado sin depender de hover. Una lista diaria ofrece la misma información sin exigir navegar una grilla.

La semana no habilita arrastrar turnos. Las celdas vacías no implican que siempre se pueda reservar: las franjas que empezaron, los cierres y las fechas fuera del horizonte no ofrecen alta. El render semanal no rotula cada celda pasada del martes; en implementación deben quedar inhabilitadas y distinguirse también con texto accesible, como Ya empezó. El sombreado de un lunes histórico no significa que ese día estuviera cerrado.

## Estado del turno y disponibilidad

Son dimensiones distintas:

| Estado del turno | Ocupa cupo por superposición | Acciones administrativas |
|---|---|---|
| Pedido | Sí | Confirmar o cancelar |
| Confirmado, antes de empezar | Sí | Cancelar; atención y ausencia todavía no disponibles |
| Confirmado, desde su inicio | Sí | Marcar atendido, marcar ausente o cancelar |
| Atendido | No | Consulta e historial |
| Ausente | No | Consulta e historial |
| Cancelado | No | Consulta e historial |

Atendido, Ausente y Cancelado son finales. No se ofrece reapertura ni cambio directo entre ellos. Haber terminado el horario no marca automáticamente una ausencia. Las imágenes de revisión todavía no registraron el cambio: Valentina continúa Confirmado en las agendas.

Libre significa que la franja vigente no empezó y tiene cupo. Completa significa que alcanzó el cupo; Sobre el cupo es un conflicto de turnos ya existentes. Ya empezó bloquea nuevas altas aunque su ocupación sea cero. Cerrado describe el horario del local; no es un estado de turno. Un día sin configuración, un día cerrado y un día abierto sin lugar necesitan mensajes distintos.

La ocupación cuenta pedidos y confirmados que se superponen, incluidos los que nacieron con otra duración. No se calcula con la cantidad de filas visibles después de filtrar por estado. Los contadores de Todos, Pedidos, Confirmados y Atendidos corresponden al día seleccionado y al mismo conjunto de registros. La aplicación debe poder filtrar también cancelados y ausentes cuando existan; no quedan excluidos porque el ejemplo no tenga ninguno.

## Nuevo turno

Cliente existente y activo, motivo activo, fecha y franja son obligatorios. Crear cliente es un acceso al módulo Clientes que debe conservar el borrador y volver con el cliente elegido; no permite registrar nombre y teléfono sueltos como sustituto. La fecha y la consulta de disponibilidad se reúnen en el mismo formulario para evitar perder lo ya escrito al cambiar de día.

La referencia es opcional y excluyente: producto o equipo, nunca ambos. El ejemplo llega desde Dar un turno de la unidad U-0102. La referencia es de solo lectura en esta propuesta; no se inventa un buscador universal de unidades o una reserva de inventario. El formulario sin referencia reutiliza la misma estructura y omite el bloque. La validación actual exige producto activo o unidad existente que no esté dada de baja; el acceso mostrado desde inventario es el de una unidad disponible.

La nota admite hasta 500 caracteres. El texto del ejemplo tiene 38. No se incorporan pagos, señas, técnicos, salas ni duración específica por motivo.

Las franjas se generan desde cada apertura, de acuerdo con la duración configurada, y deben terminar dentro del mismo tramo abierto. Se aplica el horario efectivo de cada fecha, incluidas las excepciones. La app admite hasta 90 días hacia adelante y nunca una franja ya empezada. El alta hecha por administración nace Confirmado. Seleccionar una hora o consultar disponibilidad no la reserva: al guardar se vuelve a comprobar el cupo. Un rechazo conserva cliente, motivo, referencia y nota; requiere elegir otra hora antes de reintentar.

El resumen es una previsión de lo que ocurrirá al guardar, aunque el mockup de escritorio acorte el rótulo a Estado del turno / Confirmado. El móvil lo explicita como Confirmado al guardar. Hasta recibir éxito no hay turno confirmado ni actividad nueva. El estado pendiente evita dobles envíos y el error no cierra el formulario.

## Pedidos por el agente

Pedido es una solicitud que requiere intervención humana y ya consume cupo. Confirmar conserva ese lugar, no suma otro. La ficha destaca el origen y el emisor de la credencial con su etiqueta legible; no expone claves, identificadores técnicos del evento ni datos de integración.

La lectura y el pedido del agente tienen sus propias reglas: horizonte de 14 días, al menos dos horas de anticipación y una solicitud pendiente por cliente según el contrato actual. Estas restricciones no reemplazan los 90 días de la app ni se agregan al alta manual. La lectura de franjas no reserva. Un Pedido no vence solo por falta de confirmación.

Confirmar registra un cambio en el CRM; el sistema actual no envía notificaciones ni recordatorios. La ficha no añade botones de envío ni promete que el cliente recibió el aviso. El agente no confirma, cancela o mueve turnos.

La confirmación actual de un pedido no vuelve a validar el horario ni rechaza un conflicto de cupo que haya aparecido después por un cambio de configuración. La propuesta debe mostrar esas advertencias en la agenda y en la revisión del turno para que una persona decida; no dibuja una garantía nueva del servicio.

## Atención y cancelación

Cuando ya empezó un turno confirmado, Marcar atendido es la acción principal y Marcar ausente queda como alternativa secundaria. Un panel de revisión muestra cliente, fecha, estado actual y destino antes del cambio final. Mientras esté abierto, el fondo es inerte; cerrar o Volver descarta únicamente esa revisión. El mockup no implica que los controles del fondo sigan activos.

Registrar atención no crea una reparación, una venta, una recepción de usado ni un cobro. Las operaciones posteriores se realizan en sus módulos. La ausencia utiliza la misma estructura de revisión y explica su propio estado final.

Cancelar turno se ubica en el menú secundario de la ficha. El diálogo muestra el turno concreto y que el cambio es final, libera su lugar y no envía avisos. El foco inicial corresponde a Conservar turno; Cancelar turno usa tratamiento destructivo. No se exige un motivo de cancelación nuevo, porque el modelo actual no guarda ese campo.

Cambiar día, hora, cliente, motivo, referencia o nota de un turno dado no tiene edición general en el módulo actual. Para cambiar horario se cancela y se carga otro. Debe indicarse que son dos operaciones: el nuevo hueco no queda garantizado al cancelar el anterior. No se ofrece Reprogramar como si fuese una operación atómica existente.

## Configuración

Agenda mantiene la duración global y el cupo del local. Las duraciones admitidas son 15, 20, 30, 45, 60, 90 y 120 minutos; el cupo es de 1 a 20 por franja. La vista previa ilustra la duración y el cupo elegidos; no promete disponibilidad real.

El horario se muestra en lectura con un acceso a Información > Horarios. Horarios y excepciones conservan un único lugar de edición. La zona proviene de la organización; no se añade otro selector independiente en Turnos. Un cambio de horario, duración o cupo conserva los inicios, finales y estados de los turnos existentes. Se deben revisar las advertencias Fuera de horario y Sobre el cupo, sin autocancelación ni movimiento silencioso.

Los valores aún marcados como ejemplo deben conservar su aviso Del perfil hasta que administración los confirme al guardar. El ejemplo de este lote representa valores ya confirmados; no elimina esa condición del producto real.

Motivos separa altas, renombre, orden y activación. Las flechas permiten ordenar con teclado sin depender de arrastrar. Se puede desactivar y reactivar; no se borra un motivo utilizado. Los turnos conservan su asociación y pueden seguir consultándose. El nombre admite hasta 60 caracteres, es único sin distinguir mayúsculas y hay hasta 20 motivos. Un nombre duplicado o un guardado rechazado conserva el panel y señala el campo. No se añaden precios o duraciones por motivo.

El panel Editar motivo dibuja renombre y un acceso separado a desactivar. Desactivar es su propia acción: no guarda tácitamente un nombre pendiente. Si hay cambios sin guardar, se conserva el borrador o se pide resolverlos antes de salir. El alta de motivo reutiliza el panel con nombre vacío y Crear motivo; la reactivación invierte el estado sin perder el orden.

## Roles y accesibilidad

Administración gestiona turnos, estados y configuración. Un viewer puede consultar calendario, detalle e historial; no ve acciones de alta, cambios ni Configuración. La vista de consulta de la lámina representa esa condición, no un permiso nuevo. Sin la capacidad appointments el módulo no se ofrece para esa organización.

Se mantiene Manrope y la paleta: fondo #F6F5FB, superficies blancas, lateral #F1EEFB, texto #17142E, secundario #5A5573, bordes #E3DFF0, primario #6D28D9 y selección #EDE7FE. Pedido usa ámbar, Confirmado violeta, Atendido verde y estados finales de ausencia/cancelación gris; siempre con texto e icono. El logotipo y los iconos definitivos siguen siendo los originales de Vixora. El wordmark oscuro y las variaciones de los renders no proponen sustituir activos de marca. Los fondos y botones deben implementarse planos aunque una imagen generada muestre variaciones tonales.

Objetivos pendientes de comprobar al implementar: contraste AA, zoom 200 %, reflujo a 320 px, controles táctiles mínimos de 44 px, foco visible, etiquetas persistentes y errores asociados. Los radios de franjas se agrupan con leyenda y rango anunciado; la selección no se expresa solo con color. Los controles con flechas y puntos tienen nombres accesibles específicos. Los paneles retienen el foco, admiten Esc cuando corresponde y devuelven el foco al disparador. Los cambios de fecha y disponibilidad se anuncian sin mover el foco inesperadamente.

En móvil, Turnos y Franjas separan tareas y Más sigue seleccionado en la navegación global. La configuración se alcanza desde el menú contextual de Turnos para administración, aunque no quede dibujada en la agenda compacta. Semana puede abrir una lista agrupada por día; no exige comprimir siete columnas en 320 px. Durante el alta se omite la barra global para dar lugar al formulario y al teclado. La barra de acciones debe respetar el área segura, adaptarse al teclado y permitir llegar a todos los campos sin taparlos.

Las imágenes no certifican accesibilidad ni funcionamiento. Los textos de carga y error no deben reemplazar turnos válidos por una agenda vacía; se conserva la última información, se indica su antigüedad y se ofrece reintento. Un estado desactualizado muestra el resultado vigente antes de ofrecer otra acción.

## Datos ficticios y consistencia

Reloj ilustrativo: martes 27 de octubre de 2026, 11:05, Buenos Aires (UTC−3). Duración 30 minutos; cupo 1. Lunes a viernes 10:00–13:00 y 16:00–19:00; sábado 10:00–13:00; domingo cerrado. No describe el horario real de producción.

| Fecha y hora | Cliente | Motivo | Estado en la agenda | Origen |
|---|---|---|---|---|
| 27 oct, 10:00–10:30 | Julieta Paz | Retirar un equipo | Atendido | Equipo |
| 27 oct, 11:00–11:30 | Valentina Costa | Reparación o diagnóstico | Confirmado | Equipo |
| 27 oct, 12:00–12:30 | Bruno Acosta | Ver o comprar un equipo | Pedido | Agente · WhatsApp |
| 27 oct, 16:00–16:30 | Emilia Torres | Entregar un usado | Confirmado | Equipo |
| 28 oct, 10:00–10:30 | Gabriel Medina | Visita de ejemplo, detalle no representado | Confirmado | No representado |
| 31 oct, 11:00–11:30 | Renata Díaz | Visita de ejemplo, detalle no representado | Confirmado | No representado |

El día 27 contiene cuatro turnos: un Pedido, dos Confirmados y un Atendido. El pedido de Bruno se recibió el 26 oct a las 17:10 y refiere al producto iPhone 13, 128 GB, Medianoche, Usado. Su nota compara 128 y 256 GB. El turno de Valentina fue dado por Carla Méndez el 26 oct a las 16:20; no tiene referencia de producto/unidad. Su nota consulta una falla intermitente de carga. La revisión de atención aún no se guardó.

Nadia Castro, 28 oct de 11:00 a 11:30, es un borrador y no se suma a la agenda semanal ni a sus seis visitas. Refiere exclusivamente a U-0102, IMEI ficticio terminado en 1422, que se conserva del lote de inventario. La nota es Quiere ver el equipo antes de decidir. El primer horario de la mañana no está entre sus opciones porque Gabriel ocupa 10:00–10:30.

Los conflictos de la lámina son escenarios alternativos, no turnos omitidos de la semana principal: Emiliano Roca fuera de horario el 29 oct a las 19:00 y dos turnos en una franja con cupo 1 el 30 oct a las 16:00 ilustran cambios posteriores de configuración. Tampoco el escenario Sin lugar del 28 oct describe la disponibilidad del borrador de Nadia. Los teléfonos secundarios aparecidos en la imagen diaria son ilustrativos; no se tomaron de registros reales ni definen datos necesarios del módulo.

## Cobertura y producción

Hay imágenes independientes para las diez vistas del índice. Confirmación de Pedido, ausencia, alta y reactivación de motivo reutilizan los patrones descritos; no tienen capturas adicionales de cada combinación. Falta de duración/cupo, falta de motivos activos, cliente inactivo, referencia invalidada, fecha pasada, más de 90 días, valores Del perfil, carga, error de red y conflicto de estado se especifican aquí, pero no se representan todos como tarjetas independientes. La lámina no es un inventario visual exhaustivo de cada rechazo.

Se usó ImageGen integrada, con una llamada por pieza y cuatro correcciones dirigidas: retirar una referencia extra y corregir el contador móvil; corregir el contador de escritorio; alinear el IMEI de escritorio y móvil con inventario. Se revisaron las diez imágenes y se comprobaron archivos, dimensiones y enlaces locales. No se ejecutaron pruebas de la aplicación para un lote exclusivamente visual.

Dimensiones finales: siete imágenes de escritorio/estados a 1672 × 941, la ficha de atención a 1603 × 981 y dos móviles a 941 × 1672. La ficha de atención conserva su encuadre original más alto; no se recortó ni se estiró para igualarla. Los originales y variantes permanecen en la carpeta de imágenes generadas; las diez versiones finales están copiadas aquí.

Prompts exactos y trazabilidad: [V2-08](prompts-v2-08.md). Índice global: [Manifest V2](../manifest-v2.md). Próximo lote: V2-09 — Pedidos y ventas.

