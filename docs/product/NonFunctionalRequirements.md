# Requisitos No Funcionales

**Estado: diseñado.**

## Seguridad

- Contraseñas hasheadas con un algoritmo de hashing lento y con sal (argon2id o bcrypt con costo adecuado), nunca en texto plano ni con hash rápido (SHA-256 simple).
- Sesiones server-side con cookies `HttpOnly`, `Secure` (en todo entorno con TLS) y `SameSite=Lax` o `Strict`.
- Autorización evaluada en el servidor en cada operación, nunca solo ocultando UI en el cliente.
- Todo query de datos de negocio filtra por `organization_id` de la sesión activa; no existe una vía de acceso cross-organización.

## Privacidad

- Minimización de datos personales de clientes: solo se almacenan y muestran los campos necesarios para operar (ver [FR-CLI-05](FunctionalRequirements.md)).
- Los logs de aplicación no contienen cuerpo de mensajes ni PII innecesaria — solo identificadores.
- Existe un mecanismo (aunque sea manual en el MVP) para exportar o eliminar los datos de un cliente a pedido.

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
