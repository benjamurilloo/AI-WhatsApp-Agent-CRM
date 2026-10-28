# Propuesta de métricas — V2-14

28 de octubre de 2026. Lote terminado y verificado: doce imágenes, con datos ficticios, para analizar ventas, productos, clientes, conversaciones y operación. Se mantiene la identidad violeta; no se reemplaza el dashboard operativo ni se modifica el CRM.

## Dónde colocarlas

**Recomiendo un centro Análisis junto a Inicio y accesos contextuales dentro de las fichas.** Inicio responde "qué requiere atención hoy"; Análisis responde "cómo está evolucionando y qué conviene revisar". El menú no necesita un destino nuevo por cada indicador.

Análisis tiene seis vistas: Resumen, Ventas, Productos, Clientes, Atención y Operación. Operación agrupa Servicio y turnos, y Finanzas y compras; este último desglose conserva acceso administrativo. En móvil se entra desde Más y se cambia de vista con un selector, sin añadir otro botón a la barra inferior.

Producto y Cliente incorporan una pestaña Métricas. "Abrir en Análisis" lleva al mismo cálculo con el producto/cliente preseleccionado y conserva los filtros compatibles; volver restaura el contexto. La ficha de Camila muestra expresamente un historial más amplio, no solo el período mensual del centro.

No recomiendo llenar cada módulo con un dashboard independiente: duplicaría cifras, filtros y mantenimiento. Los listados pueden tener un resumen breve y un acceso "Ver análisis"; las métricas extensas se consultan en el centro. La administración de métricas, un constructor de informes o el envío de campañas quedan fuera de esta propuesta.

## Imágenes

| # | Pantalla | Archivo |
|---|---|---|
| 01 | Resumen de negocio y accesos a señales | [Ver](desktop/01-resumen-analisis-v2.png) |
| 02 | Ventas, ticket y composición | [Ver](desktop/02-ventas-periodo-v2.png) |
| 03 | Ranking de modelos y estado del inventario | [Ver](desktop/03-productos-inventario-v2.png) |
| 04 | Métricas dentro de la ficha de producto | [Ver](contexto/04-producto-metricas-contexto-v2.png) |
| 05 | Clientes compradores y recurrencia | [Ver](desktop/05-clientes-comportamiento-v2.png) |
| 06 | Productos comprados por un cliente | [Ver](contexto/06-cliente-compras-metricas-v2.png) |
| 07 | Conversaciones, respuestas y participación del agente | [Ver](desktop/07-atencion-agente-metricas-v2.png) |
| 08 | Reparaciones y presentismo de turnos | [Ver](desktop/08-operacion-servicio-turnos-v2.png) |
| 09 | Dinero, cuentas y abastecimiento | [Ver](desktop/09-operacion-finanzas-compras-v2.png) |
| 10 | Desglose y definición de una métrica | [Ver](detalle/10-detalle-metrica-desglose-v2.png) |
| 11 | Consulta móvil de Análisis | [Ver](mobile/11-analisis-mobile-v2.png) |
| 12 | Cero, ausencia de base, medición pendiente, fallo y permisos | [Ver](estados/12-estados-definiciones-analitica-v2.png) |

[Diccionario de métricas y prioridades](diccionario-metricas-v2-14.md) · [Escenario numérico](escenario-v2-14.md) · [Prompts completos](prompts-v2-14.md) · [Producción y verificación](produccion-v2-14.md) · [Índice de toda V2](../indice-final-v2.md).

## Qué decisiones permite tomar

| Pregunta | Vista y lectura | Siguiente paso humano |
|---|---|---|
| ¿Qué modelo se vende más? | Productos ordenado por unidades; comparar importe como otra medida | Abrir variantes y stock disponible antes de comprar |
| ¿Qué productos están inmovilizados? | Disponibles con antigüedad desde el alta; no confundir con tiempo real disponible | Revisar estado, precio y publicaciones |
| ¿Qué compra cada cliente? | Historial por unidades, importe y tipo de artículo | Consultar equipos y accesorios por separado antes de preparar una propuesta |
| ¿Las ventas crecen por cantidad o por ticket? | Ventas vigentes, comprobantes y ticket comparados con igual duración | Revisar mezcla de productos y precios |
| ¿Vuelven los clientes? | Compradores con historial previo y primera compra en el período | Revisar comportamiento sin inferir abandono o enviar mensajes automáticos |
| ¿La atención responde y dónde se demora? | Cobertura, mediana y distribución, con los casos sin respuesta | Abrir las conversaciones elegibles |
| ¿Cuánto participa el agente? | Autor de mensajes, separando los registros sin dato | Examinar conversaciones; participación no demuestra calidad o resolución |
| ¿Se entregan los equipos y se atienden los turnos? | Cohorte de reparaciones, tiempo de entrega y turnos con resultado registrado | Revisar órdenes abiertas y agenda |
| ¿Qué dinero y deudas hay? | Flujos por período y saldos actuales por moneda | Abrir cuentas o comprobantes; no confundirlo con ganancia |

Las señales conducen a un listado filtrado o a una ficha, sin ejecutar cambios. "Más vendido" puede significar mayor cantidad o mayor importe; el orden elegido permanece explícito. El producto más frecuente suele ser un accesorio, por eso la ficha del cliente ofrece Todos/Equipos/Accesorios y reconoce empates.

## Qué ya existe y qué es propuesta

La lectura local encontró un catálogo de 14 métricas de conversaciones con consultas en analytics: volumen, cobertura, primera respuesta, distribución, estados actuales, errores de ingestión y comparación anterior. Su documentación declara validación con fixtures sintéticos y no con datos reales; en este trabajo no se ejecutaron esas pruebas ni se verificó producción.

La distribución Agente/Humano/Sin dato puede apoyarse en el campo nullable de autor de mensaje, pero requiere una nueva consulta agregada. Ventas, productos, clientes y operación necesitan nuevas lecturas analíticas; disponer de transacciones no significa que el informe ya exista.

Resolución atribuible solo a IA, satisfacción, motivo consultado, calidad de una respuesta, ahorro de tiempo, margen realizado histórico y venta atribuida al chat no se inventan a partir de un gráfico. El diccionario indica qué necesita medición o vínculo adicional. La propuesta los distingue mediante estados de disponibilidad, sin mostrar porcentajes ficticios de éxito del agente.

## Reglas compartidas

Cada indicador identifica período, población, moneda, definición y fecha de actualización. La vista central propone conservar el contrato de fechas de analytics: últimos 30 días completos por defecto, máximo 366 días, zona de organización. El ejemplo elige 01–27/10 y compara con 04–30/09, 27 días completos en ambos casos.

Se filtran importes por moneda, sin sumar ARS y USD ni convertir históricos con la cotización de hoy. Las vistas mixtas señalan qué indicadores no dependen del filtro monetario. Los saldos y el stock son fotos actuales; las tarjetas lo dicen y no simulan el cierre de un período pasado. Se requiere revisión de consistencia entre consultas antes de prometer que todos los datos representan un único instante.

Una anulación posterior puede cambiar una consulta de ventas vigentes de un período histórico: no es un reporte contable de movimientos de anulación por fecha. Los cobros se consultan según su propia fecha; no se dividen cobros del período por ventas del período para inventar una tasa de cobro.

Los gráficos tienen tabla alternativa, etiquetas legibles y controles con foco; no dependen solo del color. Aplican los [criterios de implementación V2](../criterios-implementacion-v2.md). No hay certificación de accesibilidad desde imágenes.

## Referencias profesionales y criterio propio

La separación entre centro analítico y análisis por tema toma como referencia patrones de informes de [inventario](https://help.shopify.com/en/manual/reports-and-analytics/shopify-reports/report-types/default-reports/inventory-reports) y [clientes](https://help.shopify.com/en/manual/reports-and-analytics/shopify-reports/report-types/default-reports/customers-reports) de Shopify. Para Vixora elijo un alcance más sencillo: ranking, comportamiento observado y stock actual, sin trasladar sus fórmulas o modelos predictivos.

Intercom distingue participación, resolución y automatización en sus [informes del agente](https://www.intercom.com/help/en/articles/7837533-fin-ai-agent-reporting) y [definiciones de métricas](https://www.intercom.com/help/en/articles/7022438-reporting-metrics-attributes). Esa distinción motiva separar las métricas en Vixora; no adopto su criterio de resolución asumida ni sus denominadores. Las definiciones locales siguen el catálogo del proyecto. Son referencias, no integraciones ni recomendaciones de compra.

## Alcance

Solo mockups y documentos dentro de docs/ui-redesign/v2. No se agregan rutas, consultas, tablas, eventos, permisos, exportaciones o automatizaciones reales. No se consultan clientes ni conversaciones reales, no se envían mensajes y no se contacta a Claude Code.

Las doce imágenes representan plantillas principales y estados compartidos; filtros, páginas adicionales, variantes por rol y cada desglose reutilizan sus patrones. La implementación queda sujeta a las definiciones y dependencias del diccionario, con datos de prueba reconciliados antes de usarla para decisiones reales.

