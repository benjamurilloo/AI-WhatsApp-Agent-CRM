# Criterios de implementación V2

28 de octubre de 2026. Especificación transversal que acompaña a los mockups. No es código implementado ni una auditoría de conformidad del CRM actual.

## Prioridad y autoridad de las referencias

Para resolver una diferencia: primero las restricciones reales de permisos y dominio; luego las precisiones funcionales del README del módulo; después los criterios compartidos de este documento; finalmente los detalles decorativos del PNG. V2-13 normaliza los criterios compartidos, sin eliminar excepciones funcionales documentadas. No se infieren campos, acciones o contratos del backend de una miniatura.

El inventario del 27 de octubre fue un punto de partida. Su referencia a regenerar credenciales queda descartada por el análisis de V2-12: la contraseña inicial se presenta una vez y no existe allí un flujo administrativo de recuperación o regeneración. Tampoco todo apartado del inventario tiene imagen independiente.

La ampliación [V2-14](33-analisis-metricas/README.md) añade la propuesta Análisis junto a Inicio y dentro de Más en móvil. Se organiza en Resumen, Ventas, Productos, Clientes, Atención y Operación; Producto y Cliente tienen métricas contextuales que reutilizan definiciones. Esta adición no reemplaza el dashboard operativo ni otorga permisos nuevos. Las métricas siguen su [diccionario específico](33-analisis-metricas/diccionario-metricas-v2-14.md), distinguiendo consultas existentes, propuestas y medición pendiente.

## Sistema visual

| Uso | Valor |
|---|---|
| Primario / foco | #6D28D9 |
| Fondo / superficies | #F6F5FB / #FFFFFF |
| Lateral / selección | #F1EEFB / #EDE7FE |
| Texto / secundario | #17142E / #5A5573 |
| Divisor decorativo | #E3DFF0 |
| Borde funcional propuesto | #817A98 |
| Tipografía | Manrope; cuerpo 16 px y ayudas 14 px como base |
| Espaciado / radio | Escala 4, 8, 12, 16, 24, 32 px; radio 12 px |
| Foco propuesto | Contorno sólido violeta 2 px con separación blanca 2 px; verificar en cada fondo |
| Controles | Área de activación objetivo 44 × 44 CSS px; icono puede ser menor |

No se cambia la marca. Usar el logo y los iconos originales, fondos y botones planos, sombras discretas. El texto secundario transmite información y debe seguir siendo legible. No usar el borde suave de tarjeta como único contorno de inputs, radios o checkboxes.

### Contraste de tokens

Cálculo propio con luminancia relativa sRGB, sobre colores opacos exactos, no mediante muestreo de píxeles de los PNG. Los valores mostrados están redondeados; la evaluación usa el resultado sin redondear. No prueban todas las combinaciones del producto.

| Frente / fondo | Relación aproximada | Uso previsto |
|---|---|---|
| #6D28D9 / #FFFFFF | 7,105:1 | Texto violeta o texto blanco sobre botón violeta |
| #5A5573 / #FFFFFF | 7,043:1 | Texto secundario |
| #E3DFF0 / #FFFFFF | 1,306:1 | Decoración; insuficiente como única señal de un control |
| #817A98 / #FFFFFF | 4,061:1 | Borde funcional; no se propone como texto pequeño |
| #166534 / #DCFCE7 | 6,492:1 | Verde |
| #6D28D9 / #EDE7FE | 5,908:1 | Violeta |
| #92400E / #FEF3C7 | 6,367:1 | Ámbar |
| #1E40AF / #DBEAFE | 7,149:1 | Azul |
| #4B5563 / #F3F4F6 | 6,867:1 | Gris |
| #B91C1C / #FEF2F2 | 5,915:1 | Rojo |

WCAG 2.2 AA pide 4,5:1 para texto normal y 3:1 para texto grande, con excepciones; la información visual necesaria para reconocer controles y estados requiere 3:1 frente al color adyacente. [Contraste de texto](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html), [contraste no textual](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html). Validar también hover, selección, errores, foco, transparencias y fondos reales.

### Semántica por contexto

| Color | Ejemplos |
|---|---|
| Verde | Unidad Disponible; persona Activa; entrada Vigente; turno Atendido; caja Abierta; orden Cerrada completa |
| Violeta | Pedido o turno Confirmado; entrada Programada; selección actual |
| Ámbar | Pedido Pendiente; turno Pedido/solicitado; unidad En revisión; orden de compra Abierta; cierre con faltante; advertencia |
| Azul | Unidad Reservada |
| Gris | Inactiva, Vencida, Anulada, Cancelada; sesión de caja Cerrada y horario Cerrado |
| Rojo | Error y control destructivo; no un estado final normal por sí solo |

Cada estado lleva nombre e icono. Abierta no tiene un color universal: caja operativa en verde y compromiso de compra pendiente en ámbar. Cerrada completa de una orden conserva verde; caja cerrada es un resultado normal gris. Una advertencia de faltante es ámbar aunque el cierre sea final. No cambiar el vocabulario de los estados del dominio por uniformidad decorativa.

## Ubicación de botones

| Contexto | Principal | Secundarios |
|---|---|---|
| Listado | Nueva entrada / Nueva venta / Nueva orden, según módulo y permiso | Filtros y búsqueda junto al contenido; configuración separada |
| Ficha | Siguiente transición válida | Imprimir, volver, abrir relación; Más acciones |
| Formulario | Guardar o Registrar con nombre de la operación | Cancelar edición; volver al paso anterior |
| Revisión irreversible | Confirmar la operación concreta después de revisar | Opción segura con foco inicial |
| Consulta sin permiso de gestión | No inventar una acción de escritura | Abrir detalle y navegación permitida |

Una acción primaria por tarea, sin repetirla en cada tarjeta. Un formulario largo puede usar pie persistente, reservando espacio para el último campo. No dejar simultáneamente un guardar flotante, otro en cabecera y otro al pie. En escritorio la subnavegación debe quedar bajo la cabecera de la ficha; las pestañas de contexto de Abastecimiento pueden preceder al título como navegación del área, sin mezclarse con pestañas internas.

Nombrar "Registrar cobro", "Cancelar pedido", "Anular venta" y "Descartar cambios"; evitar "Aceptar" cuando no explica el efecto. "Cancelar edición" nunca cancela el documento. No usar rojo para todo cierre: una revisión final puede comunicar irreversibilidad sin equipararla a borrar. Cerrar caja conserva el tratamiento prudente de V2-10, con conteo y efectos claros.

## Formularios y concurrencia

Etiquetas persistentes y unidades de medida junto al campo. Campos obligatorios explicados en texto; no depender solo de asterisco o color. Importes con moneda y separadores coherentes; IMEI y códigos como texto para no perder dígitos. Fechas de negocio con zona de organización explícita. Una línea inicial y agregado bajo demanda en lugar de filas vacías repetidas.

Al rechazar un envío, conservar valores permitidos; los secretos son una excepción y no se repueblan desde mensajes o URLs. Resumen de errores al comienzo con enlaces a campos, error específico asociado al input y foco predecible al resumen tras intento fallido. No mover el foco por validar cada tecla. Categoría de Información continúa editable; un combo con sugerencias no la convierte en taxonomía cerrada.

Durante envío, indicar "Guardando…" y prevenir duplicados. Anunciar éxito solo tras respuesta confirmada. Si la red corta después del envío y no se sabe si se registró, consultar el resultado por los mecanismos existentes antes de repetir una operación financiera; la apariencia del botón no garantiza idempotencia. Ante precio, stock, estado o esperado cambiado, mostrar el dato actualizado y pedir revisar; no confirmar silenciosamente otra operación.

La protección del borrador cubre navegación interna según capacidades. No prometer persistencia entre sesiones, guardado automático, cola offline o recuperación después de cerrar el navegador si no existen. Conservar una edición en memoria no equivale a haberla guardado. Una salida sucia ofrece Seguir editando con foco inicial; solo descarta después de la decisión explícita.

## Confirmaciones y efectos

Revisar entidad, importe, moneda, motivo permitido y efectos concretos. No sustituir todas las revisiones por un "¿Estás seguro?". No exigir escribir un identificador o una explicación libre si el contrato no lo pide.

Anular una venta de mostrador puede reingresar stock; una venta desde pedido no duplica ese movimiento. Anular no anula automáticamente recibos ni devuelve dinero. Con cliente, los cobros liberados se aplican primero a deudas y solo el remanente queda a favor; sin cliente, se devuelve sobre la venta anulada mediante un registro separado.

Cancelar pedido libera reservas y trata señas según cuenta; no promete un reembolso automático. Anular recepción comprueba elegibilidad de todas las unidades y no reabre una orden cerrada. Anular recibo/pago conserva reglas de sesión original y conversión. Cerrar caja guarda el arqueo, no crea un retiro compensatorio ni permite reabrir. Cambiar horario no mueve turnos existentes. Desactivar usuario no es borrar su historial.

## Teclado, lectura y mensajes

Usar controles semánticos y orden de lectura lógico, sin tabindex positivo. Enlaces para navegar y botones para acciones; nombres accesibles para iconos ("Más acciones del pedido", "Secciones de la orden", "Más módulos") evitan tres controles llamados Más sin contexto. Pestañas, menús, selectores y buscador siguen el patrón de teclado correspondiente; no imponer flechas a todos los controles.

En un diálogo modal: mover el foco dentro, fondo inerte, Tab/Mayús+Tab contenidos, Esc cierra cuando no implica una operación ya en curso, restaurar foco al disparador o sucesor lógico. En acciones destructivas, empezar en la opción menos dañina. Los paneles no modales no atrapan el foco. [Patrón modal W3C APG](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/).

Anunciar resultados, guardado y copia con mensajes de estado discretos; errores relevantes con anuncio apropiado, sin duplicar la lectura del resumen. Un skeleton no se lee como varias filas vacías. Encabezados de tabla asociados a celdas; gráficos con alternativa tabular y moneda explícita. Nuevos mensajes de chat no arrastran a quien está leyendo arriba.

El foco debe permanecer visible, especialmente ante pies fijos y teclado. Nuestro objetivo es mostrarlo completo; el criterio AA 2.4.11 exige que no esté enteramente oculto por contenido creado por el autor. [Foco no oculto](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html).

## Móvil y adaptación

Tarjetas y detalles progresivos, no reducir todas las columnas de una tabla. Conservar estado, identidad, importe nativo y siguiente paso. Reflujo a 320 CSS px y texto ampliado al 200 % se comprueban en la implementación; los datos que requieren comparación bidimensional pueden usar una tabla con desplazamiento contenido y alternativa operativa. [Reflujo](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html), [ampliar texto](https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html).

44 × 44 CSS px es el objetivo de diseño de Vixora para controles, no el mínimo general AA. WCAG 2.2 AA establece 24 × 24 CSS px con excepciones de espaciado y otras; no confundirlo con nuestro objetivo más amplio. [Tamaño mínimo](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html).

Inicio/Chats/Clientes/Ventas/Más en consulta; durante formularios y cambio obligatorio de contraseña se retira la barra global cuando compite con la tarea. Respetar zona segura, teclado y posición del campo enfocado. El pie se adapta al espacio disponible en lugar de esconder el error o el último input. Las pestañas mantienen la seleccionada visible y ofrecen señal de más contenido. Respetar reducción de movimiento.

## Permisos y dependencias funcionales

Reorganizar un menú no concede acceso. Admin/viewer y capacidades de la organización se verifican también en servidor; los agregados, resultados de búsqueda y documentos no revelan datos restringidos. Compras, proveedores y costos del técnico son administrativos. Consulta puede leer Información y horarios, pero no Usuarios ni auditoría administrativa. Técnicos sigue siendo la vista filtrada de proveedores, no un rol de acceso o entidad duplicada.

Búsqueda global agregada, contadores y lecturas cruzadas requieren contratos autorizados; son propuestas, no endpoints comprobados. El checkbox integrado de técnico necesita resolver la escritura separada sin falso éxito. Los avisos de turnos afectados por horario necesitan una consulta real. Adjuntos/control coordinado del agente, favoritos y nuevas vistas de resumen conservan las limitaciones de sus módulos. No dar por operativas estas mejoras solo porque aparecen en el render.

## Verificación pendiente al implementar

| Prioridad | Trabajo | Evidencia de aceptación |
|---|---|---|
| P0 | Permisos, montos, estados, stock y efectos de confirmación | Casos del dominio pasan en servidor; no fuga de datos ni movimientos duplicados |
| P1 | Shell, controles, estados, acciones y formularios compartidos | Mismo componente y vocabulario en los módulos; corrección conserva datos |
| P1 | Teclado, modal, lector de pantalla, foco y errores | Recorridos completos con teclado y lector, sin bloqueos ni foco perdido |
| P1 | Contraste, zoom, reflujo y móvil con teclado | Medición de colores reales y pruebas a 200 %, 320 CSS px y viewport reducido |
| P2 | Búsqueda agregada, contadores y resúmenes nuevos | Fuentes, permisos y definiciones conciliadas con los listados |
| P2 | Impresión y estados técnicos poco frecuentes | Documentos sin chrome, importes correctos y cobertura de fallos relevantes |

Probar al menos alta con error/éxito, consulta por rol, conflicto de stock, cobro convertido, cierre cambiado, anulación y retorno desde modal. Estas son condiciones de entrega futura; no se ejecutaron pruebas de aplicación para los PNG. Las fuentes W3C se consultaron el 28/10/2026. No se declara certificación de accesibilidad.

