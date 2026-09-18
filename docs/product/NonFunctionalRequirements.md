# Requisitos No Funcionales

**Estado: los requisitos de seguridad y privacidad se revisaron contra el código el 2026-09-18** ([brief-8.4](../decisions/brief-8.4-revision-de-seguridad.md), autoevaluación); los de rendimiento se miden en la 8.5. El resto sigue **diseñado**, y cada sección dice qué alcanzó.

## Seguridad

- Contraseñas hasheadas con un algoritmo de hashing lento y con sal (argon2id o bcrypt con costo adecuado), nunca en texto plano ni con hash rápido (SHA-256 simple).
- Sesiones server-side con cookies `HttpOnly`, `Secure` (en todo entorno con TLS) y `SameSite=Lax` o `Strict`.
- Autorización evaluada en el servidor en cada operación, nunca solo ocultando UI en el cliente.
- Todo query de datos de negocio filtra por `organization_id` de la sesión activa; no existe una vía de acceso cross-organización. **Verificado en la 8.4**, con una excepción declarada: las tablas de `auth` son globales por diseño y `findUserSummaries` lee usuarios por id sin filtrar, hoy solo con ids ya filtrados por sus llamadores (H-1, en [Risks](../planning/Risks.md)).

## Privacidad

- Minimización de datos personales de clientes: solo se almacenan y muestran los campos necesarios para operar (ver [FR-CLI-05](FunctionalRequirements.md)).
- Los logs de aplicación no contienen cuerpo de mensajes ni PII innecesaria — solo identificadores.
- Existe un mecanismo (aunque sea manual en el MVP) para exportar o eliminar los datos de un cliente a pedido. **Cumplido en la 8.2** con el runbook [datos-de-un-cliente](../runbooks/datos-de-un-cliente.md) y sus dos scripts, con una precisión que este requisito no anticipaba: la exportación es completa, pero **la eliminación es parcial para un cliente con conversaciones**, porque `messages` y `audit_logs` son de solo inserción y la cadena de claves foráneas está cerrada. Para ese caso el procedimiento minimiza la ficha —teléfono, nombre y notas— y declara lo retenido. Un borrado real exige revisar el [ADR 0013](../decisions/0013-rol-de-aplicacion-y-tablas-de-solo-insercion.md) y está en [Risks](../planning/Risks.md).

## Auditabilidad

- Cambios sensibles (productos, clientes, stock) quedan auditados con actor y timestamp, de forma inmutable.
- Los movimientos de inventario nunca se editan ni se borran; una corrección se hace con un movimiento de ajuste nuevo.

## Rendimiento (MVP, sin tráfico productivo)

- Listados paginados de productos, clientes y conversaciones responden en desarrollo/staging en tiempo interactivo (objetivo de referencia, no un SLA productivo) con datasets sintéticos de hasta ~10.000 filas por organización.
- Sin objetivo de escalabilidad masiva en el MVP; el diseño no debe impedirla, pero no se optimiza prematuramente por ella.

## Disponibilidad

- No hay SLA de disponibilidad en el MVP: no hay tráfico productivo. Staging puede tener downtime sin impacto de negocio.

## Observabilidad

- Logs estructurados por request con `organization_id`, `user_id` (cuando aplique) y `request_id`, sin contenido de negocio sensible.
- Métrica técnica de errores de ingestión visible en el dashboard cuando el contrato esté activo.

## Portabilidad y evolución

- El código de acceso a datos se organiza para que un cambio de proveedor de hosting o de motor de base de datos secundario (ej. cache) no requiera reescribir la lógica de dominio.
- El modelo de datos no impide agregar módulos futuros (ventas, compras) sin romper las tablas existentes de `clients`, `products`, `organizations`.

## Accesibilidad

- Contraste de color conforme a WCAG AA en los textos e indicadores de estado (disponible/bajo stock/sin stock no dependen solo del color).
- Navegación por teclado en formularios y tablas principales.
- Etiquetas accesibles (`label`, `aria-*`) en campos de formulario y controles de filtro.

## Retención y backups

- Se define una política de retención de mensajes antes de conectar tráfico real (pendiente, ver [planning/Risks.md](../planning/Risks.md)).
- Backups lógicos automáticos desde que exista un entorno de staging persistente, con prueba periódica de restauración (ver [architecture/SecurityModel.md](../architecture/SecurityModel.md)).

## Separación de entornos

- Desarrollo, test, staging y producción usan bases de datos y secretos completamente separados; ningún entorno no productivo tiene acceso a datos reales porque, en el MVP, no existen datos reales.
