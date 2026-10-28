# Inventario funcional V2 — Vixora iPhone Demo

Relevamiento visual y funcional realizado sobre la aplicación autenticada el 27 de octubre de 2026. Este documento enumera plantillas de pantalla, no registros individuales. Un producto, cliente o comprobante diferente reutiliza la misma plantilla de detalle.

## Criterio general

- Conservar la identidad violeta, la tipografía y el sistema de componentes aprobados.
- Rediseñar la arquitectura de información para el negocio real de venta y servicio de iPhone.
- Agrupar la navegación por tareas; el sidebar actual contiene demasiados destinos al mismo nivel.
- Ubicar la acción primaria en una posición estable y las acciones secundarias en menús contextuales.
- Separar operación diaria, configuración y auditoría.
- Diseñar escritorio y móvil deliberadamente; no reducir tablas de escritorio.
- Mantener formularios seguros, estados explícitos, foco visible y objetivos táctiles de al menos 44 px.

## Navegación recomendada

1. **Inicio:** Dashboard y búsqueda global.
2. **Atención:** Conversaciones, clientes y turnos.
3. **Catálogo e inventario:** Productos, modelos, atributos, grados y usados.
4. **Servicio técnico:** Reparaciones y lista de servicios.
5. **Comercial:** Pedidos y ventas.
6. **Finanzas:** Caja, cuentas de clientes y cotización.
7. **Abastecimiento:** Compras, recepciones, pagos y proveedores.
8. **Administración:** Información del negocio, horarios y usuarios.

En escritorio, estos grupos deberían ser colapsables. En móvil, los cinco destinos principales serían Inicio, Chats, Clientes, Ventas y Más; «Más» abre el resto agrupado por tarea.

## Pantallas y plantillas detectadas

### Globales

- Shell de escritorio y navegación agrupada.
- Shell móvil y menú «Más».
- Dashboard operativo y dashboard analítico.
- Búsqueda global y resultados agrupados.
- Estados globales: carga, error, sin resultados, permisos y desconexión.

### Conversaciones

- Bandeja con filtros.
- Detalle del hilo.
- Notas internas, pausa del agente y cambio de estado.
- Vista móvil de bandeja y chat.

### Clientes

- Listado y filtros.
- Alta y edición.
- Ficha integral con contacto, etiquetas y estadísticas.
- Pedidos, equipos comprados, reparaciones, turnos, usados y conversaciones relacionados.
- Estado de cuenta y cobro a cuenta.
- Administración de etiquetas.

### Catálogo, productos e inventario

- Listado de productos y agrupación por modelo.
- Alta y edición de producto.
- Resumen del producto.
- Configuración de control por cantidad o unidad.
- Unidades e IMEI.
- Movimientos y ajuste de stock.
- Historial y actualización de precios.
- Historial y actualización de costos; cálculo de margen.
- Listado y ficha de modelos.
- Atributos de variante.
- Grados estéticos y garantía de unidades.

### Reparaciones y técnicos

- Listado de órdenes de servicio.
- Alta de orden.
- Ficha de orden, siguiente paso y trazabilidad.
- Comprobante de recepción.
- Tipos de reparación.
- Precios por modelo y costos del técnico.
- Garantía de reparaciones.

### Usados y permutas

- Listado de recepciones.
- Recepción de usado con IMEI, batería, grado y checklist.
- Ficha de recepción, pagos, anulación y auditoría.
- Comprobante.
- Pago del usado.
- Configuración del checklist.
- Cotizador no persistente.
- Configuración de umbral, reparaciones, redondeo y márgenes por modelo.

### Turnos

- Calendario semanal y diario.
- Alta de turno con consulta de franjas.
- Ficha del turno y siguientes acciones.
- Configuración de duración, capacidad y motivos.
- Estados confirmado, atendido, ausente y cancelado.

### Pedidos

- Listado y filtros.
- Alta con líneas dinámicas e IMEI.
- Ficha, estado, señas y venta relacionada.

### Ventas

- Listado y filtros.
- Venta de mostrador con líneas dinámicas e IMEI.
- Comprobante y ficha.
- Cobros relacionados.
- Anulación y comprobante de anulación.

### Caja y cuentas de clientes

- Caja del día.
- Listado y detalle de sesiones.
- Apertura, aporte, retiro, revisión y cierre.
- Listado y detalle de cobros.
- Listado y detalle de devoluciones.
- Deudores.
- Estado de cuenta del cliente y cobro a cuenta.
- Cotización vigente, fuente, ajuste e historial.
- Medios de pago.

### Compras y proveedores

- Listado, alta y detalle de órdenes de compra.
- Listado, alta, detalle y anulación de recepciones.
- Listado, alta, detalle y anulación de pagos.
- Proveedores a pagar.
- Listado, alta, edición y ficha de proveedor.
- Estado de cuenta y pago a cuenta del proveedor.
- Proveedor marcado como técnico.

### Información del negocio

- Listado de entradas para el agente.
- Alta y edición con vigencia.
- Horario semanal.
- Días especiales y auditoría del horario.

### Usuarios

- Listado y filtros.
- Alta con contraseña inicial de un solo uso.
- Edición de rol y estado.
- Estados seguros para mostrar, copiar y regenerar credenciales iniciales.

## Problemas prioritarios observados

1. **Navegación plana:** quince destinos compiten al mismo nivel y obligan a recordar dónde vive cada tarea.
2. **Subnavegación extensa:** Caja, Compras, Productos y Usados acumulan pestañas sin una jerarquía común.
3. **Acciones dispersas:** volver, editar, desactivar, imprimir y acciones del siguiente estado aparecen en zonas diferentes según el módulo.
4. **Fichas demasiado largas:** Cliente y Producto concentran resumen, relaciones y auditoría en una sola columna vertical.
5. **Formularios repetitivos:** Pedido, Venta y Compra muestran cinco líneas vacías desde el inicio; deberían empezar con una línea y crecer bajo demanda.
6. **Selectores de moneda inmanejables:** se presentan centenares de opciones; conviene usar favoritos ARS/USD y búsqueda progresiva para el resto.
7. **Configuración mezclada con operación:** grados, garantías, motivos, checklist y precios técnicos necesitan un patrón administrativo común.
8. **Acciones destructivas visibles en exceso:** anular, cancelar o desactivar deberían vivir en un menú secundario y explicar su impacto antes de confirmar.
9. **Tablas móviles:** los datos operativos deben transformarse en tarjetas y resúmenes, no comprimirse horizontalmente.
10. **Auditoría dominante:** el historial debe estar disponible, pero fuera del flujo principal mediante pestaña o panel lateral.

## Patrón de página recomendado

- Breadcrumb compacto.
- Título, estado y contexto a la izquierda.
- Una única acción primaria arriba a la derecha.
- Acciones secundarias en botón dividido o menú «Más».
- Subnavegación estable debajo del encabezado.
- Alertas y siguiente acción antes del contenido histórico.
- Resumen operativo en el primer pliegue.
- Formularios divididos por intención, con barra de guardado persistente.
- Auditoría en pestaña o panel lateral.

