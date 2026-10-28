# Catálogo, modelos y grados — V2-04

Continuación disponible: [Inventario y ficha de producto — V2-05](README-v2-05.md), con siete imágenes de resumen, unidades/IMEI, movimientos, precios, costos, móvil y estados.

Fecha: 27 de octubre de 2026. Ocho imágenes de propuesta, con datos ficticios. Las pantallas se distribuyen por módulo y comparten este índice. El detalle operativo de producto se desarrolla en V2-05.

| # | Vista | Archivo |
|---|---|---|
| 01 | Catálogo agrupado por modelo | [Productos](desktop/01-catalogo-por-modelo-v2.png) |
| 02 | Alta y estructura de edición | [Formulario de producto](desktop/02-alta-edicion-producto-v2.png) |
| 03 | Listado y alta de modelos | [Modelos](../13-modelos/desktop/03-listado-alta-modelos-v2.png) |
| 04 | Ficha de modelo y variantes | [iPhone 13](../13-modelos/desktop/04-ficha-modelo-v2.png) |
| 05 | Atributos de variante | [Capacidad y color](../13-modelos/desktop/05-atributos-variante-v2.png) |
| 06 | Grados y garantía de referencia | [Listado y edición](../14-grados/desktop/06-grados-garantias-v2.png) |
| 07 | Catálogo móvil | [Tarjetas por modelo](mobile/07-catalogo-mobile-v2.png) |
| 08 | Estados y validaciones | [Vistas complementarias](estados/08-estados-catalogo-modelos-grados-v2.png) |

## Arquitectura funcional

Modelo identifica una familia, como iPhone 13. Los atributos distinguen presentaciones comerciales, como capacidad y color. El producto representa lo que se ofrece; la unidad contiene la identidad física mediante IMEI o serie. El catálogo permite consultar disponibilidad y precio; la ficha operativa contiene las unidades, movimientos, precios y costos. La configuración queda en Modelos y Grados.

La condición y el grado se muestran para que el usuario distinga equipos nuevos/usados y su clasificación. La imagen usa presentaciones separadas por grado como hipótesis de UX. **No prescribe almacenar el grado en el producto ni crear un SKU por grado**: el relevamiento también identificó clasificación por unidad. Si el sistema conserva el grado en cada unidad, A y B serán subgrupos de disponibilidad del mismo producto y los nombres/contadores deberán decir presentaciones o grupos, no variantes maestras. Antes de implementar se debe confirmar esa relación y conservar la trazabilidad actual. No se propone una migración de inventario en este lote.

## Catálogo

La vista Por modelo agrupa y permite expandir sin perder búsqueda, filtros o posición. El enlace Ver modelo tiene un destino diferente del chevron de expansión. La vista Lista muestra los mismos resultados sin agrupar. La búsqueda del catálogo usa nombre, SKU y modelo; buscar un IMEI abre la búsqueda global o una unidad vinculada, no crea un producto.

Disponible debe usar una definición única de unidades vendibles no reservadas, según las reglas reales. No se resta dos veces lo reservado si el sistema ya devuelve stock neto. Un error se muestra como No disponible, nunca cero. El catálogo no exhibe costo ni margen a personas sin permiso.

La alerta Stock bajo depende de un umbral configurado para la variante; el ejemplo de una unidad es ilustrativo. No equivale a Sin stock. En la muestra iPhone 13 suma 3 + 2 + 1 + 2 = 8; iPhone 14 tiene 5 e iPhone 15 tiene 3. Los precios USD 450, 450, 490 y 420 son datos de muestra, no cotizaciones ni recomendaciones comerciales.

Los accesorios sin modelo tienen un grupo propio y no se fuerzan a una familia de teléfonos. Cada precio conserva su moneda; no se genera una equivalencia ARS sin fecha, fuente y reglas explícitas. La fila abre el producto y su menú contiene acciones secundarias permitidas; no se llena de botones de ajuste o eliminación.

## Alta y edición de producto

Nuevo producto reúne identidad, atributos y tipo de control. El precio puede definirse después si el negocio admite productos sin precio; mientras tanto no debe parecer vendible a precio cero. La obligatoriedad del SKU, modelo y atributos se adapta al tipo de producto y a las reglas existentes. Un accesorio no necesita capacidad o grado estético. El grado del formulario es una propuesta contextual, no un requisito para todos los productos: si el grado pertenece a cada unidad, se retira de este formulario y se mantiene en recepción/unidades.

Crear un producto no inventa stock ni incorpora IMEI automáticamente. El inventario se ingresa por el flujo autorizado del sistema. El nombre es una etiqueta de presentación, no una fuente para interpretar capacidad, color o condición. Editar reutiliza las secciones con Guardar cambios y conserva los identificadores y relaciones.

La detección de una variante existente compara identificadores normalizados y la combinación admitida por el negocio. No se bloquean productos distintos por tener un nombre similar. Si existe una coincidencia, se ofrece abrirla y volver al formulario con el borrador intacto; no se fusiona ni reemplaza en silencio.

El cambio entre control Por unidad y Por cantidad requiere reglas de compatibilidad e historial. Con unidades, movimientos o reservas, no se permite una conversión directa desde el radio del formulario. Se explica el motivo y se ofrece consultar el inventario. Cualquier migración posterior sería un flujo específico, no parte de este rediseño visual.

## Modelos y atributos

El listado muestra familia, estado y disponibilidad. Nuevo modelo y Editar modelo usan el mismo panel con títulos y acciones acordes. Una familia sin stock puede seguir activa; Activo no significa disponible para vender. Desactivar un modelo no borra productos, servicios o historial y no debe desactivar todos sus hijos sin explicar el alcance.

La ficha del modelo reúne Variantes, Atributos y Servicios relacionados. Nueva variante abre el formulario con el modelo seleccionado. Servicios relacionados enlaza al servicio técnico filtrado por modelo; no duplica precios de reparaciones. Ese contenido y sus formularios se desarrollan en V2-06.

Los atributos de la imagen 05 son valores permitidos para ese modelo. Añadir agrega al borrador; Guardar atributos persiste el conjunto. Los valores utilizados no se quitan sin revisar dependencias. Renombrar no cambia identidades ni reclasifica productos automáticamente. Antes de cambiar un tipo de dato o borrar un atributo general se necesita una revisión de impacto específica.

Administrar atributos generales es un acceso propuesto para la configuración compartida, no un destino ya confirmado del CRM. Si existe, debe mostrar nombre, tipo y uso de cada atributo, con edición que preserve los valores vinculados. Esta administración global no tiene una pantalla independiente en el lote: se ha representado la configuración por modelo y el estado de dependencia. No debe darse por implementada ni por diseñada exhaustivamente.

Los valores de capacidad y color son datos de ejemplo del catálogo interno, no una ficha de especificaciones oficiales. No se crean todas las combinaciones posibles automáticamente. Cada color se identifica por nombre, además de la muestra visual.

## Grados y garantía

La tabla y el panel de edición separan código, nombre, criterio estético, color y estado. La clasificación visual no confirma batería, funcionamiento, piezas, autenticidad ni cobertura: esos datos se verifican en la unidad y su checklist.

Política vigente es un marcador ilustrativo de una referencia configurada. Debe reemplazarse por el nombre y versión reales de la política cuando estén disponibles. Sin configurar expresa falta de información, no ausencia de cobertura. No se proponen duraciones ni condiciones de garantía para el negocio.

La garantía aplicada y su vigencia se consultan por unidad/documento de origen. Si la aplicación administra días directamente en el grado, la interfaz debe mostrar esa configuración real y su efecto, sin afirmar que editarla modifica ventas anteriores. La cobertura por unidad se detallará en V2-05; reparaciones y su garantía, en V2-06. El enlace Ver políticas de garantía es una propuesta de acceso a la configuración existente, no una nueva entidad impuesta al sistema.

Cambiar un criterio no reclasifica equipos existentes. Crear grado reutiliza el panel sin valores; desactivarlo evita nuevas asignaciones según las reglas del negocio y conserva referencias históricas. No se ofrece borrar un grado utilizado como acción inmediata.

## Móvil, estados y accesibilidad

El catálogo móvil conserva grupos y tarjetas, sin comprimir la tabla. Más permanece seleccionado porque Productos se accede desde ese menú. Los formularios se apilan en una columna y sus paneles ocupan la pantalla en móvil. Los botones de guardado respetan teclado, área segura y espacio inferior del contenido.

Se representan catálogo vacío, búsqueda sin resultados, variante existente, atributo vinculado, tipo de control bloqueado y garantía sin configurar. Carga, error de red, falta de permiso y protección de borradores reutilizan V2-01. Limpiar filtros no debe prometer que borra el término de búsqueda si solo limpia selectores: el alcance debe quedar claro; para restablecer ambos se usa Restablecer búsqueda y filtros.

Verificar al implementar contraste AA, reflujo a 320 px, zoom, etiquetas persistentes, errores asociados, foco visible y objetivos táctiles de 44 px. Expandir grupos funciona con teclado y anuncia su estado. Los paneles de alta/edición tienen foco contenido, fondo inerte y retorno al disparador. La selección de color no depende del swatch. Las imágenes no validan por sí mismas estos comportamientos.

## Producción y límites

Se usó ImageGen integrada: ocho imágenes finales y una corrección dirigida al contador de iPhone 15 en móvil. Se revisaron cantidades, precios, ubicación de acciones y legibilidad. Los originales permanecen en la carpeta de generación. Solo se añadieron archivos en docs/ui-redesign/v2; no se modificó código ni se cargaron datos en el CRM.

El relevamiento previo es la base funcional. Campos, relaciones, filtros, políticas y permisos nuevos son propuestas a contrastar antes de implementar; no se comprobó su soporte en backend durante este lote. El logotipo original y los tokens aprobados siguen siendo la referencia, independientemente de variaciones menores en las imágenes generadas.

Prompts completos: [V2-04](prompts-v2-04.md). Próximo lote: V2-05 — Inventario y ficha de producto, con resumen, unidades/IMEI, movimientos, precios, costos/margen y móvil.
