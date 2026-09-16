# Pantallas del MVP

**Estado: diseñado**, salvo las pantallas 1 y 10 (implementadas en la 3.5 y la 3.7) y las pantallas 3, 4 y 5 (implementadas en la 4.4, con los desvíos anotados en sus wireframes). Especificación funcional de pantalla, no wireframes visuales. Los wireframes de baja fidelidad están en [wireframes/](wireframes/README.md) (subfase 1.1); su validación cruzada contra el modelo de datos corresponde a la subfase 1.2.

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
- **Información mostrada**: tarjetas de las métricas 1 a 9, 11 y 12, gráfico diario (métrica 10), zona horaria y período activo. Cada tarjeta incluye un enlace a la definición de la métrica.
- **Acciones**: cambiar el período.
- **Filtros**: período, por defecto los últimos 30 días completos.
- **Paginación**: no aplica.
- **Carga**: cada tarjeta carga por separado, así una métrica lenta no bloquea a las demás.
- **Vacío**: "sin datos" cuando el denominador es 0. La métrica 12 muestra "no disponible" mientras la ingestión no esté habilitada en el entorno; la condición sale de la configuración, no de los datos (subfase 1.2, D-7).
- **Errores**: el fallo de una métrica se muestra en su tarjeta y no rompe el resto.
- **Responsive**: tarjetas en una columna en móvil y gráfico con desplazamiento horizontal.
- **Accesibilidad**: el gráfico tiene una tabla de datos alternativa.
- **No mostrar**: contenido de mensajes ni teléfonos.

## 3. Lista de productos

- **Objetivo**: encontrar productos y ver su situación de stock.
- **Usuario autorizado**: `admin` y `viewer`.
- **Información mostrada**: SKU, nombre, stock disponible, unidad, estado de stock (disponible, bajo stock, sin stock) y si está activo.
- **Acciones**: buscar y abrir el detalle. Solo `admin` puede crear producto.
- **Filtros**: texto (nombre o SKU), estado de stock y activos/inactivos (por defecto, solo activos).
- **Paginación**: 25 por página, ordenado por nombre.
- **Carga**: skeleton de la tabla.
- **Vacío**: distingue "no hay productos" de "sin resultados".
- **Errores**: generales.
- **Responsive**: tarjetas en móvil con nombre, stock y estado.
- **Accesibilidad**: el estado se muestra con texto e ícono además del color.
- **No mostrar**: nada sensible específico.

## 4. Detalle y edición de producto

- **Objetivo**: consultar y mantener los datos de un producto.
- **Usuario autorizado**: lectura para `admin` y `viewer`; edición y desactivación solo para `admin`.
- **Información mostrada**: datos del producto, stock actual, estado, punto de reposición y los últimos movimientos (enlace a la pantalla 5). El historial de auditoría solo lo ve `admin`.
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
