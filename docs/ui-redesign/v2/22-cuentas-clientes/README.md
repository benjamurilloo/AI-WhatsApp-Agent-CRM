# Cuentas de clientes — V2-10

Tres imágenes con datos ficticios. Parte del [lote de Caja y cuentas](../21-caja/README.md), que contiene catorce piezas. [Prompts exactos](../21-caja/prompts-v2-10.md).

| # | Vista | Imagen |
|---|---|---|
| 01 | Clientes con deuda, separados por moneda | [Deudores](desktop/01-deudores-por-moneda-v2.png) |
| 02 | Resumen, imputación y acceso a comprobantes | [Estado de cuenta](desktop/02-estado-cuenta-cliente-v2.png) |
| 03 | Cobro a cuenta y aplicación prevista | [Revisión del cobro](desktop/03-cobro-a-cuenta-imputacion-v2.png) |

## Base y propuesta

Se consultaron en lectura el [brief de cuenta corriente](../../../decisions/brief-21.6-la-cuenta-corriente.md), los ADR de [cobros/caja](../../../decisions/0022-cobros-y-caja.md) y [tipo de cambio](../../../decisions/0025-tipo-de-cambio.md), el listado de deudores, el estado de cuenta y el formulario/acción de cobro a cuenta actuales. No se leyeron cuentas reales ni se verificó otra vez producción.

El acceso directo Cuentas de clientes reorganiza la función actual de Deudores bajo Finanzas. Con deuda conserva una fila por cliente y moneda; una persona puede aparecer más de una vez. Buscar cliente es un acceso propuesto al buscador/ficha de Clientes para consultar cuentas sin deuda: no supone que el listado actual de deudores ya incluya todos los clientes. La búsqueda por nombre y el agrupamiento visual por moneda necesitan soporte de lectura y deben preservar los filtros y el alcance del resumen.

Los botones Ver cuenta abren el mismo estado financiero que desde la ficha de cliente y las ventas. No se crean cuentas duplicadas. No se agregan vencimientos, morosidad automática, intereses, límite de crédito, recordatorios ni botones para contactar o cobrar externamente.

## Saldo e imputación

Cada moneda conserva su débito, crédito, saldo, señas retenidas e imputación. El saldo deudor y el saldo a favor son situaciones distintas; el equivalente de referencia no convierte la deuda ni compensa automáticamente un saldo en ARS con otro en USD.

Los cobros directos cubren su destino; los cobros a cuenta y fondos liberados se aplican según las reglas vigentes a ventas con saldo de la misma moneda, empezando por las más antiguas. Esta aplicación se deriva en cada lectura. La UI muestra cómo se aplican los importes, no incorpora casillas para asignarlos manualmente.

Las señas de pedidos abiertos o entregados sin venta quedan retenidas y se explican aparte. No deben reducir una deuda distinta ni ofrecerse como saldo libre para devolver. Al emitirse la venta o cancelarse el pedido pasan al tratamiento correspondiente. Un recibo o una venta anulados puede cambiar la imputación actual sin editar documentos anteriores.

Resumen propone tarjetas por moneda y una tabla de imputación con venta, total, cobro directo, de la cuenta y pendiente. Comprobantes reúne la historia documental. No se añade saldo corrido por cada fila: la fecha de una seña no coincide necesariamente con el momento en que integra el saldo general. Si se limita el listado de comprobantes, se informa que el resumen incluye todos y que solo la lista está recortada.

La impresión debe conservar fecha de generación, negocio, cliente, importes por moneda, imputación y documentos pertinentes. No imprime botones o navegación ni se presenta como un comprobante fiscal.

## Cobrar a cuenta

El formulario identifica cliente, moneda aplicada, moneda recibida cuando corresponda, medio e importe. Un cliente desactivado puede conservar deuda y recibir un cobro según las reglas actuales; no se bloquea por reutilizar la exigencia de cliente activo del alta de ventas.

El cobro a cuenta puede superar la deuda: el excedente queda a favor en la misma moneda. La revisión muestra destinos previstos y remanente. No se crea un error de sobrepago por el simple hecho de superar la deuda, ni se obliga a elegir una venta.

La aplicación mostrada es una previsión. Al registrar se usan las reglas y saldos de ese momento; una anulación posterior puede volver a modificar la imputación. El servicio actual no garantiza que una previsión sea una asignación fija guardada.

Con moneda principal configurada, las monedas aplicables y la posible conversión se limitan a lo que ofrece el servicio: principal y monedas con saldo pertinente. No se genera crédito aislado en cualquier moneda. La moneda de entrada puede ser otra solo cuando ese destino admite conversión y hay una cotización vigente válida. El recibo conserva la equivalencia usada; una cotización acordada para ese cobro no reemplaza la general.

Transferencia registra un ingreso recibido; no ejecuta la transferencia. Efectivo exige caja abierta y sus límites en la moneda física. Permuta no se ofrece como cobro a cuenta. Cambiar los datos vuelve al mismo borrador, sin perder cliente/importe; Registrar queda como única acción principal al revisar.

## Devolver saldo a favor

Solo aparece el acceso si hay saldo a favor disponible en la moneda correspondiente y permiso. La devolución puede ser parcial dentro del disponible, no devuelve una deuda ni una seña retenida. Se revisan destino, moneda aplicada, moneda que sale y tipo de cambio si corresponde. El patrón del [formulario de devolución](../21-caja/desktop/07-devolucion-venta-sin-cliente-v2.png) se reutiliza con destino Cuenta del cliente, no con una venta sin cliente.

Una venta anulada con cliente pasa lo cobrado a su cuenta, primero a otras deudas y luego a favor. El importe total de ese recibo no garantiza cuánto puede devolverse. Los rechazos y la anulación de devoluciones mantienen las reglas descritas en [Caja](../21-caja/README.md).

## Datos ficticios

Paula Méndez tiene dos monedas:

| Moneda | Ventas vigentes | Cobros netos | Debe |
|---|---:|---:|---:|
| USD | 400 | 100 | 300 |
| ARS | 120.000 | 0 | 120.000 |

V-000222 del 27 oct es de USD 400. R-000183 cubre USD 100 habiendo recibido ARS 150.000 en efectivo a 1 USD = ARS 1.500. V-000210, del 24 oct, conserva una deuda anterior en ARS 120.000. No se mezclan esos importes. El equivalente orientativo es USD 300 + 120.000 / 1.500 = USD 380.

La revisión prepara un cobro de USD 350 por Transferencia: USD 300 irían a V-000222 y USD 50 quedarían a favor en USD. Los ARS 120.000 seguirían pendientes. Este cobro todavía no se registró; por eso las otras vistas conservan la deuda USD 300. No tiene número R asignado ni añade efectivo a Caja.

Mateo Salas conserva el ejemplo de [Ventas V2-09](../20-ventas/README.md): pendientes ARS 380.000 en V-000218 y ARS 280.000 en V-000221, total ARS 660.000. La permuta adicional de ARS 80.000 de aquel lote seguía sin guardar y no se descuenta aquí.

El listado tiene tres saldos de dos clientes: ARS 660.000 y ARS 120.000, más USD 300. Su equivalente es (780.000 / 1.500) + 300 = USD 820. Son ejemplos de diseño, no saldos reales ni cotización de mercado.

## Roles, accesibilidad y cobertura

Admin registra cobros y devoluciones; viewer consulta estado y comprobantes sin acciones de gestión. El listado no expone datos de contacto del cliente. Los permisos de dinero no se amplían por mostrar un acceso nuevo.

Los importes siempre anuncian moneda y sentido Debe/A favor. Las etiquetas son persistentes, los resúmenes no dependen solo del color y las tablas permiten teclado y reflujo. Deben verificarse contraste AA, zoom 200 %, reflujo 320 px, foco, anuncios de actualización y objetivos táctiles de al menos 44 px. La imagen no certifica esas condiciones.

La pestaña Comprobantes, el formulario anterior a la revisión, la cuenta al día, el saldo a favor, la devolución de cliente y las variantes móviles reutilizan patrones descritos; no tienen imágenes separadas en este lote. La captura de cuenta representa USD seleccionado y un resumen por ambas monedas; no elimina el detalle ARS.

Sistema visual, controles finales y continuidad: [Caja V2-10](../21-caja/README.md). Próximo lote: V2-11 — Compras y proveedores.

