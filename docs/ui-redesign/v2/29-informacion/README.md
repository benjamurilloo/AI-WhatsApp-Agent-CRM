# Información, horarios y usuarios — V2-12

28 de octubre de 2026. Lote terminado y verificado: 14 imágenes con datos ficticios. Solo se añaden propuestas visuales y documentación, sin modificar código, configuración o datos del CRM.

| Módulo | Piezas | Índice |
|---|---:|---|
| Información y estados compartidos | 5 | Este documento |
| Horarios y días especiales | 3 | [Horarios](../30-horarios/README.md) |
| Usuarios y primer ingreso | 6 | [Usuarios](../31-usuarios/README.md) |

| # | Pantalla | Imagen |
|---|---|---|
| 1 | Base de conocimiento | [Ver](desktop/01-base-conocimiento-v2.png) |
| 2 | Nueva entrada y vigencia | [Ver](desktop/02-nueva-entrada-v2.png) |
| 3 | Detalle y actividad | [Ver](desktop/03-detalle-entrada-v2.png) |
| 12 | Información móvil en consulta | [Ver](mobile/04-informacion-consulta-mobile-v2.png) |
| 14 | Estados y decisiones | [Ver](estados/05-estados-administracion-v2.png) |

Se amplía el rango orientativo del [plan](../../00-auditoria-actual/plan-lotes-v2.md) para representar los tres módulos y el primer ingreso sin mezclar credenciales con administración. [Prompts completos](prompts-v2-12.md) · [Índice global](../manifest-v2.md).

[Registro de producción y verificación](produccion-v2-12.md). Herramienta ImageGen integrada, una llamada por pieza y cinco correcciones. Archivos, dimensiones y enlaces locales comprobados.

## Base y alcance

Revisión de lectura local de los servicios y pantallas de knowledge, sus horarios, organizations, Usuarios y cambiar-contrasena. Referencias: [Información del negocio](../../../decisions/brief-11.2-informacion-del-negocio.md), [horarios estructurados](../../../decisions/brief-17.4-informacion-del-negocio-estructurada.md), [usuarios y roles](../../../decisions/brief-3.7-gestion-de-usuarios-y-roles.md) y [Turnos V2-08](../18-turnos/README.md). Se consultó también la validación de contraseña para no inventar requisitos. No se volvió a recorrer producción ni se leyeron clientes, usuarios o secretos reales. El código puede seguir cambiando mientras avanza Claude Code.

## Navegación y tareas

Administración agrupa Información, Horarios y Usuarios. Información ofrece Entradas y un acceso explícito a Horarios; ambos caminos llevan al mismo editor de horarios. No se generan dos configuraciones independientes. Nueva entrada es la acción de listado; Editar entrada la de su ficha. Desactivar y reactivar se agrupan en Más según el estado, con revisión si corresponde. No se propone borrar entradas o restaurar una versión del historial.

Una entrada es título, categoría y contenido de texto plano, con vigencia opcional. No se convierte en una página pública ni en un envío de WhatsApp. La vista previa indica qué se está preparando y no simula una respuesta garantizada del agente. Guardar cambia la información que puede consultar en próximas lecturas; no prueba que el agente ya la haya leído o enviado a alguien.

Colores semánticos para implementación: Vigente/Activo verde; Programada violeta; Vencida/Inactiva/Cerrado gris; advertencias ámbar y errores/confirmaciones destructivas rojo. Algunos renders presentan Inactivo o Cerrado en rojo: se debe aplicar la asignación anterior para no comunicar un error en un estado normal. Los colores y los matices del render no sustituyen estos tokens.

## Vigencia y edición

Título obligatorio hasta 200 caracteres, único en la organización sin distinguir mayúsculas, también frente a entradas inactivas. Categoría obligatoria hasta 100 caracteres, con sugerencias reutilizables pero editable; no se crea una nueva administración de categorías. Contenido obligatorio hasta 4.000 caracteres, texto plano, saltos de línea normalizados y sin editor enriquecido. Se conservan los valores al rechazar el guardado.

Inicio y fin son fechas de calendario de la zona de la organización. Vacío a la izquierda: sin límite inicial; vacío a la derecha: sin vencimiento. El fin es inclusivo y puede coincidir con el inicio. Fin anterior a inicio es inválido. El estado se deriva: Inactiva prevalece; una entrada activa futura es Programada; activa con fin anterior a hoy es Vencida; las demás son Vigentes. No se agrega estado Borrador o Publicada ni se guarda el estado derivado como un selector.

Solo entradas vigentes se ofrecen al agente. Desactivar no borra el texto ni altera fechas; reactivar conserva la vigencia y puede resultar Programada o Vencida. Reactivar no equivale a renovar el período. La edición comparte los mismos campos que el alta, con valores existentes y Guardar cambios. Guardar una entrada inactiva tampoco la reactiva tácitamente.

Un viewer consulta entradas y horarios, sin altas, edición, cambios de estado ni actividad de auditoría reservada a administración. Usuarios no aparece para ese rol. El tablero muestra reactivación de una entrada inactiva con período vencido como escenario alternativo: no es el estado de esa fila en el listado principal.

## Escenario ficticio

Miércoles 28/10/2026 12:30, Buenos Aires. Retiro de equipos y Atención por WhatsApp vigentes sin límites; Entrega especial de noviembre programada del 01 al 07/11; Atención de septiembre vencida al 30/09; Catálogo anterior inactiva. Retiro con autorización es una nueva entrada preparada del 01 al 07/11, sin guardar. El texto de retiro es una política inventada para el mockup, no una condición real del negocio.

La ficha vigente Retiro de equipos fue creada el 27/10 09:00 por Carla Méndez y actualizada el 28/10 09:15 por Diego Luna. La vista móvil pertenece a Felipe Arias, rol Consulta, y filtra Vigentes: muestra exactamente dos entradas.

## Cobertura

Cinco imágenes de Información incluyen listado, alta con vista previa, ficha con actividad, consulta móvil y estados compartidos. Edición, confirmación de desactivación, búsqueda sin resultados, vacío inicial, carga, error de red y variantes de vigencia reutilizan patrones documentados; no se generó una imagen separada por cada combinación. El tablero no es un inventario exhaustivo de todos los rechazos.

## Diseño, accesibilidad y límites

Se conserva Manrope con fondo #F6F5FB, superficies blancas, lateral #F1EEFB, texto #17142E/#5A5573, borde #E3DFF0, primario #6D28D9 y selección #EDE7FE; radios de 12 px, sombras discretas y colores planos. Usar el logotipo y el sistema de iconos originales; las variaciones generadas no son nuevos activos de marca. Una acción principal por tarea, secundarios de menor peso y acciones destructivas dentro de Más, con revisión específica. El estado tiene texto e icono; no depende solo de color.

Objetivos de implementación: contraste AA, zoom al 200 %, reflujo a 320 px, controles táctiles de al menos 44 px, etiquetas persistentes, errores asociados, teclado completo y foco visible. Diálogos con foco contenido y restaurado al disparador; prioridad inicial a la opción segura. Anunciar guardado, copia y fallos sin desplazar el foco inesperadamente. Carga y error no equivalen a datos vacíos. Las imágenes no certifican estos comportamientos.

El móvil evita comprimir tablas: utiliza tarjetas y detalles progresivos, con barra inferior Inicio/Chats/Clientes/Ventas/Más, área segura y espacio para alcanzar el final. En formularios y cambio obligatorio de contraseña se prioriza el contenido y el teclado; no se agrega navegación global que permita saltar el flujo.

Los paneles, resúmenes, pasos, filtros adicionales y confirmaciones son propuestas de interfaz; no prueban que exista su lectura o escritura actual. Deben respetar las reglas y capacidades disponibles. Los ejemplos y las revisiones no se guardaron en el CRM. No se crearon usuarios, no se generaron credenciales reales ni se editaron entradas o horarios.

