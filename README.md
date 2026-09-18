# AI WhatsApp Agent CRM

Backoffice propio de productos e inventario, clientes, conversaciones y métricas de WhatsApp.

## Estado

**El estado vigente y verificado está en [HANDOFF.md](HANDOFF.md)**, que se sobrescribe al cerrar cada fase. Con las Fases 3 y 4 cerradas, la identidad, la autorización, la auditoría, el catálogo y el inventario están **validados localmente y en CI**. Las pantallas de ingreso, usuarios, productos, detalle de producto y ajuste de inventario con su historial, lista y detalle de clientes están **validadas en integración**, en modo claro y oscuro. Con la Fase 5 cerrada, el esquema y el servicio de clientes, con el teléfono enmascarado para `viewer`, están **validados localmente y en CI**. Con la Fase 6 (conversaciones e ingestión) cerrada el 2026-09-17: desde la 6.1, la 6.2 y la 6.3, su esquema, sus seeds sintéticos (de ejemplo y de volumen) y su servicio de consulta y cambio de estado están **validados localmente y en CI**, y desde la 6.4 las pantallas de conversaciones (lista y detalle) y las conversaciones en las pantallas de clientes están **validadas en integración**. Desde la 6.5.1 existe el [contrato de ingestión v1](docs/contracts/ingestion-v1.md), con su validación y su `payload_hash` **validados localmente y en CI**, y desde la 6.5.2 el registro idempotente de eventos y su proyección en conversaciones y mensajes también están **validados localmente y en CI**, y desde la 6.5.3 el endpoint de ingestión, con su credencial de servicio, su límite de tasa y su modo de prueba apagado por defecto, también está **validado localmente y en CI**, solo con requests sintéticos. Con la Fase 7 (métricas y dashboard) cerrada el 2026-09-17: la 7.1 sumó el módulo `analytics` con las métricas 1 a 6 y 10, la 7.2 las métricas 7, 8, 9 y 11 (respuesta y estado) y la 7.3 la métrica 12 (errores de ingestión, con el estado "no disponible"), las doce **validadas localmente y en CI** con fixtures sintéticos; la 7.4 sumó la pantalla 2 (dashboard), **validada en integración**, en modo claro y oscuro. Con ella existen las diez pantallas del MVP. Con la **Fase 8 (calidad, seguridad y observabilidad) cerrada el 2026-09-18**: la CSP con nonce por request y las cabeceras de seguridad están **validadas en integración** (8.1); los logs sin datos personales y el procedimiento de exportación y minimización de los datos de un cliente, **validados localmente y en integración** (8.2); la auditoría de dependencias corre en CI con dos puertas de umbral explícito (8.3); el modelo de seguridad quedó contrastado ítem por ítem contra el código, con tres hallazgos mayores abiertos y ninguno crítico, en una **revisión declarada como autoevaluación** (8.4); y las consultas de listado de productos, inventario y clientes quedaron medidas con planes reales, sin ningún índice faltante (8.5). El resto del dominio sigue en nivel *diseñado*, y **nada está desplegado ni conectado a tráfico real**: eso empieza en la Fase 9. El índice de documentación está en [docs/README.md](docs/README.md).

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
