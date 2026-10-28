# Usuarios y primer ingreso — V2-12

28 de octubre de 2026. Seis imágenes del [lote V2-12](../29-informacion/README.md). El primer ingreso se presenta sin navegación de administración.

| # | Pantalla | Imagen |
|---|---|---|
| 7 | Usuarios | [Ver](desktop/01-usuarios-v2.png) |
| 8 | Alta y alcance de roles | [Ver](desktop/02-nuevo-usuario-v2.png) |
| 9 | Ficha y cambio de rol | [Ver](desktop/03-ficha-cambio-rol-v2.png) |
| 10 | Credencial inicial | [Ver](desktop/04-credencial-inicial-v2.png) |
| 11 | Primer ingreso | [Ver](desktop/05-primer-ingreso-v2.png) |
| 13 | Usuarios móvil | [Ver](mobile/06-usuarios-mobile-v2.png) |

## Acceso y roles

Solo administración lista, crea y gestiona usuarios. Roles existentes: admin y viewer; etiquetas propuestas Administración y Consulta, manteniendo visible su correspondencia. No se crean Vendedor, Técnico o Supervisor como roles. Ser técnico es una marca de proveedor, no una cuenta de acceso.

Las tarjetas de rol explican el alcance sin configurar permisos por módulo. Consulta accede a pantallas habilitadas y sus restricciones existentes; no ve Compras, costos ni Usuarios. Administración gestiona operación, configuración y usuarios. La descripción no sustituye los controles de acceso en servidor ni otorga acceso a una capacidad no habilitada en la organización.

Listado con búsqueda por nombre/email, filtros de rol y activo/inactivo, y ficha. No se inventan último ingreso, usuarios conectados, dispositivos, matriz editable de permisos o monitor de sesiones. El contador de administradores activos se deriva de los datos del escenario y se valida de nuevo en servidor antes de un cambio sensible.

## Crear y modificar

Alta con nombre hasta 200 caracteres, email válido y rol; Consulta se propone por defecto. Email existente se señala en su campo y no genera un segundo usuario. La ficha actual modifica rol y estado, no nombre/email: se muestran de solo lectura. No se dibuja un botón genérico de edición que sugiera campos que el servicio no modifica.

Guardar rol y desactivar son acciones distintas. Un cambio de rol preparado no se guarda por abrir Más o cambiar el estado. Si hay un borrador, resolver su descarte o conservarlo antes de otra acción. Desactivar impide ingresar y cierra las sesiones abiertas; reactivar permite volver a iniciar sesión, sin restaurar sesiones revocadas. No se agrega borrado de usuario ni envío de invitación.

No puede quitarse el rol ni desactivarse al último administrador activo. La guarda se conserva aunque cambien simultáneamente otras cuentas. Un administrador puede cambiar su propio rol o desactivarse si queda otro activo: explicarlo antes. Si deja de ser admin, sale de Usuarios hacia Inicio; si se desactiva, vuelve a ingreso. El tablero distingue estos escenarios alternativos del listado con dos administradores.

## Credencial inicial y primer ingreso

El alta genera una contraseña inicial que aparece una sola vez en la respuesta y vive en memoria de esa página. No se envía un email. El render usa EJEMPLO-NO-VALIDO, una etiqueta sin acceso real; no se creó una cuenta ni una contraseña del sistema.

Copiar confirma el resultado mediante anuncio accesible; un fallo de portapapeles permite seleccionar/copiar manualmente sin mostrar un éxito falso. Entendido vuelve al listado. La pantalla aclara que no se volverá a mostrar y que la persona debe cambiarla al ingresar. No se inventa vencimiento a las 24 horas, una descarga, impresión, enlace para volver a verla o restablecimiento desde administración. La documentación, capturas futuras, historial y logs no deben contener credenciales reales.

En el cambio obligatorio se pide nueva contraseña y repetición, sin contraseña anterior ni opción de omitirlo. La validación actual admite entre 12 y 128 caracteres; no se inventan reglas de mayúsculas, símbolos o un medidor de fortaleza. Mostrar/ocultar con nombre accesible y admitir pegado/gestores de contraseñas. Al fallar no se registra ni repuebla el secreto en mensajes o URLs. Guardar y continuar completa el flujo; Cerrar sesión permite salir. La nueva navegación de esa pantalla no se interpreta como un acceso a Usuarios del rol Consulta.

## Escenario y variantes

Carla Méndez y Diego Luna: administradores activos. Felipe Arias: Consulta activo. Lucía Moreno: Consulta inactiva. Todos los emails usan example.com. Paula Ríos, paula.rios@example.com, Consulta: alta preparada, éxito hipotético y primer ingreso ilustrados en imágenes separadas; no se suma como quinto usuario a los listados.

La ficha de Felipe prepara el cambio de Consulta a Administración, sin guardar; los listados mantienen Consulta. El tablero del último administrador usa una alternativa con uno solo; la desactivación propia usa otra alternativa con Diego todavía activo.

Alta, detalle de rol, credencial, primer ingreso, listado y móvil tienen imágenes propias. Reactivación, confirmación de rol propio, errores de email/contraseña, sesión vencida y falta de permiso reutilizan el patrón documentado; no se dibujaron todos de forma independiente.

## Diseño, accesibilidad y límites

Se conserva Manrope con fondo #F6F5FB, superficies blancas, lateral #F1EEFB, texto #17142E/#5A5573, borde #E3DFF0, primario #6D28D9 y selección #EDE7FE; radios de 12 px, sombras discretas y colores planos. Usar el logotipo y el sistema de iconos originales; las variaciones generadas no son nuevos activos de marca. Una acción principal por tarea, secundarios de menor peso y acciones destructivas dentro de Más, con revisión específica. El estado tiene texto e icono; no depende solo de color.

Objetivos de implementación: contraste AA, zoom al 200 %, reflujo a 320 px, controles táctiles de al menos 44 px, etiquetas persistentes, errores asociados, teclado completo y foco visible. Diálogos con foco contenido y restaurado al disparador; prioridad inicial a la opción segura. Anunciar guardado, copia y fallos sin desplazar el foco inesperadamente. Carga y error no equivalen a datos vacíos. Las imágenes no certifican estos comportamientos.

El móvil evita comprimir tablas: utiliza tarjetas y detalles progresivos, con barra inferior Inicio/Chats/Clientes/Ventas/Más, área segura y espacio para alcanzar el final. En formularios y cambio obligatorio de contraseña se prioriza el contenido y el teclado; no se agrega navegación global que permita saltar el flujo.

Los paneles, resúmenes, pasos, filtros adicionales y confirmaciones son propuestas de interfaz; no prueban que exista su lectura o escritura actual. Deben respetar las reglas y capacidades disponibles. Los ejemplos y las revisiones no se guardaron en el CRM. No se crearon usuarios, no se generaron credenciales reales ni se editaron entradas o horarios.

