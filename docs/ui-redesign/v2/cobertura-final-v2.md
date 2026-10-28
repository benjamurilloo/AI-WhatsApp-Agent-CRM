# Cobertura final V2

28 de octubre de 2026. La serie reúne 14 lotes y 145 imágenes: los 133 PNG del plan original más 12 de la ampliación Análisis V2-14. El [índice de archivos](indice-final-v2.md) enumera cada PNG real, sin contar originales descartados, V1 o documentación como pantallas.

## Qué significa terminado

Los 13 lotes del plan y la ampliación V2-14 tienen sus entregables visuales. Esto no equivale a haber dibujado por separado cada combinación de rol, moneda, estado, modal, tamaño o error técnico. Un detalle de otra persona o producto reutiliza plantilla. Un efecto de negocio distinto requiere su regla específica, aunque comparta el componente.

La auditoría inicial se hizo el 27/10; los últimos lotes contrastaron reglas con archivos locales. Este cierre revisa las propuestas, no vuelve a inspeccionar producción ni garantiza cubrir funcionalidades añadidas después por Claude Code. La implementación y las pruebas reales quedan pendientes.

## Lotes y evidencia

| Lote | PNG | Índice y alcance |
|---|---:|---|
| V2-01 | 6 | [Arquitectura y dashboard](manifest-v2.md): shell, Más, dashboard operativo, búsqueda y estados |
| V2-02 | 6 | [Conversaciones](03-conversaciones/README.md): bandeja/hilo, control y notas, móvil y estados |
| V2-03 | 8 | [Clientes](04-clientes/README.md): listado, alta, ficha, operaciones, cuenta, etiquetas, móvil |
| V2-04 | 8 | [Catálogo](05-productos/README.md), [Modelos](13-modelos/README.md), [Grados](14-grados/README.md) |
| V2-05 | 7 | [Inventario](05-productos/README-v2-05.md): unidades, movimientos, precios, costos, móvil y estados |
| V2-06 | 11 | [Reparaciones](15-reparaciones/README.md) y [Técnicos](16-tecnicos/README.md): tres tipos de orden, precios, entrega y garantía |
| V2-07 | 11 | [Usados](17-usados/README.md): compra, permuta, checklist, cotizador, reglas, comprobante, móvil y estados |
| V2-08 | 10 | [Turnos](18-turnos/README.md): semana/día, alta, solicitud, atención, configuración, móvil y conflictos |
| V2-09 | 14 | [Pedidos](19-pedidos/README.md) y [Ventas](20-ventas/README.md): reserva, entrega, emisión, cobro y anulación |
| V2-10 | 14 | [Caja](21-caja/README.md), [Cuentas](22-cuentas-clientes/README.md), [Tipo de cambio](23-tipo-cambio/README.md), [Medios](24-medios-pago/README.md) |
| V2-11 | 17 | [Compras](25-compras/README.md), [Recepciones](26-recepciones/README.md), [Pagos](27-pagos-proveedores/README.md), [Proveedores](28-proveedores/README.md) |
| V2-12 | 14 | [Información](29-informacion/README.md), [Horarios](30-horarios/README.md), [Usuarios](31-usuarios/README.md) |
| V2-13 | 7 | [Consistencia y accesibilidad](32-consistencia-accesibilidad/README.md): reglas compartidas y móvil con teclado |
| V2-14 | 12 | [Análisis y métricas](33-analisis-metricas/README.md): centro analítico, fichas contextuales, desglose, móvil y estados |
| **Total** | **145** | Archivo por archivo en el índice final |

## Variantes resueltas con patrones compartidos

Alta/edición con los mismos campos, búsqueda sin resultados, vacío, carga, fallo de lectura, falta de permiso, guardado rechazado, copia fallida y salida con cambios reutilizan V2-13 y las reglas del módulo. No se añade una nueva imagen por cada mensaje.

Los estados finales se consultan sin botones de transiciones inválidas. La vista Consulta omite controles y datos administrativos según permisos; no basta con deshabilitar un botón. Una tabla pasa a tarjetas en móvil según las prioridades descritas, pero no todos los listados tienen un render móvil propio.

Los comprobantes mantienen el formato documental y excluyen navegación/acciones. Compartir formato no implica compartir numeración, efectos o contenido de un documento de anulación o devolución.

## Variantes sin PNG independiente

Estos puntos son límites concretos de la entrega, no pantallas que ya estén representadas individualmente. Para una especificación visual de cada variante, estos serían los suplementos prioritarios. El dashboard analítico antes pendiente queda representado por el centro Análisis V2-14; su medición de calidad de IA y atribución sigue pendiente según el diccionario.

| Área | Falta una pieza independiente | Base disponible y tratamiento |
|---|---|---|
| Inventario | Corrección de costo con revisión completa | V2-05 representa consulta/historial y especifica el efecto. Confirmar el contrato antes de diseñar una corrección contable |
| Reparaciones | Comprobante de recepción aislado, cancelación y listado móvil | Se conserva ficha/entrega, tres tipos de orden y patrones; cada tipo tiene efectos diferentes |
| Usados | Anulación completa de compra/permuta y sus bloqueos | V2-07 documenta revisión de elegibilidad, pagos/crédito y unidad; no equivale a anular documentos financieros |
| Turnos | Confirmar solicitud, marcar ausente y algunas altas/estados de motivos | V2-08 documenta transiciones y horarios; aplicar patrón con efecto y momento permitido |
| Pedidos | Cancelación con señas y sus efectos en cuenta | V2-09 documenta liberación de reserva y de importes; no es devolución automática |
| Ventas | Documento propio de anulación y anulación desde pedido | V2-09 documenta el comprobante y diferencias de stock; V2-13 solo ilustra mostrador sin cliente |
| Caja | Primer paso de conteo; listado/documento/anulación de devoluciones; devolución desde cuenta | V2-10 representa revisión de cierre y devolución sin cliente. Compartir componente sin trasladar supuestos del origen |
| Medios de pago | Renombre y cambio de estado en sus confirmaciones | V2-10 documenta tipo de efectivo inmutable y Permuta protegido |
| Compras | Cancelar orden, cerrar con faltante y anular pago con sesión cerrada en fichas completas | V2-11 contiene reglas y estados compartidos; no crear edición de orden ni reapertura |
| Administración | Editar entrada, reactivar con distintas vigencias, cambios del propio rol y sesión vencida | V2-12 documenta campos, permisos y restricciones; no existe regeneración administrativa de la credencial inicial |
| Análisis | Cohortes de retención, métricas de calidad/atribución, cada filtro y resultado individual | V2-14 representa las plantillas y documenta dependencias; no hay constructor de informes, predicciones o campañas implementadas |
| Móvil | Cada lista/detalle y revisión financiera en viewport estrecho propio | Hay 20 ejemplos móviles en toda V2; se deben comprobar todos los flujos reales a 320 CSS px y con teclado, no extrapolar del PNG |

Los nombres de carpeta indican el tipo de referencia, no un dispositivo verificado. No se dibujaron todas las combinaciones ni se comprobó interacción a partir de imágenes estáticas.

## Diferencias visuales resueltas por la especificación

| Observación en lotes previos | Decisión para implementar |
|---|---|
| Anulada, Cancelada, Inactiva o Cerrado aparecen a veces en rojo | Gris para estado normal; rojo para error/control destructivo |
| OC Abierta aparece azul en algún render | Ámbar; Reservada conserva azul; Caja abierta usa verde |
| Reservada aparece ámbar en una ficha de entrega | Azul del inventario, con etiqueta e icono |
| Descartar cambios recibe peso violeta en la lámina inicial | Seguir editando tiene prioridad segura y foco; descarte secundario destructivo |
| Imprimir aparece dos veces entre cabecera y Más | Una sola ubicación; en cabecera si se usa con frecuencia |
| Bordes suaves de campos y textos pequeños | Refuerzo funcional #817A98 y medición de tokens; tamaños de texto según criterios |
| Cabeceras/botones con leves degradados o distintas marcas | Colores planos y activos originales; no usar el render como asset de logo |
| Miniaturas de demostración parecen habilitar campos no editables | No amplían contratos; preservar líneas/fechas de pedidos y órdenes inmutables |
| Estado o importe ficticio cambia entre escenas alternativas | Leer el escenario del README: borrador, revisión, alternativa y base no son hechos simultáneos |

No se regeneran los 126 PNG anteriores para corregir detalles de componente: las referencias compartidas y esta tabla fijan la decisión para desarrollo. Los originales se preservan para comparación y trazabilidad.

## Coherencia funcional revisada

El equipo U-0102 está disponible en el instante de Inventario, reservado al confirmar P-000204 y vendido al entregarlo. El mismo render no representa todos esos instantes. Emisión y cobro son posteriores y separados; no duplican la salida física.

La permuta de Mateo conserva ARS 200.000 reconocidos, ARS 120.000 ya aplicados y ARS 80.000 disponibles antes del cobro propuesto. No mezclar ese saldo con una compra de usado pagada o con dinero de caja.

Caja distingue dinero físico y valores aplicados: una transferencia no incrementa efectivo; una conversión no suma ambas monedas; un cierre anterior no se reescribe al anular después. Los borradores de retiro, cierre, devolución o pago no alteran los listados base.

Compras separa orden opcional, recepción física y pago. RC-000091 recibe dos unidades a costo real USD 510; el pendiente de OC-000057 es una unidad, no una resta de importes esperados y reales. El trabajo reparado del técnico entra a su cuenta sin crear recepción de mercadería.

Horarios especiales no reprograman los turnos ya creados. La excepción de cierre del 31/10 deja a revisar el turno ficticio de Renata a las 11:00, conservando su estado. El texto de información para el agente no se convierte automáticamente en horario estructurado.

Las pantallas de usuarios muestran roles actuales Administración/Consulta y datos inventados. La credencial demostrativa no da acceso y el cambio obligatorio conserva la validación de 12–128 caracteres.

## Entrega para desarrollo

Orden recomendado: componentes compartidos y permisos; navegación y acciones; formularios y confirmaciones; adaptación móvil y lectura accesible; luego contadores y resúmenes que requieran lecturas nuevas. Los [criterios de implementación](criterios-implementacion-v2.md) contienen aceptación y fuentes W3C.

La entrega es visual/documental. No se modificó la aplicación, no se realizaron operaciones de negocio y no se envió el trabajo a Claude ni a otra persona. El desarrollo puede continuar sobre sus propios cambios.

