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
  - Un ajuste de stock concurrente no deja saldo negativo ni pierde actualizaciones. Cubierto desde la 4.3.2 en `tests/integration/inventory-concurrency.test.ts` (detalle más abajo).
  - SKU y teléfono son únicos por organización. El SKU, desde la 4.1; el teléfono, desde la 5.1.
  - Idempotencia de ingestión: reenviar el mismo evento no duplica conversaciones ni mensajes, y reenviarlo con otro `payload_hash` devuelve `CONFLICT` sin modificar datos.
  - Aislamiento por organización: un usuario de la organización A recibe `NOT_FOUND` al leer o escribir datos de la organización B, incluso manipulando IDs directamente. Cubierto desde la 3.4 para `organization_members` (`tests/integration/authorization.test.ts`); cada módulo de las Fases 4 a 7 agrega el suyo para sus recursos.
  - `inventory_movements` rechaza `UPDATE` y `DELETE`: con `42501` para `crm_app` y con `P0001` por trigger para el rol dueño. Cubierto desde la 4.1 en `tests/integration/catalog-inventory-schema.test.ts`, con `inventory_movements` en la lista de solo inserción de `audit.test.ts`.
  - Esquema de catálogo e inventario, cubierto desde la 4.1 en ese mismo archivo con SQL directo:
    - SKU único por organización sin distinguir mayúsculas (`23505`), y aceptado en otra organización;
    - `quantity_on_hand`, `balance_after` y `reorder_point` negativos, `quantity` cero o negativa y `reason` vacío o solo con espacios se rechazan con `23514`;
    - las cantidades se redondean a tres decimales y fuera de `numeric(14, 3)` se rechazan con `22003`;
    - un saldo o un movimiento con el producto de otra organización se rechaza con `23503`, y borrar una organización, un producto o un usuario referenciados, con `23001`.
  - Esquema de clientes ([brief-5.1](../decisions/brief-5.1-migracion-de-clientes.md)), cubierto desde la 5.1 en `tests/integration/clients-schema.test.ts` con SQL directo:
    - teléfono repetido en la organización, también contra un cliente inactivo, se rechaza con `23505` y el nombre del índice; se acepta en otra organización, y varios clientes sin teléfono conviven;
    - un teléfono fuera de E.164 canónico (espacios, guiones, paréntesis, sin `+`, con `+0`, más de 15 dígitos, dígitos no ASCII, salto de línea final o vacío) se rechaza con `23514`, al insertar y al actualizar;
    - una organización inexistente se rechaza con `23503`, y borrar una con clientes, con `23001`;
    - `crm_app` lee, inserta, actualiza y borra clientes.
  - Esquema de conversaciones, mensajes e ingestión ([brief-6.1](../decisions/brief-6.1-migraciones-de-conversaciones.md)), cubierto desde la 6.1 en `tests/integration/conversations-schema.test.ts` con SQL directo, verificando el SQLSTATE y la constraint:
    - aislamiento: una conversación con el cliente de otra organización y un mensaje con la conversación de otra organización se rechazan con `23503` (claves compuestas); una conversación sin cliente se acepta;
    - `external_ref` repetido se rechaza con `23505` en su organización y canal (conversaciones) o en su conversación (mensajes), y se acepta fuera de ese alcance; vacío o solo con espacios, con `23514`;
    - `ingestion_events`: evento repetido por `(organization_id, source, external_ref)` → `23505`, y `ON CONFLICT ON CONSTRAINT … DO NOTHING` no inserta el reenvío; identidad vacía, fecha de proceso o código de error que no corresponden al estado → `23514`;
    - un último mensaje anterior al inicio de la conversación → `23514`;
    - borrar un cliente, una conversación o una organización con filas dependientes → `23001`;
    - `messages` rechaza `UPDATE` y `DELETE` con `42501` para `crm_app` y con `P0001` por trigger para el rol dueño;
    - `ingestion_events` rechaza `DELETE` (`42501` para `crm_app`) y todo cambio de identidad o borrado por trigger (`P0001`), y admite cambiar el estado;
    - cada trigger se quita dentro de una transacción revertida para demostrar que, sin él, el cambio pasaría.
  - Servicio de conversaciones ([brief-6.3](../decisions/brief-6.3-servicio-de-consulta-y-estado.md)), cubierto desde la 6.3 en `tests/integration/conversations.test.ts`, con validación de filtros, páginas y cursores en tests unitarios de `conversations`:
    - lista ordenada por último mensaje con desempate, filtros de estado, canal y cliente, período en días de la organización (medianoche local y el 19/10/2008), páginas, cantidad de mensajes y "sin resultados" frente a "no hay conversaciones";
    - **sin contenido** (FR-CONV-01): la lista serializada no contiene el texto de ningún mensaje ni el teléfono; con la consulta trayendo el último cuerpo, el test falla (evidencia en el brief);
    - timeline de a 50 por cursor sin duplicados ni huecos, estable ante un mensaje nuevo, con desempate por `id` y microsegundos, cuerpos tal cual y cursores inválidos o de otra conversación;
    - cambio de estado solo para `admin`, auditado con el `diff` exacto, sin auditoría si no cambia, revertido si falla la auditoría, y con la segunda escritura viendo el estado de una primera que retiene el bloqueo;
    - actividad del cliente: última interacción independiente del filtro de estado, conversaciones filtradas, cliente sin conversaciones e inactivo;
    - clientes por última interacción: orden con los clientes sin interacciones al final por nombre, búsqueda, actividad, páginas y H-5 (el `viewer` no recibe el número; con `getClientsByIds` sin enmascarar, el test falla);
    - aislamiento: conversación, cliente o filtro de otra organización → `NOT_FOUND` o sin filas; contraseña pendiente → `FORBIDDEN`.
  - Servicio de catálogo ([brief-4.2](../decisions/brief-4.2-servicio-de-catalogo.md)), cubierto desde la 4.2 en `tests/integration/catalog.test.ts`:
    - alta, edición, desactivación y reactivación auditadas en la misma transacción con `diff` exacto; un cambio sin diferencias no escribe ni audita; si la auditoría falla, el producto no persiste;
    - SKU duplicado, también con otras mayúsculas, en alta y en edición → `CONFLICT` sin auditoría; dos altas simultáneas con el mismo SKU → una sola se crea;
    - `viewer` y contraseña pendiente → `FORBIDDEN` en escrituras; producto de otra organización → `NOT_FOUND`; id inválido → `VALIDATION_ERROR`;
    - lista con saldo y estado contra la base: prefijo de nombre y SKU exacto sin distinguir mayúsculas, `%` y `_` literales, filtros de estado y actividad, un producto sin fila de `inventories` como `sin_stock`, orden y paginación.
  - Servicio de clientes ([brief-5.2](../decisions/brief-5.2-servicio-de-clientes.md)), cubierto desde la 5.2 en `tests/integration/crm.test.ts`:
    - alta, edición, desactivación y reactivación auditadas en la misma transacción con `diff` exacto; un cambio sin diferencias no escribe ni audita; si la auditoría falla, el cliente no persiste;
    - teléfono duplicado, escrito con otro formato o de un cliente inactivo, en alta y en edición → `CONFLICT` sin auditoría; dos altas simultáneas con el mismo teléfono → una sola se crea;
    - `viewer` y contraseña pendiente → `FORBIDDEN` en escrituras; cliente de otra organización → `NOT_FOUND`; id inválido → `VALIDATION_ERROR`;
    - lista: prefijo de nombre sin distinguir mayúsculas con `%` y `_` literales, teléfono completo en cualquier formato y no por fragmentos, actividad, orden por nombre con desempate, paginación y totales;
    - **H-5 (FR-CLI-06)**: la respuesta a un `viewer` de `getClient` y de `searchClients`, también buscando por el teléfono completo, serializada a JSON, no contiene el número ni sus dígitos anteriores a los últimos 4; con el enmascarado quitado, el test falla (evidencia en el brief-5.2);
    - auditoría del cliente solo para `admin` de la propia organización, con autor.
  - Normalización del teléfono a E.164, enmascarado por rol (incluidos los números de 4 dígitos o menos) y validación de clientes, en tests unitarios de `crm`.
  - Bordes del estado de stock (FR-PROD-05) y cantidades exactas, en tests unitarios de `catalog` y `src/shared/quantity/`.
  - Ajuste de stock ([brief-4.3.1](../decisions/brief-4.3.1-transaccion-de-ajuste-de-stock.md)), cubierto desde la 4.3.1 en `tests/integration/inventory-adjustment.test.ts`, sin conexiones simultáneas:
    - el primer ajuste crea la fila de `inventories`, el movimiento con `balance_after` y la auditoría `inventory` / `stock_adjustment`; en una serie, después de cada ajuste, `balance_after` del último movimiento es igual a `quantity_on_hand`;
    - un saldo que queda exacto en 0 o exacto en el máximo se acepta;
    - −0,001 → `negative_stock`, producto desactivado → `inactive_product`, máximo superado → `stock_limit`, saldo esperado distinto → `CONFLICT`; cada rechazo se compara contra una foto de saldos, movimientos y auditoría, y no deja la fila de `inventories` si no existía;
    - `viewer` y contraseña pendiente → `FORBIDDEN`; producto de otra organización o inexistente → `NOT_FOUND`; id o entrada inválidos → `VALIDATION_ERROR`, sin crear la fila;
    - si falla el movimiento, no persiste ni la fila nueva ni el cambio de saldo. **Límite**: el fallo se provoca con un actor inexistente, que rompe primero la clave foránea del movimiento; no hay un caso que haga fallar solo la auditoría después de actualizar el saldo.
  - Concurrencia del ajuste ([brief-4.3.2](../decisions/brief-4.3.2-concurrencia-de-ajustes.md)), cubierta desde la 4.3.2 en `tests/integration/inventory-concurrency.test.ts`:
    - método: otra conexión retiene un bloqueo, el test espera en `pg_stat_activity` a que las conexiones queden detenidas con `wait_event_type = 'Lock'` y recién entonces lo suelta; no se usa `setTimeout` para suponer que hay carrera, y un `afterEach` suelta los bloqueos aunque el test falle;
    - dos ajustes con el mismo saldo esperado: uno aceptado, el otro `CONFLICT`, y el libro cuadra (saldo final igual al inicial más la suma de los movimientos);
    - dos primeros ajustes sobre un producto sin fila: una sola fila, sin `23505` ni `40P01`. Lo serializa también la espera del `ON CONFLICT` sobre el índice único, así que este caso no prueba el `FOR UPDATE`;
    - seis ajustes que reintentan ante `CONFLICT`: todos aplicados, libro cuadrado, cada `balance_after` igual al resultado de su ajuste;
    - un ajuste en curso frena la desactivación, y una desactivación sin confirmar frena el ajuste, que termina en `inactive_product` sin efectos;
    - evidencia de que fallan sin sus bloqueos, registrada en el brief: sin el `FOR UPDATE` del saldo fallan los dos casos de saldo compartido, y sin el `FOR SHARE` del producto, los dos de desactivación;
    - desde la 4.3.3, el historial devuelto después de seis ajustes que reintentan encadena los saldos: del más antiguo al más reciente, cada `balance_after` es el anterior más o menos su cantidad.
  - Historial de movimientos ([brief-4.3.3](../decisions/brief-4.3.3-historial-de-movimientos.md)), cubierto desde la 4.3.3 en `tests/integration/inventory-history.test.ts`, con validación de filtros y páginas en tests unitarios de `inventory`:
    - `created_at` es la hora del `INSERT`: dentro de una transacción que espera antes de insertar, queda posterior a `transaction_timestamp()` (`catalog-inventory-schema.test.ts`);
    - orden del más reciente al más antiguo con desempate por `id`; 25 por página en SQL, y una página fuera de rango se lleva a la última o a la primera;
    - filtro por tipo; período en días de la zona de la organización con fin semiabierto: el borde de medianoche local, la misma consulta con otra zona y el 19/10/2008 de Buenos Aires, un día de 23 horas;
    - fechas inválidas, período invertido y tipo desconocido → `VALIDATION_ERROR` con sus campos; `productHasMovements` distingue "sin resultados" de "sin movimientos";
    - autor con nombre también si está desactivado; contraseña pendiente → `FORBIDDEN`; otra organización o inexistente → `NOT_FOUND`; id inválido → `VALIDATION_ERROR`; un producto desactivado conserva su historial.
  - `audit_logs` ([ADR 0013](../decisions/0013-rol-de-aplicacion-y-tablas-de-solo-insercion.md)), cubierto desde la 3.6 en `tests/integration/audit.test.ts`:
    - rechaza `UPDATE` y `DELETE` para `crm_app` con `42501`, y para el rol dueño por trigger;
    - un registro escrito con `recordAudit` persiste o se revierte junto con el cambio que audita, incluso cuando falla la inserción de auditoría;
    - toda tabla de `public` tiene los privilegios esperados para `crm_app`, y el test demuestra que falla ante una tabla sin ellos.
  - Lectura del historial de auditoría de una entidad (FR-AUD-02, [brief-4.4](../decisions/brief-4.4-ui-de-productos-e-inventario.md)), cubierta desde la 4.4 en `tests/integration/product-audit.test.ts`: un producto reúne sus ediciones (`product`) y sus ajustes de stock (`inventory`) en una sola lista ordenada y paginada de a 25; el autor llega por la interfaz de `auth`, también si está desactivado; `viewer` y contraseña pendiente → `FORBIDDEN`; otra organización o id inexistente → `NOT_FOUND`; id inválido → `VALIDATION_ERROR`; la auditoría de otro producto no se mezcla.
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

- Tests en `tests/guards/` que vigilan reglas del proyecto, no comportamiento: referencias prohibidas por `CLAUDE.md`, frontera entre módulos y, desde la 4.3.1, que `inventories` e `inventory_movements` solo se escriban desde `lockBalance` y `applyStockChange` (`stock-writes.test.ts`, FR-PROD-07). Esta última lee `src/` como texto: no detecta una tabla que llega por un alias ni SQL escrito fuera del repositorio.
- Sin base de datos ni red. Corren en local con `npm run test:guards` y en cada ejecución de CI.
- Cada guarda incluye casos que demuestran que falla ante lo que prohíbe. Una guarda que nunca se vio fallar no protege nada.

### End-to-end
- Playwright sobre las pantallas de [product/Screens.md](../product/Screens.md): como mínimo el camino feliz de cada pantalla y un caso de error o de estado vacío por pantalla.
- Implementado desde la 3.5 ([brief-3.5](../decisions/brief-3.5-pantalla-de-inicio-de-sesion.md), D-8): Chromium sobre `next start`, contra la base `_e2e` sembrada, en local y en CI. Sin mocks: es la evidencia `producer-consumer` de UI ↔ Server Action ↔ servicio ↔ base.
- Obligatorio en cada test de pantalla (D-3): `@axe-core/playwright` sin violaciones WCAG 2.x A ni AA en cada estado (vacío, error, carga bloqueada, éxito), foco al primer error y un recorrido completo solo con teclado.
- Pantalla 1 cubierta en `tests/e2e/login.spec.ts`: ingreso y cookie, mismo mensaje para cuenta inexistente y contraseña incorrecta, email inválido, límite de intentos, redirecciones de FR-ORG-03, cambio obligatorio, cierre de sesión con reenvío de la cookie anterior, botón de mostrar contraseña, teclado, axe y móvil a 375 px.
- Pantallas 6 y 7 cubiertas en `tests/e2e/clients.spec.ts` (5.3): alta desde la lista vacía con la navegación marcada, validación con foco y valores conservados, teléfono duplicado de un cliente inactivo con el aviso en el campo, búsqueda por nombre y por teléfono en otro formato, actividad y paginación en la URL, edición con su resumen de auditoría (sin el texto de las notas), duplicado en la edición, desactivación con confirmación y reactivación, `viewer` con el teléfono enmascarado y sin formularios ni auditoría, cliente de otra organización o id inválido, alta solo con teclado, móvil a 375 px y axe en cada estado, en claro y oscuro. El caso 9 (H-5) junta los documentos, el HTML pedido directamente y las respuestas de RSC de una navegación del `viewer`, y verifica que ninguno contiene el número guardado; el mismo recorrido con `admin` sí lo contiene, y con el enmascarado quitado de `crm` el caso falla (evidencia en el brief-5.3).
- Pantallas 3, 4 y 5 cubiertas en `tests/e2e/products.spec.ts` (4.4): alta desde la lista vacía, SKU repetido en el campo, edición con su registro de auditoría, desactivación con confirmación que quita el formulario de ajuste y reactivación, ajuste registrado con su historial y el saldo nuevo, ajuste que dejaría el stock negativo bloqueado en el formulario, cambio concurrente que pide confirmar de nuevo conservando lo escrito, filtros y página en la URL en la lista y en el historial, `viewer` sin formularios ni auditoría, producto de otra organización o id inválido, alta solo con teclado, móvil a 375 px y axe en cada estado, en claro y oscuro. Los productos los crea cada caso: el camino feliz por la pantalla y los casos de volumen por SQL ([brief-4.4](../decisions/brief-4.4-ui-de-productos-e-inventario.md), D-5).
- Pantalla 10 y marco común cubiertos en `tests/e2e/users.spec.ts` (3.7): lista con "(vos)" y navegación, alta con contraseña inicial de un solo uso, email repetido, cambio de rol auditado, desactivación con confirmación que cierra la sesión abierta del usuario, reactivación, último `admin`, `viewer` sin datos, miembro de otra organización, filtros y página en la URL, móvil a 375 px, teclado y axe.
- Un `INTERNAL` real no se fuerza de punta a punta: el mensaje y el log se prueban con tests unitarios.

## Datos de prueba

- Fixtures y seeds propios, sintéticos y versionados en el repo: seeds en `seeds/`, fixtures junto al test que los usa ([RepositoryStructure.md](../architecture/RepositoryStructure.md)). Ningún fixture usa datos reales ni provenientes de Airtable.
- Un seed "básico" para desarrollo local (pocas filas, legible) y un seed "volumen" para probar paginación y rendimiento con más datos, ambos sintéticos. El básico existe desde la 3.5 (`seeds/basic.ts`), con test de idempotencia y de rechazo de una base no permitida (`tests/integration/seed.test.ts`). Desde la 6.2 ([brief-6.2](../decisions/brief-6.2-seeds-sinteticos-de-conversaciones.md)) existen el seed de conversaciones de ejemplo (`seeds/conversations.ts`) y el de volumen (`seeds/volume.ts`), cubiertos en `tests/integration/conversations-seed.test.ts` con una fecha de referencia fija y un volumen chico:
  - toda conversación sembrada tiene al menos un mensaje, `started_at` igual a su primer `sent_at` y `last_message_at` igual al último; el test se corrió una vez con el seed alterado para confirmar que lo detecta;
  - el seed de conversaciones incluye los tres estados, conversaciones sin cliente, un cliente inactivo, un mensaje que en UTC cae en otro día, una conversación que cruza la medianoche local, el 19/10/2008 de Buenos Aires (23 horas) y cuerpos con marcado, nulos, largos y con emojis, guardados tal cual;
  - los dos son idempotentes: una segunda corrida, aun con otra fecha, no agrega ni mueve filas; el de conversaciones repone el estado y los clientes;
  - el volumen es determinista (misma huella con el mismo tamaño), queda en su propia organización y un tamaño mayor conserva las filas existentes;
  - ninguno corre fuera de una base `_dev`, `_test` o `_e2e`.
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
