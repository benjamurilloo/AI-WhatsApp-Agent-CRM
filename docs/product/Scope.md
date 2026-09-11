# Alcance

**Estado: diseñado.**

## Dentro del MVP

| Módulo | Incluye |
|---|---|
| Organizaciones y usuarios | Alta de organización, usuarios, roles `admin`/`viewer`, sesión segura |
| Productos e inventario | CRUD (sin borrado físico) de productos, stock por producto, mínimos y punto de reposición, estados derivados, ajustes manuales con movimiento inmutable |
| Clientes | CRUD (sin borrado físico), búsqueda, última interacción, conversaciones relacionadas |
| Conversaciones y mensajes | Consulta, filtros, timeline; contrato de ingestión idempotente diseñado y probado con datos sintéticos, **no conectado a tráfico real** |
| Métricas de WhatsApp | Dashboard con fórmulas auditables calculadas desde datos transaccionales |
| Seguridad base | Auth por sesión, autorización server-side, aislamiento por organización, CSRF/XSS, rate limiting en login e ingestión, auditoría de cambios sensibles |

## Explícitamente fuera del MVP

- Ventas, compras, proveedores, pagos, cuentas de caja, contabilidad.
- Cualquier tabla o módulo "preparado para el futuro ERP" sin uso en el MVP.
- SDK, adaptadores, IDs, variables de entorno o sincronización con Airtable, en cualquier forma.
- Dependencia técnica o arquitectónica del repositorio del agente de WhatsApp.
- Conexión a tráfico productivo real (WhatsApp real, clientes reales).
- Migración de datos del sistema legado — es un proyecto futuro separado, fuera de este backlog.
- Multi-canal implementado — el modelo se diseña extensible a canales futuros, pero el MVP solo opera con el canal `whatsapp`.
- Notificaciones push/email, exportaciones masivas avanzadas, reportes personalizables por el usuario.

## Criterio de exclusión

Si una funcionalidad no es necesaria para que un administrador humano pueda operar productos, clientes, conversaciones de solo lectura y ver métricas de WhatsApp con datos sintéticos, no entra al MVP. Ante la duda, se documenta como pregunta abierta en [planning/Risks.md](../planning/Risks.md) en lugar de implementarse por anticipado.
