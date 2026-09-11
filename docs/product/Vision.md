# Visión

**Estado: diseñado.**

## Problema

El negocio opera hoy sobre un agente conversacional de WhatsApp cuya persistencia es Airtable. Airtable fue una elección deliberada de implementación física inicial (no una elección arquitectónica definitiva), y como tal expone limitaciones conocidas y ya documentadas por el propio equipo:

- No hay garantía documentada de unicidad efectiva ni de atomicidad/comportamiento concurrente en operaciones de upsert (fue investigado y descartado formalmente como mecanismo de idempotencia confiable para eventos).
- El modelo de datos vive acoplado a los límites de una herramienta de hojas de cálculo colaborativas, no a un motor relacional con integridad referencial real.
- No existe hoy un backoffice operable por personas (administración de productos, clientes, inventario) separado del flujo conversacional automatizado.
- No existe una capa de métricas auditable y reproducible sobre la actividad de WhatsApp: los campos calculados existen solo como diseño, no como implementación validada.

Esto no es una crítica al agente de WhatsApp — es la constatación de que el negocio necesita un sistema de registro (system of record) propio para los datos que hoy solo existen como efecto secundario de una automatización conversacional.

## Qué construimos

Un backoffice web propio — el CRM — con:

- Base de datos relacional propia (PostgreSQL), dueña de sus datos, con integridad referencial real.
- Gestión operable por personas de productos/inventario y clientes, con trazabilidad completa de cambios de stock.
- Visibilidad de conversaciones y mensajes de WhatsApp para consulta humana, con un contrato de ingestión propio (no conectado a tráfico real todavía) para que, en una fase futura, el agente u otros sistemas puedan alimentar este CRM sin acoplarlo a su implementación interna.
- Un dashboard de métricas de WhatsApp con definiciones exactas, versionadas y verificables — no números "que alguien calculó una vez en una hoja".

## Qué no construimos (todavía)

- No es un ERP. No hay ventas, compras, proveedores, pagos, caja ni contabilidad en el MVP.
- No reemplaza al agente de WhatsApp ni a Airtable hoy. La migración es un proyecto futuro separado, posterior a validar que este CRM funciona.
- No es un clon de Airtable con tablas genéricas editables por el usuario. El modelo de datos es específico del dominio (productos, clientes, conversaciones), no una plataforma no-code.

## Definición de éxito del MVP

El MVP es exitoso si, sin tráfico productivo, un usuario administrador puede: dar de alta y mantener su catálogo con trazabilidad de stock, mantener su cartera de clientes, consultar conversaciones y mensajes cargados vía seeds/fixtures, y leer métricas de WhatsApp calculadas correctamente desde datos transaccionales — todo esto validado con datos sintéticos y con pruebas automatizadas, antes de considerar cualquier conexión a datos reales.
