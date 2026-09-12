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
- **FR-PROD-05**: El estado de stock de un producto se deriva de `quantity_on_hand` vs. `reorder_point`, único umbral (subfase 1.2, D-10): `sin_stock` si `quantity_on_hand = 0`; `bajo_stock` si `0 < quantity_on_hand <= reorder_point`; `disponible` en otro caso.
- **FR-PROD-06**: Un admin puede realizar un ajuste manual de stock (positivo o negativo) indicando motivo; el ajuste se registra como un movimiento de inventario inmutable, que guarda el saldo resultante (`balance_after`), y actualiza el saldo en la misma transacción (subfase 1.2, D-1).
- **FR-PROD-07**: No existe ninguna vía en la aplicación para modificar `quantity_on_hand` sin crear el movimiento de inventario correspondiente.
- **FR-PROD-08**: Un ajuste que dejaría el stock en un valor negativo es rechazado con `BUSINESS_RULE_VIOLATION`, informando el saldo actual y la cantidad solicitada. No hay excepciones: ni por rol, ni por producto, ni por organización ([ADR 0008](../decisions/0008-stock-nunca-negativo.md)).
- **FR-PROD-09**: Cualquier usuario puede consultar el historial completo de movimientos de un producto, ordenado cronológicamente.

## Clientes

- **FR-CLI-01**: Un admin puede crear un cliente con nombre y teléfono; el teléfono es único por organización cuando está presente.
- **FR-CLI-02**: Un admin puede editar y desactivar (borrado lógico) un cliente.
- **FR-CLI-03**: Cualquier usuario puede buscar clientes por nombre o teléfono.
- **FR-CLI-04**: La ficha de un cliente muestra su última interacción (mensaje más reciente en cualquier conversación asociada) y la lista de sus conversaciones.
- **FR-CLI-05**: Los datos personales del cliente mostrados se limitan a los necesarios para operar (minimización): nombre, teléfono, notas operativas; no se exponen campos sensibles no declarados explícitamente como necesarios.
- **FR-CLI-06**: El teléfono completo se expone únicamente a un `admin`. A un `viewer` se le entrega enmascarado (últimos 4 dígitos) desde el servidor, tanto en la lista como en el detalle; la respuesta que recibe no contiene el número completo. La búsqueda por teléfono completo funciona para ambos roles, porque el filtro se resuelve en la consulta (subfase 1.3, D-1).
- **FR-CLI-07**: Un cliente se identifica de forma única por `(organization_id, phone_e164)`. No existe ningún otro identificador de negocio en el MVP ([ADR 0007](../decisions/0007-identificador-de-cliente-solo-telefono.md)).

## Conversaciones y mensajes

- **FR-CONV-01**: Cualquier usuario puede listar conversaciones filtrando por período, estado, canal y cliente. La lista no incluye el contenido de ningún mensaje, ni truncado: la consulta no trae el cuerpo del último mensaje (subfase 1.3, D-2).
- **FR-CONV-02**: El detalle de una conversación muestra el timeline cronológico de mensajes, diferenciando visualmente entrantes y salientes.
- **FR-CONV-03**: Una conversación tiene un estado (`open`, `pending`, `closed`) consultable y filtrable. Un admin puede cambiarlo manualmente y el cambio queda auditado.
- **FR-CONV-04**: Existe un contrato de ingestión (endpoint y esquema de payload versionados), documentado y probado con datos sintéticos, que crea conversaciones y mensajes de forma idempotente por `(organization_id, source, external_ref)` del evento. Reenviar el mismo evento no duplica datos. Reenviarlo con otro contenido se rechaza con `CONFLICT` sin modificar nada.
- **FR-CONV-05**: El contrato de ingestión no está conectado a ningún origen de tráfico real en el MVP; solo se ejercita con fixtures y tests.

## Métricas

- **FR-MET-01**: El dashboard muestra, como mínimo, las métricas definidas en [analytics/MetricsCatalog.md](../analytics/MetricsCatalog.md), cada una calculada según su fórmula documentada.
- **FR-MET-02**: Cada métrica es filtrable por rango de fechas; el rango por defecto y la zona horaria de visualización están definidos en el catálogo de métricas. La zona horaria sale de `organizations.timezone`, cuyo valor por defecto es `America/Argentina/Buenos_Aires` y que en el MVP no se edita por pantalla (subfase 1.3, D-5).
- **FR-MET-03**: Las métricas se recalculan sobre datos transaccionales vigentes; no existe un valor de métrica editable manualmente.

## Auditoría

- **FR-AUD-01**: Generan un registro de auditoría con actor, acción, entidad y diferencia de datos:
  - toda creación, edición, desactivación o reactivación de un producto o un cliente;
  - todo ajuste de stock;
  - todo cambio de estado de una conversación;
  - todo cambio de rol o de estado de un miembro de la organización.
- **FR-AUD-02**: Un admin puede consultar el historial de auditoría de una entidad específica (producto, cliente), en las pantallas 4 y 7 (subfase 1.2, D-8).
