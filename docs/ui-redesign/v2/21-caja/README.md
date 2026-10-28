# Caja y cuentas de clientes — V2-10

Iniciado el 27 de octubre de 2026 y finalizado el 28 de octubre de 2026. Catorce imágenes con datos ficticios, distribuidas por módulo. Las fechas del escenario se conservan en el 27. No se modifica código, configuración ni datos del CRM.

| Módulo | Piezas | Índice |
|---|---:|---|
| Caja | 9 | Este documento |
| Cuentas de clientes | 3 | [Ver cuentas](../22-cuentas-clientes/README.md) |
| Tipo de cambio | 1 | [Ver cotización](../23-tipo-cambio/README.md) |
| Medios de pago | 1 | [Ver medios](../24-medios-pago/README.md) |

| # | Vista de Caja | Imagen |
|---|---|---|
| 01 | Sesión abierta y cálculo del efectivo | [Caja actual](desktop/01-caja-abierta-v2.png) |
| 02 | Efectivo inicial por moneda | [Abrir caja](desktop/02-apertura-caja-v2.png) |
| 03 | Aporte/retiro y efecto previsto | [Movimiento](desktop/03-movimiento-efectivo-v2.png) |
| 04 | Conteo, diferencia y confirmación | [Cierre](desktop/04-cierre-arqueo-v2.png) |
| 05 | Sesiones y arqueo conservado | [Historial](desktop/05-sesiones-arqueo-historico-v2.png) |
| 06 | Cobros y recibo con conversión | [Recibo](desktop/06-cobros-recibo-conversion-v2.png) |
| 07 | Devolución de una venta sin cliente anulada | [Devolución](desktop/07-devolucion-venta-sin-cliente-v2.png) |
| 08 | Efectivo esperado y acciones en móvil | [Caja móvil](mobile/08-caja-mobile-v2.png) |
| 09 | Rechazos, avisos y anulación de recibo | [Estados compartidos](estados/09-estados-caja-cuentas-v2.png) |

Se amplía el rango orientativo del [plan](../../00-auditoria-actual/plan-lotes-v2.md) para representar cuatro módulos y sus decisiones de dinero. Los [prompts completos](prompts-v2-10.md) contienen las instrucciones exactas y la trazabilidad. [Índice global V2](../manifest-v2.md).

## Base y límites

Se parte del [inventario de pantallas](../../00-auditoria-actual/inventario-pantallas-v2.md), los lotes de [Ventas](../20-ventas/README.md) y [Usados](../17-usados/README.md). Se leyeron solo archivos locales: los ADR de [cobros/caja](../../../decisions/0022-cobros-y-caja.md) y [tipo de cambio](../../../decisions/0025-tipo-de-cambio.md), briefs 21.2, 21.5, 21.6, 29.4, 29.4.2 y [29.4.3](../../../decisions/brief-29.4.3-devoluciones-y-pagos-en-otra-moneda.md), las pantallas/formularios de caja, cobros, devoluciones, cuentas, medios y cotización, y los servicios actuales.

No se recorrió otra vez producción, no se accedió a clientes reales ni se ejecutaron pruebas o migraciones. Las reglas se contrastaron con el código local disponible, que puede cambiar mientras sigue el desarrollo. Las cotizaciones del diseño son inventadas; no se consultaron fuentes de mercado.

El rediseño propone jerarquía, agrupación de movimientos, resúmenes, paneles y accesos. Un selector nuevo, un filtro o un contador dibujados no implican que la lectura actual los ofrezca. Deben implementarse y validarse respetando permisos y reglas existentes.

## Navegación y acciones

Finanzas agrupa Caja, Cuentas de clientes y Tipo de cambio. Medios de pago se alcanza desde la configuración de Caja. Las rutas actuales de Deudores y Cotización se conservan como destinos funcionales aunque se propongan accesos directos en el menú.

Caja distingue Caja actual, Sesiones, Cobros y Devoluciones. Más reúne configuración y destinos secundarios sin esconder la sección activa. Registrar movimiento abre Aporte/Retiro; no registra un cobro de cliente ni un pago de compra. Preparar cierre lleva al conteo y revisión; no cierra al tocarlo.

La sesión abierta tiene identificador, fecha y autor. Los importes son esperados, no una afirmación de cuánto se contó físicamente. Ver todos/Ver movimientos conserva la sesión; consultar otra sesión no cambia dónde se registran movimientos.

En móvil, Resumen y Movimientos separan consulta y detalle. La navegación global mantiene Más seleccionado. Las barras fijas respetan área segura y espacio para llegar a todo el contenido. La versión pequeña puede apilar monedas sin comprimir la tabla de escritorio.

## Efectivo y totales

La sesión cuenta efectivo por moneda. Un cobro con Transferencia, Tarjeta, USDT o Permuta no entra a esta caja. No se confunden caja física, ventas emitidas, deuda de clientes y un saldo bancario.

El cálculo actual por moneda incluye inicial, cobros en efectivo, anulaciones de cobros mientras estaba abierta, devoluciones y sus anulaciones, aportes, retiros, pagos a proveedores/usados y sus anulaciones pertinentes. La tabla de ejemplo omite filas de anulaciones porque valen cero; cuando existan deben aparecer, sin borrar el original ni netearlo de modo que pierda su trazabilidad.

Una operación convertida tiene monto aplicado y monto físico. La deuda usa lo aplicado; caja usa la moneda que entra o sale. Un cobro aplicado por USD 100 que recibió ARS 150.000 no incrementa además los billetes en USD.

El equivalente orientativo usa una cotización explícita y fecha; no reemplaza los importes nativos. Sin cotización no se inventa un cero ni una tasa. Una cotización antigua se advierte, sin bloquear por antigüedad sola. No se presenta el equivalente como efectivo contado, saldo contable ni importe de una operación nueva.

## Apertura y movimientos

Abrir requiere cargar al menos una moneda, incluso con monto cero, sin duplicarla; se respetan las monedas admitidas y el máximo actual de diez filas. La moneda principal se propone primero cuando existe. El número C se asigna al guardar, no se anticipa en el formulario. Solo puede existir una sesión abierta por organización según el servicio actual.

El inicial se cuenta y declara; no se copia silenciosamente del cierre anterior. Los importes de apertura no son ingresos de ventas. Una discrepancia con el día anterior no habilita a editar un arqueo cerrado.

Aporte y Retiro requieren moneda, importe positivo y motivo de la lista correspondiente. Los motivos actuales distinguen cambio para la caja/aporte del dueño, depósito en banco/retiro del dueño y corrección/otro según el tipo. No se añade un campo de texto libre nuevo.

La revisión muestra esperado actual y previsto después de registrar. Un retiro no puede dejar el esperado negativo. Un aporte respeta el límite máximo del sistema. Registrar un retiro con motivo Depósito en el banco describe una salida física; no ordena una transferencia ni concilia un banco. Para corregir un movimiento equivocado se registra el movimiento opuesto con el motivo apropiado y auditoría; no se ofrece editar o borrar el original.

## Cierre y sesiones guardadas

El cierre es de dos pasos: conteo y revisión. Se cuenta cada moneda con inicial o movimientos, incluyendo un cero cuando corresponde. Se muestra lo esperado; el arqueo actual no es a ciegas. El diseño representa el segundo paso y permite volver a corregir el conteo.

La diferencia es contado menos esperado. Faltante y sobrante llevan texto e importe; una moneda no compensa la otra. Una diferencia no bloquea por sí sola el cierre ni genera automáticamente un aporte/retiro para hacerla desaparecer.

Antes de confirmar se vuelve a calcular lo esperado bajo las reglas existentes. Si cambió desde la revisión, se conservan los conteos y se exige revisar nuevamente. Cerrar es final; el botón tiene tratamiento de operación irreversible y salida Corregir lo contado.

El arqueo guarda los valores del cierre. Una sesión cerrada no se reabre ni se reescribe con cotizaciones o anulaciones nuevas. El histórico muestra fecha, responsables, esperado, contado y diferencia. Los efectos posteriores se explican aparte, con permisos; no se sustituyen por un arqueo recalculado.

## Cobros y documentos

Cobros reúne recibos de venta, seña y cuenta del cliente. El listado permite reconocer destino y abrir el documento. La búsqueda/filtro de cliente y el panel son propuestas de presentación; no se afirma que toda nueva combinación esté disponible en la lectura actual. Registrar cobro, si se ofrece como acceso general, primero exige elegir su destino: venta, pedido o cuenta; no crea un recibo sin contexto.

El panel de R-000183 separa Aplicado a la venta y Recibido físicamente, con cotización copiada y sesión. La impresión usa el documento completo con datos originales, destino, monto, medio, conversión y leyenda Documento no válido como factura. El panel compacto no pretende sustituir todas las variantes del comprobante imprimible.

Los recibos no se editan. La anulación emite AR, exige un motivo de la lista y anula todo el recibo. No es devolver dinero. La deuda y las imputaciones se vuelven a derivar; con Permuta se restaura el disponible del usado según sus reglas.

Si el efectivo pertenece a una sesión que sigue abierta, la anulación resta lo recibido físicamente de esa sesión y no puede dejarla negativa. Si la sesión original ya cerró, no modifica su arqueo ni toca una sesión posterior. Se conserva el aviso de que la realidad física se resuelve con el procedimiento de caja pertinente, sin mover dinero automáticamente.

Se rechaza anular si deja más devuelto que cobrado, si el efecto físico no puede aplicarse o si ya hay anulación; se enlaza el documento existente. Los efectos convertidos conservan los montos y la cotización originales, sin recotizar una anulación.

## Devoluciones

Con cliente, una devolución se prepara desde su saldo a favor disponible, en la moneda correspondiente. Sin cliente, se prepara sobre una venta anulada con dinero pendiente de devolver. No se devuelve una venta vigente desde ese flujo, ni una seña retenida como si fuera saldo libre.

La devolución admite importes parciales dentro del disponible actual y un medio activo ordinario. Efectivo exige sesión abierta y fondos en la moneda que sale. Permuta no es un medio de devolución. Registrar confirma un dinero entregado; no ejecuta una transferencia.

En el caso convertido habilitado por el sistema se distingue moneda del destino, moneda que sale y cotización vigente o acordada. Una devolución nueva usa la cotización admitida de hoy; no asume la del cobro anterior. La anulación de esa devolución conserva lo que salió originalmente, no convierte con otra tasa. Un saldo histórico en ARS no se convierte automáticamente por existir USD como moneda principal.

Anular una devolución emite AD con su motivo y revierte el registro completo. Si su efectivo corresponde a una sesión aún abierta, suma el monto físico original y respeta el máximo; si cerró, conserva el arqueo. No se dibuja como depósito bancario o ingreso real ejecutado.

El listado y documento de devolución reutilizan número, fecha, cliente/destino, medio, aplicado/físico, estado y referencia a su anulación. No tienen una captura independiente de cada combinación en este lote.

## Escenario ficticio y verificación de importes

Sesión C-000046 abierta el martes 27 oct 2026 a las 09:00 por Carla Méndez. Situación base a las 12:30. Cotización ilustrativa: 1 USD = ARS 1.500; no es un dato de mercado.

| Concepto | ARS | USD |
|---|---:|---:|
| Inicial | 100.000 | 50 |
| Cobros en efectivo | +150.000 | +50 |
| Aportes | +20.000 | 0 |
| Retiros | −10.000 | 0 |
| Devoluciones | −20.000 | 0 |
| Pagos a proveedores | −30.000 | 0 |
| Pagos de usados | −40.000 | 0 |
| Esperado | 170.000 | 100 |

R-000183, 11:40: Paula Méndez, venta V-000222, aplicado USD 100 y recibido ARS 150.000 en efectivo. R-000184, 11:50: V-000223, USD 50 en efectivo. Los demás movimientos del ejemplo son aporte 20.000, retiro 10.000, D-000012 por 20.000, PP-000072 por 30.000 y PPU-000042 por 40.000, todos ARS. El pago del usado puede leerse como paso posterior al ejemplo de Sofía: de ARS 190.000 pendientes antes se pasarían a ARS 150.000, sin modificar las imágenes anteriores.

La suma es ARS 170.000 y USD 100. Su equivalente orientativo es 170.000 / 1.500 + 100 = USD 213,33. R-000182 de Mateo, una Transferencia de ARS 200.000 del lote anterior, aparece en Cobros pero no en efectivo. Las permutas tampoco integran la caja.

Las imágenes son distintos momentos o alternativas, no acciones ya realizadas:

- Apertura representa las 08:55, antes de asignarse C-000046.
- El nuevo retiro de ARS 50.000 está sin guardar: dejaría ARS 120.000; no cambia las otras vistas.
- El cierre representa una revisión posterior, a las 18:30, sin movimientos nuevos respecto de la base: contado ARS 168.000 y USD 100; faltante ARS 2.000 y equivalente de lo contado USD 212.
- C-000045 es otra sesión, del 26 oct de 09:00 a 19:00, con esperado/contado ARS 80.000 y USD 40, sin diferencia.
- La devolución preparada de V-000220 ocurre después de la anulación A-000011, como continuación del caso de Ventas. Se devolverían ARS 80.000 por Transferencia; aún no se registró y no cambia C-000046.
- Anular R-000183 en la lámina es una alternativa: dejaría el esperado ARS 20.000 y la deuda USD de Paula volvería a USD 400, sin cambiar su saldo ARS. No describe la caja base.

## Sistema visual, roles y accesibilidad

Se conservan Manrope, fondo #F6F5FB, blanco, lateral #F1EEFB, texto #17142E, secundario #5A5573, bordes #E3DFF0, primario #6D28D9 y selección #EDE7FE. Colores planos, radios 12 px y sombras discretas. Abierta/Vigente usa verde, Cerrada/Anulada gris y avisos/faltantes ámbar; siempre con texto e icono. El logotipo y los iconos definitivos siguen siendo los activos oficiales, sin sustituirlos por variaciones generadas.

Admin registra y configura; viewer consulta. Los pagos de proveedores/técnicos y de usados conservan las restricciones actuales: un resumen de caja no habilita a mostrar nombres, costos o documentos restringidos. Las agregaciones permitidas no se amplían por incluirlas en el mockup de administración.

Objetivos pendientes de comprobar al implementar: contraste AA, zoom 200 %, reflujo a 320 px, objetivos táctiles de al menos 44 px, foco visible, etiquetas y unidades persistentes, errores asociados y teclado completo. Las tablas tienen encabezados y alternativa legible en móvil. Un importe se lee con su moneda; signo y color solos no bastan. Los paneles modales retienen foco, vuelven al disparador y dejan el fondo inerte.

Se conserva el formulario ante rechazo, se evita el doble envío y se anuncia guardado solo después del éxito. Error de red, caja cerrada, búsqueda sin resultados, inexistencia de sesión y falta de permiso son estados distintos. Las imágenes no verifican comportamiento accesible, servidor ni impresión.

## Cobertura y continuidad

La lámina muestra caja cerrada, esperado cambiado, efectivo insuficiente, anulación de recibo, cotización antigua/ausente y falta de saldo a favor. La primera pantalla de conteo, el aporte, la devolución de cuenta, el listado/documento de devolución y su anulación reutilizan los patrones descritos, sin imagen independiente de cada variante.

No se pretende certificar todos los estados posibles con catorce renders. El alcance representado y las condiciones no dibujadas se documentan para implementación. Este lote no añade automatizaciones, notificaciones, intereses, conciliación bancaria ni movimientos reales.

Se usa ImageGen integrada, una generación por pieza y correcciones dirigidas. Los originales permanecen en su carpeta de generación y las versiones seleccionadas se copian aquí. La trazabilidad y el control final se registran en [prompts-v2-10.md](prompts-v2-10.md).

Control final: catorce PNG copiados a sus carpetas, dimensiones comprobadas y enlaces locales revisados. Doce horizontales de 1672 × 941, apertura de 1671 × 941 y móvil de 941 × 1672. Se conservan los originales sin estirar ni recortar. El lote queda cerrado el 28 de octubre de 2026.

Próximo lote: V2-11 — Compras y proveedores.

