# Alcance

**Estado: diseñado.** **Enmendado el 2026-09-23 por el [ADR 0014](../decisions/0014-el-agente-de-whatsapp-como-consumidor-del-crm.md)**: el alcance del MVP no cambia —se evaluó en la [subfase 10.1](../decisions/evaluacion-10.1-mvp.md) tal como estaba—, pero dos exclusiones dejan de ser permanentes y hay una sección nueva, [§Después del MVP](#después-del-mvp-integración-con-el-agente-de-whatsapp). El texto anterior se conserva tachado.

## Dentro del MVP

| Módulo | Incluye |
|---|---|
| Organizaciones y usuarios | Alta de organización, usuarios, roles `admin`/`viewer`, sesión segura |
| Productos e inventario | CRUD (sin borrado físico) de productos, stock por producto, punto de reposición, estados derivados, ajustes manuales con movimiento inmutable |
| Clientes | CRUD (sin borrado físico), búsqueda, última interacción, conversaciones relacionadas |
| Conversaciones y mensajes | Consulta, filtros, timeline; contrato de ingestión idempotente diseñado y probado con datos sintéticos, **no conectado a tráfico real** |
| Métricas de WhatsApp | Dashboard con fórmulas auditables calculadas desde datos transaccionales |
| Seguridad base | Auth por sesión, autorización server-side, aislamiento por organización, CSRF/XSS, rate limiting en login e ingestión, auditoría de cambios sensibles |

## Explícitamente fuera del MVP

- Ventas, compras, proveedores, pagos, cuentas de caja, contabilidad. *Siguen fuera del MVP; desde el [ADR 0016](../decisions/0016-el-crm-se-amplia-hacia-un-erp-por-fases.md) (2026-10-05) entran por las fases del ERP, abajo.*
- Cualquier tabla o módulo "preparado para el futuro ERP" sin uso en el MVP.
- SDK, adaptadores, IDs, variables de entorno o sincronización con Airtable, en cualquier forma.
- Dependencia técnica o arquitectónica del repositorio del agente de WhatsApp.
- Conexión a tráfico productivo real (WhatsApp real, clientes reales). *Sigue fuera del MVP; entra en las fases de integración (ADR 0014), detrás del modo de prueba y con el gate de la fase que la conecte.*
- Migración de datos del sistema legado — ~~es un proyecto futuro separado, fuera de este backlog~~. *Desde el ADR 0014 es la última fase de integración de este repositorio, por CSV exportado.*
- Multi-canal implementado — el modelo se diseña extensible a canales futuros, pero el MVP solo opera con el canal `whatsapp`.
- Notificaciones push/email, exportaciones masivas avanzadas, reportes personalizables por el usuario.

## Criterio de exclusión

Si una funcionalidad no es necesaria para que un administrador humano pueda operar productos, clientes, conversaciones de solo lectura y ver métricas de WhatsApp con datos sintéticos, no entra al MVP. Ante la duda, se documenta como pregunta abierta en [planning/Risks.md](../planning/Risks.md) en lugar de implementarse por anticipado.

## Después del MVP: integración con el agente de WhatsApp

Agregado el 2026-09-23 por el [ADR 0014](../decisions/0014-el-agente-de-whatsapp-como-consumidor-del-crm.md). Las fases, sus subfases y su orden están en el [Roadmap](../planning/Roadmap.md); acá solo el perímetro.

**Entra**, en fases de este repositorio:

- Lo que el agente necesita **leer**: catálogo comercial (precio con historial y moneda, marca, categoría, condición, búsqueda por palabras) e información del negocio, con una API de servicio versionada de solo lectura.
- Lo que el agente necesita para **cada turno**: cliente por teléfono, conversación vigente, derivación a una persona, mensajes de entrada y de salida, e historial.
- **Producción**, con el primer tráfico real.
- **Migración** de los datos existentes, por CSV exportado.

**Sigue fuera**:

- Todo lo de Airtable, en cualquier forma: el CRM nunca llama a su API, tampoco para migrar.
- Cualquier dependencia técnica del repositorio del agente. El agente consume contratos del CRM; el CRM no conoce la implementación del agente.
- Que el CRM envíe mensajes o produzca efectos externos.
- ~~El ERP —ventas, compras, proveedores, pagos, caja, contabilidad— **hasta que la integración esté en producción**, por decisión del usuario.~~ *Enmendado el 2026-10-05 por el ADR 0016*: ver §Después de la integración: el ERP.
- Un segundo canal, no antes de que WhatsApp esté en producción con el agente ([evaluación 10.1](../decisions/evaluacion-10.1-mvp.md), O-37).

**Criterio de exclusión de estas fases**: lo decide el brief de cada una. El del MVP, arriba, no se aplica a ellas.

## Después de la integración: el ERP

Agregado el 2026-10-05 por el [ADR 0016](../decisions/0016-el-crm-se-amplia-hacia-un-erp-por-fases.md). Las fases y su orden están en el [Roadmap](../planning/Roadmap.md) (Fases 18 a 22); acá solo el perímetro.

**Entra**, una fase por vez y cada una con su brief: las bases (costo del producto con historial, numeración de comprobantes, moneda e impuestos), los pedidos, las ventas con comprobantes internos, la caja y los cobros, y las compras con sus proveedores. *Agregado el 2026-10-13*: la cuenta corriente de clientes, en la Fase 21, por decisión del usuario ([ADR 0022](../decisions/0022-cobros-y-caja.md), punto 9).

**Sigue fuera**:

- Cualquier tabla o módulo del ERP antes de que se abra la fase que lo incluye.
- La factura electrónica de ARCA, hasta su propio ADR.
- Que el agente registre cobros, pagos o movimientos de caja.
- La contabilidad general, ~~la cuenta corriente,~~ las listas de precios y los depósitos múltiples, hasta que el uso los pida y se decidan. *Enmendado el 2026-10-13*: la cuenta corriente entra en la Fase 21 (arriba).
- *Agregado el 2026-10-15 por el [ADR 0023](../decisions/0023-compras-y-proveedores.md)*: los gastos que no son compras de mercadería (alquiler, servicios, sueldos), la devolución de mercadería al proveedor y sus notas de crédito, el costo promedio y la valuación del inventario. Los pagos a proveedores y la cuenta corriente con ellos **entran** en la Fase 22.

**Cuándo empieza**: la Fase 18 se abre con la Fase 13 cerrada, o antes solo por decisión explícita del usuario registrada con fecha (ADR 0016, punto 3).

## Rubros: capacidades y perfiles

Agregado el 2026-10-18 por el [ADR 0024](../decisions/0024-rubros-y-capacidades.md). Las subfases están en el [Roadmap](../planning/Roadmap.md) §Fase 29; acá solo el perímetro.

**Entra**, con la Fase 29: capacidades activables por organización y perfiles de rubro. El primero es la venta de iPhone: variantes, unidades con IMEI, usados con grado y batería, la recepción de usados con la permuta y la compra, la cotización orientativa de un usado, la lista de reparaciones y el servicio técnico tercerizado, la garantía derivada, los turnos para visitar el local y lo que el agente lee y pide de todo eso. El tipo de cambio entra con su propio ADR, el 0025.

**Sigue fuera**:

- un taller propio, con técnicos que usen el CRM;
- la consulta automática del IMEI en una base externa;
- el recargo de las cuotas, hasta que se sepa cómo lo calcula el negocio;
- un segundo rubro, hasta que se decida;
- que el CRM guarde especificaciones técnicas de los equipos: las contesta el agente con su propio conocimiento;
- recordatorios o avisos de turnos, porque el CRM no envía mensajes;
- que el agente registre recepciones de usados, órdenes de servicio, cobros o pagos.

**Cuándo se construye**: desde la 29.2, con el negocio confirmado o por decisión explícita del usuario registrada con fecha.
