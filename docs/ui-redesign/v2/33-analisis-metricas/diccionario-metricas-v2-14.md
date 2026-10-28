# Diccionario de métricas V2-14

28/10/2026. Especificación de lectura para los mockups. Las fórmulas comerciales y operativas son propuestas; no se implementaron consultas. Toda lectura se limita a una organización y a los permisos del usuario.

## Disponibilidad y prioridad

- **E — Existente:** cálculo localizado en analytics y definido en el catálogo del proyecto. Se propone reorganizar su presentación, sin afirmar validación en producción.
- **D — Derivable:** campos o transacciones identificados; requiere diseñar, autorizar, implementar y probar una consulta nueva. No significa "ya funciona".
- **M — Medición adicional:** falta un evento, vínculo, histórico o clasificación validada. Mostrar el estado de disponibilidad; no fabricar un valor.

Primera entrega funcional sugerida: ventas vigentes y ticket, ranking de productos, compradores y composición, métricas E de atención, stock actual y desglose de cada cifra. Después, antigüedad, cohortes de entrega, presentismo, cuentas y recepción/pago con sus definiciones. Calidad de IA y atribución necesitan diseño de medición antes del indicador.

## Contrato común

Período I: dos fechas calendario inclusivas en zona de organización; consultar internamente desde inicio 00:00 hasta el día siguiente al fin 00:00, intervalo semiabierto. Mantener últimos 30 días completos por defecto, máximo 366 días, sin fechas futuras; hoy puede consultarse como parcial. El ejemplo usa 01–27/10/2026 y comparación 04–30/09/2026, ambos 27 días completos.

Los tramos del gráfico de ejemplo tienen distinta duración (6, 7, 7 y 7 días) y muestran **totales**, no tasas diarias comparables. Para analizar velocidad de venta ofrecer serie diaria o promedio por día, con tabla alternativa. No inferir que el ritmo diario crece solo porque aumenta un total de tramo.

Ventas elegibles: comprobantes emitidos con fecha en I que no tienen anulación vigente al instante de consulta. Moneda de emisión exacta; no convertir ni usar total del pedido además de total de venta. La anulación posterior cambia este reporte histórico de vigentes; un informe de movimientos por fecha sería otro contrato.

El filtro de moneda delimita importes y su población comercial. Conteos de compradores y comprobantes se recalculan sobre esa población; unidades de rankings también. Stock y conversaciones no se filtran por moneda de venta y deben decirlo. No sumar porcentajes ni promediar promedios entre páginas o grupos; recalcular numerador y denominador.

Comparación: misma duración y misma fórmula. Cantidades/importes: (actual−anterior)/anterior si anterior > 0. Tasas: diferencia en puntos porcentuales. Tiempos: diferencia absoluta, con sentido de la variación explicado. Anterior 0 en cantidades: Sin comparación; denominador 0: Sin datos. Período parcial: sin variación contra período completo. Sin dato o sin permiso no se convierte en 0. Las fotos actuales no tienen comparación histórica si ese histórico no existe.

## Ventas y productos

| Indicador | Definición y fuente propuesta | Estado | Decisión |
|---|---|---|---|
| Importe de ventas vigentes | Suma sales.total de elegibles en I y moneda; sin doble conteo por joins de líneas o recibos | D | Distinguir volumen comercial de cobro |
| Comprobantes | Cantidad de sales.id distintos elegibles, incluidos los sin cliente | D | Volumen de operaciones, no equipos |
| Ticket promedio | Importe elegible / comprobantes; sin comprobantes: Sin datos | D | Detectar cambios de cantidad o mezcla |
| Mercadería vendida | Suma de cantidades de líneas de productos elegibles, separando equipos/accesorios; servicios fuera de este conteo | D | Cantidad física comercializada |
| Ranking por modelo | Agrupar variantes de líneas elegibles por modelo; contar cantidad, sumar importes nativos | D | Reposición por demanda observada |
| Ranking por producto | Agrupar por producto, sin mezclar sus variantes bajo una etiqueta ambigua | D | Comparar artículo y presentación |
| Precio medio vendido | Suma de importes del producto / cantidad elegible; no es precio actual ni ticket | D | Efecto de precios y mezcla de líneas |
| Participación por unidades | Cantidad del producto / total de la misma categoría, moneda y período | D | Peso del artículo dentro de una base homogénea |
| Estado actual de equipos | Conteo de unidades por estado físico autorizado; indicar instante, no fecha de emisión | D | Disponibilidad y trabajo pendiente |
| Antigüedad desde alta | Hoy−stock_unit.created_at para unidades actualmente disponibles con origen de alta confiable; umbral ilustrativo >45 días | D | Lista para revisar, no recomendación automática de descuento |
| Tiempo disponible / rotación / sell-through | Necesita entradas/salidas y base temporal reconstruida o snapshots autorizados; created_at no demuestra disponibilidad continua | M | Evitar una tasa de rotación sin denominador |
| Margen realizado | Venta menos costo histórico atribuible a lo vendido, en moneda coherente y con cobertura de costos explícita | M | No usar el costo actual mutable como costo histórico |
| Margen estimado actual | Reutilizar fórmula/base del inventario V2-05, con permisos; no presentarlo como resultado realizado | D | Comparar precios/costos actuales |

La etiqueta Equipos requiere una clasificación fiable del catálogo del rubro; no basta con buscar "iPhone" en el nombre. Unidades serializadas y control por cantidad tienen cantidades con reglas diferentes; no contar tanto línea como cada unión a IMEI. Un equipo vendido desde pedido se cuenta una sola vez en ventas. Reparación facturada va al análisis de servicios, no se presenta como otra unidad de teléfono.

La antigüedad desde alta es solo aproximación operativa: importaciones pueden tener fecha técnica distinta de la recepción real. Separar sin fecha confiable; no tratarlos como recién ingresados. Distinguir reservas, revisión, reparación y disponibles. No mezclar el balance comercial del inventario con todos los estados físicos.

No mostrar "ganancia neta" ni "ROI" con margen bruto: faltan gastos, costos completos, devoluciones y tratamiento tributario. No se cambian criterios contables desde el diseño.

## Clientes

| Indicador | Definición | Estado |
|---|---|---|
| Compradores identificados | COUNT DISTINCT client_id no nulo en ventas elegibles de I/moneda; excluir anónimas y mostrarlas aparte | D |
| Primera compra en el período | Compradores cuya primera venta vigente conocida, considerando **todas las monedas**, se emitió en I; población de compradores del filtro actual | D |
| Con compras anteriores | Compradores del filtro actual con alguna venta vigente conocida anterior al inicio de I, en cualquier moneda | D |
| Participación recurrente | Con compras anteriores / compradores identificados; no una tasa de retención de una cohorte previa | D |
| Frecuencia del período | Ventas identificadas elegibles / compradores identificados del mismo filtro | D |
| Importe por cliente | Suma de compras vigentes de la persona en período y moneda; no saldo de cuenta ni dinero cobrado | D |
| Producto más comprado | Mayor cantidad de líneas por producto; permitir Equipos/Accesorios/Todos y ordenar también por importe | D |
| Historial de la persona | Mismas reglas hasta fecha de corte; indicar expresamente que amplía el período | D |
| Clientes sin compra reciente | Días desde última venta vigente conocida; umbral explícito, no probabilidad de abandono | D |
| Retención de cohorte | Compradores de una cohorte anterior que vuelven, dividido por compradores de esa cohorte, con ventana fija | D, diseño de cohorte pendiente |
| Preferencia predicha, abandono o valor futuro | Requiere modelo y validación; no se infiere de etiquetas o una compra | M |

Si alguien compra dos veces por primera vez dentro de I, sigue perteneciendo a Primera compra en el período, porque no tenía compra antes del inicio. Puede contarse aparte como recompra dentro de la ventana, sin mezclarlo con Con compras anteriores. No confundir cliente creado recientemente con comprador nuevo.

Importes de Camila en su historial incluyen marzo, agosto y octubre; en el informe 01–27/10 solo cuenta su compra de octubre. Un empate entre iPhone 13, 14 y 15 se presenta como empate, no se elige un favorito arbitrario. Las fundas repetidas demuestran unidades adquiridas, no una intención de compra futura.

Datos borrados, fusionados o migrados pueden alterar la identidad/historia: usar el alcance real del CRM y declarar historia incompleta cuando corresponda. No publicar un ranking con datos personales a roles que no puedan consultar sus fichas. Abrir un segmento no envía mensajes.

## Conversaciones y agente

Las métricas E mantienen las fórmulas de [MetricsCatalog](../../../analytics/MetricsCatalog.md). La siguiente síntesis no cambia sus denominadores.

| Indicador | Población y fórmula | Estado |
|---|---|---|
| Iniciadas | started_at en I; una reapertura no crea otra conversación | E |
| Con actividad | A: conversaciones con al menos un mensaje en I; únicas en toda la ventana | E |
| Clientes únicos atendidos | client_id distintos de A; conversaciones sin cliente en contador aparte | E |
| Entrantes/salientes | Mensajes por dirección con sent_at en I; no confundir mensajes con conversaciones | E |
| Promedio/mediana de mensajes | Mensajes de I por conversación de A; sin A: Sin datos | E |
| Respondidas | Tiene entrante y saliente estrictamente posterior, ambos en I | E |
| Cobertura | Respondidas / conversaciones con al menos un entrante en I; salientes solos fuera | E |
| Mediana de primera respuesta | Primer entrante de toda la vida del hilo dentro de I; primer saliente posterior hasta consulta, incluso después del fin; solo las respondidas entran en la mediana | E |
| Sin primera respuesta | Cantidad pendiente de la misma cohorte de primera respuesta, siempre junto a la mediana | E |
| Distribución de respuesta | Rangos del catálogo sobre las respondidas de la cohorte anterior; no las mismas 198 de cobertura | E |
| Serie diaria | Volúmenes por día, con 0 real cuando procede; conversaciones diarias no son aditivas a únicas de toda I | E |
| Estado actual | Agrupar A por estado **actual**, no por momento en que se resolvió | E |
| Tipo de mensaje | Tipo original de entrantes; conservar Sin dato para históricos nulos | E |
| Fallos de ingestión | Eventos admitidos según exclusiones del catálogo; fallidos / registrados, no mensajes fallidos del proveedor | E |
| Autor de salientes | Contar sent_by agent/person/null de salientes en I; mostrar las tres bases | D |
| Conversaciones con participación del agente | Hilos distintos con al menos un saliente agent en I; puede incluir intervención humana posterior | D |
| Derivaciones históricas | Eventos de derivación deduplicados por conversación/episodio y período; validar retención y vínculo | D, consulta y alcance pendientes |
| Tiempo a intervención humana | Timestamps de derivación y primera respuesta humana emparejados por episodio | M hasta validar eventos |
| Resuelta exclusivamente por IA | Resultado verificado y autoría por episodio, política de reapertura y ventana de observación | M |
| Conversación→pedido/venta | Vínculo explícito origen y ventana; identificar asistida vs originada, sin inferir causalidad | M |
| Satisfacción | Encuesta y cobertura de respuestas; no medir satisfacción desde ausencia de mensajes | M |
| Motivos frecuentes / consulta por producto | Etiquetado de tema o referencia validada por conversación; no extraer cada mención como intención de compra | M |
| Calidad, errores de respuesta y ahorro | Muestra revisada/rúbrica, trazas y costo/tiempo de referencia medidos | M |

El campo de autor existe pero admite null; no atribuir salientes sin dato al agente. Un 80 % de mensajes del agente no significa 80 % de conversaciones resueltas ni ventas generadas. El agente no emite ventas: el usuario humano emisor tampoco demuestra quién originó la oportunidad.

Cobertura no significa que cada pregunta recibió respuesta, solo que existió el par definido. Una conversación puede estar Respondida y seguir abierta. Resuelta es el nombre de presentación del estado closed, no una evaluación del contenido ni su autor. La pausa actual no sirve para reconstruir todas las derivaciones.

La mediana de primera respuesta puede cambiar con respuestas tardías; mostrar fecha de consulta y casos pendientes. Se mide tiempo de calendario, sin descontar automáticamente horario cerrado. Un futuro SLA por horario requeriría una definición diferente.

Para evaluar IA en una segunda fase: definir episodio de atención, origen/handoff/reapertura, resultado confirmado, muestra humana auditada, vínculo comercial y encuesta opcional. Aprovechar eventos existentes si son suficientes; no crear eventos duplicados ni puntuar resultados no observados. "Sin medición" permanece visible en el estado correspondiente.

## Operación, finanzas y abastecimiento

| Indicador | Definición propuesta | Estado |
|---|---|---|
| Recepciones de reparación | Órdenes customer_device recibidas en I; separar own_unit y warranty_claim | D |
| Entregadas de la cohorte | De las recibidas en I, entregadas hasta consulta; no todas las entregas del período | D |
| Tiempo hasta entrega | delivered_at−created_at sobre entregadas de esa cohorte; el alta registra la recepción en el contrato actual; mediana en días calendario, base y pendientes visibles | D; validar timestamps y tipo |
| Abiertas actuales | Órdenes no finales al instante de consulta, incluidas las de otros períodos | D |
| Aprobación de presupuesto | Aprobados / (aprobados+rechazados) de una cohorte/fecha de decisión definida; pendientes aparte | D, definición no dibujada |
| Presentismo | Atendidos / (atendidos+ausentes) de turnos con inicio en I y resultado registrado; cancelar y futuros fuera | D |
| Turnos sin resultado registrado | Conteo de turnos pasados aún pedidos/confirmados; no imputarlos como ausentes | D |
| Dinero recibido | Recibos vigentes de medios ordinarios con fecha de registro en I, por importe/moneda física recibida; Permuta fuera | D |
| Crédito de permuta aplicado | Recibos de venta vigentes de tipo Permuta en I, por moneda aplicada, separado de dinero recibido | D |
| Devoluciones | Registros vigentes de devoluciones en I, por importe/moneda física; no anular cobro para simularlas | D |
| Saldo cliente/proveedor | Cuenta actual por moneda según imputaciones vigentes; no suma de todos los comprobantes ni deuda vencida | D |
| Recepciones de mercadería | Recepciones vigentes registradas en I por moneda de costo, no órdenes comprometidas | D |
| Pagos aplicados proveedor | Pagos vigentes con fecha en I por moneda/importe aplicado; otro desglose físico si hay conversión | D |
| Órdenes de compra abiertas | Foto actual de abiertas; no equivale a deuda a pagar ni entrada futura garantizada | D |
| Plazo proveedor | De creación de OC a recepción/última recepción, con cohorte y parciales definidos | D, no dibujada |
| Vencimientos, morosidad y flujo futuro | No hay fechas de vencimiento o compromisos de cobro/pago validados en esta propuesta | M |

Los flujos financieros no producen un estado de resultados ni concilian automáticamente bancos. Dinero recibido puede corresponder a ventas anteriores y pagos a cuenta; Permuta cancela saldo sin entrada física. Un cobro anulado deja de ser vigente, pero no demuestra una salida de dinero. La devolución tiene su propia operación y puede ser parcial. En Finanzas y compras, el filtro Flujos: ARS se aplica a dinero recibido, Permuta y devoluciones; cuentas, compras y pagos aplicados muestran todas sus monedas separadas, con su propio alcance indicado.

Distinguir moneda física de moneda aplicada: un pago aplicado USD 300 con transferencia ARS 450.000 no se cuenta dos veces en un total. La tarjeta Compras muestra valores por moneda aplicada, no una caja. No sumar ARS recibidos y ARS pagados con el total de ventas para calcular ganancia.

Las órdenes de técnico reparadas alimentan cuentas de proveedor según reglas actuales; sus costos no se abren a viewer por aparecer en un gráfico. Las reparaciones de garantía no generan una nueva venta al cliente. Una devolución/garantía no se usa para inventar una tasa de retorno de producto sin vínculo válido con la venta original.

## Acceso, interacción y pruebas futuras

Análisis no crea un rol nuevo. La visibilidad por vista e indicador replica la autorización real de los módulos; Finanzas y compras y costos detallados son administrativos. Viewer recibe solo agregados que ya está autorizado a leer, sin nombres o importes de proveedor escondidos en HTML, tooltips, tabla alternativa o exportaciones. El backend autoriza cada filtro y detalle.

Al pulsar una tarjeta o barra se abre un desglose con la **misma** definición, fechas, moneda y agrupación; volver conserva filtros. Cada gráfico necesita alternativa tabular, encabezados y lectura de unidades. Muestra la población y la última actualización. El fallo parcial no borra otras tarjetas ni transforma desconocidos en 0. Proteger capacidad de consultas; aplicar paginación/índices medidos y no descargar todos los datos al navegador.

Antes de implementar: validar las consultas contra un conjunto sintético con venta anulada posterior, reemplazo desde pedido, anónima, venta y recibo de períodos distintos, moneda distinta, Permuta, costo desconocido, mensaje con autor nulo, respuesta tardía y turno sin resultado. Comprobar que tabla, ranking y tarjeta concilien; probar permisos y rango temporal. Ninguna de esas pruebas de aplicación se ejecutó en este lote visual.

## Evidencia local consultada

- [Catálogo de métricas](../../../analytics/MetricsCatalog.md) y código analytics service/repository.
- [Conversaciones: esquema](../../../../src/modules/conversations/schema.ts), con sent_by nullable.
- [Ventas: esquema](../../../../src/modules/sales/schema.ts), sales, sale_lines, sale_line_units y anulaciones; sin snapshot de costo en la línea inspeccionada.
- Esquemas locales de inventory y service, y decisiones V2-05 a V2-12.
- [Reglas compartidas de diseño](../criterios-implementacion-v2.md).

Esta lectura comprueba la base documental y de campos disponible el 28/10. No verifica todos los endpoints de negocio ni cambios concurrentes, no consulta producción y no demuestra que una nueva métrica esté implementada.

