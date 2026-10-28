# Compras y proveedores — Lote V2-11

28 de octubre de 2026. Lote terminado y verificado: 17 propuestas visuales, con datos ficticios. Solo se añaden imágenes y documentación; no se modifica código, configuración ni datos del CRM. Las operaciones representadas no se ejecutan.

Se amplía el rango orientativo del [plan](../../00-auditoria-actual/plan-lotes-v2.md) para separar las decisiones de stock, documentos y dinero.

| Módulo | Piezas | Índice |
|---|---:|---|
| Órdenes de compra y estados compartidos | 4 | Este documento |
| Recepciones de compra | 5 | [Ver](../26-recepciones/README.md) |
| Pagos y cuentas a pagar | 4 | [Ver](../27-pagos-proveedores/README.md) |
| Proveedores y técnicos | 4 | [Ver](../28-proveedores/README.md) |

| # | Vista | Imagen |
|---|---|---|
| 01 | Órdenes de compra | [Ver](desktop/01-ordenes-compra-v2.png) |
| 02 | Nueva orden | [Ver](desktop/02-nueva-orden-compra-v2.png) |
| 03 | Orden parcial | [Ver](desktop/03-orden-parcial-v2.png) |
| 17 | Estados | [Ver](estados/04-estados-compras-proveedores-v2.png) |

[Prompts completos](prompts-v2-11.md) · [Índice global](../manifest-v2.md).

[Registro de producción y verificación](produccion-v2-11.md): 15 vistas de escritorio, una móvil y un tablero de estados; archivos y enlaces locales comprobados. Generación con ImageGen integrada y revisión visual de todas las piezas.

## Base de la revisión

Lectura local del [ADR 0023](../../../decisions/0023-compras-y-proveedores.md), briefs 22.2 a 22.7, servicios de purchasing, pagos/cuentas de proveedores en cash y pantallas/formularios actuales de compras. Las precisiones de unidades serializadas, técnicos y conversión de salida se contrastaron con el código disponible. No se volvió a recorrer producción ni se accedió a registros reales. El proyecto puede seguir cambiando mientras trabaja Claude Code.

## Ordenar las acciones

Semántica de estado al implementar: Abierta en ámbar; Cerrada completa en verde; Cancelada/Anulada en gris; cierre con faltante con texto e icono ámbar. El rojo se reserva para el control destructivo y los errores. Algunos renders varían el color de estas etiquetas: prevalece esta asignación compartida con V2, sin depender del color para entender el estado. Evitar duplicar Imprimir dentro de Más cuando ya está visible en la cabecera.

Abastecimiento reúne Compras, Recepciones, Pagos y Proveedores. A pagar es una vista dentro del mismo contexto. Los accesos del lateral y las pestañas conservan el destino activo y los filtros al volver. Compras muestra Nueva orden; la ficha abierta muestra Recibir mercadería. Imprimir es secundario; cerrar con faltante o cancelar se descubren en Más, con una revisión concreta. No se ofrece Pagar orden.

El resumen de etapas enseña que la orden expresa un compromiso, la recepción incorpora mercadería y costo, y el pago se aplica a la deuda. La orden es opcional: recibir sin orden sigue siendo un camino visible.

## Reglas de la orden

Proveedor activo, una moneda para todas las líneas y un producto por línea. Cantidad positiva, costo esperado positivo con IVA incluido, redondeo por línea. En equipos por unidad, cantidades enteras y los IMEI se solicitan al recibir. Crear una orden no reserva stock ni cambia el costo ni registra pagos.

La orden no se edita ni se elimina. Abierta puede cancelarse solo sin recepciones vigentes; con alguna recepción vigente puede cerrarse con faltante. Completar todas las líneas mediante recepción la cierra automáticamente. Cerrada y cancelada son finales. Una anulación de recepción no reabre una orden cerrada.

Lo recibido se deriva de las recepciones vigentes, por línea. No se resta un importe recibido real al total esperado para presentar una falsa deuda o un importe pendiente: el costo recibido puede cambiar. La pantalla muestra cantidades pendientes y distingue total esperado de costo efectivamente recibido.

## Escenario ficticio común

Miércoles 28/10/2026, 12:30 Buenos Aires. Son propuestas alternativas de revisión; ninguna se guardó en el CRM.

- OC-000057, Nexo Mobile: 3 iPhone 14 128 GB Azul nuevos a USD 500 esperados, total USD 1.500. Creada a las 09:00.
- RC-000091 a las 09:30: 2 equipos a USD 510, total USD 1.020; U-000501/502, IMEI ficticios 350000000005101/102, disponibles. Queda 1 unidad por recibir.
- PP-000073 a las 10:00: USD 300 aplicados a RC-000091; salida registrada ARS 450.000 por transferencia a una tasa ilustrativa de 1.500. Quedan USD 720. No afecta el efectivo de caja.
- RC-000088, Nexo Mobile, del 27/10, vinculada a OC-000052: ARS 120.000, PP-000072 efectivo ARS 30.000; saldo ARS 90.000. Conserva el pago en efectivo del ejemplo V2-10, sin modificarlo.
- Laboratorio Prisma: técnico activo, trabajo reparado OS-000315 por ARS 60.000 a las 10:30 del 28/10; sin pagos. No es una nueva recepción de mercadería.
- A pagar: USD 720 y ARS 150.000; referencia USD 820 a tasa ilustrativa de 1.500. Cuenta Nexo: USD 720 y ARS 90.000; referencia USD 780. Los equivalentes no se suman a los importes nativos.
- Recepción pendiente de revisión del último equipo: costo real USD 505, IMEI ficticio 350000000005103; total USD 505. No tiene número asignado ni existe aún U-000503. Si se confirma, completa la orden.
- Alternativa de pago a cuenta USD 800: cancela USD 720 y deja USD 80 a favor del negocio. Los ARS 90.000 siguen pendientes. No se combina con la anulación alternativa ni se muestra como ya realizado.
- Alternativa sin orden: Accesorios Delta, 20 fundas a ARS 4.000, total ARS 80.000; sin registrar. OC-000056 de Delta es otra orden y no es origen de RC-000088.

Los nombres, números, fechas, cotizaciones y montos son inventados. No se consultó una cotización de mercado.

## Sistema visual, acceso y límites

Se conservan Manrope y los tokens aprobados: fondo #F6F5FB, lateral #F1EEFB, superficies blancas, texto #17142E/#5A5573, bordes #E3DFF0, primario #6D28D9 y selección #EDE7FE. Radios de 12 px y sombras discretas. Usar el logotipo y los iconos originales al implementar; los renders no definen nuevos activos de marca. Botones y fondos planos, aunque la generación introduzca pequeñas variaciones de tono.

Compras, proveedores, costos, pagos y cuentas de proveedores son exclusivos de administración. El agente no accede a ellos; un viewer no recibe una versión con datos parcialmente ocultos de estas pantallas. Técnicos requiere la capacidad de reparaciones. Los accesos y los datos se autorizan también en servidor.

Objetivos de implementación: contraste AA, zoom 200 %, reflujo a 320 px, objetivos táctiles de 44 px, etiquetas persistentes, estado con texto e icono, navegación completa con teclado y foco visible. Diálogos con foco contenido y regreso al disparador; foco inicial en la opción segura. Un error conserva los datos ingresados; la carga o el fallo de cuenta nunca se presentan como deuda cero. Las imágenes no certifican accesibilidad.

Las pestañas, paneles, contadores, filtros y pasos de revisión son propuestas de interfaz. Deben conectarse a las lecturas y escrituras autorizadas, sin suponer que existen nuevos contratos. Los casos de rechazo reutilizan los patrones documentados; no se generó una pantalla independiente por cada error, rol, moneda o página de resultados. No se garantiza cobertura exhaustiva de todos los estados técnicos.

