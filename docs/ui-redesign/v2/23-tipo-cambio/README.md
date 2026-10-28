# Tipo de cambio — V2-10

Una imagen con datos ficticios, dentro del [lote de Caja y cuentas](../21-caja/README.md). [Cotización, fuente, historial y carga manual](desktop/01-cotizacion-fuente-historial-v2.png). [Prompts](../21-caja/prompts-v2-10.md).

La propuesta reúne valor vigente, fuente, ajuste, fechas e historial, y abre la carga manual en un panel. Así se distingue configurar cómo se obtiene la cotización de registrar un valor concreto. Mientras se carga el valor, la configuración del fondo queda inerte.

Se consultaron solo en lectura el [ADR de tipo de cambio](../../../decisions/0025-tipo-de-cambio.md), los briefs 29.4/29.4.2/29.4.3 y las pantallas/formularios actuales. No se consultó una cotización real, no se llamó al proveedor ni se cambiaron valores del CRM.

## Reglas que conserva el diseño

La moneda principal es una configuración operativa de la organización; el administrador del negocio no la modifica en esta pantalla. El par se muestra en lectura. Sin moneda principal no se ofrece este módulo ni se añaden conversiones como si siempre estuvieran habilitadas.

La dirección siempre se anuncia: 1 USD = cierta cantidad de ARS en el ejemplo. La tasa tiene precisión propia, puede mostrarse con más decimales cuando corresponde y respeta el mínimo y los límites del dominio. No es un monto de caja. Una tasa vigente no convierte los precios de productos o líneas de documentos ni reescribe operaciones anteriores.

Una cotización nueva es otro registro; las anteriores no se editan ni borran. Manual y automática comparten el historial con autor/origen y fecha pertinentes. Una tasa negociada para un cobro o pago se guarda en esa operación, no se vuelve la tasa general por defecto.

La fuente automática configurada usa DolarAPI blue venta más el ajuste de la organización. No se incorpora una tasa distinta de compra, una lectura de otro proveedor o un botón que haga salir a internet a la pantalla. Se conserva atribución visible y el comportamiento del lector existente. El ajuste admite cero o valores negativos y se aplica en la siguiente lectura; no modifica inmediatamente la vigente al escribirlo.

Cargar una tasa manual la hace vigente al guardar. Con fuente automática una lectura posterior puede reemplazarla según las reglas actuales; para mantener carga manual se cambia la fuente. Volver desde manual a automática exige explicar que la siguiente lectura puede reemplazar la vigente aunque el proveedor no haya cambiado, conforme al comportamiento actual.

Un cambio manual mayor al umbral vigente del 10 % requiere confirmación adicional, sin convertirlo en una prohibición. Una lectura automática inválida/dudosa se rechaza y conserva la anterior. El render propone 1.530 sobre 1.500, un 2 %, y no muestra esa confirmación excepcional.

## Vigencia y operaciones convertidas

Valor, fuente, momento de registro y última confirmación se diferencian. La antigüedad de la automática se mide por la confirmación, no necesariamente por una fila nueva; la manual por su registro. El aviso actual considera más de 24 horas sin contar fines de semana. Una advertencia de antigüedad no bloquea por sí sola, mientras que ausencia de tasa impide la conversión.

Antes de registrar dinero convertido se conserva la tasa presentada, su identificador si corresponde y la confirmación requerida por el servicio. Si cambió durante la carga, se actualiza la propuesta y se revisa. Una tasa acordada necesita el mismo contexto válido que exige el servicio; no sirve para eludir ausencia de cotización. Las anulaciones conservan los montos físicos originales, sin usar la tasa de hoy.

Los equivalentes de Caja y cuentas se rotulan Orientativo y muestran fecha/tasa. No se guardan como nuevos movimientos ni se usan para compensar automáticamente saldos entre monedas.

## Datos ilustrativos

El 27 oct 2026, a las 12:30, la vigente del ejemplo es 1 USD = ARS 1.500. Fuente ilustrativa 1.485 más ajuste 15. Fue registrada a las 09:00 y confirmada a las 12:00. El historial dibuja además una manual de 1.490 del 26 oct a las 18:00 y otra automática de 1.480 de las 15:00.

La manual de ARS 1.530 está preparada y no se guardó; el resto del lote usa 1.500. Ninguno de estos números representa el mercado ni una recomendación de valor.

Admin carga tasas, fuente y ajuste y consulta historial; viewer ve vigente, origen, fechas y referencias permitidas, sin acciones de modificación ni historial administrativo completo. El mockup muestra el rol administrador.

La vista móvil, la tasa ausente, la advertencia por antigüedad, el salto mayor al 10 % y el retorno de manual a automática se describen aquí o en los estados compartidos, sin una captura independiente de cada caso. Se conservan accesibilidad y tokens del [lote](../21-caja/README.md). No se tocaron código ni datos.

