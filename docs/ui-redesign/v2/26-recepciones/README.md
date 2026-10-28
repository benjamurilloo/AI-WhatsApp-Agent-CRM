# Recepciones de compra — V2-11

28 de octubre de 2026. Cinco imágenes del [lote V2-11](../25-compras/README.md). Se distingue este módulo de [Usados y permutas](../17-usados/README.md): son ingresos de proveedores y no recepciones de equipos de clientes.

| # | Vista | Imagen |
|---|---|---|
| 04 | Recepciones | [Ver](desktop/01-recepciones-compra-v2.png) |
| 05 | Recibir IMEI | [Ver](desktop/02-recibir-imei-con-orden-v2.png) |
| 06 | Sin orden | [Ver](desktop/03-recepcion-sin-orden-v2.png) |
| 07 | Anular recepción | [Ver](desktop/04-detalle-anulacion-recepcion-v2.png) |
| 16 | Recepción móvil | [Ver](mobile/05-recibir-imei-mobile-v2.png) |

## Entrada de mercadería

Con orden, proveedor y moneda provienen de ella; solo se reciben líneas pendientes, sin excederlas. Se permite recibir menos, omitir una línea con cantidad cero y corregir el costo esperado por el costo real. Lo que llegue de más requiere una recepción sin orden. Sin orden, se eligen proveedor activo, moneda y productos. La revisión conserva los datos y permite volver a corregir; no se propone guardar borradores persistentes.

Remito/factura del proveedor es referencia opcional de hasta 40 caracteres admitidos, no un archivo adjunto ni una factura fiscal emitida. No hay texto libre de notas, fechas de vencimiento ni desglose de IVA. El costo incluye IVA.

Un producto por unidad exige cantidad entera y un IMEI/serie por unidad, sin duplicados dentro de la carga o entre unidades activas. Crear cada unidad fija su costo en la moneda de la recepción; no actualiza product_costs de ese producto. La propuesta no incorpora batería, grado o checklist como campos obligatorios de compras. Por cantidad, se incorporan existencias y se registra el último costo recibido del producto, sin promedio. El precio de venta no cambia. Si costo y precio están en distintas monedas, no se muestra un margen calculado entre ellas.

La recepción no es un estado de la orden: es un documento inmutable que puede seguir vigente o tener una anulación. Situación de pago, estado de la unidad y vigencia del documento son distintos. Su ficha debe permitir abrir unidades, orden, pagos, actividad e impresión sin mezclar botones de cada entidad.

## Anulación revisable

La pieza 07 representa la ficha con su revisión de anulación, no una anulación ya realizada. Es total, con motivo cerrado; no hay edición, borrado ni anulación parcial. Para cantidad, debe alcanzar lo disponible; para equipos, todas las unidades de esa recepción deben seguir disponibles. Una unidad reservada, vendida, en revisión, en reparación o dada de baja bloquea toda la operación. No se ofrece eludirlo cambiando estados automáticamente.

El diálogo muestra IMEI abreviados …5101/…5102 junto al identificador de unidad. En la implementación se debe poder consultar el IMEI completo para identificar el equipo sin ambigüedad, sin sustituirlo por números inferidos del render.

La anulación da de baja las unidades o retira las cantidades, no restaura el costo y no cambia el precio. Deja de contarse como recibido en la orden, que conserva su estado si estaba cerrada. No anula pagos ni devuelve dinero: lo pagado pasa a la cuenta, que primero cubre otras deudas de la misma moneda antes de dejar saldo a favor.

En el ejemplo RC-000091, ambas unidades están disponibles. La deuda USD 1.020 se retira y el pago USD 300 se reclasifica a cuenta. Como no hay otra deuda USD de Nexo en este escenario, queda a favor del negocio. La orden abierta vuelve a tener 3 unidades pendientes. En el tablero de estados, una alternativa con U-000502 reservada impide la anulación; no es un cambio ya ejecutado.

## Móvil

Formulario a pantalla completa con proveedor/moneda/orden visibles, unidades antes que resumen y una barra inferior con total y Revisar recepción. Sin navegación global durante la carga; respeta teclado, área segura y espacio inferior. No se promete cámara, lector de códigos o guardado automático. La etapa de revisión comparte las reglas y datos del escritorio.

## Sistema visual, acceso y límites

Se conservan Manrope y los tokens aprobados: fondo #F6F5FB, lateral #F1EEFB, superficies blancas, texto #17142E/#5A5573, bordes #E3DFF0, primario #6D28D9 y selección #EDE7FE. Radios de 12 px y sombras discretas. Usar el logotipo y los iconos originales al implementar; los renders no definen nuevos activos de marca. Botones y fondos planos, aunque la generación introduzca pequeñas variaciones de tono.

Compras, proveedores, costos, pagos y cuentas de proveedores son exclusivos de administración. El agente no accede a ellos; un viewer no recibe una versión con datos parcialmente ocultos de estas pantallas. Técnicos requiere la capacidad de reparaciones. Los accesos y los datos se autorizan también en servidor.

Objetivos de implementación: contraste AA, zoom 200 %, reflujo a 320 px, objetivos táctiles de 44 px, etiquetas persistentes, estado con texto e icono, navegación completa con teclado y foco visible. Diálogos con foco contenido y regreso al disparador; foco inicial en la opción segura. Un error conserva los datos ingresados; la carga o el fallo de cuenta nunca se presentan como deuda cero. Las imágenes no certifican accesibilidad.

Las pestañas, paneles, contadores, filtros y pasos de revisión son propuestas de interfaz. Deben conectarse a las lecturas y escrituras autorizadas, sin suponer que existen nuevos contratos. Los casos de rechazo reutilizan los patrones documentados; no se generó una pantalla independiente por cada error, rol, moneda o página de resultados. No se garantiza cobertura exhaustiva de todos los estados técnicos.

