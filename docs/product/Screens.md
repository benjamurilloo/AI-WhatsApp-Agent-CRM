# Pantallas del MVP

**Estado: implementado.** Las diez pantallas del MVP existen: 1 y 10 (subfases 3.5 y 3.7), 3, 4 y 5 (4.4), 6 y 7 (5.3, completadas con las conversaciones en la 6.4), 8 y 9 (6.4) y 2, el dashboard (7.4), con los desvíos anotados en sus wireframes. Desde la Fase 11 se suman, sin wireframe propio, la 5b (precios, 11.1) y la 11 y la 12 (información del negocio, 11.2). Especificación funcional de pantalla, no wireframes visuales. Los wireframes de baja fidelidad están en [wireframes/](wireframes/README.md) (subfase 1.1); su validación cruzada contra el modelo de datos corresponde a la subfase 1.2.

## Reglas comunes a todas las pantallas

- **Autorización**: se verifica en el servidor en cada carga y en cada acción. Ocultar un botón en la UI es solo cosmético. Un recurso de otra organización responde `NOT_FOUND`.
- **Organización**: en el MVP cada usuario pertenece a una sola organización, cuyo nombre se muestra en el marco común, sin selector ([ADR 0010](../decisions/0010-un-usuario-una-organizacion-en-el-mvp.md)).
- **Carga**: skeletons con la forma del contenido final. Los botones de acción se deshabilitan mientras la operación está en curso, para evitar envíos dobles.
- **Vacío vs. sin resultados**: "todavía no hay registros" (con la acción de crear, si el rol puede) es distinto de "ningún resultado para estos filtros" (con la acción de limpiar filtros).
- **Errores**: mensajes derivados de la taxonomía de [architecture/Overview.md](../architecture/Overview.md#estrategia-de-errores-diseño), sin detalles internos y con `request_id` visible en errores inesperados.
- **Paginación**: en el servidor, 25 filas por defecto. Filtros, orden y página se reflejan en la URL, así el botón "atrás" y los enlaces compartidos conservan la vista.
- **Fechas**: se muestran en la zona horaria de la organización, indicada en pantalla.
- **Responsive**: escritorio desde 1024 px, tablet de 640 a 1023 px y móvil por debajo de 640 px. Las tablas pasan a tarjetas en móvil.
- **Accesibilidad (WCAG 2.2 AA)**: labels asociados a cada campo, foco visible, navegación completa por teclado, foco al primer error de un formulario, resultados asíncronos anunciados con `aria-live` y estados que nunca dependen solo del color.
- **Diseño visual base** ([brief-4.0](../decisions/brief-4.0-diseno-visual-base.md)): paleta Laguna y tipografía Manrope, con modo claro y oscuro. Sin preferencia se sigue el tema del sistema operativo; el marco común ofrece "Sistema", "Claro" y "Oscuro". Las pantallas usan solo los tokens de color, y el contraste AA se verifica en los dos modos. No es la identidad visual definitiva.
- **Identidad visual y marco, desde la 15.1** ([brief-15.1](../decisions/brief-15.1-identidad-visual-y-marco.md)) *(nota del 2026-10-05)*: la paleta Laguna se reemplaza por una violeta, sobre los mismos tokens, más `action` (el relleno de los botones primarios y del ítem activo, aparte de `primary`, que queda para el texto y los enlaces) y `sidebar`. El marco pasa a ser un panel lateral con la marca Vixora y la navegación con íconos, y una barra superior con la organización, el tema (los tres botones de siempre, como íconos con el mismo nombre accesible) y el usuario. Debajo de `lg` (1024 px), el panel se pliega detrás de un botón «Menú», y sigue habiendo una sola navegación «Principal». La organización quedó en la barra superior y no debajo de la marca, como proponía D-4: así sigue dentro del `banner`, donde la buscan las pruebas y donde la encuentra un lector de pantalla. Los listados llevan encabezado con subtítulo, avatar con iniciales, un lápiz que abre la edición del detalle (solo `admin`) y paginación numerada con «Mostrando X a Y de Z». El dashboard lleva un ícono por tarjeta y el nombre de cada métrica sin su número; el número sigue en el catálogo.
- **Pantallas de detalle y formularios, desde la 15.4** ([brief-15.4](../decisions/brief-15.4-detalles-y-formularios.md)) *(nota del 2026-10-05)*: cada detalle lleva «Volver a…», un encabezado con avatar o ícono, sus estados y las acciones («Editar» y «Desactivar», este último con borde de peligro), y los datos en tarjetas con ícono. Sin pestañas: un producto tiene una barra con sus tres páginas (resumen, movimientos de stock e historial de precios). El historial de auditoría es la misma tarjeta en productos, clientes e información, con la paginación numerada y, si está vacío, «Sin cambios registrados todavía.». El cliente suma dos estadísticas que se derivan de lo que la página ya carga: la cantidad de conversaciones y los días desde la última interacción. La conversación muestra los mensajes como burbujas, con el texto que dice quién envía, y al costado sus datos y el cambio de estado; sin campo para escribir ni tildes de leído. Los formularios agrupan sus campos en tarjetas, en el mismo orden de siempre. Los campos que los bocetos dibujan y el CRM no tiene no se muestran (Fase 17; el costo, Fase 18).
- **Controles de los listados, desde la 15.2** ([brief-15.2](../decisions/brief-15.2-controles-de-los-listados.md)) *(nota del 2026-10-06)*: Productos, Clientes y Conversaciones suman un selector «Ordenar por» y la elección de 10, 25 o 50 filas por página; los dos viven en la URL (`orden` y `filas`) y se conservan al filtrar y al paginar. Productos ordena por nombre en los dos sentidos, SKU, stock y precio (agrupado por moneda; sin precio, al final); Clientes, por última interacción o por nombre; Conversaciones, por último mensaje en los dos sentidos o por inicio. Productos filtra además por categoría y por marca, con selectores armados con los valores que ya existen. Las sugerencias son una lista propia, debajo del campo, en lugar de la ventana del navegador: en marca y categoría del formulario de producto y en categoría de información, con los valores existentes; en los buscadores de Productos y Clientes, con los resultados de la búsqueda desde 2 letras, y elegir uno abre su detalle. Clientes nunca sugiere teléfonos. Sin JavaScript, todo sigue siendo un formulario común.
- **Dashboard interactivo, desde la 15.3** ([brief-15.3](../decisions/brief-15.3-dashboard-interactivo.md)) *(nota del 2026-10-06)*: cada tarjeta compara su valor con el del período anterior de igual largo (en %, en puntos porcentuales o como diferencia), con una flecha y sin verde ni rojo; la de estados no se compara, y si el período incluye hoy no se compara ninguna. «Ver detalles» reemplaza a «Definición» y suma el valor del período anterior con sus fechas. Debajo de la evolución diaria, «Tipos de mensajes» (una dona con los entrantes por tipo, métrica 13) y «Tiempo de primera respuesta» (un histograma por rangos, métrica 14). Pasar el mouse por un gráfico, o enfocarlo y usar las flechas, escribe el valor de cada barra o segmento en una línea arriba del gráfico; la lista y las tablas siguen siendo los valores exactos. El dashboard no muestra valores sin JavaScript, porque carga cada tarjeta con streaming desde la 7.4.
- **Logo de la marca, desde la 15.5** ([brief-15.5](../decisions/brief-15.5-logo-de-la-marca.md)) *(nota del 2026-10-06)*: la pestaña del navegador muestra el símbolo de Vixora, y el panel lateral y la barra del celular, el símbolo como imagen decorativa y el nombre «Vixora» como texto en el color del tema; el panel de escritorio suma el lema «AI SOLUTIONS». Reemplaza la «V» de dos triángulos de la 15.1.
- **Información sensible**: nunca se muestran hashes, tokens, IDs internos de sesión ni detalles de errores de servidor.

---

## 1. Inicio de sesión

- **Objetivo**: autenticar a un usuario existente.
- **Usuario autorizado**: no autenticado. Un usuario ya autenticado se redirige al dashboard.
- **Información mostrada**: email y contraseña.
- **Acciones**: ingresar. Si el usuario tiene la contraseña inicial pendiente de cambio (`users.must_change_password`), antes de entrar debe definir una nueva, con campos de nueva contraseña y confirmación; ninguna ruta protegida responde hasta completarlo (subfase 1.2, D-6).
- **Filtros y paginación**: no aplican.
- **Carga**: botón deshabilitado con indicador.
- **Vacío**: no aplica.
- **Errores**: un mensaje genérico ("email o contraseña incorrectos") que no revela si la cuenta existe. Si hay límite de intentos (`RATE_LIMITED`), avisa cuándo reintentar.
- **Responsive**: una columna centrada.
- **Accesibilidad**: `autocomplete="email"` y `"current-password"`, y la opción de mostrar la contraseña es un botón accesible.
- **No mostrar**: si el email existe ni la contraseña en claro por defecto.

## 2. Dashboard

- **Objetivo**: ver las métricas de WhatsApp de [analytics/MetricsCatalog.md](../analytics/MetricsCatalog.md).
- **Usuario autorizado**: `admin` y `viewer`.
- **Información mostrada**: tarjetas de las métricas 1 a 9, 11 y 12, gráfico diario (métrica 10), la dona de tipos de mensaje (13) y el histograma de primera respuesta (14; desde la 15.3), zona horaria y período activo. Cada tarjeta trae la definición de su métrica en un desplegable, con el texto en la pantalla: el catálogo no se sirve desde la aplicación ([brief-7.4](../decisions/brief-7.4-dashboard.md), D-3). La pantalla es la portada de la sesión, en `/`, y el marco común la enlaza como "Dashboard" (D-1).
- **Acciones**: cambiar el período.
- **Filtros**: período, por defecto los últimos 30 días completos. Atajos de 7, 30 y 90 días más un rango personalizado, en la URL; no existe "todas las fechas", porque en métricas un período vacío es el de defecto y el máximo es de 366 días ([brief-7.4](../decisions/brief-7.4-dashboard.md), D-5).
- **Paginación**: no aplica.
- **Carga**: cada tarjeta carga por separado, así una métrica lenta no bloquea a las demás.
- **Vacío**: "sin datos" cuando el denominador es 0. La métrica 12 muestra "no disponible" cuando la ingestión no está configurada en el entorno **y** el período no registró eventos ([brief-7.3](../decisions/brief-7.3-metrica-de-errores-de-ingestion.md), D-1): la condición mira la configuración y los datos, y con eventos registrados los muestra aunque el endpoint esté apagado.
- **Errores**: el fallo de una métrica se muestra en su tarjeta y no rompe el resto.
- **Responsive**: tarjetas en una columna en móvil y gráfico con desplazamiento horizontal.
- **Accesibilidad**: el gráfico tiene una tabla de datos alternativa.
- **No mostrar**: contenido de mensajes ni teléfonos.

## 3. Lista de productos

- **Objetivo**: encontrar productos y ver su situación de stock.
- **Usuario autorizado**: `admin` y `viewer`.
- **Información mostrada**: SKU, nombre, marca, categoría, precio vigente o «Sin precio», stock disponible, unidad, estado de stock (disponible, bajo stock, sin stock) y si está activo. Marca, categoría y precio desde la 11.1.
- **Acciones**: buscar y abrir el detalle. Solo `admin` puede crear producto.
- **Filtros**: texto, estado de stock y activos/inactivos (por defecto, solo activos). Desde la 11.1 el texto busca por palabras sueltas sobre nombre, marca y categoría, o por SKU exacto (FR-PROD-11); antes era prefijo de nombre o SKU.
- **Paginación**: 25 por página, ordenado por nombre.
- **Carga**: skeleton de la tabla.
- **Vacío**: distingue "no hay productos" de "sin resultados".
- **Errores**: generales.
- **Responsive**: tarjetas en móvil con nombre, marca y categoría, precio, stock y estado.
- **Accesibilidad**: el estado se muestra con texto e ícono además del color. «Bajo stock» usa el token de advertencia desde la 11.1 (O-17).
- **No mostrar**: nada sensible específico.

## 4. Detalle y edición de producto

- **Objetivo**: consultar y mantener los datos de un producto.
- **Usuario autorizado**: lectura para `admin` y `viewer`; edición y desactivación solo para `admin`.
- **Información mostrada**: datos del producto —con marca, categoría, condición y precio vigente desde la 11.1, y el enlace a la pantalla 5b—, stock actual, estado, punto de reposición y los últimos movimientos (enlace a la pantalla 5). El historial de auditoría solo lo ve `admin`. El formulario sugiere las marcas y categorías que ya existen en la organización.
- **Acciones**: editar, y desactivar o reactivar con confirmación explícita.
- **Filtros**: no aplican.
- **Paginación**: el historial de auditoría pagina de a 25.
- **Carga**: skeleton del formulario.
- **Vacío**: no aplica.
- **Errores**: validación en línea, `CONFLICT` si el SKU está duplicado y `NOT_FOUND` si el producto no existe.
- **Responsive**: el formulario pasa a una columna.
- **Accesibilidad**: los errores se asocian a cada campo con `aria-describedby`.
- **No mostrar**: la auditoría a `viewer`.

## 5. Ajuste de inventario e historial de movimientos

- **Objetivo**: corregir stock con trazabilidad y consultar el historial.
- **Usuario autorizado**: el historial lo ven `admin` y `viewer`; el ajuste solo `admin`.
- **Información mostrada**: stock actual y movimientos (fecha, tipo, cantidad, saldo resultante, motivo y autor).
- **Acciones**: registrar un ajuste positivo o negativo con cantidad mayor a 0 y motivo obligatorio. Antes de confirmar se ve el saldo resultante.
- **Filtros**: tipo de movimiento (ajuste positivo o negativo, los únicos del MVP) y período.
- **Paginación**: 25 por página, del más reciente al más antiguo.
- **Carga**: el botón queda deshabilitado hasta que responde el servidor.
- **Vacío**: "este producto no tiene movimientos".
- **Errores**: `BUSINESS_RULE_VIOLATION` si el saldo quedaría negativo o si el producto está desactivado. Ante un `CONFLICT` por un cambio concurrente, se recarga el saldo y se pide confirmar de nuevo.
- **Responsive**: el formulario se muestra arriba y el historial en tarjetas.
- **Accesibilidad**: el saldo resultante se anuncia con `aria-live`.
- **No mostrar**: nada sensible específico. No existe ninguna acción para editar ni borrar un movimiento.

## 5b. Precios de un producto

Agregada en la 11.1 ([brief-11.1](../decisions/brief-11.1-catalogo-comercial.md), FR-PROD-12 y FR-PROD-13). Ruta `/productos/[id]/precios`.

- **Objetivo**: fijar el precio de venta y consultar su historial.
- **Usuario autorizado**: el precio vigente y el historial los ven `admin` y `viewer`; fijar un precio, solo `admin` y con el producto activo.
- **Información mostrada**: el precio vigente o «Sin precio», y el historial (fecha, precio formateado en su moneda y autor), con el vigente marcado.
- **Acciones**: fijar un precio nuevo con moneda y monto. Antes de confirmar se ve el monto formateado en su moneda (`CLP 300.000`, `US$ 1.234,50`), y si es igual al vigente se avisa que no cambia nada. El monto se escribe según los decimales de la moneda: en una moneda sin decimales, un punto o una coma se rechazan con «escribí el monto sin puntos ni comas» (D-6).
- **Filtros**: no aplican.
- **Paginación**: 25 por página, del más reciente al más antiguo.
- **Carga**: el botón queda deshabilitado hasta que responde el servidor.
- **Vacío**: «este producto todavía no tiene precio».
- **Errores**: validación del monto con un mensaje por motivo, y de la moneda. `BUSINESS_RULE_VIOLATION` si el producto está desactivado. Ante un `CONFLICT` porque otro fijó un precio, se muestra el vigente nuevo, se conserva lo escrito y se pide confirmar de nuevo.
- **Responsive**: el historial pasa a tarjetas.
- **Accesibilidad**: el monto formateado se anuncia con `aria-live`; los errores se asocian a su campo con `aria-describedby` y reciben el foco.
- **No mostrar**: ninguna acción para editar ni borrar un precio. El formulario, a `viewer`.

## 6. Lista de clientes

- **Objetivo**: encontrar clientes.
- **Usuario autorizado**: `admin` y `viewer`.
- **Información mostrada**: nombre, teléfono, fecha de última interacción y si está activo. El teléfono se muestra completo a `admin` y enmascarado (solo los últimos 4 dígitos) a `viewer` (subfase 1.3, D-1).
- **Acciones**: buscar y abrir el detalle. Solo `admin` puede crear cliente.
- **Filtros**: texto (nombre o teléfono completo) y activos/inactivos.
- **Paginación**: 25 por página, ordenado por última interacción de más reciente a más antigua.
- **Carga**: skeleton.
- **Vacío**: distingue "no hay clientes" de "sin resultados".
- **Errores**: generales.
- **Responsive**: tarjetas en móvil.
- **Accesibilidad**: el teléfono enmascarado tiene un texto accesible que lo indica.
- **Etiquetas** *(16.1, FR-CLI-10)*: hasta tres chips por fila y «+N» con las demás; un filtro «Etiqueta» con las activas, en la URL (`etiqueta=<id>`), combinable con la búsqueda, la actividad y el orden. Una etiqueta ajena, inexistente o inactiva en la URL se ignora. Un botón «Etiquetas» lleva al catálogo (pantalla 13).
- **No mostrar**: el teléfono completo a un `viewer`, en la lista ni en ninguna otra vista. El enmascarado se aplica en el servidor: la respuesta que recibe un `viewer` no contiene el número completo. La búsqueda por teléfono completo funciona igual para ambos roles, porque el filtro se resuelve en la consulta y no depende de lo que se renderice.

## 7. Detalle y edición de cliente

- **Objetivo**: consultar y mantener un cliente y ver su actividad.
- **Usuario autorizado**: lectura para `admin` y `viewer`; edición y desactivación solo para `admin`.
- **Información mostrada**: nombre, teléfono, notas, última interacción (fecha y canal, sin contenido) y conversaciones del cliente. El teléfono sigue la misma regla que en la lista: completo para `admin`, enmascarado para `viewer` (subfase 1.3, D-1). Enmascararlo en la lista y mostrarlo entero acá no protegería nada. Solo `admin` ve además el historial de auditoría del cliente (subfase 1.2, D-8).
- **Acciones**: editar, y desactivar o reactivar con confirmación. Abrir una conversación.
- **Filtros**: estado de las conversaciones del cliente.
- **Paginación**: las conversaciones paginan de a 25, del último mensaje más reciente al más antiguo; el historial de auditoría también pagina de a 25.
- **Carga**: los datos del cliente y sus conversaciones cargan por separado.
- **Vacío**: "sin conversaciones registradas".
- **Errores**: `CONFLICT` si el teléfono está duplicado en la organización y validación de formato E.164.
- **Responsive**: los datos van arriba y las conversaciones abajo.
- **Accesibilidad**: estándar.
- **No mostrar**: la auditoría a `viewer`. El campo de notas incluye un aviso para no registrar datos sensibles innecesarios.
- **Etiquetas** *(16.1, FR-CLI-09 y 10)*: una tarjeta «Etiquetas» con los chips, para los dos roles; una inactiva lleva «(inactiva)» y borde punteado. Un `admin` agrega desde un selector con las activas que el cliente no tiene y quita con un botón por chip («Quitar Reclamo»). Son formularios con Server Actions, como el resto de la ficha. La auditoría muestra «Etiqueta agregada: Reclamo» y «Etiqueta quitada: Reclamo».

## 8. Lista de conversaciones

- **Objetivo**: explorar conversaciones.
- **Usuario autorizado**: `admin` y `viewer`.
- **Información mostrada**: cliente (o "sin cliente"), canal, estado, inicio, último mensaje y cantidad de mensajes.
- **Acciones**: abrir el detalle.
- **Filtros**: período (por `last_message_at`), estado, canal y cliente.
- **Paginación**: 25 por página, del último mensaje más reciente al más antiguo.
- **Carga**: skeleton.
- **Vacío**: "no hay conversaciones". En el MVP solo existen las que cargan los seeds o los tests de ingestión.
- **Errores**: generales.
- **Responsive**: tarjetas en móvil.
- **Accesibilidad**: el estado se muestra con texto.
- **No mostrar**: vista previa del contenido de los mensajes (subfase 1.3, D-2). La consulta de la lista no trae el cuerpo del último mensaje, así que la restricción es del modelo de consulta y no solo de la vista.

## 9. Detalle de conversación y timeline

- **Objetivo**: leer una conversación en orden cronológico.
- **Usuario autorizado**: lectura para `admin` y `viewer`; cambio de estado solo para `admin`.
- **Información mostrada**: cliente, canal, estado actual y mensajes del más antiguo al más reciente, con dirección y hora.
- **Acciones**: cargar mensajes anteriores y cambiar el estado (`open`, `pending`, `closed`). El cambio queda auditado.
- **Filtros**: no aplican.
- **Paginación**: incremental, de a 50 mensajes, empezando por los más recientes.
- **Carga**: indicador al cargar mensajes anteriores sin perder la posición de lectura.
- **Vacío**: "esta conversación no tiene mensajes".
- **Errores**: `NOT_FOUND`.
- **Responsive**: burbujas a ancho completo en móvil.
- **Accesibilidad**: la dirección se indica con texto ("Cliente" o "Negocio") y no solo con la alineación o el color. El timeline es una lista semántica.
- **No mostrar**: el cuerpo del mensaje se renderiza siempre como texto plano escapado, sin HTML ni enlaces automáticos.

## 10. Usuarios y roles

- **Objetivo**: gestionar quién accede a la organización (FR-ORG-02).
- **Usuario autorizado**: solo `admin`.
- **Información mostrada**: nombre, email, rol y si está activo. Como cada usuario pertenece a una sola organización, "activo" es el estado de la cuenta (`users.is_active`) y equivale a su estado en la organización (subfase 1.2, D-5 y D-9).
- **Acciones**: crear un usuario con contraseña inicial de un solo uso, cambiar el rol, desactivar y reactivar (la reactivación se agregó en la subfase 3.7, D-9). Todo queda auditado.
- **Filtros**: rol y activos/inactivos.
- **Paginación**: 25 por página.
- **Carga**: estándar.
- **Vacío**: no aplica, porque siempre existe al menos el `admin` actual.
- **Errores**: `CONFLICT` si el email ya existe y `BUSINESS_RULE_VIOLATION` al intentar quitar o desactivar el último `admin` de la organización.
- **Responsive**: tarjetas en móvil.
- **Accesibilidad**: estándar.
- **No mostrar**: hashes ni la contraseña inicial después de crearla.
- **Alcance**: esta pantalla entra al MVP y la implementa la Fase 3 (subfase 1.3, D-3). Se descartó resolver el alta con un script de administración, porque un script no deja registro auditado de quién hizo el cambio y FR-ORG-02 lo exige.

## 11. Información del negocio

Agregada en la 11.2 ([brief-11.2](../decisions/brief-11.2-informacion-del-negocio.md), FR-INFO-02 y FR-INFO-03). Ruta `/informacion`, en la navegación como «Información». Sin wireframe propio, como la 5b.

- **Objetivo**: ver y encontrar la información que el negocio da a diario: horarios, ubicación, medios de pago, envíos, garantía.
- **Usuario autorizado**: `admin` y `viewer`. «Nueva entrada», solo `admin`.
- **Información mostrada**: título, categoría, estado de vigencia (vigente, programada, vencida o inactiva, con ícono y texto) y vigencia («Sin límite», «Desde el …», «Hasta el …», «Del … al …»).
- **Acciones**: buscar; ir al detalle; `admin`, crear una entrada.
- **Filtros**: búsqueda por palabras sueltas sobre título, categoría y contenido, y estado (todas, vigentes, programadas, vencidas e inactivas; por defecto, todas). Todo en la URL (`?q=&estado=&pagina=`).
- **Paginación**: 25 por página. Sin texto, por categoría y título; con texto, por relevancia (el título pesa más que el contenido).
- **Carga**: estándar.
- **Vacío**: «Todavía no hay información del negocio», con «Crear la primera» para `admin`. Sin resultados: «Ninguna entrada coincide con estos filtros», con «Limpiar filtros».
- **Errores**: estándar.
- **Responsive**: tarjetas en móvil.
- **Accesibilidad**: estándar. El estado nunca depende solo del color.
- **No mostrar**: entradas de otra organización.

## 12. Detalle y edición de una entrada

Agregada en la 11.2 ([brief-11.2](../decisions/brief-11.2-informacion-del-negocio.md), FR-INFO-01). Rutas `/informacion/nueva` (alta) y `/informacion/[id]` (detalle, `?editar=1` para editar y `?confirmar=desactivar` para confirmar).

- **Objetivo**: leer una entrada completa y, para `admin`, mantenerla.
- **Usuario autorizado**: el detalle, `admin` y `viewer`; el alta, la edición, la desactivación, la reactivación y la auditoría, solo `admin`.
- **Información mostrada**: título, estado, categoría, vigencia, fecha de la última actualización y el contenido completo, escapado y con sus saltos de línea. Para `admin`, el historial de auditoría paginado, con el contenido resumido como «modificado».
- **Acciones**: crear y editar (título, categoría con sugerencias de las ya usadas, contenido y las dos fechas de vigencia, opcionales e inclusivas); desactivar con confirmación en un segundo paso; reactivar. Ninguna entrada se borra.
- **Filtros**: no aplican.
- **Paginación**: la de la auditoría, 25 por página.
- **Carga**: el botón queda deshabilitado hasta que responde el servidor.
- **Vacío**: no aplica.
- **Errores**: validación por campo, con el foco en el primero, y la vigencia invertida en «Vigente hasta». `CONFLICT` si el título ya existe, también en otras mayúsculas o en una entrada inactiva, en el campo del título y con lo escrito conservado. Una entrada de otra organización o un id inválido: «Esta entrada no existe».
- **Responsive**: una columna.
- **Accesibilidad**: estándar. Los campos de fecha son nativos y se recorren con el teclado por segmento.
- **No mostrar**: formularios ni auditoría a `viewer`, tampoco forzando la URL.

## 13. Etiquetas de clientes

*Agregada en la 16.1* ([brief-16.1](../decisions/brief-16.1-etiquetas-de-clientes.md), D-9), sin wireframe, como la 5b. La numeración sigue a la 12 de la 11.2.

- **Objetivo**: mantener el catálogo de etiquetas de clientes de la organización (FR-CLI-08).
- **Ruta**: `/clientes/etiquetas`. Se llega desde el botón «Etiquetas» de la lista de clientes; no tiene ítem en el panel lateral.
- **Usuario autorizado**: lectura para `admin` y `viewer`; alta, edición, desactivación y reactivación solo para `admin`.
- **Información mostrada**: cada etiqueta como chip, su estado y la cantidad de clientes activos que la tienen, que lleva a la lista filtrada si la etiqueta está activa.
- **Acciones**: con el catálogo vacío, «Crear las sugeridas». Crear con nombre y uno de seis colores (radios con la muestra del chip). Editar (`?editar=<id>`), desactivar con confirmación (`?confirmar=<id>`) y reactivar.
- **Vacío**: «Todavía no hay etiquetas.»
- **Errores**: nombre repetido sin distinguir mayúsculas, también frente a una inactiva; nombre vacío o de más de 40; el límite de 50 activas.
- **Responsive**: tabla en escritorio y tarjetas en móvil, sin scroll horizontal a 375 px.
- **Accesibilidad**: el color nunca es el único dato; los seis colores pasan el contraste de axe en claro y en oscuro; «Editar», «Desactivar» y «Reactivar» llevan el nombre de la etiqueta en su texto accesible.
