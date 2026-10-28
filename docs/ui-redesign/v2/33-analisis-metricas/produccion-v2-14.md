# Producción y verificación — V2-14

**Terminado el 28/10/2026.** Doce imágenes finales: diez horizontales de 1672 × 941, una móvil de 941 × 1672 y un tablero de estados de 1536 × 1024. ImageGen integrada, doce generaciones y seis correcciones dirigidas; sin CLI/API externa.

## Procedencia y revisión visual

Originales conservados en `C:\Users\benja\.codex\generated_images\01a1412b-553e-7060-8d8b-7317f5b80bdf`. Los [prompts completos y seis correcciones](prompts-v2-14.md) documentan las llamadas; no hay generación con datos reales.

| # | Archivo original seleccionado | Original previo a edición | Revisión |
|---|---|---|---|
| 1 | `exec-26681e0f-53bc-43de-a374-787d8d91d2ff.png` | `exec-4689828d-60b6-4310-b0d4-9dbc3762c17b.png` | Comparación de igual duración explícita, tabla alternativa y cifras 30m/500k/48/240. |
| 2 | `exec-732036a7-aefe-4014-a78e-49fe8bf8d0b2.png` | `exec-5851dabe-99de-4f9c-8832-7cd4c14c618b.png` | Tramos de octubre corregidos a 6/7/8/9m; composición 92%/8% y ticket conciliados. |
| 3 | `exec-3a6c7f19-97e9-4dc4-9da2-be7566dd7913.png` | Misma generación | Ranking por unidades y valor separado de stock actual; 36 equipos y 30 físicos. |
| 4 | `exec-43fcb88a-2699-4a30-8428-96d02bfaa85f.png` | Misma generación | Producto por cantidad, 36 unidades, 1,8m y 75% de accesorios; costo histórico no inventado. |
| 5 | `exec-1f9328f5-12c9-4606-b56d-9750f16881a5.png` | Misma generación | 48 compradores, 36 nuevos, 12 anteriores; 54 ventas identificadas y 6 anónimas. |
| 6 | `exec-66cbb6a5-5a03-45c6-8e97-0086c19721dd.png` | Misma generación | Historial de 3 ventas, 6 unidades, 2,5m; selector por tipo y empates explícitos. |
| 7 | `exec-4ef866b8-ec70-4309-a6fb-765b241a1c32.png` | `exec-ba0f2e26-c59d-497d-9326-caf12ca029ad.png` | Cobertura 198/220, cohorte 180+10 y 5 rangos del catálogo; autor sin dato separado. |
| 8 | `exec-3208bcb2-ebdf-4ea5-8796-97fe478c5512.png` | Misma generación | Cohorte de órdenes y pendientes frente a foto actual; presentismo 14/18 sin cancelados. |
| 9 | `exec-92786049-90a3-448d-a300-2a6d1797c99d.png` | `exec-372858ad-e8ad-4176-8e97-81b97b9ad451.png` | Flujos ARS y cuentas/compras en todas las monedas rotulados; Permuta sin dinero físico. |
| 10 | `exec-423f6bc7-1bc0-41af-96e0-0895280698b4.png` | Misma generación | Desglose de iPhone 13 suma 12 unidades y 6m; definición, exclusiones y actualización. |
| 11 | `exec-18ef78bd-b9bb-410e-bc2d-cf03815dca3f.png` | `exec-8f7ec3ed-382a-4eb7-8bee-1503e2849bea.png` | Selector único de vista, Más activo, cifras coherentes con escritorio y scroll. |
| 12 | `exec-84292fdd-0a5d-4072-88a1-7d919e1b8e74.png` | Misma generación | Ausencia de base y medición, error, cero real, comparación parcial y permisos diferenciados. |

La pieza 01 tiene una corrección intermedia `exec-65899f1c-dd4f-4929-b19a-b8f5a422c75a.png`: añadió dos veces la comparación; la selección final retira la repetición. No se usa esa variante como final. Las otras correcciones sustituyen meses inventados en el gráfico de ventas, alinean los rangos de primera respuesta con el catálogo, precisan el alcance monetario y simplifican la navegación móvil.

Todas las versiones seleccionadas se inspeccionaron visualmente antes de copiarse. No se estiran, recortan ni sobrescriben imágenes previas. Los iconos, pequeñas variaciones de fuente/logo, tonos o sombras generados no son nuevos activos de marca; al implementar se usan los originales y los tokens planos de V2-13.

## Verificación documental y numérica

La [fixture del escenario](escenario-v2-14.md) reconcilia cantidades, importes, cohortes y denominadores. Se comprobaron [34 identidades aritméticas](verificacion-aritmetica-v2-14.md), todas correctas. No se reconstruye una mediana desde agregados ni se prueban consultas reales con esas identidades: son controles del ejemplo visual.

Se registraron dimensiones, tamaño y SHA-256 de los 145 PNG existentes en el [inventario global](../inventario-imagenes-v2.json). La [copia previa de 133 registros](verificacion-previa-v2-14.json) permite comprobar que los lotes anteriores permanecen iguales.

Control final completado: 558 referencias locales comprobadas sin destinos inexistentes, 145 PNG presentes en el índice, doce piezas nuevas y cero cambios en las 133 imágenes anteriores. El [registro final](verificacion-final-v2-14.json) guarda el resultado. Los originales descartados no cuentan como entregables. La carpeta se organiza en desktop, contexto, detalle, mobile y estados, sin crear módulos de aplicación.

## Decisiones de revisión

El centro Análisis es una propuesta nueva, autorizada por este pedido de métricas. No reemplaza Inicio. Producto y Cliente muestran el contexto de un cálculo compartido, no otra fuente de verdad. En móvil, el selector Cambiar vista ofrece las seis vistas; el mockup no dibuja el menú desplegado ni todas sus variantes.

Las cohortes y fotos actuales se rotulan de forma distinta. La frase corta "sin respuesta en el período" del resumen significa ausencia del par entrante/saliente definido en I; no es una cola actual garantizada. El diccionario y el escenario explican esa diferencia, además de la fecha de consulta de respuestas tardías.

La vista Finanzas y compras limita el filtro Flujos: ARS a entradas físicas, Permuta y devoluciones. Sus saldos y compras exponen monedas nativas separadas. En los gráficos, tramos de distinta duración muestran totales: para comparar ritmo se necesita serie diaria o promedio por día.

Algunos gráficos no muestran todos los accesos de detalle o tabla en el render; su alternativa tabular y operación con teclado son requisitos escritos, no una implementación comprobada. Las barras y el estado requieren contraste y texto, no solo tonos de violeta. A 320 CSS px se apilan tarjetas y se verifica que la barra inferior no tape el final del contenido. El recorte visible no certifica estas condiciones.

## Alcance de la evidencia

Se leyó el catálogo de métricas y partes del código local de analytics, conversaciones, ventas, inventario y servicio. El diccionario distingue 14 cálculos existentes de conversaciones, lecturas propuestas y medición pendiente. No se afirma que las nuevas consultas estén implementadas, ni se comprobó producción o cada contrato de backend.

Se consultaron fuentes oficiales de Shopify e Intercom, enlazadas en la [propuesta](README.md), como patrones de informes y separación entre participación y resultado. No se integraron servicios externos.

Solo se añadieron imágenes y documentos en docs/ui-redesign/v2 y se actualizaron sus índices. No se modificó código, configuración, permisos, datos, mensajes o despliegues. No se ejecutaron pruebas de la aplicación ni se contactó a Claude Code. El flujo continúa como entrega visual para revisión e implementación posterior.


