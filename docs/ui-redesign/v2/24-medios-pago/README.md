# Medios de pago — V2-10

Una imagen del [lote de Caja y cuentas](../21-caja/README.md): [listado y alta](desktop/01-medios-pago-configuracion-v2.png). [Prompts exactos](../21-caja/prompts-v2-10.md). Datos ficticios; sin cambios en el CRM.

## Organización

Se propone ubicar Medios de pago en la configuración de Caja, conservando el destino actual. El listado distingue nombre, si pasa por efectivo, estado y acciones. El alta usa un panel y un único botón principal; al abrirlo el fondo deja de ser interactivo. El acceso no conecta un banco, una tarjeta ni una pasarela de pagos.

La revisión procede del formulario, listado y acciones actuales y del [brief de medios/caja](../../../decisions/brief-21.2-los-medios-de-pago-y-la-caja.md), el [tipo de cambio](../../../decisions/0025-tipo-de-cambio.md) y las reglas de [permuta](../../../decisions/brief-29.7.2-la-permuta-y-la-compra-de-usados.md). No se probaron integraciones ni se leyeron medios reales.

## Alta, edición y estado

Un medio ordinario requiere nombre único, de hasta 40 caracteres, y elegir si es efectivo. Ese tipo no se puede cambiar después de crearlo: modificarlo reinterpretaría movimientos anteriores. La edición posterior solo renombra según las reglas actuales; no añade comisiones, moneda obligatoria, datos bancarios o procesamiento automático.

Desactivar quita el medio de nuevas operaciones, sin borrar lo que lo usa. Reactivar lo vuelve a ofrecer. No se borra ni se cambia el tipo de un medio con historia. El panel de renombre reutiliza el de alta, con el tipo de solo lectura y Guardar nombre. Antes de desactivar se revisa el medio concreto y el efecto; Cancelar conserva el estado.

La creación de la lista inicial solo se ofrece cuando el módulo lo permite, sin crear duplicados. No se convierte en un botón permanente que reinicialice configuraciones del negocio.

## Efectivo, USDT y Permuta

Efectivo participa en una sesión de caja y sus controles de apertura, fondos y cierre. No efectivo conserva el recibo sin sumar billetes a la caja. Elegir un nombre como Transferencia o Tarjeta no ejecuta ni verifica un pago real.

USDT es un medio no efectivo que el modelo del negocio usa en USD, no una moneda nueva ni una sesión de caja. El nombre no introduce billeteras, redes, cotización de criptoactivos ni un procesador automático.

Permuta es del sistema: no se renombra, desactiva ni usa como medio genérico. Descuenta crédito de un usado elegible en un cobro de venta, con mismo cliente/moneda y límites. No se usa en señas, cobros a cuenta, devoluciones o pagos ordinarios de compra. El bloqueo del listado es explícito y no depende solo de un icono.

## Ejemplo y cobertura

El listado contiene Efectivo, Transferencia, Tarjeta y USDT activos; Permuta activa del sistema; Cheque inactivo. Link de pago es el nombre de un medio ordinario nuevo, no efectivo, aún sin guardar. No aparece como séptima fila antes de confirmar ni genera un enlace de pago real.

Admin administra; viewer consulta sin controles de gestión. Los controles de estado tienen nombre accesible, los radios tienen leyenda y las etiquetas siguen visibles ante error. Nombre duplicado, guardado rechazado o cambio concurrente conserva el panel con error asociado. Los objetivos de accesibilidad se verifican al implementar; no se certifican por el PNG.

Se representa alta y listado. Renombre, confirmación de desactivación, reactivación, vacío inicial y móvil reutilizan los patrones descritos, sin imágenes adicionales. Se mantiene el sistema visual y no se modifica código, configuración o datos.

