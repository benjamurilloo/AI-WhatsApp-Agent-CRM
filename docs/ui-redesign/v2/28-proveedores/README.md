# Proveedores, técnicos y estado de cuenta — V2-11

28 de octubre de 2026. Cuatro imágenes del [lote V2-11](../25-compras/README.md). Técnicos conserva la entidad proveedor definida en [V2-06](../16-tecnicos/README.md).

| # | Vista | Imagen |
|---|---|---|
| 11 | Cuenta proveedor | [Ver](desktop/02-estado-cuenta-v2.png) |
| 13 | Proveedores | [Ver](desktop/01-proveedores-v2.png) |
| 14 | Técnico proveedor | [Ver](desktop/03-ficha-tecnico-v2.png) |
| 15 | Alta proveedor | [Ver](desktop/04-alta-edicion-proveedor-v2.png) |

## Ficha única y acciones

Listado alfabético con nombre, estado, tipo y contactos disponibles; búsqueda por nombre y filtro de activos/inactivos/todos. El filtro por tipo es una mejora de presentación propuesta. No se inventan proveedores duplicados para los técnicos ni se fusionan proveedores con clientes por compartir teléfono.

Nombre obligatorio hasta 120 caracteres, único sin distinguir mayúsculas; teléfono, email y CUIT opcionales. CUIT normalizado, 11 dígitos con verificador y único si existe. La unicidad alcanza a inactivos: ante duplicado se invita a abrir/reactivar la ficha existente, no a borrar la anterior. Teléfono compartido entre proveedores es admisible. Sin notas, dirección, condición fiscal ni nuevos campos de negocio.

Alta y edición comparten estructura y etiquetas. La marca Es técnico requiere administración y capacidad repairs. Integrarla en el formulario es una propuesta: actualmente se cambia desde una acción separada en la ficha. Su implementación debe resolver ambos resultados sin afirmar que se guardó la marca si falla; crear el proveedor no implica que ya sea técnico. El checkbox del render no prueba una operación atómica existente.

Desactivar no borra historial ni cancela deuda; impide nuevas órdenes/recepciones y selección para nuevos trabajos. Puede reactivarse y seguir recibiendo pagos. Quitar la marca de técnico no elimina los trabajos ni sus cargos anteriores.

La ficha del proveedor comercial prioriza Nueva orden si está activo, con Pago a cuenta secundario. Para el técnico, que suele resolver cargos de trabajos, se prioriza Registrar pago a cuenta y Ver reparaciones contextual. Editar y Más quedan agrupados en la cabecera. Actividad e historia se consultan aparte de los formularios operativos.

## Cuenta de proveedor y técnico

Resumen por moneda, imputación actual por comprobante y lista de documentos imprimible. No hay saldo corrido histórico por fila: la imputación se deriva con la cuenta actual. Los documentos anulados se conservan enlazados con su anulación, pero no generan deuda vigente. Los pagos directos van a su recepción y los libres a los comprobantes más viejos en la misma moneda; excedente a favor del negocio.

Los trabajos reparados de un técnico generan cargos en su moneda y fecha de reparación, sin inventar una recepción de mercadería. Se pagan a cuenta del proveedor, sin agregar un destino de pago directo a OS. La ficha de Laboratorio Prisma muestra OS-000315 reparada y ARS 60.000 pendientes. Abrir el trabajo respeta permisos y lleva a Reparaciones. El usuario viewer no ve técnico ni costo técnico en ese módulo y tampoco puede entrar a Compras.

En estado de cuenta se separan Debe, Haber, saldo a pagar/favor y los importes originales. Con más de 500 documentos se muestran los 500 más nuevos con aviso, manteniendo el resumen completo, no un saldo derivado solo del recorte. Imprimir excluye navegación, botones y ayudas de operación, conserva fecha de generación, moneda y referencias necesarias. No se realiza un envío automático al proveedor.

## Sistema visual, acceso y límites

Se conservan Manrope y los tokens aprobados: fondo #F6F5FB, lateral #F1EEFB, superficies blancas, texto #17142E/#5A5573, bordes #E3DFF0, primario #6D28D9 y selección #EDE7FE. Radios de 12 px y sombras discretas. Usar el logotipo y los iconos originales al implementar; los renders no definen nuevos activos de marca. Botones y fondos planos, aunque la generación introduzca pequeñas variaciones de tono.

Compras, proveedores, costos, pagos y cuentas de proveedores son exclusivos de administración. El agente no accede a ellos; un viewer no recibe una versión con datos parcialmente ocultos de estas pantallas. Técnicos requiere la capacidad de reparaciones. Los accesos y los datos se autorizan también en servidor.

Objetivos de implementación: contraste AA, zoom 200 %, reflujo a 320 px, objetivos táctiles de 44 px, etiquetas persistentes, estado con texto e icono, navegación completa con teclado y foco visible. Diálogos con foco contenido y regreso al disparador; foco inicial en la opción segura. Un error conserva los datos ingresados; la carga o el fallo de cuenta nunca se presentan como deuda cero. Las imágenes no certifican accesibilidad.

Las pestañas, paneles, contadores, filtros y pasos de revisión son propuestas de interfaz. Deben conectarse a las lecturas y escrituras autorizadas, sin suponer que existen nuevos contratos. Los casos de rechazo reutilizan los patrones documentados; no se generó una pantalla independiente por cada error, rol, moneda o página de resultados. No se garantiza cobertura exhaustiva de todos los estados técnicos.

