# Horarios y días especiales — V2-12

28 de octubre de 2026. Tres imágenes del [lote V2-12](../29-informacion/README.md).

| # | Pantalla | Imagen |
|---|---|---|
| 4 | Horario semanal | [Ver](desktop/01-horario-semanal-v2.png) |
| 5 | Días especiales y alta | [Ver](desktop/02-dia-especial-v2.png) |
| 6 | Quitar excepción y auditoría | [Ver](desktop/03-quitar-dia-historial-v2.png) |

## Semana y zona

Una sola semana, siete días y cero, uno o dos tramos por día. Día vacío equivale a cerrado; falta de configuración es un estado diferente y no debe comunicarse como una decisión explícita del negocio de estar cerrado. Se guarda la semana completa, no un cambio tácito al tocar un interruptor. El segundo tramo exige el primero y debe empezar después de su cierre, sin superposición ni contigüidad. Cada tramo requiere apertura y cierre, con apertura anterior; no atraviesa medianoche.

La zona procede de la organización y se muestra de solo lectura. No se agrega un selector independiente en Información o Turnos. Abierto ahora y próximo cambio son una propuesta de lectura del cálculo estructurado existente; no se calculan con una frase de la base de conocimiento. Un próximo cambio ausente no se inventa más allá del horizonte de siete días.

El ejemplo conserva la semana de V2-08: lunes a viernes 10:00–13:00 y 16:00–19:00; sábado 10:00–13:00; domingo cerrado. El 28/10 a las 12:30 está abierto y el próximo cambio es el cierre a las 13:00. Se representan valores ya confirmados, no valores Del perfil pendientes de confirmar.

## Excepciones por fecha

Una fecha desde hoy en adelante, única en la organización, cerrada todo el día o con uno/dos tramos propios, y motivo opcional hasta 100 caracteres. Reemplaza el horario semanal completo de esa fecha: no se suma a él ni se aplica a todas las semanas. No hay calendario de feriados nacional ni generación automática de días especiales.

Se crea y se quita una excepción; el contrato actual no tiene edición. Una corrección exige quitar y volver a crear, con escrituras separadas: no se promete reemplazo atómico. Ante fecha duplicada, abrir el día existente y conservar lo tipeado; no sobrescribirlo. Quitar una excepción hace volver a aplicar el horario semanal y conserva su auditoría. Las excepciones pasadas no se muestran en la lista próxima ni se eliminan desde esta interfaz.

Escenario: 31/10 cerrado por Inventario y 03/11 de 11:00 a 13:00 por Atención especial. El alta del 07/11 de 10:00 a 12:00 por Capacitación está preparada, sin guardar. La revisión de quitar el 31/10 volvería a sábado 10:00–13:00; todavía no se realizó.

## Relación con turnos e información

Cambiar semana o excepciones no mueve, cancela o reprograma turnos existentes. Abrir Revisar agenda permite comprobar su situación; no se añade una asignación a empleados o técnicos. Una excepción que cierre el sábado puede dejar el turno ficticio del 31/10 de V2-08 fuera de horario: debe revisarse conservando su registro y estado. No se promete que la escritura de horarios ya devuelva un contador de turnos afectados; cualquier aviso derivado necesita una lectura autorizada.

La entrada vigente Atención por WhatsApp, categoría Horarios, provoca la advertencia de convivencia entre texto y estructura. El sistema no extrae ni migra tramos de ese texto. Administración revisa, conserva como complemento o desactiva esa entrada de manera independiente. No se desactiva automáticamente al guardar la semana.

Consulta puede ver semana y excepciones; administración las modifica y consulta auditoría. La vista de actividad registra cambios de semana y alta/baja de excepciones, con fecha, autor y valores. No se agrega restauración automática de versiones ni borrado de historia.

## Diseño, accesibilidad y límites

Se conserva Manrope con fondo #F6F5FB, superficies blancas, lateral #F1EEFB, texto #17142E/#5A5573, borde #E3DFF0, primario #6D28D9 y selección #EDE7FE; radios de 12 px, sombras discretas y colores planos. Usar el logotipo y el sistema de iconos originales; las variaciones generadas no son nuevos activos de marca. Una acción principal por tarea, secundarios de menor peso y acciones destructivas dentro de Más, con revisión específica. El estado tiene texto e icono; no depende solo de color.

Objetivos de implementación: contraste AA, zoom al 200 %, reflujo a 320 px, controles táctiles de al menos 44 px, etiquetas persistentes, errores asociados, teclado completo y foco visible. Diálogos con foco contenido y restaurado al disparador; prioridad inicial a la opción segura. Anunciar guardado, copia y fallos sin desplazar el foco inesperadamente. Carga y error no equivalen a datos vacíos. Las imágenes no certifican estos comportamientos.

El móvil evita comprimir tablas: utiliza tarjetas y detalles progresivos, con barra inferior Inicio/Chats/Clientes/Ventas/Más, área segura y espacio para alcanzar el final. En formularios y cambio obligatorio de contraseña se prioriza el contenido y el teclado; no se agrega navegación global que permita saltar el flujo.

Los paneles, resúmenes, pasos, filtros adicionales y confirmaciones son propuestas de interfaz; no prueban que exista su lectura o escritura actual. Deben respetar las reglas y capacidades disponibles. Los ejemplos y las revisiones no se guardaron en el CRM. No se crearon usuarios, no se generaron credenciales reales ni se editaron entradas o horarios.

