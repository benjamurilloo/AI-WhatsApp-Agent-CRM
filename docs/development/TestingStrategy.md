# Estrategia de Pruebas

**Estado: diseñado.**

## Niveles

### Unitarias
- Lógica de dominio pura: derivación de estado de stock (FR-PROD-05), fórmulas de métricas (con datos en memoria/fixtures pequeños), validación de esquemas de entrada.
- Sin base de datos real; mocks solo en los bordes del módulo bajo prueba.

### Integración
- Contra una base de datos PostgreSQL real de test (Docker), no mockeada — decisión explícita: la lógica de transacciones de inventario y las constraints (unicidad, `CHECK`, FKs) solo se validan con el motor real.
- Aislamiento ([brief-3.1](../decisions/brief-3.1-migraciones-de-identidad.md), D-1): base `_test` separada, recreada y migrada desde cero en cada ejecución, tablas vaciadas con `TRUNCATE` antes de cada test y archivos en serie. No se usan transacciones revertidas por test, porque la auditoría atómica y los ajustes concurrentes necesitan transacciones reales y varias conexiones. Detalle operativo en [Environments.md](Environments.md).
- Un rechazo de la base se comprueba por su código de error de PostgreSQL (`23505`, `23503`, `23502`, `22P02`...), no solo porque la consulta falle.
- Casos obligatorios:
  - Un ajuste de stock concurrente no deja saldo negativo.
  - SKU y teléfono son únicos por organización. El SKU, desde la 4.1.
  - Idempotencia de ingestión: reenviar el mismo evento no duplica conversaciones ni mensajes, y reenviarlo con otro `payload_hash` devuelve `CONFLICT` sin modificar datos.
  - Aislamiento por organización: un usuario de la organización A recibe `NOT_FOUND` al leer o escribir datos de la organización B, incluso manipulando IDs directamente. Cubierto desde la 3.4 para `organization_members` (`tests/integration/authorization.test.ts`); cada módulo de las Fases 4 a 7 agrega el suyo para sus recursos.
  - `inventory_movements` rechaza `UPDATE` y `DELETE`: con `42501` para `crm_app` y con `P0001` por trigger para el rol dueño. Cubierto desde la 4.1 en `tests/integration/catalog-inventory-schema.test.ts`, con `inventory_movements` en la lista de solo inserción de `audit.test.ts`.
  - Esquema de catálogo e inventario, cubierto desde la 4.1 en ese mismo archivo con SQL directo:
    - SKU único por organización sin distinguir mayúsculas (`23505`), y aceptado en otra organización;
    - `quantity_on_hand`, `balance_after` y `reorder_point` negativos, `quantity` cero o negativa y `reason` vacío o solo con espacios se rechazan con `23514`;
    - las cantidades se redondean a tres decimales y fuera de `numeric(14, 3)` se rechazan con `22003`;
    - un saldo o un movimiento con el producto de otra organización se rechaza con `23503`, y borrar una organización, un producto o un usuario referenciados, con `23001`.
  - Queda para la 4.3: que el servicio de ajuste no pueda saltearse el movimiento, el primer ajuste de un producto sin fila de `inventories` y los ajustes concurrentes.
  - `audit_logs` ([ADR 0013](../decisions/0013-rol-de-aplicacion-y-tablas-de-solo-insercion.md)), cubierto desde la 3.6 en `tests/integration/audit.test.ts`:
    - rechaza `UPDATE` y `DELETE` para `crm_app` con `42501`, y para el rol dueño por trigger;
    - un registro escrito con `recordAudit` persiste o se revierte junto con el cambio que audita, incluso cuando falla la inserción de auditoría;
    - toda tabla de `public` tiene los privilegios esperados para `crm_app`, y el test demuestra que falla ante una tabla sin ellos.
  - `conversations.started_at` coincide con el `sent_at` del primer mensaje.
  - Después de cada ajuste, `balance_after` del movimiento es igual a `inventories.quantity_on_hand` del producto.
  - Un usuario con `must_change_password = true` no accede a ninguna ruta protegida hasta definir una nueva contraseña. Cubierto desde la 3.4 en el servicio (`authorize`) y desde la 3.5 de punta a punta (`tests/e2e/login.spec.ts`, caso 7); `completeRequiredPasswordChange` rechaza con `FORBIDDEN` cuando el flag ya está en `false` (`auth-service.test.ts`).
  - Sesiones ([ADR 0012](../decisions/0012-mecanismo-de-sesion.md)), en la 3.3 y la 3.4:
    - el cierre de sesión borra la fila en `sessions`, y reenviar la cookie anterior da `UNAUTHENTICATED`;
    - una sesión con `expires_at` vencido, o con más de 30 días desde `created_at`, se rechaza aunque la cookie siga presente;
    - un token manipulado, inexistente o con otro formato se rechaza sin distinguir la causa;
    - la base guarda solo el hash: ninguna fila de `sessions` contiene el token de la cookie;
    - cambiar la contraseña invalida todas las demás sesiones del usuario;
    - un usuario desactivado o sin membresía recibe `UNAUTHENTICATED` en el request siguiente, sin revocación previa;
    - un cambio de rol rige en el request siguiente;
    - cada ingreso crea una sesión nueva, distinta de cualquier cookie previa;
    - un Route Handler mutante rechaza un `Origin` ajeno.
  - `organization_members` rechaza una segunda membresía del mismo usuario, y quitar el rol o desactivar al último `admin` de la organización se rechaza con `BUSINESS_RULE_VIOLATION` ([ADR 0010](../decisions/0010-un-usuario-una-organizacion-en-el-mvp.md)). Gestión de miembros cubierta desde la 3.7 en `tests/integration/members.test.ts`:
    - regla del último `admin`, incluido un `admin` inactivo que no cuenta;
    - test de concurrencia: dos `admin` se quitan el rol en dos conexiones mientras una tercera retiene el bloqueo de la organización; ninguno termina antes de liberarlo, y exactamente uno lo logra;
    - alta atómica de usuario, membresía y auditoría; `CONFLICT` por email, también con dos altas concurrentes, sin filas huérfanas;
    - `diff` exacto de cada cambio y ninguna auditoría sin cambio real;
    - la contraseña inicial no aparece en ninguna tabla ni en la consola.
  - Un ajuste que dejaría el stock negativo se rechaza con `BUSINESS_RULE_VIOLATION`, sin modificar `quantity_on_hand` y sin registrar ningún movimiento en `inventory_movements` ([ADR 0008](../decisions/0008-stock-nunca-negativo.md)).
  - Una métrica calculada sobre un intervalo que cruza un cambio de horario de verano en `America/Argentina/Buenos_Aires` (con una fecha histórica, porque la zona lo tuvo hasta 2009) da el valor calculado a mano, con días de 23 o 25 horas ([MetricsCatalog.md](../analytics/MetricsCatalog.md)).
- Cada invariante crítico se prueba intentando violarlo, no solo por el camino feliz: una suite que nunca fuerza el fallo no detecta una salvaguarda desactivada.

### Guardas

- Tests en `tests/guards/` que vigilan reglas del proyecto, no comportamiento: referencias prohibidas por `CLAUDE.md` y frontera entre módulos.
- Sin base de datos ni red. Corren en local con `npm run test:guards` y en cada ejecución de CI.
- Cada guarda incluye casos que demuestran que falla ante lo que prohíbe. Una guarda que nunca se vio fallar no protege nada.

### End-to-end
- Playwright sobre las pantallas de [product/Screens.md](../product/Screens.md): como mínimo el camino feliz de cada pantalla y un caso de error o de estado vacío por pantalla.
- Implementado desde la 3.5 ([brief-3.5](../decisions/brief-3.5-pantalla-de-inicio-de-sesion.md), D-8): Chromium sobre `next start`, contra la base `_e2e` sembrada, en local y en CI. Sin mocks: es la evidencia `producer-consumer` de UI ↔ Server Action ↔ servicio ↔ base.
- Obligatorio en cada test de pantalla (D-3): `@axe-core/playwright` sin violaciones WCAG 2.x A ni AA en cada estado (vacío, error, carga bloqueada, éxito), foco al primer error y un recorrido completo solo con teclado.
- Pantalla 1 cubierta en `tests/e2e/login.spec.ts`: ingreso y cookie, mismo mensaje para cuenta inexistente y contraseña incorrecta, email inválido, límite de intentos, redirecciones de FR-ORG-03, cambio obligatorio, cierre de sesión con reenvío de la cookie anterior, botón de mostrar contraseña, teclado, axe y móvil a 375 px.
- Pantalla 10 y marco común cubiertos en `tests/e2e/users.spec.ts` (3.7): lista con "(vos)" y navegación, alta con contraseña inicial de un solo uso, email repetido, cambio de rol auditado, desactivación con confirmación que cierra la sesión abierta del usuario, reactivación, último `admin`, `viewer` sin datos, miembro de otra organización, filtros y página en la URL, móvil a 375 px, teclado y axe.
- Un `INTERNAL` real no se fuerza de punta a punta: el mensaje y el log se prueban con tests unitarios.

## Datos de prueba

- Fixtures y seeds propios, sintéticos y versionados en el repo: seeds en `seeds/`, fixtures junto al test que los usa ([RepositoryStructure.md](../architecture/RepositoryStructure.md)). Ningún fixture usa datos reales ni provenientes de Airtable.
- Un seed "básico" para desarrollo local (pocas filas, legible) y un seed "volumen" para probar paginación y rendimiento con más datos, ambos sintéticos. El básico existe desde la 3.5 (`seeds/basic.ts`), con test de idempotencia y de rechazo de una base no permitida (`tests/integration/seed.test.ts`); el de volumen, todavía no.
- Los fixtures de métricas incluyen bordes temporales: un mensaje cerca de la medianoche local que en UTC cae en otro día, y un día con cambio de horario.
- Los payloads de ingestión del MVP se marcan en el propio fixture como **forma asumida, no verificada**, porque todavía no existe un emisor real. En el proyecto de integración se derivan de capturas reales del emisor, y recién ahí cuentan como evidencia de compatibilidad.
- En staging, los datos de prueba se limpian por identidad exacta (IDs creados o diff contra un baseline), nunca por rango de fechas, y en orden hijo → padre.

## Qué bloquea un merge

- Cualquier test unitario, de integración o end-to-end roto.
- Cobertura de los invariantes críticos listados arriba (no se exige un % de cobertura arbitrario; se exige que estos invariantes específicos tengan test).
- Lint y typecheck limpios.

## Qué no se prueba en el MVP

- Carga/performance bajo tráfico productivo real (no existe tráfico real).
- Compatibilidad cross-browser exhaustiva; se valida en un navegador moderno de referencia (Chromium vía Playwright) salvo hallazgo concreto que amerite más.
