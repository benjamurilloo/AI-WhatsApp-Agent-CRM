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

- Ventas, compras, proveedores, pagos, cuentas de caja, contabilidad.
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
- El ERP —ventas, compras, proveedores, pagos, caja, contabilidad— **hasta que la integración esté en producción**, por decisión del usuario.
- Un segundo canal, no antes de que WhatsApp esté en producción con el agente ([evaluación 10.1](../decisions/evaluacion-10.1-mvp.md), O-37).

**Criterio de exclusión de estas fases**: lo decide el brief de cada una. El del MVP, arriba, no se aplica a ellas.
