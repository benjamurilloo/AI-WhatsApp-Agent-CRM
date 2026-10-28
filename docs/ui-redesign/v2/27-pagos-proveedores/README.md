# Pagos y cuentas a pagar — V2-11

28 de octubre de 2026. Cuatro imágenes del [lote V2-11](../25-compras/README.md). La pieza de listado incluye un detalle de comprobante en panel lateral; no son dos documentos distintos.

| # | Vista | Imagen |
|---|---|---|
| 08 | Pagos | [Ver](desktop/01-pagos-detalle-v2.png) |
| 09 | Pago convertido | [Ver](desktop/02-pago-recepcion-conversion-v2.png) |
| 10 | A pagar | [Ver](desktop/03-cuentas-a-pagar-v2.png) |
| 12 | Pago a cuenta | [Ver](desktop/04-pago-a-cuenta-v2.png) |

## Registrar una salida

Un pago se dirige a una recepción vigente o a la cuenta de un proveedor. No se paga una orden de compra. Contra recepción, monto positivo sin exceder lo que falta según la cuenta al confirmar; a cuenta puede superar la deuda y generar un anticipo a favor del negocio. Un proveedor inactivo puede recibir pagos. Medios activos ordinarios; Permuta no se ofrece.

La operación registra el pago, sin enviar una transferencia ni realizar una operación bancaria. Efectivo requiere caja abierta y saldo suficiente en la moneda física que sale; transferencia no requiere abrir caja. Se distinguen monto aplicado, salida física y cotización guardada. La pieza 09 prepara el mismo pago que la pieza 08 muestra ya emitido: no son dos pagos acumulados.

Cotización actual debe mostrarse como valor de solo lectura; editar la tasa requiere seleccionar Acordada. La apariencia de campo del render no autoriza cambiar la cotización general desde el pago. Usar el código de moneda como identificación principal y no depender de banderas.

Con moneda principal, un pago a cuenta se aplica en ella o en una moneda con deuda pertinente del proveedor. La conversión de salida se ofrece solo en los casos habilitados por la regla actual, con cotización vigente o acordada para esa operación; requiere que exista una cotización de base. Antigüedad se advierte y ausencia impide la conversión. Una cotización acordada no modifica la general. La cuenta usa lo aplicado; caja usa lo físico. No se convierte otra vez un comprobante histórico con la tasa de hoy.

## Cuenta y deuda

El pago directo va primero a su recepción; lo libre se imputa por moneda al comprobante más antiguo con deuda, incluyendo cargos de trabajos reparados. No hay selección manual de imputación. La vista previa explica el efecto esperado y se revalida al confirmar, pues la cuenta puede haber cambiado.

A pagar contiene una fila por proveedor y moneda con deuda, incluyendo inactivos, con fecha del comprobante pendiente más antiguo y cantidad de comprobantes con saldo. No se inventan vencimientos, mora, intereses o límites de crédito. Los saldos a favor del negocio se consultan en la cuenta y no se cuentan como deuda. No se suma ARS y USD sin una referencia explícita y su tasa.

El filtro por nombre, los agrupamientos nuevos o un acceso global a cuentas con saldo a favor son mejoras propuestas, no lecturas garantizadas por el código actual. El render no muestra una marca de inactivo en A pagar porque la lectura actual no la suministra.

## Corregir un pago

Detalle con Imprimir y anulación dentro de Más. Anulación completa y única con motivo cerrado: El pago no se hizo / Medio de pago equivocado / Monto equivocado / Recepción o proveedor equivocados / Otro. Conserva el pago original y usa sus importes y tasa; no recalcula con la cotización actual ni mueve stock.

Si el pago fue en efectivo y su sesión original sigue abierta, revierte la salida en esa sesión. Si cerró, no modifica su arqueo ni ingresa dinero a la caja actual. La cuenta se recalcula al anular. No representa un reintegro recibido del proveedor ni abre una funcionalidad de devolución de proveedor.

## Sistema visual, acceso y límites

Se conservan Manrope y los tokens aprobados: fondo #F6F5FB, lateral #F1EEFB, superficies blancas, texto #17142E/#5A5573, bordes #E3DFF0, primario #6D28D9 y selección #EDE7FE. Radios de 12 px y sombras discretas. Usar el logotipo y los iconos originales al implementar; los renders no definen nuevos activos de marca. Botones y fondos planos, aunque la generación introduzca pequeñas variaciones de tono.

Compras, proveedores, costos, pagos y cuentas de proveedores son exclusivos de administración. El agente no accede a ellos; un viewer no recibe una versión con datos parcialmente ocultos de estas pantallas. Técnicos requiere la capacidad de reparaciones. Los accesos y los datos se autorizan también en servidor.

Objetivos de implementación: contraste AA, zoom 200 %, reflujo a 320 px, objetivos táctiles de 44 px, etiquetas persistentes, estado con texto e icono, navegación completa con teclado y foco visible. Diálogos con foco contenido y regreso al disparador; foco inicial en la opción segura. Un error conserva los datos ingresados; la carga o el fallo de cuenta nunca se presentan como deuda cero. Las imágenes no certifican accesibilidad.

Las pestañas, paneles, contadores, filtros y pasos de revisión son propuestas de interfaz. Deben conectarse a las lecturas y escrituras autorizadas, sin suponer que existen nuevos contratos. Los casos de rechazo reutilizan los patrones documentados; no se generó una pantalla independiente por cada error, rol, moneda o página de resultados. No se garantiza cobertura exhaustiva de todos los estados técnicos.

