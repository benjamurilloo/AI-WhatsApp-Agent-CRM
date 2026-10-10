# Decisiones

Esta carpeta responde "¿por qué el sistema quedó así?". Sigue la convención de los proyectos Vixora.

## Convención de archivos

- `NNNN-titulo.md`: un ADR corto por decisión que costaría revertir. Se escribe al tomar la decisión y no se reescribe: si cambia, se crea un ADR nuevo que la supera y se enlaza.
- `brief-X.Y-titulo.md`: brief de una tarea o subfase con frontmatter `schema: task-brief.v1` y criterios `AC-n` (ver [development/ExecutionProtocol.md](../development/ExecutionProtocol.md)).
- `cierre-X.Y-titulo.md`: evidencia por criterio y veredicto de cierre, cuando el detalle no entra en `CHANGELOG.md`.
- `notas-piloto-X.Y.md`: observaciones de un período de validación, registradas sin implementar hasta que el usuario confirme el cierre.

## Índice

| ADR | Título | Estado |
|---|---|---|
| [0001](0001-base-de-datos-propia-sin-airtable.md) | Base de datos propia, sin dependencia de Airtable | aceptada |
| [0002](0002-monolito-modular.md) | Monolito modular, no microservicios | aceptada |
| [0003](0003-migracion-legado-proyecto-separado.md) | Migración del legado como proyecto futuro separado | aceptada; reemplazada parcialmente por 0014 |
| [0004](0004-stack-tecnologico-propuesto.md) | Stack tecnológico | aceptada |
| [0005](0005-metricas-desde-datos-transaccionales.md) | Métricas desde datos transaccionales | aceptada |
| [0006](0006-repositorio-registra-decisiones-no-tareas.md) | El repositorio registra decisiones, no tareas | aceptada |
| [0007](0007-identificador-de-cliente-solo-telefono.md) | El teléfono E.164 es el único identificador de negocio del cliente | aceptada |
| [0008](0008-stock-nunca-negativo.md) | El stock nunca puede quedar negativo, sin excepciones | aceptada |
| [0009](0009-repositorio-remoto-github-y-ci.md) | Repositorio remoto en GitHub privado y CI con GitHub Actions | aceptada |
| [0010](0010-un-usuario-una-organizacion-en-el-mvp.md) | En el MVP un usuario pertenece a una sola organización | aceptada |
| [0011](0011-lint-con-eslint-10-sin-eslint-config-next.md) | Lint con ESLint 10, sin `eslint-config-next` (supera al 0004 en el lint) | aceptada |
| [0012](0012-mecanismo-de-sesion.md) | Sesiones server-side propias en PostgreSQL | aceptada |
| [0013](0013-rol-de-aplicacion-y-tablas-de-solo-insercion.md) | Rol de aplicación `crm_app` y tablas de solo inserción | aceptada |
| [0014](0014-el-agente-de-whatsapp-como-consumidor-del-crm.md) | El agente de WhatsApp como consumidor del CRM (reemplaza parcialmente al 0003) | aceptada; punto 7 reemplazado por 0016 |
| [0015](0015-vaciado-de-una-sola-direccion-en-tablas-de-solo-insercion.md) | Vaciado de una sola dirección en las tablas de solo inserción (enmienda al 0013) | aceptada; enmendada el 2026-10-07 por la 16.4, que suma `conversation_notes` |
| [0016](0016-el-crm-se-amplia-hacia-un-erp-por-fases.md) | El CRM se amplía hacia un ERP, por fases (reemplaza el punto 7 del 0014) | aceptada |
| [0017](0017-responder-desde-el-crm.md) | Responder desde el CRM: una bandeja de salida que el agente toma, y el registro de lo que se contesta desde la app | aceptada el 2026-10-08, con la implementación pospuesta |
| [0018](0018-imagenes-de-producto.md) | Imágenes de producto: una principal, guardada en PostgreSQL y procesada en el servidor; sin foto de perfil del cliente | aceptada el 2026-10-08; implementación en la 17.5 y la ruta del agente, confirmada por él, en una subfase posterior |
| [0019](0019-bases-de-los-comprobantes.md) | Las bases de los comprobantes: numeración sin huecos por organización y tipo, una moneda por comprobante, el precio como final al consumidor y la base del margen; sin tablas | aceptada el 2026-10-10; las tablas, con la fase que las use (la primera, `product_costs` en la 18.2) |

## Briefs

| Brief | Subfase | Estado |
|---|---|---|
| [brief-1.3](brief-1.3-decisiones-de-producto-abiertas.md) | 1.3 — Decisiones de producto pendientes | resuelto el 2026-09-11, cerrado el 2026-09-12 |
| [brief-1.1](brief-1.1-wireframes-baja-fidelidad.md) | 1.1 — Wireframes de baja fidelidad | aprobado y cerrado el 2026-09-12 |
| [brief-1.2](brief-1.2-validacion-cruzada-del-modelo.md) | 1.2 — Validación cruzada del modelo | aprobado y cerrado el 2026-09-12 |
| [brief-2.2](brief-2.2-re-verificacion-del-stack.md) | 2.2 — Re-verificación del stack | aprobado y cerrado el 2026-09-12 |
| [brief-2.1](brief-2.1-estructura-del-repositorio.md) | 2.1 — Estructura del repositorio | aprobado y cerrado el 2026-09-12 |
| [brief-2.3](brief-2.3-bootstrap-de-la-aplicacion.md) | 2.3 — Bootstrap de la aplicación | aprobado y cerrado el 2026-09-12 |
| [brief-2.4](brief-2.4-base-de-datos-local.md) | 2.4 — Base de datos local | aprobado y cerrado el 2026-09-13 |
| [brief-2.5](brief-2.5-pipeline-de-ci.md) | 2.5 — Pipeline de CI | aprobado y cerrado el 2026-09-13 |
| [brief-3.1](brief-3.1-migraciones-de-identidad.md) | 3.1 — Migraciones de identidad | aprobado y cerrado el 2026-09-13 |
| [brief-3.2](brief-3.2-adr-mecanismo-de-sesion.md) | 3.2 — ADR del mecanismo de sesión | aprobado y cerrado el 2026-09-13 |
| [brief-3.3](brief-3.3-autenticacion.md) | 3.3 — Autenticación | aprobado y cerrado el 2026-09-13 |
| [brief-3.4](brief-3.4-autorizacion-y-errores.md) | 3.4 — Autorización y taxonomía de errores | aprobado y cerrado el 2026-09-14 |
| [brief-3.6](brief-3.6-modulo-de-auditoria.md) | 3.6 — Módulo de auditoría | aprobado y cerrado el 2026-09-14 |
| [brief-3.5](brief-3.5-pantalla-de-inicio-de-sesion.md) | 3.5 — Pantalla de inicio de sesión | aprobado y cerrado el 2026-09-14 |
| [brief-3.7](brief-3.7-gestion-de-usuarios-y-roles.md) | 3.7 — Gestión de usuarios y roles | aprobado y cerrado el 2026-09-14 |
| [brief-4.0](brief-4.0-diseno-visual-base.md) | 4.0 — Diseño visual base | aprobado y cerrado el 2026-09-14 |
| [brief-4.1](brief-4.1-migraciones-de-catalogo-e-inventario.md) | 4.1 — Migraciones de catálogo e inventario | aprobado y cerrado el 2026-09-15 |
| [brief-4.2](brief-4.2-servicio-de-catalogo.md) | 4.2 — Servicio de catálogo | aprobado y cerrado el 2026-09-15 |
| [brief-4.3.1](brief-4.3.1-transaccion-de-ajuste-de-stock.md) | 4.3.1 — Transacción de ajuste de stock | aprobado y cerrado el 2026-09-15 |
| [brief-4.3.2](brief-4.3.2-concurrencia-de-ajustes.md) | 4.3.2 — Concurrencia de ajustes | aprobado y cerrado el 2026-09-15 |
| [brief-4.3.3](brief-4.3.3-historial-de-movimientos.md) | 4.3.3 — Historial de movimientos | aprobado y cerrado el 2026-09-15 |
| [brief-4.4](brief-4.4-ui-de-productos-e-inventario.md) | 4.4 — UI de productos e inventario | aprobado el 2026-09-15 y cerrado el 2026-09-16 |
| [brief-5.1](brief-5.1-migracion-de-clientes.md) | 5.1 — Migración de clientes | aprobado y cerrado el 2026-09-16 |
| [brief-5.2](brief-5.2-servicio-de-clientes.md) | 5.2 — Servicio de clientes | aprobado y cerrado el 2026-09-16 |
| [brief-5.3](brief-5.3-ui-de-clientes.md) | 5.3 — UI de clientes | aprobado y cerrado el 2026-09-16 |
| [brief-6.1](brief-6.1-migraciones-de-conversaciones.md) | 6.1 — Migraciones de conversaciones | aprobado y cerrado el 2026-09-16 |
| [brief-6.2](brief-6.2-seeds-sinteticos-de-conversaciones.md) | 6.2 — Seeds sintéticos de conversaciones | aprobado y cerrado el 2026-09-16 |
| [brief-6.3](brief-6.3-servicio-de-consulta-y-estado.md) | 6.3 — Servicio de consulta y estado | aprobado y cerrado el 2026-09-16 |
| [brief-6.4](brief-6.4-ui-de-conversaciones.md) | 6.4 — UI de conversaciones | aprobado y cerrado el 2026-09-16 |
| [brief-6.5.1](brief-6.5.1-contrato-de-ingestion.md) | 6.5.1 — Contrato de ingestión y validación | aprobado y cerrado el 2026-09-16 |
| [brief-6.5.2](brief-6.5.2-registro-idempotente-y-proyeccion.md) | 6.5.2 — Registro idempotente y proyección | aprobado y cerrado el 2026-09-17 |
| [brief-6.5.3](brief-6.5.3-autenticacion-de-servicio-y-rate-limit.md) | 6.5.3 — Autenticación de servicio y rate limit | aprobado y cerrado el 2026-09-17 |
| [brief-7.1](brief-7.1-metricas-de-volumen.md) | 7.1 — Métricas de volumen | aprobado y cerrado el 2026-09-17 |
| [brief-7.2](brief-7.2-metricas-de-respuesta-y-estado.md) | 7.2 — Métricas de respuesta y estado | aprobado y cerrado el 2026-09-17 |
| [brief-7.3](brief-7.3-metrica-de-errores-de-ingestion.md) | 7.3 — Métrica de errores de ingestión | aprobado y cerrado el 2026-09-17 |
| [brief-7.4](brief-7.4-dashboard.md) | 7.4 — Dashboard (pantalla 2) | aprobado y cerrado el 2026-09-17 |
| [brief-8.1](brief-8.1-endurecimiento-web.md) | 8.1 — Endurecimiento web | aprobado y cerrado el 2026-09-18 |
| [brief-8.2](brief-8.2-logs-y-privacidad.md) | 8.2 — Logs y privacidad | aprobado y cerrado el 2026-09-18 |
| [brief-8.3](brief-8.3-dependencias.md) | 8.3 — Dependencias | aprobado y cerrado el 2026-09-18 |
| [brief-8.4](brief-8.4-revision-de-seguridad.md) | 8.4 — Revisión de seguridad | aprobado y cerrado el 2026-09-18 |
| [brief-8.5](brief-8.5-rendimiento-de-listados.md) | 8.5 — Rendimiento de los listados | aprobado y cerrado el 2026-09-18 |
| [brief-9.0.1](brief-9.0.1-aislamiento-por-organizacion.md) | 9.0.1 — Aislamiento por organización | aprobado y cerrado el 2026-09-21 |
| [brief-9.0.2](brief-9.0.2-busqueda-sin-distinguir-acentos.md) | 9.0.2 — Búsqueda sin distinguir acentos | aprobado y cerrado el 2026-09-21 |
| [brief-9.0.3](brief-9.0.3-frontera-de-analytics-en-eslint.md) | 9.0.3 — La frontera de `analytics` en ESLint | aprobado y cerrado el 2026-09-21 |
| [brief-9.0.4](brief-9.0.4-aislamiento-de-la-escritura-de-ingestion.md) | 9.0.4 — La escritura de `ingestion` que la 9.0.1 no cubrió | aprobado y cerrado el 2026-09-21 |
| [brief-9.1](brief-9.1-infraestructura-de-staging.md) | 9.1 — Infraestructura de staging | aprobado y cerrado el 2026-09-22, tras cuatro revisiones independientes |
| [brief-9.2](brief-9.2-backups-y-restauracion.md) | 9.2 — Backups y restauración | aprobado y cerrado el 2026-09-22, tras una revisión independiente no obligatoria |
| [brief-9.3](brief-9.3-datos-de-volumen-en-staging.md) | 9.3 — Datos de volumen en staging | aprobado y cerrado el 2026-09-23 sin revisión independiente; **revisada después, en la 10.1**: 22 hallazgos, 10 mayores |
| [brief-10](brief-10-evaluacion-del-mvp.md) | Fase 10 — Evaluación del MVP (10.1 a 10.3, un solo brief) | aprobado y cerrado el 2026-09-23: 10.1, 10.2 y 10.3 cerradas; decisión del usuario: continuar ampliando el alcance |
| [evaluacion-10.1](evaluacion-10.1-mvp.md) | 10.1 — El MVP contra su Definición de Terminado | cerrada el 2026-09-23; corregida en la 10.3 por la revisión independiente, con la decisión en §7 |
| [brief-11.0](brief-11.0-instrumentos-antes-de-construir-encima.md) | 11.0 — Instrumentos y herramienta antes de construir encima | aprobado el 2026-09-23 con las recomendaciones de D-1 a D-7; cerrado el 2026-09-24 |
| [brief-11.1](brief-11.1-catalogo-comercial.md) | 11.1 — Catálogo comercial | aprobado el 2026-09-24 con las recomendaciones de D-1 a D-10; cerrado el 2026-09-24 |
| [brief-11.2](brief-11.2-informacion-del-negocio.md) | 11.2 — Información del negocio | aprobado el 2026-09-24 con las recomendaciones de D-1 a D-10; cerrado el 2026-09-24 |
| [brief-11.3](brief-11.3-api-de-lectura.md) | 11.3 — API de servicio de lectura | aprobado el 2026-09-24 con las recomendaciones de D-1 a D-12; cerrado el 2026-09-24 |
| [brief-11.4](brief-11.4-piloto-en-staging.md) | 11.4 — Piloto en staging | aprobado el 2026-09-24 con las recomendaciones de D-1 a D-12; cerrado el 2026-09-25, y con él la Fase 11 |
| [brief-12.1](brief-12.1-actor-de-servicio-y-cliente-por-telefono.md) | 12.1 — Actor de servicio y cliente por teléfono | aprobado el 2026-09-25 con las recomendaciones de D-1 a D-13; cerrado el 2026-09-25 |
| [brief-12.2](brief-12.2-conversacion-vigente-y-derivacion.md) | 12.2 — Conversación vigente y derivación | aprobado el 2026-09-25 con las recomendaciones de D-1 a D-11, C-1 y C-2; cerrado el 2026-09-25 |
| [brief-12.3](brief-12.3-contrato-de-ingestion-v2.md) | 12.3 — Contrato de ingestión v2 | aprobado el 2026-09-25 con las recomendaciones de D-1 a D-11; cerrado el 2026-09-27 |
| [brief-12.4](brief-12.4-historial-y-memorias.md) | 12.4 — Historial y memorias | aprobado el 2026-09-26 con las recomendaciones de D-1 a D-11, incluida la enmienda del Roadmap de C-1; cerrado el 2026-09-27 |
| [brief-12.5](brief-12.5-turno-completo-en-staging.md) | 12.5 — Turno completo en staging | aprobado el 2026-09-27 con las recomendaciones de D-1 a D-11, incluido H-1; cerrado el 2026-09-29, y con él la Fase 12 |
| [brief-13.1](brief-13.1-entorno-productivo.md) | 13.1 — Entorno productivo | aprobado el 2026-09-29 con las recomendaciones de D-1 a D-12; cerrado el 2026-09-30. Salidas crudas en [evidencia-13.1](evidencia-13.1-produccion.md) |
| [brief-13.2](brief-13.2-mediciones-previas-a-datos-reales.md) | 13.2 — Mediciones previas a exponer datos reales | aprobado el 2026-09-30 con las recomendaciones de D-1 a D-7; cerrado el 2026-09-30. Salidas crudas en [evidencia-13.2](evidencia-13.2-mediciones.md) y planes en [planes-13.2/](planes-13.2/) |
| [brief-13.3](brief-13.3-disponibilidad-y-observabilidad.md) | 13.3 — Disponibilidad y observabilidad | aprobado el 2026-09-30 con las recomendaciones de D-1 a D-8 y un cambio en la condición de detención 2; cerrado el 2026-10-01. Salidas crudas en [evidencia-13.3](evidencia-13.3-disponibilidad.md) |
| [brief-13.4](brief-13.4-retencion-y-borrado.md) | 13.4 — Retención y borrado de datos reales | aprobado el 2026-10-01 con las recomendaciones de D-1 a D-9; cerrado el 2026-10-01. H-4 resuelto en el contrato (I-1, opción A1). Salidas crudas en [evidencia-13.4](evidencia-13.4-retencion-y-borrado.md) |
| [brief-13.5](brief-13.5-primer-cliente.md) | 13.5 — Primer cliente | aprobado el 2026-10-01 con las recomendaciones de D-1 a D-11; en curso. Salidas crudas en [evidencia-13.5](evidencia-13.5-primer-cliente.md) |
| [brief-15.1](brief-15.1-identidad-visual-y-marco.md) | 15.1 — Identidad visual, marco y pantallas principales | aprobado el 2026-10-05 con las recomendaciones de D-1 a D-12; cerrado el 2026-10-05 |
| [brief-15.2](brief-15.2-controles-de-los-listados.md) | 15.2 — Controles de los listados | aprobado el 2026-10-05 con las recomendaciones de D-1 a D-9; cerrado el 2026-10-06 |
| [brief-15.3](brief-15.3-dashboard-interactivo.md) | 15.3 — Dashboard más atractivo e interactivo | aprobado el 2026-10-06 con las recomendaciones de D-1 a D-9, salvo los rangos de D-5 (los del boceto); cerrado el 2026-10-06 |
| [brief-15.4](brief-15.4-detalles-y-formularios.md) | 15.4 — Pantallas de detalle y formularios | aprobado el 2026-10-05 con las recomendaciones de D-1 a D-11; cerrado el 2026-10-05 |
| [brief-15.5](brief-15.5-logo-de-la-marca.md) | 15.5 — Logo de la marca | aprobado el 2026-10-06 con las recomendaciones de D-1 a D-4 y la precisión de D-4 del usuario; cerrado el 2026-10-06 |
| [brief-16.1](brief-16.1-etiquetas-de-clientes.md) | 16.1 — Etiquetas de clientes, manuales | aprobado el 2026-10-06 con las recomendaciones de D-1 a D-13, y la precisión de D-4 del 2026-10-07; cerrado el 2026-10-07 |
| [brief-16.2](brief-16.2-etiquetas-puestas-por-el-agente.md) | 16.2 — Etiquetas puestas por el agente | aprobado el 2026-10-07 con las recomendaciones de D-1 a D-13, y las precisiones de D-7 y de la precedencia del mismo día; cerrado el 2026-10-07 |
| [brief-16.3](brief-16.3-pausar-y-reanudar-al-agente.md) | 16.3 — Pausar y reanudar al agente | aprobado el 2026-10-07 con las recomendaciones de D-1 a D-11, y la precisión de D-4 del mismo día; cerrado el 2026-10-07 |
| [brief-16.4](brief-16.4-notas-de-la-conversacion.md) | 16.4 — Notas de la conversación | aprobado el 2026-10-07 con las recomendaciones de D-1 a D-10 y la enmienda del ADR 0015, y la precisión de D-4 del mismo día; cerrado el 2026-10-08 |
| [brief-16.5](brief-16.5-adr-responder-desde-el-crm.md) | 16.5 — ADR: responder desde el CRM | aprobado el 2026-10-08 con las recomendaciones de D-1 a D-9; cerrado el 2026-10-08 con el ADR 0017 aceptado |
| [brief-16.6](brief-16.6-la-cantidad-de-stock-para-el-agente.md) | 16.6 — La cantidad de stock para el agente | aprobado el 2026-10-08 con las recomendaciones de D-1 a D-8, las precisiones de H-1 y la de D-3; cerrado el 2026-10-08, con la Fase 16 |
| [brief-17.1](brief-17.1-campos-de-clientes.md) | 17.1 — Campos de clientes | aprobado el 2026-10-08 con las recomendaciones de D-1 a D-14, y las precisiones P-1 y P-3 del mismo día; cerrado el 2026-10-08 |
| [brief-17.2](brief-17.2-campos-de-productos.md) | 17.2 — Campos de productos | aprobado el 2026-10-08 con las recomendaciones de D-1 a D-13, y las precisiones P-1 a P-4 del mismo día; cerrado el 2026-10-08 |
| [brief-17.3](brief-17.3-adr-de-las-imagenes.md) | 17.3 — ADR de las imágenes | aprobado el 2026-10-08 con las recomendaciones de D-1 a D-12, y el umbral de 1 GB del mismo día; cerrado el 2026-10-08 con el ADR 0018 aceptado |
| [brief-17.4](brief-17.4-informacion-del-negocio-estructurada.md) | 17.4 — Información del negocio estructurada | aprobado el 2026-10-09 con las recomendaciones de D-1 a D-11, las precisiones P-1 a P-7 y los pedidos R-1 y R-2 del agente; cerrado el 2026-10-09, con la ventana 17.4.3 hecha y cerrada el 2026-10-10 |
| [brief-17.5](brief-17.5-imagenes-de-producto.md) | 17.5 — Imágenes de producto | aprobado el 2026-10-09 con las recomendaciones de D-1 a D-13 y las precisiones P-1 a P-6; cerrado el 2026-10-09 |
| [brief-18.1](brief-18.1-adr-bases-de-los-comprobantes.md) | 18.1 — ADR de las bases de los comprobantes | aprobado el 2026-10-10 con las recomendaciones de D-1 a D-10; cerrado el 2026-10-10 con el ADR 0019 aceptado, con las correcciones R-1 y R-2 de la revisión independiente a D-4 y D-5 |
| [evidencia-9.1](evidencia-9.1-staging.md) | 9.1 — Salidas crudas de la verificación en staging | captura del 2026-09-22 |
| [evidencia-9.2](evidencia-9.2-backups.md) | 9.2 — Backup y restauración verificados en staging | captura del 2026-09-22 |
| [evidencia-9.3](evidencia-9.3-volumen.md) | 9.3 — Volumen, planes y tiempos medidos en staging | captura del 2026-09-23 |

## Plantilla

```markdown
# NNNN — Título

- Estado: propuesta | aceptada | superada por NNNN
- Fecha: YYYY-MM-DD

## Contexto

## Decisión

## Alternativas descartadas

## Consecuencias
```
