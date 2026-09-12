# Estrategia de Pruebas

**Estado: diseñado.**

## Niveles

### Unitarias
- Lógica de dominio pura: derivación de estado de stock (FR-PROD-05), fórmulas de métricas (con datos en memoria/fixtures pequeños), validación de esquemas de entrada.
- Sin base de datos real; mocks solo en los bordes del módulo bajo prueba.

### Integración
- Contra una base de datos PostgreSQL real de test (Docker), no mockeada — decisión explícita: la lógica de transacciones de inventario y las constraints (unicidad, `CHECK`, FKs) solo se validan con el motor real.
- Casos obligatorios:
  - Un ajuste de stock concurrente no deja saldo negativo.
  - SKU y teléfono son únicos por organización.
  - Idempotencia de ingestión: reenviar el mismo evento no duplica conversaciones ni mensajes, y reenviarlo con otro `payload_hash` devuelve `CONFLICT` sin modificar datos.
  - Aislamiento por organización: un usuario de la organización A recibe `NOT_FOUND` al leer o escribir datos de la organización B, incluso manipulando IDs directamente.
  - `inventory_movements` rechaza `UPDATE` y `DELETE` por permisos de base de datos.
  - `conversations.started_at` coincide con el `sent_at` del primer mensaje.
  - Un ajuste que dejaría el stock negativo se rechaza con `BUSINESS_RULE_VIOLATION`, sin modificar `quantity_on_hand` y sin registrar ningún movimiento en `inventory_movements` ([ADR 0008](../decisions/0008-stock-nunca-negativo.md)).
  - Una métrica calculada sobre un intervalo que cruza un cambio de horario de verano en `America/Argentina/Buenos_Aires` (con una fecha histórica, porque la zona lo tuvo hasta 2009) da el valor calculado a mano, con días de 23 o 25 horas ([MetricsCatalog.md](../analytics/MetricsCatalog.md)).
- Cada invariante crítico se prueba intentando violarlo, no solo por el camino feliz: una suite que nunca fuerza el fallo no detecta una salvaguarda desactivada.

### End-to-end
- Playwright sobre las pantallas de [product/Screens.md](../product/Screens.md): como mínimo el camino feliz de cada pantalla y un caso de error o de estado vacío por pantalla.

## Datos de prueba

- Fixtures y seeds propios, sintéticos y versionados en el repo (`/seeds` o equivalente). Ningún fixture usa datos reales ni provenientes de Airtable.
- Un seed "básico" para desarrollo local (pocas filas, legible) y un seed "volumen" para probar paginación y rendimiento con más datos, ambos sintéticos.
- Los fixtures de métricas incluyen bordes temporales: un mensaje cerca de la medianoche local que en UTC cae en otro día, y un día con cambio de horario.
- Los payloads de ingestión del MVP se marcan en el propio fixture como **forma asumida, no verificada**, porque todavía no existe un emisor real. En el proyecto de integración se derivan de capturas reales del emisor, y recién ahí cuentan como evidencia de compatibilidad.
- En staging, los datos de prueba se limpian por identidad exacta (IDs creados o diff contra un baseline), nunca por rango de fechas, y en orden hijo → padre.

## Qué bloquea un merge

- Cualquier test unitario/integración roto.
- Cobertura de los invariantes críticos listados arriba (no se exige un % de cobertura arbitrario; se exige que estos invariantes específicos tengan test).
- Lint y typecheck limpios.

## Qué no se prueba en el MVP

- Carga/performance bajo tráfico productivo real (no existe tráfico real).
- Compatibilidad cross-browser exhaustiva; se valida en un navegador moderno de referencia (Chromium vía Playwright) salvo hallazgo concreto que amerite más.
