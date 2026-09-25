# Personas

**Estado: contrastado con el dueño del negocio, no con un operador real.** Hasta el 2026-09-25 eran supuestos (estado *diseñado*). El piloto de la 11.4 los contrastó con el conocimiento del dueño sobre su operación: `admin` quedó **confirmado**, `viewer` quedó **confirmado como necesidad futura** y el enmascarado del teléfono para `viewer` quedó **refutado**. El resultado y su límite están en [§Resultado del piloto 11.4](#resultado-del-piloto-114-o-36). La observación de un operador real queda para la 13.5.

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

## Resultado del piloto 11.4 (O-36)

El 2026-09-25, en la ventana de observación de la 11.4, el dueño del negocio recorrió el guion con las dos personas en staging y contestó una pregunta por supuesto. Las respuestas textuales y el triage están en [notas-piloto-11.4.md](../decisions/notas-piloto-11.4.md).

| Supuesto | Resultado | Respuesta |
| --- | --- | --- |
| Existe un `admin` que mantiene catálogo, stock e información | **Confirmado** | Hoy opera el backoffice **solo el dueño**, con rol `admin`. Él cambia los precios, ajusta el stock y edita la información del negocio (P-1, P-4 y P-5). Los clientes no se preguntaron |
| Existe alguien que solo necesita leer (`viewer`) | **Confirmado como necesidad futura**, sin persona real hoy | «va a ser necesario en caso de tener algun empleado que solo necesite chequear precios o información sin requerir editar nada» (P-2) |
| El `viewer` ve el precio | **Confirmado** | P-3 |
| El `viewer` ve el teléfono del cliente enmascarado (FR-CLI-06) | **Refutado** | «debería poder ver precio y telefono completo» (P-3). **No se cambió**: la regla afloja la privacidad y hoy no hay ningún `viewer` real. Se reabre junto con la persona intermedia |
| Dos roles alcanzan | **Refutado para el futuro** | Hará falta un **rol intermedio** que pueda «realizar ventas, agendar nuevos clientes, etc.», sin editar lo que es del `admin` (P-2). Es una persona futura: se diseña cuando el negocio sume un empleado. La parte de ventas espera al ERP (`Scope.md`) |

**Límite declarado** (brief-11.4, D-4): los datos eran sintéticos y la misma persona hizo de las dos personas. Esto valida las personas **contra el conocimiento del dueño sobre su operación**, no contra la observación de un operador real. Esa observación queda para la **13.5**, con datos reales.
