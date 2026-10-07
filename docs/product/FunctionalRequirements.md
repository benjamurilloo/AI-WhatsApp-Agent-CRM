# Requisitos Funcionales

**Estado: diseñado.** Cada requisito debe ser verificable mediante una prueba automatizada o manual concreta. IDs estables para trazabilidad con el backlog.

## Organizaciones, usuarios y roles

- **FR-ORG-01**: En el MVP un usuario pertenece a una sola organización y solo puede ver y operar datos de ella ([ADR 0010](../decisions/0010-un-usuario-una-organizacion-en-el-mvp.md)).
- **FR-ORG-02**: Un admin puede invitar/crear usuarios dentro de su organización y asignarles rol `admin` o `viewer`. Se satisface con la pantalla de usuarios y roles, que entra al MVP y queda auditada (subfase 1.3, D-3). Un script de administración no cumple este requisito, porque no registra quién ejecutó el cambio. El usuario creado recibe una contraseña inicial de un solo uso y debe definir una nueva en su primer ingreso, antes de acceder a cualquier ruta protegida (subfase 1.2, D-6). No se puede quitar el rol ni desactivar al último `admin` de la organización (`BUSINESS_RULE_VIOLATION`).
- **FR-ORG-03**: Un usuario sin sesión válida es redirigido a login en cualquier ruta protegida.

## Productos e inventario

- **FR-PROD-01**: Un admin puede crear un producto con SKU único por organización, nombre, unidad y punto de reposición.
- **FR-PROD-02**: Un admin puede editar los datos de un producto existente, con el cambio auditado.
- **FR-PROD-03**: Un admin puede desactivar (borrado lógico) un producto; un producto desactivado no aparece en búsquedas por defecto ni puede recibir ajustes de stock nuevos.
- **FR-PROD-04**: Cualquier usuario puede buscar productos por nombre o SKU y filtrar por estado de stock (disponible, bajo stock, sin stock).
  - *Enmendado el 2026-09-24 por la 11.1* ([brief-11.1](../decisions/brief-11.1-catalogo-comercial.md), D-4): la parte de **búsqueda** la reemplaza FR-PROD-11, que busca por palabras sueltas sobre nombre, marca y categoría. El filtro por estado de stock sigue como está escrito arriba.
- **FR-PROD-05**: El estado de stock de un producto se deriva de `quantity_on_hand` vs. `reorder_point`, único umbral (subfase 1.2, D-10): `sin_stock` si `quantity_on_hand = 0`; `bajo_stock` si `0 < quantity_on_hand <= reorder_point`; `disponible` en otro caso.
- **FR-PROD-06**: Un admin puede realizar un ajuste manual de stock (positivo o negativo) indicando motivo; el ajuste se registra como un movimiento de inventario inmutable, que guarda el saldo resultante (`balance_after`), y actualiza el saldo en la misma transacción (subfase 1.2, D-1).
- **FR-PROD-07**: No existe ninguna vía en la aplicación para modificar `quantity_on_hand` sin crear el movimiento de inventario correspondiente.
- **FR-PROD-08**: Un ajuste que dejaría el stock en un valor negativo es rechazado con `BUSINESS_RULE_VIOLATION`, informando el saldo actual y la cantidad solicitada. No hay excepciones: ni por rol, ni por producto, ni por organización ([ADR 0008](../decisions/0008-stock-nunca-negativo.md)).
- **FR-PROD-09**: Cualquier usuario puede consultar el historial completo de movimientos de un producto, ordenado cronológicamente.

Agregados en la Fase 11, catálogo comercial ([brief-11.1](../decisions/brief-11.1-catalogo-comercial.md)). Desde la 11.1, el identificador de cada requisito nuevo aparece en el caso de test que lo prueba ([EngineeringStandards](../development/EngineeringStandards.md)).

- **FR-PROD-10**: Un admin puede registrar la marca, la categoría y la condición (nuevo o reacondicionado) de un producto, con el cambio auditado. Marca y categoría son texto libre y opcional; la condición es obligatoria y, si no se indica al crear por SQL, es «nuevo».
- **FR-PROD-11**: Cualquier usuario puede buscar productos por palabras sueltas sobre nombre, marca y categoría, sin distinguir mayúsculas ni acentos, con todas las palabras a la vez y cada una como comienzo de una palabra del producto; o por SKU exacto. No encuentra por el medio de una palabra ni reduce plurales.
- **FR-PROD-12**: Un admin puede fijar el precio de venta de un producto activo, con monto y moneda (ISO 4217, hasta dos decimales). El precio vigente es el último fijado; un producto sin precios no tiene precio. Cualquier usuario ve el precio vigente y el historial completo, con fecha y autor. Fijar un precio igual al vigente no cambia nada, y si el vigente cambió mientras se completaba el formulario, la respuesta es `CONFLICT` y se pide confirmar de nuevo.
- **FR-PROD-13**: No existe ninguna vía en la aplicación para modificar ni borrar un precio ya fijado. Un precio nuevo se agrega y el anterior queda en el historial.

## Clientes

- **FR-CLI-01**: Un admin puede crear un cliente con nombre y teléfono; el teléfono es único por organización cuando está presente.
- **FR-CLI-02**: Un admin puede editar y desactivar (borrado lógico) un cliente.
- **FR-CLI-03**: Cualquier usuario puede buscar clientes por nombre o teléfono.
- **FR-CLI-04**: La ficha de un cliente muestra su última interacción (mensaje más reciente en cualquier conversación asociada) y la lista de sus conversaciones.
- **FR-CLI-05**: Los datos personales del cliente mostrados se limitan a los necesarios para operar (minimización): nombre, teléfono, notas operativas; no se exponen campos sensibles no declarados explícitamente como necesarios.
- **FR-CLI-06**: El teléfono completo se expone únicamente a un `admin`. A un `viewer` se le entrega enmascarado (últimos 4 dígitos) desde el servidor, tanto en la lista como en el detalle; la respuesta que recibe no contiene el número completo. La búsqueda por teléfono completo funciona para ambos roles, porque el filtro se resuelve en la consulta (subfase 1.3, D-1).
- **FR-CLI-07**: Un cliente se identifica de forma única por `(organization_id, phone_e164)`. No existe ningún otro identificador de negocio en el MVP ([ADR 0007](../decisions/0007-identificador-de-cliente-solo-telefono.md)).
- **FR-CLI-08** *(16.1, [brief](../decisions/brief-16.1-etiquetas-de-clientes.md))*: Un admin administra el catálogo de etiquetas de clientes de su organización: crea, renombra, cambia el color (uno de seis), desactiva y reactiva, con el nombre único sin distinguir mayúsculas y hasta 50 etiquetas activas por organización. Con el catálogo vacío puede crear las cuatro sugeridas («Interesado», «Quiere señar», «Reclamo» y «No interesado»). Cada cambio queda auditado. Ninguna etiqueta se borra ni dispara nada: «Quiere señar» no es un pago.
- **FR-CLI-09** *(16.1)*: Un admin pone y quita etiquetas activas en un cliente, hasta 10 por cliente. Cada cambio queda auditado en el historial del cliente, con el nombre de la etiqueta.
- **FR-CLI-10** *(16.1)*: Cualquier usuario ve las etiquetas de cada cliente en la lista y en la ficha, y filtra la lista por una etiqueta activa. Una etiqueta desactivada sigue en los clientes que la tienen, marcada como inactiva, y no se ofrece para agregar ni para filtrar.
- **FR-CLI-11** *(16.2, [brief](../decisions/brief-16.2-etiquetas-puestas-por-el-agente.md))*: Un sistema externo con una credencial de ingestión de una organización pone y quita etiquetas del catálogo en un cliente de esa organización, con los eventos `client.tag_added` y `client.tag_removed` del [contrato de ingestión v2](../contracts/ingestion-v2.md): el cliente por teléfono, que tiene que existir, y la etiqueta por su id, que lee con una credencial de lectura en `GET /api/read/v1/client-tags`. Las reglas son las de la ficha (FR-CLI-09): solo activas para poner y hasta 10 por cliente. Cada cambio queda en el historial del cliente con la credencial como autor (FR-AUD-03). El servicio nunca crea, renombra ni desactiva etiquetas, y la respuesta no trae datos del cliente.

## Conversaciones y mensajes

- **FR-CONV-01**: Cualquier usuario puede listar conversaciones filtrando por período, estado, canal y cliente. La lista no incluye el contenido de ningún mensaje, ni truncado: la consulta no trae el cuerpo del último mensaje (subfase 1.3, D-2).
- **FR-CONV-02**: El detalle de una conversación muestra el timeline cronológico de mensajes, diferenciando visualmente entrantes y salientes.
- **FR-CONV-03**: Una conversación tiene un estado (`open`, `pending`, `closed`) consultable y filtrable. Un admin puede cambiarlo manualmente y el cambio queda auditado. *Precisado el 2026-09-25 por la 12.2 ([brief-12.2](../decisions/brief-12.2-conversacion-vigente-y-derivacion.md), D-4)*: `pending` significa **«espera a una persona»**, y es el estado al que la deriva un servicio (FR-API-06).
- **FR-CONV-04**: Existe un contrato de ingestión (endpoint y esquema de payload versionados), documentado y probado con datos sintéticos, que crea conversaciones y mensajes de forma idempotente por `(organization_id, source, external_ref)` del evento. Reenviar el mismo evento no duplica datos. Reenviarlo con otro contenido se rechaza con `CONFLICT` sin modificar nada.
- **FR-CONV-05**: El contrato de ingestión no está conectado a ningún origen de tráfico real en el MVP; solo se ejercita con fixtures y tests. **Enmendado el 2026-09-23 por el [ADR 0014](../decisions/0014-el-agente-de-whatsapp-como-consumidor-del-crm.md)**: el requisito rige **para el MVP** y se cumplió ([evaluación 10.1](../decisions/evaluacion-10.1-mvp.md)). En las fases de integración, el contrato puede recibir tráfico de un emisor real **solo** detrás del modo de prueba (`INGESTION_ENABLED` y la allowlist de credenciales) y con el gate de la fase que lo conecta, que incluye validar la autenticación y los fixtures con tráfico del propio emisor ([IntegrationBoundaries](../architecture/IntegrationBoundaries.md)).

## Información del negocio

Desde la subfase 11.2 ([brief-11.2](../decisions/brief-11.2-informacion-del-negocio.md)). Es lo que el agente de WhatsApp va a leer por el contrato de la 11.3.

- **FR-INFO-01**: Un admin puede crear, editar, desactivar y reactivar entradas de información del negocio, cada una con título, categoría, contenido y vigencia. Ninguna entrada se borra. El título es único por organización, sin distinguir mayúsculas. Cada cambio queda auditado.
- **FR-INFO-02**: Cualquier usuario puede listar las entradas, filtrarlas por estado y buscarlas por palabras sueltas sobre título, categoría y contenido, sin distinguir mayúsculas ni acentos. Una coincidencia en el título sale antes que una solo en el contenido.
- **FR-INFO-03**: Una entrada está **vigente** si está activa y el día de hoy, en la zona horaria de la organización, cae dentro de su vigencia, cuyas dos fechas son opcionales e inclusivas. Las demás están programadas, vencidas o inactivas. Las lecturas de vigentes no devuelven ninguna otra.

## API de lectura para sistemas externos

Agregada el 2026-09-24 por la 11.3 ([brief-11.3](../decisions/brief-11.3-api-de-lectura.md)), con el [contrato de lectura v1](../contracts/read-v1.md). El consumidor previsto es el agente de WhatsApp ([ADR 0014](../decisions/0014-el-agente-de-whatsapp-como-consumidor-del-crm.md)); ninguno está conectado.

- **FR-API-01**: Un sistema externo con una credencial de lectura de una organización puede buscar por palabras los productos activos de esa organización, y leer uno por su id, con su precio vigente y su estado de stock, sin la cantidad. Nunca recibe un producto inactivo ni de otra organización.
- **FR-API-02**: Un sistema externo con una credencial de lectura de una organización puede leer las entradas de información del negocio vigentes hoy en la zona horaria de esa organización, con o sin texto de búsqueda. Nunca recibe una entrada inactiva, programada, vencida ni de otra organización.
- **FR-API-03**: La lectura exige una credencial de servicio de alcance `read` (*precisado el 2026-09-26 por la 12.4*: salvo el historial, que exige `context`; ver FR-API-08), no revocada y en la lista del modo de prueba, con un límite de pedidos por minuto. Una credencial de lectura no escribe, y una sesión de usuario no autentica la lectura. Cada respuesta queda en el log, y nunca con el texto buscado. Lleva el identificador de correlación del emisor desde que se valida, después de la credencial, la lista y el límite: un rechazo anterior no lo tiene.
- **FR-API-04** (agregado el 2026-09-25 por la 12.1): un sistema externo con una credencial de ingestión de una organización puede resolver el cliente de un teléfono, con el evento `client.resolved` del [contrato de ingestión v1](../contracts/ingestion-v1.md). Si el teléfono es de un cliente de la organización, activo o no, lo recibe sin que se escriba nada. Si no, se crea con el nombre propuesto o «Sin nombre», auditado con la credencial como actor (FR-AUD-03). Reenviar el mismo evento no crea otro cliente, y la respuesta nunca trae el teléfono.
- **FR-API-05** (agregado el 2026-09-25 por la 12.2): un sistema externo con una credencial de ingestión de una organización puede registrar el mensaje entrante de un cliente de esa organización con el evento `conversation.resolved` del [contrato de ingestión v1](../contracts/ingestion-v1.md). El mensaje entra en la conversación vigente del cliente —abierta o pendiente, y a como mucho 24 horas del mensaje: su último mensaje, hacia atrás, y su inicio, hacia adelante; entre varias, la más cercana— o en una nueva que nace con él, y la respuesta trae la referencia de esa conversación. Una conversación cerrada nunca recibe el mensaje ni se reabre. Dos mensajes simultáneos del mismo cliente no abren dos conversaciones, y reenviar el mismo evento no registra otro mensaje. Un teléfono sin cliente se rechaza. La respuesta nunca trae el teléfono ni el texto.
- **FR-API-06** (agregado el 2026-09-25 por la 12.2): un sistema externo con una credencial de ingestión de una organización puede derivar una conversación de esa organización a una persona, con el evento `conversation.escalated` del [contrato de ingestión v1](../contracts/ingestion-v1.md). Una conversación abierta pasa a `pending` y el cambio se audita con la credencial como actor (FR-AUD-03); una que ya está `pending` no cambia ni se audita. Una conversación cerrada o inexistente se rechaza con su regla, y el servicio nunca cierra ni reabre. Reenviar el mismo evento no audita otra vez.
- **FR-API-07** (agregado el 2026-09-25 por la 12.3): un sistema externo con una credencial de ingestión puede usar el [contrato de ingestión v2](../contracts/ingestion-v2.md), con los mismos cuatro eventos que v1, el mismo registro de idempotencia y el mismo límite de tasa. Cada mensaje registra su **tipo original** (texto, audio, imagen, video, documento u otro) y cada salida, **quién la envió** (el agente o una persona); la pantalla 9 los rotula. Un `CONFLICT` dice por qué, también al reenviar, para que el emisor sepa si su mensaje quedó guardado. El emisor puede mandar un identificador de correlación, que el CRM registra y devuelve en cada respuesta, incluido el límite de tasa. Un nombre de cliente que es el teléfono se rechaza. v1 no cambia: sus mensajes quedan sin tipo ni autor.
- **FR-API-08** (agregado el 2026-09-26 por la 12.4, [brief-12.4](../decisions/brief-12.4-historial-y-memorias.md)): un sistema externo con una credencial de alcance `context` de una organización puede leer los **últimos N mensajes** de una conversación de esa organización, por la referencia que le devolvió `conversation.resolved`, con el [contrato de lectura v1](../contracts/read-v1.md). Los recibe del más viejo al más nuevo, cada uno con su dirección, su tipo, su autor, su hora y su texto; nunca los primeros N. Una conversación de otra organización o inexistente da la misma respuesta. Una credencial de otro alcance no lee el historial, y una `context` no lee otra superficie. El log nunca registra la referencia ni el texto.

## Métricas

- **FR-MET-01**: El dashboard muestra, como mínimo, las métricas definidas en [analytics/MetricsCatalog.md](../analytics/MetricsCatalog.md), cada una calculada según su fórmula documentada.
- **FR-MET-02**: Cada métrica es filtrable por rango de fechas; el rango por defecto y la zona horaria de visualización están definidos en el catálogo de métricas. La zona horaria sale de `organizations.timezone`, cuyo valor por defecto es `America/Argentina/Buenos_Aires` y que en el MVP no se edita por pantalla (subfase 1.3, D-5).
- **FR-MET-03**: Las métricas se recalculan sobre datos transaccionales vigentes; no existe un valor de métrica editable manualmente.

## Auditoría

- **FR-AUD-01**: Generan un registro de auditoría con actor, acción, entidad y diferencia de datos:
  - toda creación, edición, desactivación o reactivación de un producto o un cliente;
  - todo ajuste de stock;
  - todo cambio de estado de una conversación;
  - todo cambio de rol o de estado de un miembro de la organización;
  - toda creación, edición, desactivación o reactivación de una entrada de información del negocio (agregado el 2026-09-24 por la 11.2, FR-INFO-01).
- **FR-AUD-02**: Un admin puede consultar el historial de auditoría de una entidad específica (producto, cliente), en las pantallas 4 y 7 (subfase 1.2, D-8). Desde la 11.2, también el de una entrada de información del negocio, en la pantalla 12.
- **FR-AUD-03** (agregado el 2026-09-25 por la 12.1, D-3 y D-4): un cambio hecho por un servicio autenticado queda auditado con la **credencial de servicio** como actor, no con un usuario humano. Cada registro tiene exactamente un actor, y la credencial es de la misma organización. En el historial, ese autor se muestra como «Servicio · &lt;emisor&gt;».
