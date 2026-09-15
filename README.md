# AI WhatsApp Agent CRM

Backoffice propio de productos e inventario, clientes, conversaciones y métricas de WhatsApp.

## Estado

**El estado vigente y verificado está en [HANDOFF.md](HANDOFF.md)**, que se sobrescribe al cerrar cada fase. Con la Fase 3 cerrada, la identidad, la autorización, la auditoría y las pantallas de ingreso y de usuarios están **validadas en integración** o **validadas localmente y en CI**, según el componente. La Fase 4 está en curso: la 4.0 dejó un diseño visual base con modo claro y oscuro, la 4.1, el esquema de productos e inventario, y la 4.2, el servicio de catálogo, ambos validados localmente y en CI. El resto del dominio sigue en nivel *diseñado*, y nada está desplegado ni conectado a tráfico real. El índice de documentación está en [docs/README.md](docs/README.md).

## Qué es

Un backoffice web con base de datos PostgreSQL propia para administrar productos e inventario y clientes, consultar conversaciones y mensajes, y ver métricas de WhatsApp con definiciones auditables.

Pese al nombre, es un proyecto **independiente** del agente de WhatsApp ("AI WhatsApp Agent"), que hoy usa Airtable: no comparte con él código, infraestructura ni base de datos. Si en el futuro se integran, será a través de un contrato de ingestión propio de este repositorio ([IntegrationBoundaries.md](docs/architecture/IntegrationBoundaries.md)).

## Principios no negociables

1. Todo se construye con código versionado: schema, migraciones y documentación.
2. El sistema es dueño de sus datos, en su propia base de datos PostgreSQL.
3. Cero dependencia de Airtable: sin SDK, adaptadores, IDs, variables de entorno, sincronización, dual-write ni consultas en tiempo real.
4. Sin referencias arquitectónicas al repositorio del agente de WhatsApp.
5. Desarrollo con datos sintéticos y seeds propios, sin tráfico productivo en el MVP.
6. La migración del sistema legado es un proyecto futuro separado, posterior a validar el CRM.
7. Preparado para evolucionar a un ERP, pero sin tablas ni módulos especulativos.

Detalle en [docs/product/Scope.md](docs/product/Scope.md) y en [docs/decisions/](docs/decisions/README.md).

## Metodología

- **Tareas y estado**: proyecto [AI WhatsApp Agent CRM](https://app.notion.com/p/3d8702be6f4e81659e43c3d8bd9a6e1c) en Notion.
- **Decisiones y cierres**: [docs/decisions/](docs/decisions/README.md) y [CHANGELOG.md](CHANGELOG.md), que registra cada cierre de fase o subfase.
- **Traspaso entre sesiones**: [HANDOFF.md](HANDOFF.md). Cada fase se trabaja en una sesión propia y termina escribiendo ahí su estado verificado.
- **Conocimiento transversal**: hub `80 Projects/AI WhatsApp Agent CRM` en el vault de Obsidian.

Para trabajar con Claude Code, leer primero [CLAUDE.md](CLAUDE.md).
