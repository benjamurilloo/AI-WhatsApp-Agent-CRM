# Personas

**Estado: diseñado.** Basado en supuestos razonables sobre el uso del backoffice; falta validación directa con el dueño del negocio (ver preguntas abiertas en [planning/Risks.md](../planning/Risks.md)).

## Admin de organización (`admin`)

- **Objetivo**: mantener el catálogo y la cartera de clientes correctos, y decidir sobre stock.
- **Permisos**: CRUD completo de productos y clientes, ajustes de inventario, alta/gestión de usuarios de su organización, acceso completo al dashboard de métricas.
- **Dolor actual**: en Airtable, corregir un dato no deja rastro claro de quién lo cambió ni por qué; el stock se edita directamente sin historial confiable.
- **Necesita del CRM**: certeza de que cada cambio de stock queda registrado y es reconstruible; no perder tiempo buscando en múltiples vistas de Airtable.

## Operador/consulta (`viewer`)

- **Objetivo**: consultar información para atender clientes o reportar al admin, sin capacidad de alterar datos críticos.
- **Permisos**: lectura de productos, clientes, conversaciones, mensajes y métricas. Sin edición, sin ajustes de stock, sin gestión de usuarios.
- **Dolor actual**: hoy cualquiera con acceso a Airtable puede editar cualquier campo, incluidos datos sensibles de stock o clientes.
- **Necesita del CRM**: ver lo que necesita para su trabajo sin riesgo de romper datos que no le corresponde tocar.

## Fuera de alcance de personas para el MVP

No se modela un rol de "cliente final" con acceso propio (los clientes no inician sesión en este sistema), ni un rol de integración de sistemas externos con permisos propios — la ingestión futura se autentica por un mecanismo de servicio a servicio definido en [architecture/SecurityModel.md](../architecture/SecurityModel.md), no como una persona de usuario.
