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
- **Pantallas de detalle y formularios, desde la 15.4** ([brief-15.4](../decisions/brief-15.4-detalles-y-formularios.md)) *(nota del 2026-10-05)*: cada detalle lleva «Volver a…», un encabezado con avatar o ícono, sus estados y las acciones («Editar» y «Desactivar», este último con borde de peligro), y los datos en tarjetas con ícono. Sin pestañas: un producto tiene una barra con sus tres páginas (resumen, movimientos de stock e historial de precios). El historial de auditoría es la misma tarjeta en productos, clientes e información, con la paginación numerada y, si está vacío, «Sin cambios registrados todavía.». El cliente suma dos estadísticas que se derivan de lo que la página ya carga: la cantidad de conversaciones y los días desde la última interacción. La conversación muestra los mensajes como burbujas, con el texto que dice quién envía, y al costado sus datos y el cambio de estado; sin campo para escribir ni tildes de leído. Los formularios agrupan sus campos en tarjetas, en el mismo orden de siempre. Los campos que los bocetos dibujan y el CRM no tiene no se muestran (Fase 17; el costo, Fase 18). *Desde la 18.2*, el costo y el margen se muestran solo a un `admin`, en la pantalla 5c y en una tarjeta de la 4, y la barra del producto suma «Costos y margen» para un `admin`.
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
- **Información mostrada**: SKU, nombre, marca, categoría, precio vigente o «Sin precio», stock disponible, unidad, estado de stock (disponible, bajo stock, sin stock) y si está activo. Marca, categoría y precio desde la 11.1. *Desde la 17.5* ([brief-17.5](../decisions/brief-17.5-imagenes-de-producto.md), D-7), la miniatura de la imagen junto al nombre, o un recuadro vacío con el ícono del producto.
- **Acciones**: buscar y abrir el detalle. Solo `admin` puede crear producto.
- **Filtros**: texto, estado de stock y activos/inactivos (por defecto, solo activos). Desde la 11.1 el texto busca por palabras sueltas sobre nombre, marca y categoría, o por SKU exacto (FR-PROD-11); antes era prefijo de nombre o SKU. *Desde la 17.2*, también por código de barras exacto (FR-PROD-15): un lector de códigos lo escribe y manda Enter.
- **Paginación**: 25 por página, ordenado por nombre.
- **Carga**: skeleton de la tabla.
- **Vacío**: distingue "no hay productos" de "sin resultados".
- **Errores**: generales.
- **Responsive**: tarjetas en móvil con nombre, marca y categoría, precio, stock y estado; desde la 17.5, con la miniatura.
- **Accesibilidad**: el estado se muestra con texto e ícono además del color. «Bajo stock» usa el token de advertencia desde la 11.1 (O-17).
- *Desde la 19.3* ([brief-19.3](../decisions/brief-19.3-reserva-y-ciclo.md), D-7; FR-PROD-05 enmendado): la columna de stock muestra **lo disponible** y, si hay algo reservado, «N reservado» debajo; el estado, su filtro y el orden por stock usan lo disponible. En móvil, «N unidad disponible · M reservado».
- **No mostrar**: nada sensible específico.

## 4. Detalle y edición de producto

- **Objetivo**: consultar y mantener los datos de un producto.
- **Usuario autorizado**: lectura para `admin` y `viewer`; edición y desactivación solo para `admin`.
- **Información mostrada**: datos del producto —con marca, categoría, condición y precio vigente desde la 11.1, y el enlace a la pantalla 5b—, stock actual, estado, punto de reposición y los últimos movimientos (enlace a la pantalla 5). El historial de auditoría solo lo ve `admin`. El formulario sugiere las marcas y categorías que ya existen en la organización. *Desde la 17.2* ([brief-17.2](../decisions/brief-17.2-campos-de-productos.md), D-11): el código de barras debajo del SKU, y las tarjetas «Logística» (peso en kg y dimensiones en cm, «largo × ancho × alto») y «Ubicación» (ubicación, con sugerencias de las ya cargadas, y estante), en el formulario y en el detalle; las ve también un `viewer` (FR-PROD-14). *Desde la 18.2* ([brief-18.2](../decisions/brief-18.2-costo-y-margen.md), D-3): para un `admin`, la tarjeta «Costo y margen» con el costo y el precio vigentes, el margen y el recargo o el motivo por el que no hay margen, y la base del cálculo, con el enlace a la pantalla 5c.
- **Acciones**: editar, y desactivar o reactivar con confirmación explícita. *Desde la 17.5* ([brief-17.5](../decisions/brief-17.5-imagenes-de-producto.md), D-7): la tarjeta «Imagen» muestra la imagen principal o «Sin imagen»; un `admin` la sube o la reemplaza desde un campo de archivo, con los formatos y el tamaño a la vista y una línea fija que dice que la foto no debe mostrar personas, y la quita con confirmación. El alta no lleva imagen.
- **Filtros**: no aplican.
- **Paginación**: el historial de auditoría pagina de a 25.
- **Carga**: skeleton del formulario.
- **Vacío**: no aplica.
- **Errores**: validación en línea, `CONFLICT` si el SKU está duplicado y `NOT_FOUND` si el producto no existe. *Desde la 17.2*, `CONFLICT` también si el código de barras está duplicado, en su campo; una o dos dimensiones sin la tercera marcan las que faltan. *Desde la 17.5*, la imagen: el formato, el tamaño, los píxeles, una animada, el límite de subidas y el procesamiento ocupado, cada uno con su mensaje y el foco en el error.
- **Responsive**: el formulario pasa a una columna.
- **Accesibilidad**: los errores se asocian a cada campo con `aria-describedby`.
- **No mostrar**: la auditoría a `viewer`. *Desde la 18.2*, tampoco el costo, el margen ni el enlace a la pantalla 5c.

*Desde la 19.3* ([brief-19.3](../decisions/brief-19.3-reserva-y-ciclo.md), D-7), la tarjeta «Stock» de la ficha suma «Reservado» y «Disponible»; el estado usa lo disponible.

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

*Desde la 19.3* ([brief-19.3](../decisions/brief-19.3-reserva-y-ciclo.md), D-7): la cabecera muestra también lo reservado y lo disponible; el historial etiqueta las entregas de pedidos («Entrega de pedido», con el número del pedido en el motivo) y las filtra con `?tipo=entrega`; *desde la 20.3* ([brief-20.3](../decisions/brief-20.3-la-venta-sin-pedido.md), H-2), también las ventas sin pedido («Venta», con el número de la venta en el motivo), con `?tipo=venta`, y desde la 20.4 ([brief-20.4](../decisions/brief-20.4-la-anulacion.md), D-7) las reposiciones de una anulación («Anulación de venta», con los dos números en el motivo), con `?tipo=anulacion`; el ajuste avisa antes de enviar si el saldo quedaría por debajo de lo reservado, y el servidor lo rechaza con `below_reserved` y un mensaje con el saldo, lo reservado, la cantidad y qué hacer (cancelar primero el pedido que no se puede cumplir).

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

## 5c. Costos y margen de un producto

Agregada en la 18.2 ([brief-18.2](../decisions/brief-18.2-costo-y-margen.md), FR-PROD-19 a FR-PROD-21). Ruta `/productos/[id]/costos`. Tiene la forma de la 5b.

- **Objetivo**: fijar el costo del producto, consultar su historial y ver el margen.
- **Usuario autorizado**: **solo `admin`**, también para leer (D-1). Un `viewer` recibe «No tenés permiso para ver esta página.», no ve el enlace en la barra del producto ni la tarjeta del resumen. Fijar un costo exige además el producto activo.
- **Información mostrada**: la tarjeta «Costo y margen» con el costo y el precio vigentes, el margen (monto y porcentaje del precio) y el recargo (porcentaje sobre el costo), o el motivo por el que no hay margen; la base del cálculo, siempre visible; y el historial (fecha, costo formateado y autor), con el vigente marcado. La misma tarjeta va en la pantalla 4.
- **Acciones**: fijar un costo nuevo con moneda y monto, como el precio de la 5b.
- **Filtros**: no aplican.
- **Paginación**: 25 por página, del más reciente al más antiguo.
- **Vacío**: «este producto todavía no tiene costo».
- **Errores**: los de la 5b, con «costo» donde dice «precio». Un margen negativo se muestra con su signo y el aviso «El costo supera el precio».
- **Responsive y accesibilidad**: como la 5b.
- **No mostrar**: ninguna acción para editar ni borrar un costo. Nada de esta pantalla a `viewer`. El costo y el margen no van en la lista de productos (D-4).

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
- **Tipo, provincia y segmento** *(17.1, FR-CLI-14)*: tres selectores más, en la URL (`tipo=persona|empresa`, `provincia=<código>`, `segmento=<texto>`), combinables con los demás filtros. Cada selector aparece y ofrece valores solo si algún cliente de la organización los tiene; cualquier otro valor en la URL se ignora. Sin columnas nuevas en la tabla.
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
- **Campos ampliados** *(17.1, FR-CLI-12 y 13)*: cuatro tarjetas debajo de «Información principal»: «Contacto» (email), «Empresa» (tipo, empresa y cargo), «Dirección» (calle y número, ciudad, provincia y código postal) y «Clasificación» (segmento), con «—» en lo vacío. A un `viewer`, el email, la calle y el código postal no le llegan del servidor, y la tarjeta dice «Solo visible para administradores.». El formulario de alta y edición suma las mismas cuatro tarjetas, todas opcionales; el tipo y la provincia son selectores con «Sin dato», y el segmento sugiere los ya cargados.
- **Agente pausado** *(16.3, FR-CONV-06)*: las conversaciones del cliente usan la misma tabla que la pantalla 8, así que también muestran la marca «Agente pausado» junto al estado. Solo se ve; pausar y reanudar se hace desde la pantalla 9.

## 8. Lista de conversaciones

- **Objetivo**: explorar conversaciones.
- **Usuario autorizado**: `admin` y `viewer`.
- **Información mostrada**: cliente (o "sin cliente"), canal, estado, inicio, último mensaje y cantidad de mensajes. *Desde la 16.3*, la marca «Agente pausado» junto al estado, si un admin pausó al agente en esa conversación.
- **Acciones**: abrir el detalle.
- **Filtros**: período (por `last_message_at`), estado, canal y cliente.
- **Paginación**: 25 por página, del último mensaje más reciente al más antiguo.
- **Carga**: skeleton.
- **Vacío**: "no hay conversaciones". En el MVP solo existen las que cargan los seeds o los tests de ingestión.
- **Errores**: generales.
- **Responsive**: tarjetas en móvil.
- **Accesibilidad**: el estado se muestra con texto, y la marca de pausa también: el color y el ícono acompañan.
- **No mostrar**: vista previa del contenido de los mensajes (subfase 1.3, D-2). La consulta de la lista no trae el cuerpo del último mensaje, así que la restricción es del modelo de consulta y no solo de la vista.

## 9. Detalle de conversación y timeline

- **Objetivo**: leer una conversación en orden cronológico.
- **Usuario autorizado**: lectura para `admin` y `viewer`; cambio de estado, pausa del agente y, desde la 16.4, agregar notas solo para `admin`.
- **Información mostrada**: cliente, canal, estado actual y mensajes del más antiguo al más reciente, con dirección y hora. *Desde la 16.3*, el agente: «Activo» o «Agente pausado», con la fecha y la hora desde la que está pausado. *Desde la 16.4* ([brief-16.4](../decisions/brief-16.4-notas-de-la-conversacion.md), D-6; FR-CONV-07), la tarjeta «Notas»: cada nota con su autor, su fecha y hora en la zona de la organización y su texto, de la más reciente a la más vieja, de a 25 con «Ver anteriores». Vacía, dice «Sin notas.». Una nota vaciada con los datos del cliente dice que se vació.
- **Acciones**: cargar mensajes anteriores y cambiar el estado (`open`, `pending`, `closed`). El cambio queda auditado. *Desde la 16.3*, «Pausar al agente» en una conversación `open` o `pending` y «Reanudar al agente» en cualquiera, auditados; una cerrada sin pausa dice que no se pausa. La sección explica que, mientras está pausado, el agente no contesta, y que una conversación nueva del cliente empieza con el agente activo ([brief-16.3](../decisions/brief-16.3-pausar-y-reanudar-al-agente.md)). *Desde la 16.4*, «Agregar nota» en cualquier estado, auditada; el resultado se anuncia con `aria-live` y un rechazo deja el foco en el campo, con lo escrito. La ayuda dice que las notas solo las ve el equipo y que no se editan ni se borran. Las pantallas 7 y 8 no muestran notas.
- **Filtros**: no aplican.
- **Paginación**: incremental, de a 50 mensajes, empezando por los más recientes.
- **Carga**: indicador al cargar mensajes anteriores sin perder la posición de lectura.
- **Vacío**: "esta conversación no tiene mensajes".
- **Errores**: `NOT_FOUND`.
- **Responsive**: burbujas a ancho completo en móvil.
- **Accesibilidad**: la dirección se indica con texto ("Cliente" o "Negocio") y no solo con la alineación o el color. El timeline es una lista semántica.
- **No mostrar**: el cuerpo del mensaje y, desde la 16.4, el texto de las notas se renderizan siempre como texto plano escapado, sin HTML ni enlaces automáticos.

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

## 12b. Horario de atención

Agregada en la 17.4 ([brief-17.4](../decisions/brief-17.4-informacion-del-negocio-estructurada.md), D-4; FR-INFO-04 y FR-INFO-05). Ruta `/informacion/horario` (`?editar=1` para editar la semana), con un enlace «Horario de atención» en la pantalla 11. Ocupa el lugar de la pestaña «Horarios» de los bocetos.

- **Objetivo**: ver y mantener el horario de atención estructurado, que el CRM usa para calcular si el negocio está abierto.
- **Usuario autorizado**: ver, `admin` y `viewer`; editar la semana, agregar y quitar días especiales y el historial, solo `admin`.
- **Información mostrada**: la zona horaria de la organización; los siete días con sus tramos («09:00 a 13:00 y 16:00 a 20:00», o «Cerrado»); los días especiales de hoy en adelante, con el día de la semana, sus tramos o «Cerrado», y el motivo; si hay una entrada de texto vigente de la categoría «Horarios», un aviso con su enlace (D-5). Para `admin`, el historial paginado, con cada día que cambió en castellano.
- **Acciones**: editar la semana entera, con dos tramos por día y un día vacío como cerrado; agregar un día especial (fecha, motivo y tramos, vacío como cerrado); quitar uno, sin confirmación.
- **Filtros**: no aplican.
- **Paginación**: la del historial, 25 por página.
- **Carga**: el botón queda deshabilitado hasta que responde el servidor.
- **Vacío**: «Todavía no hay un horario cargado»; «No hay días especiales próximos».
- **Errores**: un día inválido se marca con su mensaje, el foco va al primero y lo escrito se conserva; una fecha pasada o repetida, en el campo de la fecha.
- **Responsive**: los cuatro campos de cada día en dos columnas en móvil y en una fila desde `lg`.
- **Accesibilidad**: estándar. Cada día es un grupo con su nombre; los campos de hora son nativos.
- **No mostrar**: formularios, el botón «Quitar» ni el historial a `viewer`, tampoco forzando la URL.

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

## 14. Lista de pedidos

*Agregada en la 19.2* ([brief-19.2](../decisions/brief-19.2-el-pedido.md), D-10; FR-ORD-05), sin wireframe. Ruta `/pedidos`, con su ítem «Pedidos» en el panel lateral para los dos roles.

- **Objetivo**: encontrar un pedido.
- **Usuario autorizado**: `admin` y `viewer`; el botón «+ Nuevo pedido», solo `admin`.
- **Información mostrada**: número, fecha, cliente, cantidad de líneas, total y estado (con ícono y texto). *Desde la 19.4* ([brief-19.4](../decisions/brief-19.4-el-pedido-del-agente.md), D-11; FR-ORD-11), el origen: «Agente» si lo dejó el agente y «Equipo» si se cargó en la app; en móvil, «Agente» al final de la tarjeta.
- **Filtros**: estado (todos, pendientes, cancelados; confirmados y entregados desde la 19.3) y búsqueda por número (`P-000123`, `000123` o `123`). Desde la ficha de un cliente llega filtrada por él, con un enlace para ver los de todos.
- **Paginación**: 25 por página, del más reciente al más viejo.
- **Vacío**: «Todavía no hay pedidos.»; con filtros, «Ningún pedido coincide con estos filtros.»
- **Responsive**: tabla en escritorio y tarjetas en móvil.
- **No mostrar**: costo ni margen.

## 15. Nuevo pedido

*Agregada en la 19.2* (D-5 a D-7; FR-ORD-01 a FR-ORD-03). Ruta `/pedidos/nuevo`; desde la ficha de un cliente, `/pedidos/nuevo?cliente=<id>` con el cliente ya elegido.

- **Objetivo**: cargar un pedido pendiente.
- **Usuario autorizado**: solo `admin`. Un `viewer` recibe «No tenés permiso para ver esta página.»
- **Información mostrada**: el buscador de clientes; cinco líneas de inicio, cada una con el buscador de productos, la cantidad, el precio vigente y el subtotal estimado; el total estimado, con el aviso de que el total que vale es el que calcula el sistema.
- **Acciones**: agregar y quitar líneas, hasta 50; las vacías no se envían. Crear el pedido.
- **Errores**: el cliente o cada línea con su motivo (sin precio, otra moneda, inactivo, repetido, total en cero, monto demasiado grande); un precio que cambió se muestra con el nuevo, y el pedido no se crea hasta confirmarlo.
- **Sin JavaScript**: los buscadores son campos de texto; el cliente se reconoce por su nombre exacto y el producto por su SKU exacto.
- **Accesibilidad**: los buscadores son combobox de ARIA 1.2, como los de la 15.2, y se eligen con las flechas y Enter; cada línea es un grupo con su número.

## 16. Detalle de un pedido

*Agregada en la 19.2* (D-12; FR-ORD-04 y FR-ORD-05). Ruta `/pedidos/[id]`.

- **Objetivo**: ver un pedido y cancelarlo mientras está pendiente.
- **Usuario autorizado**: `admin` y `viewer`; «Cancelar pedido» y la historia, solo `admin`.
- **Información mostrada**: número, estado y total; las líneas con el producto (su nombre de hoy, con el aviso de que los precios son los del alta), la cantidad, el precio unitario y el total; el cliente, con el teléfono enmascarado y sin email para un `viewer`; las fechas de cada estado. Para `admin`, la historia: el alta con su número, sus líneas y su total, y cada cambio de estado.
- **Acciones**: cancelar un pendiente, con confirmación.

*Desde la 19.3* ([brief-19.3](../decisions/brief-19.3-reserva-y-ciclo.md), D-8 y D-9; FR-ORD-08 a 10): para `admin`, «Confirmar pedido» y «Cancelar pedido» en un pendiente, y «Marcar entregado» y «Cancelar pedido» en un confirmado; nada en un entregado o un cancelado. Cada uno con una confirmación que dice qué pasa con el stock. Un pendiente suma la columna «Disponible» por línea, para los dos roles, con «No alcanza» en las que no alcanzan. Un rechazo por falta de stock o por un producto desactivado se anuncia con `role="alert"` y nombra cada línea. La lista (pantalla 14) filtra también por confirmados y entregados.
*Desde la 19.4* (D-11; FR-ORD-11): la tarjeta «Estado» muestra el origen, «Agente · <emisor>» con el `source` de la credencial o «Equipo», y la historia muestra a la credencial como «Servicio · <emisor>». Un pedido del agente se confirma, entrega y cancela igual que cualquier otro.
*Desde la 20.2* ([brief-20.2](../decisions/brief-20.2-la-venta-de-un-pedido.md), D-4; FR-VEN-01, 02 y 04): un pedido entregado suma la tarjeta «Venta», para los dos roles, con el enlace a su venta o «Este pedido todavía no tiene su venta.». Para `admin`, sin venta, «Emitir venta» lleva al paso `?confirmar=venta`, que funciona sin JavaScript: la pregunta recibe el foco, dice que la venta copia el pedido y no mueve el stock, y ofrece «No, volver» y «Sí, emitir la venta». Emitir lleva al detalle de la venta. Si el pedido ya tenía venta, el mensaje se anuncia con `role="alert"` y la enlaza.
*Desde la 21.4* ([brief-21.4](../decisions/brief-21.4-la-sena.md), D-8; FR-CAJ-13 y 15): la tarjeta «Señas», compuesta con `cash`, para los dos roles: lo señado y, mientras la seña está retenida, lo que le falta; qué pasó con la seña («queda retenida para este pedido hasta que se emita su venta», «cuenta para la venta V-…» con su enlace, o «lo señado pasó a la cuenta del cliente como saldo a favor»); y la lista de señas con el recibo enlazado, su fecha, el medio y el monto. Para `admin`, «Registrar seña» mientras el pedido esté pendiente o confirmado y le falte algo. Al volver de una seña, el aviso «Se registró la seña R-000123.» enlaza el recibo.
*Desde la 21.5* ([brief-21.5](../decisions/brief-21.5-la-anulacion-y-la-devolucion.md), D-9; FR-CAJ-16 y 18): una seña anulada lleva la marca «Anulado» y no cuenta en lo señado. Con el pedido cancelado y saldo a favor en la cuenta del cliente, `admin` ve «Devolver saldo a favor» (pantalla 35).
- **No mostrar**: editar ni borrar el pedido o sus líneas; costo ni margen.

## 17. Lista de ventas

*Agregada en la 20.2* ([brief-20.2](../decisions/brief-20.2-la-venta-de-un-pedido.md), D-6; FR-VEN-04), sin wireframe. Ruta `/ventas`, con su ítem «Ventas» en el panel lateral para los dos roles.

- **Objetivo**: encontrar una venta.
- **Usuario autorizado**: `admin` y `viewer`. No hay «+ Nueva venta»: en la 20.2 una venta se emite desde un pedido entregado. *Desde la 20.3* (D-6): `admin` ve «+ Nueva venta», que lleva a la pantalla 19.
- **Información mostrada**: número, fecha, cliente, un enlace «Ver pedido», cantidad de líneas y total. El número del pedido no está en la lista: `sales` no lee `orders` para listar.
- **Filtros**: búsqueda por número (`V-000123`, `000123` o `123`) y período con «Desde» y «Hasta», días de la zona de la organización. Desde el detalle de una venta llega filtrada por su cliente, con un enlace para ver las de todos. Un período inválido o invertido se anuncia con `role="alert"`.
- **Paginación**: 25 por página, de la más reciente a la más vieja.
- **Vacío**: «Todavía no hay ventas. Una venta se emite desde un pedido entregado.»; con filtros, «Ninguna venta coincide con estos filtros.» *Desde la 20.3*: «Todavía no hay ventas. Una venta se emite desde un pedido entregado o con «Nueva venta».»
- *Desde la 20.3* (D-7): una venta sin cliente dice «Consumidor final», y una sin pedido dice «Sin pedido» en lugar del enlace.
- *Desde la 20.4* ([brief-20.4](../decisions/brief-20.4-la-anulacion.md), D-8): una venta anulada lleva la marca «Anulada» junto al número; el filtro «Estado» elige «Todas», «Vigentes» o «Anuladas» (`?estado=vigente|anulada`); la búsqueda por número acepta también el de una anulación (`A-000045`, con su prefijo) y trae la venta que anula.
- **Responsive**: tabla en escritorio y tarjetas en móvil.
- **No mostrar**: costo ni margen.

## 18. Detalle de una venta y su comprobante

*Agregada en la 20.2* (D-5 y D-9; FR-VEN-04 y 05). Ruta `/ventas/[id]`.

- **Objetivo**: ver una venta e imprimir su comprobante o guardarlo como PDF.
- **Usuario autorizado**: `admin` y `viewer`; la historia, solo `admin`.
- **Información mostrada**: el comprobante, con el nombre de la organización, el número, la fecha y hora de emisión, el nombre del cliente, el número del pedido con su enlace, las líneas (el nombre de hoy del producto, con el aviso de que los precios son los del pedido), el total y la leyenda «Documento no válido como factura»; al lado, el cliente con el teléfono enmascarado y sin email para un `viewer`, y «Ver las ventas de este cliente». Para `admin`, la historia: la emisión con su número, sus líneas y su total.
- **Acciones**: «Imprimir o guardar PDF» abre el diálogo del navegador.
- **Al imprimir**: queda solo el comprobante, en claro también con el tema oscuro. Se ocultan el panel lateral, la barra superior, los botones, el aviso, la tarjeta del cliente con su contacto y la historia (D-9: el comprobante nunca lleva el contacto).
- *Desde la 20.3* (D-7): una venta sin cliente muestra «Consumidor final» en el comprobante y en la tarjeta del cliente, sin «Ver las ventas de este cliente»; una sin pedido no muestra la línea del pedido, y el aviso dice que los precios son los vigentes al emitir.
- **No mostrar**: editar, borrar ni anular la venta (la anulación es de la 20.4); costo ni margen. *Precisado el 2026-10-13 en la 20.4* (brief-20.4, H-2 y D-7): editar y borrar siguen sin existir; anular sí:
  - la tarjeta «Anulación» dice si la venta está vigente o por cuál anulación y motivo se anuló, con «Ver el comprobante de la anulación»;
  - `admin` ve «Anular venta» en una venta vigente, que abre una confirmación en la misma página (`?confirmar=anular`) con el motivo como grupo de opciones obligatorio y lo que pasa con el stock («Se repone el stock de cada línea» o «El stock no cambia: el pedido sigue entregado y se puede emitir otra venta»); al anular vuelve con «Venta anulada.». Funciona sin JavaScript, y la pregunta recibe el foco;
  - una venta anulada lo dice arriba («Anulada por A-000045 el {fecha}: {motivo}.») y en el comprobante, que se sigue imprimiendo con la marca;
  - el comprobante dice «Reemplaza a V-…» o «Reemplazada por V-…» en la cadena de las ventas de un pedido;
  - la historia muestra la anulación con su número y su motivo.
- *Desde la 21.3* ([brief-21.3](../decisions/brief-21.3-el-cobro-de-una-venta.md), D-8; FR-CAJ-09 a 11): la tarjeta «Cobros», compuesta con `cash`: el total, lo cobrado, lo imputado desde la cuenta del cliente si lo hay, y lo que falta o «Cobrada»; la lista de cobros con el recibo enlazado, su fecha, el medio y el monto; y para `admin`, «Registrar cobro» mientras falte algo en una venta vigente. En una venta anulada, en lugar de lo que falta: «Lo cobrado (…) pasó a la cuenta del cliente como saldo a favor.» o, sin cliente, «A devolver: …». Al volver de un cobro, el aviso «Se registró el cobro R-000123.» enlaza el recibo. La tarjeta no se imprime. *Desde la 21.4* ([brief-21.4](../decisions/brief-21.4-la-sena.md), D-8): en la venta vigente de un pedido señado, lo cobrado incluye la seña, con la fila «Incluye la seña del pedido P-…», y la lista marca cada seña con «Seña del pedido P-…».
- *Desde la 21.5* ([brief-21.5](../decisions/brief-21.5-la-anulacion-y-la-devolucion.md), D-9; FR-CAJ-16, 18 y 19): un cobro anulado lleva la marca «Anulado» y no cuenta en lo cobrado. En una venta sin cliente anulada, «Devuelto: … A devolver: …», la lista de sus devoluciones con la marca de las anuladas, y para `admin` «Devolver» mientras quede algo (pantalla 35). En una venta anulada con cliente, si su cuenta tiene saldo a favor, `admin` ve «Devolver saldo a favor».

## 19. Nueva venta

*Agregada en la 20.3* ([brief-20.3](../decisions/brief-20.3-la-venta-sin-pedido.md), D-6 y D-9; FR-VEN-07), sin wireframe. Ruta `/ventas/nueva`, desde «+ Nueva venta» de la pantalla 17.

- **Objetivo**: emitir una venta sin pedido, la de mostrador.
- **Usuario autorizado**: solo `admin`. Un `viewer` recibe «No tenés permiso para ver esta página.»
- **Información mostrada**: el formulario de la pantalla 15, con el cliente opcional («Vacío, la venta es a «Consumidor final».»), las líneas con el buscador de productos, la cantidad, el precio vigente y el subtotal estimado, y el total estimado, con el aviso de que el total que vale es el que calcula el sistema y de que al emitir se descuenta el stock.
- **Acciones**: agregar y quitar líneas, hasta 50; las vacías no se envían. «Emitir venta» lleva al detalle de la venta con «Venta emitida.».
- **Buscador de productos**: por nombre, SKU o código de barras exacto (D-5); un lector USB escribe el código como un teclado.
- **Errores**: los de la pantalla 15, y lo disponible de cada línea que no alcanza («Disponible: 2. Pediste 2,5.»); no se emite nada y lo cargado se conserva. No muestra lo disponible antes de emitir (D-6).
- **Sin JavaScript**: como la pantalla 15; un cliente escrito que no se reconoce se rechaza, no se toma como «Consumidor final».
- **Accesibilidad**: como la pantalla 15; el rechazo se anuncia con `role="alert"` y recibe el foco.
- **No mostrar**: costo ni margen.

## 20. Comprobante de una anulación

*Agregada en la 20.4* ([brief-20.4](../decisions/brief-20.4-la-anulacion.md), D-7; FR-VEN-10), sin wireframe. Ruta `/ventas/[id]/anulacion`, desde el detalle de una venta anulada: una venta tiene a lo sumo una anulación.

- **Objetivo**: ver la anulación e imprimirla o guardarla como PDF.
- **Usuario autorizado**: `admin` y `viewer`.
- **Información mostrada**: el nombre de la organización, «Anulación A-000045», la fecha, la venta anulada con su número y fecha, el motivo, el cliente o «Consumidor final», el pedido si hay, las líneas y el «Total anulado», y la leyenda «Documento no válido como factura». Nunca el contacto del cliente.
- **Acciones**: «Imprimir o guardar PDF»; volver a la venta.
- **Al imprimir**: queda solo el comprobante, como en la pantalla 18.
- **Vacío**: una venta vigente muestra «Esta venta no está anulada.», con el enlace para volver a ella.
- **No mostrar**: costo ni margen.

## 21. Caja

*Agregada en la 21.2* ([brief-21.2](../decisions/brief-21.2-los-medios-de-pago-y-la-caja.md), D-10; FR-CAJ-02 a 06), sin wireframe. Ruta `/caja`, «Caja» en la navegación, entre «Ventas» y «Conversaciones». Una barra lleva a «Caja de hoy», «Sesiones» y «Medios de pago».

- **Objetivo**: ver el efectivo de la sesión abierta y operarla.
- **Usuario autorizado**: `admin` y `viewer`; las acciones, solo `admin`.
- **Información mostrada**: abierta, el número de la sesión, quién la abrió y cuándo, por moneda el inicial, los aportes, los retiros y lo esperado, y los movimientos con hora, tipo, motivo, monto y autor. Cerrada, «La caja está cerrada.» y el enlace a la última sesión.
- **Acciones** (`admin`): «Registrar aporte», «Registrar retiro» y «Cerrar caja» con la caja abierta; «Abrir caja» con la caja cerrada.
- **Vacío**: «Todavía no se abrió nunca.»
- *Desde la 21.3* ([brief-21.3](../decisions/brief-21.3-el-cobro-de-una-venta.md), D-5 y D-8): por moneda, la columna «Cobros», que suma a lo esperado; la tarjeta «Cobros en efectivo», con el recibo enlazado, la hora, la venta y el monto; y en la barra, «Cobros» (pantalla 30). *Desde la 21.4* ([brief-21.4](../decisions/brief-21.4-la-sena.md)): la columna de esa tarjeta pasa de «Venta» a «Destino», con la venta o el pedido de una seña. *Desde la 21.5* ([brief-21.5](../decisions/brief-21.5-la-anulacion-y-la-devolucion.md), D-6 y D-9): por moneda, «Cobros» y «Devoluciones» van sin lo anulado mientras la sesión estaba abierta; los cobros anulados llevan la marca «Anulado»; la tarjeta «Devoluciones en efectivo», con el comprobante enlazado, la hora, de dónde sale y el monto; y en la barra, «Devoluciones» (pantalla 34).

## 22. Abrir caja

*Agregada en la 21.2* (D-3 y D-10; FR-CAJ-02). Ruta `/caja/abrir`, solo `admin`.

- **Información mostrada**: filas de moneda y efectivo inicial, con lo contado en el último cierre propuesto, y filas vacías hasta diez. La moneda se elige de la lista del sistema, como en precios, y debajo de cada monto se muestra cómo se lee, con los separadores de miles («Se lee: $ 100.000,00») *(ajuste del recorrido de la 21.2, 2026-10-14: era un campo de texto con la lista de las aceptadas)*.
- **Validación**: al menos una moneda, sin repetir; el monto puede ser cero. Cada fila inválida dice por qué.
- **Acciones**: «Abrir caja»; «Cancelar».
- **Sin JavaScript**: funciona igual; las filas vacías no se envían.
- **Con la caja abierta**: lo dice y enlaza la sesión. Un `viewer` recibe «Solo un administrador puede operar la caja.»

## 23. Registrar aporte o retiro

*Agregada en la 21.2* (D-5 y D-10; FR-CAJ-03). Ruta `/caja/movimiento?tipo=aporte|retiro`, solo `admin`.

- **Información mostrada**: la sesión, la moneda, de la lista del sistema (propuesta si la sesión tiene una sola), el monto con cómo se lee, y el motivo como grupo de opciones obligatorio, con la lista del tipo.
- **Rechazos**: un retiro que dejaría lo esperado negativo dice lo esperado de esa moneda y conserva lo escrito.
- **Con la caja cerrada**: lo dice y enlaza «Abrila». Si la sesión del formulario se cerró mientras tanto, el envío lo dice («La sesión C-000045 ya está cerrada.») y el movimiento no cae en la sesión siguiente.

## 24. Cerrar caja

*Agregada en la 21.2* (D-4 y D-10; FR-CAJ-05). Ruta `/caja/cerrar`, solo `admin`.

- **Paso 1**: lo contado de cada moneda que lo exige, con lo esperado al lado (no es un arqueo a ciegas), y filas vacías para otra moneda, elegida de la lista del sistema; debajo de cada monto, cómo se lee (ajuste del recorrido de la 21.2). «Revisar el cierre».
- **Paso 2**: «¿Cerrar la sesión C-000045 con este arqueo?», con la tabla de lo esperado, lo contado y la diferencia de cada moneda («Sobrante de», «Faltante de» o «Sin diferencia»). «Sí, cerrar la caja» o «Corregir lo contado», que vuelve al paso 1 con lo escrito. El foco va a la pregunta. Si lo esperado cambió desde que se mostró, porque alguien registró un movimiento, no cierra: vuelve a mostrar la diferencia con «Lo esperado cambió mientras confirmabas: hubo un movimiento nuevo. Revisá la diferencia otra vez.»
- **Al cerrar**: lleva al arqueo de la sesión (pantalla 26) con «Caja cerrada. Este es su arqueo.»
- **Sin JavaScript**: los dos pasos funcionan igual.

## 25. Sesiones de caja

*Agregada en la 21.2* (D-10; FR-CAJ-06). Ruta `/caja/sesiones`, para los dos roles.

- **Información mostrada**: las sesiones, de la más nueva a la más vieja, paginadas de a 25, con el número, la apertura y su autor, el cierre y su autor o «Abierta», y la diferencia de cada moneda.
- **Búsqueda**: por número, `C-000045` o `45`.
- **Vacío**: «Todavía no se abrió la caja.»; sin resultados, «Ninguna sesión coincide con ese número.»

## 26. Sesión de caja y su arqueo

*Agregada en la 21.2* (D-10; FR-CAJ-06 y 07). Ruta `/caja/sesiones/[id]`, para los dos roles.

- **Información mostrada**: el nombre de la organización, «Arqueo de caja C-000045» (o «Caja abierta»), la apertura y el cierre con su fecha y autor, por moneda el inicial, los aportes, los retiros, lo esperado, lo contado y la diferencia, los movimientos y la leyenda «Documento no válido como factura». Debajo, la historia de la sesión: la apertura y el cierre.
- **Acciones**: «Imprimir o guardar PDF», con la sesión cerrada.
- **Al imprimir**: queda solo el arqueo, sin navegación, botones ni historia.
- *Desde la 21.3* ([brief-21.3](../decisions/brief-21.3-el-cobro-de-una-venta.md), D-5): la columna «Cobros» por moneda y los cobros en efectivo de la sesión, con su recibo y su venta, también en el arqueo impreso. *Desde la 21.4* ([brief-21.4](../decisions/brief-21.4-la-sena.md)): con su destino, la venta o el pedido de una seña. *Desde la 21.5* ([brief-21.5](../decisions/brief-21.5-la-anulacion-y-la-devolucion.md), D-6; FR-CAJ-17 y 19): la columna «Devoluciones», las devoluciones en efectivo de la sesión y la marca «Anulado». Una sesión cerrada con anulaciones posteriores a su cierre las lista en «Anulaciones posteriores al cierre», con la anulación, la fecha, el comprobante que anula, el motivo y su efecto en esa caja: el arqueo guardado no cambia, y estas explican su diferencia.

## 27. Medios de pago

*Agregada en la 21.2* (D-6 y D-10; FR-CAJ-01). Ruta `/caja/medios-de-pago`, para los dos roles; las acciones, solo `admin`.

- **Información mostrada**: cada medio con su nombre, si entra a la caja del efectivo y su estado.
- **Acciones** (`admin`): «Nuevo medio de pago», con el nombre y «¿Es efectivo?»; «Renombrar» (`?editar=<id>`); «Desactivar», con confirmación (`?confirmar=<id>`); «Reactivar»; y, con la lista vacía, «Crear la lista inicial».
- **Vacío**: «Todavía no hay medios de pago. Un administrador puede crear la lista inicial.»
- **No mostrar**: la información del negocio que lee el agente: es otra cosa.

## 28. Registrar cobro

*Agregada en la 21.3* ([brief-21.3](../decisions/brief-21.3-el-cobro-de-una-venta.md), D-3 y D-8; FR-CAJ-09). Ruta `/ventas/[id]/cobrar`, solo `admin`; se llega desde «Registrar cobro» del detalle de la venta.

- **Información mostrada**: «Registrar cobro de V-000123» y lo que falta; el medio de pago como grupo de opciones obligatorio con los activos («Efectivo (entra a la caja)»), con un aviso de si la caja está abierta; y el monto en la moneda de la venta, propuesto en lo que falta (sin decimales en una moneda que no los tiene), con cómo se lee («Se lee: $ 100.000,00»), como en la caja.
- **Un solo paso**: «Registrar cobro» guarda; el tope lo vuelve a calcular `cash` con el bloqueo tomado. Al guardar vuelve al detalle de la venta con el aviso y el enlace al recibo.
- **Rechazos**, con lo escrito conservado y el foco en el mensaje: un cobro de más («El cobro supera lo que falta: $ …»); un cobro en efectivo con la caja cerrada, con el enlace «Abrir caja»; un medio desactivado o que ya no existe; un monto inválido o en cero; y una venta anulada mientras tanto.
- **Sin formulario**: una venta anulada, una ya cobrada o una organización sin medios activos lo dicen y enlazan a dónde seguir. Un `viewer` recibe «Solo un administrador puede registrar cobros.»
- **Sin JavaScript**: funciona igual.

## 29. Recibo

*Agregada en la 21.3* ([brief-21.3](../decisions/brief-21.3-el-cobro-de-una-venta.md), D-8; [ADR 0022](../decisions/0022-cobros-y-caja.md), punto 11; FR-CAJ-11). Ruta `/cobros/[id]`, para los dos roles. Está fuera de `/ventas` porque la 21.4 y la 21.6 suman otros destinos.

- **Información mostrada**: el comprobante, con el nombre de la organización, «Recibo R-000123» y la fecha y hora, «Recibimos de» el cliente o «Consumidor final», la venta enlazada, el medio, el monto y la leyenda «Documento no válido como factura». *Desde la 21.4* (D-8): el recibo de una seña dice «Seña del pedido» con el pedido enlazado, y vuelve al pedido. En pantalla, la sesión de caja si fue en efectivo y quién lo registró.
- **Acciones**: «Imprimir o guardar PDF».
- **Al imprimir**: queda solo el recibo, sin el contacto del cliente para ningún rol.
- *Desde la 21.5* ([brief-21.5](../decisions/brief-21.5-la-anulacion-y-la-devolucion.md), D-9; FR-CAJ-16): para `admin`, «Anular cobro» en un cobro sin anular (pantalla 32). Uno anulado dice arriba «Anulado por AR-000012 el {fecha}: {motivo}. Anuló {quién}. Ya no cuenta en lo cobrado.», y el recibo, que se sigue imprimiendo, lleva «Anulado por AR-…». Al volver de una anulación, el aviso «Cobro anulado.».

## 30. Cobros

*Agregada en la 21.3* ([brief-21.3](../decisions/brief-21.3-el-cobro-de-una-venta.md), D-8; FR-CAJ-11). Ruta `/caja/cobros`, «Cobros» en la barra de la caja, para los dos roles.

- **Información mostrada**: los cobros, del más nuevo al más viejo, paginados de a 25, con el recibo enlazado, la fecha, la venta, el cliente o «Consumidor final», el medio y el monto. *Desde la 21.4* (D-8): la columna «Venta» pasa a «Destino», con «Venta V-…» o «Pedido P-…». *Desde la 21.5* (D-9): los anulados llevan la marca «Anulado».
- **Búsqueda**: por número, `R-000123` o `123`.
- **Vacío**: «Todavía no se registró ningún cobro.»; sin resultados, «Ningún cobro coincide con ese número.»

## 31. Registrar seña

*Agregada en la 21.4* ([brief-21.4](../decisions/brief-21.4-la-sena.md), D-4 y D-8; FR-CAJ-13). Ruta `/pedidos/[id]/senar`, solo `admin`; se llega desde «Registrar seña» del detalle del pedido.

- **Información mostrada**: «Registrar seña de P-000123» y lo que le falta; el mismo formulario de la pantalla 28: el medio de pago con los activos y el aviso de la caja, y el monto en la moneda del pedido, propuesto en lo que le falta, con cómo se lee.
- **Un solo paso**: «Registrar seña» guarda; el tope lo vuelve a calcular `cash` con los bloqueos tomados. Al guardar vuelve al detalle del pedido con el aviso y el enlace al recibo.
- **Rechazos**, con lo escrito conservado y el foco en el mensaje: una seña de más («La seña supera lo que le falta al pedido: $ …»); un pedido que se entregó o se canceló mientras tanto; y los del cobro (efectivo con la caja cerrada, con «Abrir caja»; un medio desactivado o que ya no existe; un monto inválido o en cero).
- **Sin formulario**: un pedido entregado («lo que falta se cobra en su venta»), uno cancelado, uno cubierto por sus señas o una organización sin medios activos lo dicen y enlazan a dónde seguir. Un `viewer` recibe «Solo un administrador puede registrar señas.»
- **Sin JavaScript**: funciona igual.

## 32. Anular cobro

*Agregada en la 21.5* ([brief-21.5](../decisions/brief-21.5-la-anulacion-y-la-devolucion.md), D-4 y D-9; FR-CAJ-16 y 17). Ruta `/cobros/[id]/anular`, solo `admin`; se llega desde «Anular cobro» del recibo.

- **Información mostrada**: «Anular el recibo R-000123», el monto, el medio y el destino; la pregunta, que recibe el foco, y qué pasa: la anulación es otro comprobante y anula el cobro entero; si no es efectivo, no mueve la caja; si es efectivo con su sesión abierta, sale de lo esperado; con su sesión cerrada, el arqueo no cambia y la sesión la muestra, y la caja abierta no se toca. Una anulación no se deshace; después se registra el cobro correcto.
- **El motivo**: un grupo de opciones obligatorio, de la lista cerrada.
- **Acciones**: «No, volver» y «Sí, anular el cobro». Vuelve al recibo con «Cobro anulado.».
- **Rechazos**, con `role="alert"`: ya anulado (con el número de su anulación); «No se puede anular: ya se devolvieron … y sin este cobro quedaría devuelto más de lo cobrado. Si la devolución fue un error, anulala primero.»; y el efectivo que no alcanza en la caja.
- **Sin formulario**: un cobro ya anulado lo dice. Un `viewer` recibe «Solo un administrador puede anular cobros.»
- **Sin JavaScript**: funciona igual.

## 33. Devolución

*Agregada en la 21.5* ([brief-21.5](../decisions/brief-21.5-la-anulacion-y-la-devolucion.md), D-9; ADR 0022, punto 11; FR-CAJ-18). Ruta `/devoluciones/[id]`, para los dos roles.

- **Información mostrada**: el comprobante, con el nombre de la organización, «Devolución D-000007» y la fecha y hora, «Devolvimos a» el cliente o «Consumidor final», «Desde» («El saldo a favor de su cuenta» o la venta enlazada), el medio, el monto y la leyenda «Documento no válido como factura». En pantalla, la sesión de caja si fue en efectivo y quién la registró. Al volver de registrarla, «Devolución registrada.».
- **Acciones**: «Imprimir o guardar PDF»; para `admin`, «Anular devolución» en una sin anular (pantalla 36).
- **Anulada**: lo dice arriba («Anulada por AD-000002 el {fecha}: {motivo}. Lo devuelto vuelve a estar a favor o a devolver.») y en el comprobante.
- **Al imprimir**: queda solo el comprobante, sin el contacto del cliente para ningún rol.

## 34. Devoluciones

*Agregada en la 21.5* ([brief-21.5](../decisions/brief-21.5-la-anulacion-y-la-devolucion.md), D-9; FR-CAJ-18). Ruta `/caja/devoluciones`, «Devoluciones» en la barra de la caja, para los dos roles.

- **Información mostrada**: las devoluciones, de la más nueva a la más vieja, paginadas de a 25, con el comprobante enlazado y la marca «Anulada», la fecha, de dónde salen («Saldo a favor» o «Venta V-…»), el cliente o «Consumidor final», el medio y el monto.
- **Búsqueda**: por número, `D-000007` o `7`.
- **Vacío**: «Todavía no hay devoluciones.»; sin resultados, «Ninguna devolución coincide con ese número.»

## 35. Registrar devolución

*Agregada en la 21.5* ([brief-21.5](../decisions/brief-21.5-la-anulacion-y-la-devolucion.md), D-7 y D-9; FR-CAJ-18). Dos rutas, solo `admin`, con el mismo formulario:

- **Desde la cuenta**, `/clientes/[id]/devolver`: «Devolver saldo a favor de {cliente}» y lo que está a favor por moneda, sin el estado de cuenta (que es de la 21.6). Se llega desde «Devolver saldo a favor» de la venta anulada con cliente o del pedido cancelado. La ficha del cliente no cambia.
- **Desde una venta sin cliente anulada**, `/ventas/[id]/devolver`: «Devolver lo cobrado de V-000123» y lo que queda a devolver. Se llega desde «Devolver» del detalle de la venta.
- **El formulario**: la moneda, si hay más de una con algo a devolver; el medio de pago con los activos, con «(sale de la caja)» en el efectivo y el aviso de la caja; y el monto, propuesto en lo disponible, con cómo se lee. «Registrar devolución» guarda y lleva al comprobante.
- **Rechazos**, con lo escrito conservado y el foco en el mensaje: una devolución de más («La devolución supera lo disponible: $ …»); el efectivo que no alcanza en la caja; efectivo con la caja cerrada, con «Abrir caja»; un medio desactivado o que ya no existe; un monto inválido o en cero.
- **Sin formulario**: sin saldo a favor, una venta con cliente o vigente, nada a devolver, o sin medios activos, lo dice y enlaza a dónde seguir. Un `viewer` recibe «Solo un administrador puede registrar o anular devoluciones.»
- **Sin JavaScript**: funciona igual.

## 36. Anular devolución

*Agregada en la 21.5* ([brief-21.5](../decisions/brief-21.5-la-anulacion-y-la-devolucion.md), D-7 y D-9; FR-CAJ-19). Ruta `/devoluciones/[id]/anular`, solo `admin`, con la confirmación de la pantalla 32: el motivo de su lista, y qué pasa con la caja (vuelve a lo esperado con su sesión abierta; con la cerrada, el arqueo no cambia). Vuelve al comprobante con «Devolución anulada.».
