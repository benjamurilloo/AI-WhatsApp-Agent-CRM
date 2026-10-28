# V2-13 — Consistencia y accesibilidad

28 de octubre de 2026. Siete referencias transversales para implementar las decisiones compartidas de V2. Mantienen la identidad violeta y complementan las pantallas por módulo; no reemplazan sus reglas de negocio.

| # | Referencia | Archivo |
|---|---|---|
| 01 | Paleta, jerarquía, controles y estados | [Ver](referencias/01-sistema-visual-estados-v2.png) |
| 02 | Ubicación de acciones y siguiente paso | [Ver](referencias/02-acciones-navegacion-v2.png) |
| 03 | Formulario con error y recuperación | [Ver](referencias/03-formularios-errores-v2.png) |
| 04 | Pérdida de cambios y anulación de venta | [Ver](referencias/04-confirmaciones-seguras-v2.png) |
| 05 | Vacío, sin resultados, carga, fallo, acceso y conflicto | [Ver](referencias/05-vacios-carga-fallos-v2.png) |
| 06 | Búsqueda, teclado y foco modal | [Ver](referencias/06-teclado-foco-lectura-v2.png) |
| 07 | Formulario móvil con teclado abierto | [Ver](mobile/07-formulario-mobile-teclado-v2.png) |

[Índice de todas las imágenes](../indice-final-v2.md) · [Cobertura y variantes](../cobertura-final-v2.md) · [Criterios para implementación](../criterios-implementacion-v2.md) · [Prompts exactos](prompts-v2-13.md) · [Producción y verificación](produccion-v2-13.md).

## Qué queda unificado

Se conserva la paleta aprobada. Se propone un único refuerzo: borde funcional #817A98 para reconocer campos y controles sobre blanco. El borde #E3DFF0 permanece en divisores decorativos y tarjetas; su bajo contraste no debe ser la única señal para identificar un campo. Las combinaciones concretas y los cálculos están en los criterios de implementación.

El listado prioriza crear; la ficha, el siguiente paso permitido; el formulario, guardar. Imprimir y volver son secundarios. Más acciones reúne operaciones menos frecuentes y destructivas. No se duplica una acción en el menú si ya está visible. En móvil se mantiene el mismo vocabulario, con acciones alcanzables sin tapar el contenido.

El foco ilustrado no demuestra el funcionamiento de teclado. Las dos confirmaciones de la lámina 04 son ejemplos independientes: cada diálogo real tiene un solo foco. Las anotaciones y miniaturas de estas láminas son documentación para desarrollo, no nuevas pantallas o textos que deban añadirse al CRM.

## Ejemplos y lectura correcta

La ficha P-000204 reutiliza el caso ficticio de Nadia: equipo U-0102, IMEI terminado en 1422, total USD 450, señas USD 100 y saldo USD 350. La entrega está por preparar; no se registra en estas referencias. No se habilita edición de líneas ni fechas de un pedido ya creado.

El formulario de escritorio muestra deliberadamente inicio 07/11 y fin 01/11 para ilustrar un rechazo. El móvil es otro momento de edición, con el contenido enfocado y el teclado abierto; no es una confirmación del guardado. Categoría sigue siendo texto editable con sugerencias, aunque el render parezca un desplegable.

V-000220 es la venta de mostrador sin cliente por dos fundas, ARS 80.000 cobrados. La anulación ilustrada devolvería las fundas al stock y dejaría lo cobrado a devolver sobre esa venta. No anula sus cobros ni ejecuta una devolución. Con cliente o venta desde pedido los efectos son distintos: se conserva la especificación de Ventas.

El saldo anterior USD 720 en la lámina de fallo es un ejemplo de dato desactualizado, no un permiso para registrar un pago sin revalidar. En la búsqueda, mostrar un resultado depende de los permisos. El estado Disponible de U-0102 corresponde al instante de inventario previo a la confirmación de P-000204, no al pedido ya reservado de la lámina 02. Son ejemplos separados, no una secuencia simultánea.

## Alcance y límites

Revisión de documentación y mockups de los lotes anteriores, con comprobación de criterios de accesibilidad en fuentes oficiales W3C. No se volvió a recorrer producción ni se comprobó cada propuesta contra el backend actual. Claude Code puede haber añadido cambios desde el relevamiento inicial.

Las siete piezas se generan con ImageGen integrada y se guardan aquí; los lotes anteriores permanecen intactos. Las pequeñas variaciones de tipografía, logo, iconos y tonos en imágenes no reemplazan los activos originales ni los tokens escritos. Para implementar prevalecen los criterios transversales y las reglas del módulo; una miniatura no amplía permisos ni capacidades.

La serie V2 cierra como propuesta visual y funcional. Las variantes no dibujadas y la validación real pendiente se enumeran en la cobertura. No se certifica accesibilidad desde imágenes. No se modifican código, configuración, datos, cuentas, mensajes o despliegues.

