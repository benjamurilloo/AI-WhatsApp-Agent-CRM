---
schema: task-brief.v1
task_id: "18.2"
task_type: implementation
generated_at: 2026-10-10
---

# Brief 18.2 — El costo del producto con historial y el margen derivado

- **Contrato**: `task-brief.v1`
- **Tipo de tarea**: `implementation`
- **Nivel de evidencia objetivo**: `deterministic` para el esquema, el servicio, la guarda y el cálculo del margen, contra PostgreSQL real; `producer-consumer` para la pantalla (end-to-end sobre `next start`) y para el contrato de lectura del agente, que no cambia; `isolated-runtime` para el despliegue, si se autoriza (D-10).
- **Nivel de validación alcanzable**: **validado localmente y en CI**, **validado en integración** para la pantalla y, con D-10, **desplegado en producción** con la revisión del usuario. No es «preparado para producción».
- **Orden**: segunda y última subfase de la Fase 18 ([Roadmap](../planning/Roadmap.md) §Fase 18), después de la 18.1, cerrada el 2026-10-10. Implementa el punto 5 y la primera fila del punto 7 del [ADR 0019](0019-bases-de-los-comprobantes.md).
- **No abre ni cierra gate.** Crea una tabla y el primer dato del CRM que un `viewer` **no** puede leer. Por eso se recomienda la revisión independiente (D-9).
- **Estado de este documento**: **aprobado el 2026-10-10** por el usuario, con las recomendaciones de D-1 a D-10. La tarea 18.2, `3f5702be6f4e811f8820db49471f1c3a`, estuvo en «En proceso» en Notion desde ese día. **Cerrado el 2026-10-10** (§Cierre, al final).

## Objetivo

Que un `admin` pueda cargar **el costo de un producto**, con historial de solo inserción como el precio, y ver **el margen** que resulta del precio vigente y del costo vigente, con la base del ADR 0019, punto 5, dicha en la pantalla.

## Lo que se verificó antes de escribir este brief

Releído o verificado en el código el 2026-10-10:

- **Ya está fijado** (ADR 0019, punto 5, y [HANDOFF](../../HANDOFF.md) §3, paso 0):
  - el costo es lo que el negocio paga por una unidad, **con el IVA incluido**, lo recupere o no;
  - margen = precio vigente − costo vigente, con el porcentaje sobre el precio;
  - no hay margen si las monedas difieren o si falta uno de los dos, y la pantalla dice sobre qué base se calcula;
  - `product_costs` es de solo inserción, como `product_prices`. El agente no lee el costo.
- **El precio es el molde.** Lo que se repite está en:
  - `setProductPrice` de `src/modules/catalog/service.ts`: solo `admin`, el producto bloqueado `FOR UPDATE`, `CONFLICT` con el id del precio esperado, el mismo valor no escribe ni audita, y un producto inactivo da `BUSINESS_RULE_VIOLATION`;
  - la migración `drizzle/0017_*`: el valor nuevo del enum, la FK compuesta, los `CHECK`, el índice del historial, `SELECT` e `INSERT` para `crm_app` y el trigger `P0001`;
  - la pantalla `productos/[productId]/precios/`, la guarda `tests/guards/price-writes.test.ts` y `tests/integration/product-prices.test.ts`.
- **Hoy, un `viewer` ve todo lo de un producto salvo la auditoría.** Ve el precio, el historial de precios y los movimientos de stock. La auditoría ya es solo de `admin`, en dos capas: `listProductAudit` exige `admin` (`service.ts`, línea 345) y el detalle ni siquiera la pide para un `viewer` (`[productId]/page.tsx`, línea 122). **Un `cost_change` en la auditoría no se le filtra a un `viewer`.**
- **El agente** lee los productos por [read-v1](../contracts/read-v1.md) §Productos, con campos explícitos. El caso 6b de `tests/integration/read-api.test.ts` (17.2) fija que los campos nuevos no cambian la búsqueda ni el detalle; se repite para el costo.
- **Dos listas de tablas en los tests** suman cada tabla nueva: `tests/integration/identity-schema.test.ts` y `tests/integration/audit.test.ts`. El simulacro de restauración (`deploy/production/crm-restore-check.sh`) nombra solo `product_images`, para sus hashes: no cambia.
- **La Fase 22** (compras y recepción) va a «actualizar el costo» (Roadmap §Fase 22). Esta subfase no le agrega nada: el costo de la 18.2 lo carga una persona, y cuando una recepción escriba costos, esa fase decidirá si hace falta una columna de origen. Prepararla ahora sería una columna especulativa.
- **Producción** corre `45e7b70`, con la migración `0034`. La de esta subfase es la `0035`.

**Contraste con las reglas vigentes** (paso 5 de la skill, con `grep` sobre DataModel, Overview, Roadmap, Screens, FunctionalRequirements, ADR 0016 y brief-15.4):
- DataModel, **regla 14**, ya anuncia `product_costs` en la 18.2.
- **§`product_prices`** dice que el precio «no tiene costo (regla 14)»: es cierto del precio y sigue siéndolo, porque el costo va en su propia tabla. Se le agrega una referencia a la tabla nueva.
- **Screens.md** y **brief-15.4** (D-1): el costo y el margen que dibujan los bocetos se dejaron «para la Fase 18», y esta subfase los muestra.
- **ADR 0016**, §Consecuencias: «el costo no se muestra hasta la Fase 18», y esta es la Fase 18.
- **Overview.md**: el costo vive en `catalog`, igual que el producto y el precio. El margen no cruza módulos ni necesita un `JOIN` entre módulos.
- **No apareció ninguna contradicción.**

## Alcance incluido

1. **Esquema** (migración `0035`):
   - la tabla `product_costs`, con las mismas columnas, `CHECK`, FK compuesta e índice de historial que `product_prices`;
   - de solo inserción: `SELECT` e `INSERT` para `crm_app` y el trigger `product_costs_insert_only` con `P0001` (ADR 0013, regla 10);
   - el valor `cost_change` en `audit_action`.
2. **Servicio `catalog`**:
   - `setProductCost`: el molde de `setProductPrice` (D-5), con auditoría `cost_change` en la misma transacción;
   - leer el costo vigente y el historial paginado, **solo para `admin`** (D-1);
   - **el margen** como función pura y probada (D-6): recibe el precio vigente y el costo vigente, y devuelve el monto, el porcentaje sobre el precio y, según D-2, el recargo sobre el costo, o el motivo por el que no hay margen (`no_price`, `no_cost`, `currency_mismatch`).
3. **Pantallas**, según D-3 y D-4:
   - una página nueva, `/productos/[id]/costos`, solo para `admin`: el costo vigente, el formulario para fijar uno nuevo con la confirmación del monto formateado, el historial y el margen con su base;
   - en el resumen del producto, una tarjeta «Costo y margen», solo para `admin`;
   - el enlace en la barra del producto, solo para `admin`;
   - el resumen de auditoría entiende `cost_change`.
4. **Guarda nueva**, `tests/guards/cost-writes.test.ts`, con el patrón de `price-writes`: falla si algo en `src/` escribe `product_costs` fuera de `insertProductCost`. Lleva sus casos de fallo versionados.
5. **El agente no ve el costo**: un caso nuevo en `read-api.test.ts`, como el 6b, con un producto con costo cuya búsqueda y detalle conservan exactamente sus claves y no mencionan el costo.
6. **Seed básico** (D-8).
7. **Documentación**:
   - `DataModel.md`: la tabla, el enum, la regla 10 (la lista de tablas de solo inserción), la regla 8 (tablas de eventos que no se borran) y la referencia desde §`product_prices`;
   - `FunctionalRequirements.md`: **FR-PROD-19** (fijar el costo, solo `admin`, con historial) y **FR-PROD-20** (ningún camino modifica ni borra un costo fijado), más **FR-PROD-21** (el margen, su base y quién lo ve). FR-PROD-18 ya existe (17.5);
   - `Screens.md`, `TraceabilityMatrix.md` y `EngineeringStandards.md` (la guarda nueva).

## Alcance excluido

- **Toda lectura del costo para el agente o un servicio**: ni `read-v1` ni una versión nueva. El agente no lee el costo.
- **El costo en la lista de productos** (D-4), en el dashboard o en las métricas.
- **El margen sobre montos netos**, la condición frente al IVA y las alícuotas: esperan la 13.5.2-b (ADR 0019, puntos 5 y 7).
- **Tipos de cambio**: con monedas distintas, no hay margen.
- **El costo cargado automáticamente** por una compra o una recepción (Fase 22), un costo promedio ponderado o un costo por lote.
- **El costo en el alta del producto**: igual que el precio, se carga después, desde el detalle (brief-15.4, D-4).
- **Datos de volumen** (`seeds/volume.ts`).
- **El repositorio del agente** y avisarle que el precio quedó fijado como precio final, que el usuario dejó para más adelante.
- **Staging.**

## Archivos autorizados

Crear o modificar solo estos. Tocar cualquier otro es una condición de detención.

- `drizzle/0035_*.sql` y `drizzle/meta/*`, generados con `drizzle-kit generate` y revisados a mano
- `src/modules/catalog/`: `schema.ts`, `repository.ts`, `service.ts`, `index.ts` y `service.test.ts`, más `margin.ts` y `margin.test.ts` (nuevos)
- `src/modules/audit/schema.ts`: **solo** el valor nuevo del enum
- `src/app/(autenticado)/productos/[productId]/costos/` (nuevo), `[productId]/page.tsx`, `[productId]/product-sub-nav.tsx`, `[productId]/audit-summary.ts` y `audit-summary.test.ts`
- `src/app/(autenticado)/productos/[productId]/precios/messages.ts`: **solo** si un mensaje se comparte con la página de costos en lugar de duplicarse
- `tests/integration/product-costs.test.ts` (nuevo); `tests/integration/identity-schema.test.ts` y `tests/integration/audit.test.ts`, **solo** la tabla nueva en sus listas; `tests/integration/read-api.test.ts`, **solo** el caso nuevo
- `tests/guards/cost-writes.test.ts` (nuevo) y `tests/e2e/products.spec.ts`
- `seeds/basic.ts`
- `docs/architecture/DataModel.md`, `docs/architecture/TraceabilityMatrix.md`, `docs/product/FunctionalRequirements.md`, `docs/product/Screens.md`, `docs/development/EngineeringStandards.md`
- al cerrar: este brief, `docs/planning/Roadmap.md` (la Fase 18), `docs/decisions/README.md`, `CHANGELOG.md` y `HANDOFF.md`

*Ampliada el 2026-10-10 por el usuario, durante la implementación* (ver §Resultados y §Revisión independiente): `tests/e2e/product-fields.spec.ts`, `tests/e2e/product-images.spec.ts` y `tests/e2e/security-headers.spec.ts`, **solo** `product_costs` en su `TRUNCATE`; `tests/guards/exposed-surface.test.ts`, **solo** la declaración de `setCostAction`; y `docs/architecture/SecurityModel.md`, los recuentos de superficie y la regla de lectura por rol.

`src/shared/money/` **no** se toca: el margen se calcula con `bigint` dentro de `catalog`. Si hiciera falta cambiarlo, es una condición de detención.

## Fuentes de verdad

- **El código y las migraciones**: `catalog` y `audit`, `drizzle/0017_*` y `src/shared/money/`.
- **Las decisiones**:
  - el [ADR 0019](0019-bases-de-los-comprobantes.md), puntos 5 y 7;
  - el [ADR 0013](0013-rol-de-aplicacion-y-tablas-de-solo-insercion.md), sobre las tablas de solo inserción;
  - el [ADR 0016](0016-el-crm-se-amplia-hacia-un-erp-por-fases.md);
  - el [brief-11.1](brief-11.1-catalogo-comercial.md), D-5 a D-7 y la revisión independiente: los patrones del precio que se repiten.
- **Los contratos**: [read-v1](../contracts/read-v1.md), que no cambia.

## Decisiones pendientes

Cada una con su recomendación. El usuario aprueba o cambia.

**D-1. Quién ve el costo y el margen.**
- (a) **Solo `admin`. Recomendada.** El costo es un dato del negocio que un empleado con acceso de lectura no necesita, y es lo que la auditoría ya hace. Es el primer dato de un producto que un `viewer` no ve, y se aplica en el servicio, no solo en la pantalla: `getProductCost`, el historial y el margen devuelven `FORBIDDEN` a un `viewer`, y la página `/costos` le muestra el mensaje de acceso denegado de siempre.
- (b) Todos los usuarios, como el precio.

**D-2. Si se muestra el recargo sobre el costo** (ADR 0019, §Lo que no decide).
- (a) Solo el margen sobre el precio.
- (b) **El margen y el recargo, cada uno con su nombre. Recomendada.** «Margen: 50,0 % del precio» y «Recargo: 100,0 % sobre el costo». Muchos comercios ponen el precio con un recargo («le pongo un 30 % arriba»), y los dos se derivan de los mismos datos sin columnas nuevas. Con el nombre explícito no se confunden.

**D-3. Dónde va.**
- (a) **Una página propia, `/productos/[id]/costos`, con el formulario, el historial y el margen, y una tarjeta «Costo y margen» en el resumen, con un enlace a la página. Las dos, solo para `admin`. Recomendada.** Repite la forma del precio, y la página del precio sigue igual para un `viewer`.
- (b) El costo dentro de la página de precios. Esa página la ve un `viewer`, así que habría que partirla por rol.

**D-4. Si la lista de productos muestra el costo o el margen.**
- (a) **No. Recomendada.** La lista ya muestra el precio y el stock, y sumar columnas que dependen del rol complica una pantalla que usan los dos roles. Puede entrar después, si el uso lo pide.
- (b) Una columna de margen para `admin`.

**D-5. Las reglas del costo.** **Recomendada: las del precio, sin excepciones.**
- monto mayor que cero, hasta dos decimales según la moneda, y las mismas monedas aceptadas (`acceptedCurrencies`);
- **el producto inactivo rechaza un costo nuevo**, como el precio;
- fijar el mismo monto y la misma moneda no escribe ni audita;
- el costo esperado distinto del vigente da `CONFLICT`, con el producto bloqueado `FOR UPDATE`.
- **La moneda del costo es libre**: puede diferir de la del precio, y entonces no hay margen.

**D-6. Cómo se calcula y se muestra el porcentaje.** **Recomendada**:
- todo en `bigint`: el porcentaje en décimas de punto, `(precio − costo) × 1000 / precio`, redondeado con el medio hacia afuera del cero, igual que el ADR 0019, punto 4. Se muestra con un decimal, como «50,0 %»;
- el recargo, igual, sobre el costo;
- el margen negativo (el costo supera al precio) se muestra con su signo y el aviso «El costo supera el precio»;
- **la base, siempre visible** junto al margen: «Calculado sobre el precio final y el costo, los dos con impuestos incluidos. Si el negocio recupera el IVA de sus compras, el monto incluye IVA.» Es la mitigación del riesgo que el ADR 0019 escribe en §Consecuencias;
- sin margen, el motivo: «Sin precio», «Sin costo» o «El precio y el costo están en monedas distintas».

**D-7. La prueba de que el agente no ve el costo.** **Recomendada**: el caso nuevo de `read-api.test.ts` (alcance, punto 5). Ninguna ruta de servicio lee `product_costs`. Si lo hiciera, la guarda no lo vería, porque solo mira escrituras: lo cubre el caso.

**D-8. El seed básico.** **Recomendado**: costos en algunos productos, incluidos uno con dos costos (para que haya historial), uno con el costo en otra moneda que el precio (sin margen), uno con el costo mayor que el precio (margen negativo) y uno sin costo.

**D-9. La revisión independiente.** **Recomendada**: un agente de solo lectura contra este brief y las reglas vigentes. Es el primer dato restringido por rol dentro de una entidad que los dos roles leen. Una fuga a un `viewer` o al agente no se ve en la pantalla de un `admin`.

**D-10. El despliegue a producción.** **Recomendado**: sí, después de la revisión independiente y con la CI del SHA exacto en `success`, según [deploy/production/README.md](../../deploy/production/README.md) §Desplegar. Lleva la migración `0035` y se autoriza aparte, en su turno. Un valor nuevo de enum no se revierte con un rollback de código, pero el código anterior no lo lee, así que volver a `45e7b70` sigue siendo seguro.

## Invariantes

- `product_costs` no se modifica ni se borra por ninguna vía de la aplicación, y la base lo rechaza para cualquier rol.
- Ningún costo apunta a un producto de otra organización: la FK compuesta lo impide.
- Ni un `viewer` ni el agente leen el costo o el margen por ninguna vía.
- El precio, su página y `read-v1` no cambian de forma ni de comportamiento.
- El dinero nunca pasa por `number`.
- Cada cambio de costo queda auditado en la misma transacción.

## Criterios de aceptación

- **AC-1**: la migración `0035` crea `product_costs` con la FK compuesta, `CHECK (amount > 0)`, el formato de moneda, el índice de historial y `cost_change` en el enum. `crm_app` tiene solo `SELECT` e `INSERT`, y un `UPDATE` o un `DELETE` da `P0001` con el rol dueño. Lo prueba un test de integración contra PostgreSQL.
- **AC-2**: `setProductCost` repite las reglas de D-5. Un `viewer` recibe `FORBIDDEN`; un producto inexistente o de otra organización, `NOT_FOUND`; uno inactivo, `BUSINESS_RULE_VIOLATION`; el mismo valor, `changed: false` sin fila ni auditoría; un esperado vencido, `CONFLICT` con el vigente. Dos llamadas concurrentes se ordenan, y la segunda recibe `CONFLICT`.
- **AC-3**: el costo vigente es la última fila (`created_at desc, id desc`), y el historial se pagina en SQL. Las dos lecturas devuelven `FORBIDDEN` a un `viewer`.
- **AC-4**: la función del margen devuelve, con pruebas unitarias para cada caso: el monto y el porcentaje (y el recargo, si D-2 (b)) con el redondeo de D-6; `no_price`, `no_cost` y `currency_mismatch`; el margen negativo; y una moneda sin decimales (CLP).
- **AC-5**: la página `/costos` y la tarjeta del resumen muestran el costo, el margen, el motivo cuando no hay margen y la base de D-6. Un `viewer` no ve la tarjeta ni el enlace, y en `/costos` recibe el mensaje de acceso denegado. Lo prueba un end-to-end con los dos roles sobre `next start`.
- **AC-6**: la auditoría registra `cost_change` con el antes y el después (los del primer costo en `null`), y el resumen de auditoría lo muestra como «Cambio de costo».
- **AC-7**: la guarda `cost-writes` pasa con el código y falla con cada uno de sus casos versionados.
- **AC-8**: el caso nuevo de `read-api.test.ts` prueba que la búsqueda y el detalle de un producto con costo conservan exactamente sus claves de `read-v1`.
- **AC-9**: la batería de la CI completa pasa en local (formato, lint, typecheck, unitarios, guardas, integración y end-to-end) y en la CI del SHA del cierre.
- **AC-10**: la documentación del punto 7 queda actualizada, sin reescribir ninguna decisión anterior.
- **AC-11** (si D-10): producción corre el SHA del cierre con la migración `0035` aplicada. Un `admin` fija un costo en la organización del operador y ve el margen, y la lectura del agente de la demostración sigue respondiendo igual.

## Pruebas y evidencia requerida

- `deterministic`: AC-1 a AC-4, AC-6 a AC-8, contra PostgreSQL real de desarrollo y de la CI.
- `producer-consumer`: AC-5 (UI ↔ servicio ↔ base) y AC-8 (el contrato de lectura que consume el agente, que no cambia).
- `isolated-runtime`: AC-11, si se despliega.
- La batería se corre **desde Git Bash**: en esta máquina, el `bash` de PowerShell es el de WSL y no hereda las variables de entorno (cierre de la 18.1).

## Condiciones de detención

Parar e informar antes de seguir si:
- hace falta tocar un archivo fuera de la lista autorizada, `src/shared/money/` incluido;
- `read-v1`, la página del precio o su comportamiento tendrían que cambiar;
- aparece una vía por la que un `viewer` o el agente lee el costo y que este brief no previó;
- el margen exigiría la condición frente al IVA o una alícuota;
- un test que pasaba deja de pasar y la causa no es de esta subfase.

Y siempre **antes** de: el commit, el push, pasar tareas de estado en Notion, ejecutar migraciones contra una base que no sea la local o la de la CI, y desplegar. Cada una necesita autorización explícita en su turno.

## Resultados — 2026-10-10 (autoevaluación)

Implementado el 2026-10-10. **Esta sección es autoevaluación**: la escribió quien implementó. La revisión independiente de D-9 va aparte.

### Lo que la implementación encontró que el brief no decía

- **El seed básico no tiene productos** (D-8). `seeds/basic.ts` solo crea la organización y los usuarios; los productos con precio están en `seeds/pilot.ts`, fuera de la lista autorizada. **Decisión del usuario del 2026-10-10**: no se agregan costos a ningún seed. Los casos que D-8 pedía (dos costos, otra moneda, margen negativo, sin costo) los cubren `product-costs.test.ts` y `products.spec.ts`, casos 24 y 25. D-8 queda corregida así.
- **`TRUNCATE products` falla si `product_costs` no va en la misma sentencia**, tenga filas o no (`cannot truncate a table referenced in a foreign key constraint`). Lo hacían **cuatro** specs end-to-end (*corregido por la revisión independiente, B-2*: esta sección decía «tres» y no había visto `security-headers.spec.ts`). Se confirmó corriendo `product-fields.spec.ts`, que falló en su `beforeEach`. `products.spec.ts` estaba autorizada. **`product-fields.spec.ts` y `product-images.spec.ts` no lo estaban: el usuario autorizó el 2026-10-10 agregar `product_costs` a su `TRUNCATE`**, sin otro cambio. La integración no se ve afectada: `reset-database.ts` vacía todas las tablas de `public` de forma dinámica.
- **La barra del producto la usan tres páginas**, y dos (movimientos y precios) no estaban autorizadas. En vez de pasarle el rol desde cada página, `ProductSubNav` pasó a ser un componente asíncrono que lee la sesión con `requireSession`, que `cache` resuelve una sola vez por request. Ocultar el enlace es presentación: la página `/costos` y su servicio rechazan a un `viewer` por su cuenta.
- **`getProductCostSummary` devuelve también el producto**, para que la página `/costos` no lo lea dos veces.
- **La guarda del journal de producción (13.4.1) no figuraba en EngineeringStandards**, ni en la lista ni en el recuento: el párrafo decía «quince» y había dieciséis. Es la cuarta vez que pasa el defecto H-4 de la 8.4. Se encontró al ir a sumar `cost-writes`, se agregó a la lista y el recuento quedó en diecisiete.

### Contraste por criterio

- **AC-1**: cumplido. `drizzle/0035_product_costs.sql`, generada y completada a mano con el `GRANT` y el trigger. `product-costs.test.ts`, §esquema y §solo inserción: los defaults, los `CHECK`, la FK compuesta, el índice, `cost_change` en el enum, `SELECT` e `INSERT` exactos para `crm_app`, `42501` para `crm_app` y `P0001` para el rol dueño. `identity-schema.test.ts` y `audit.test.ts` suman la tabla.
- **AC-2**: cumplido. `product-costs.test.ts`, §`setProductCost` y §conexiones simultáneas: `FORBIDDEN` para el `viewer` y para el admin con la contraseña pendiente, `NOT_FOUND` para otra organización, `BUSINESS_RULE_VIOLATION` para un producto inactivo, `changed: false` sin fila ni auditoría, `CONFLICT` también con el id en mayúsculas, y dos llamadas concurrentes que se ordenan sobre el mismo bloqueo.
- **AC-3**: cumplido. El vigente y su desempate por id, el historial paginado y llevado a la última página, y el `FORBIDDEN` de las dos lecturas para un `viewer`.
- **AC-4**: cumplido. `margin.test.ts`, 9 casos: el ejemplo del ADR 0019 (121 contra 60,50 da 50,0 % y 100,0 %), el redondeo del medio hacia afuera en los dos signos, el margen negativo, el CLP sin centavos y los tres motivos sin margen. Todo en `bigint`.
- **AC-5**: cumplido, a nivel `producer-consumer`. `products.spec.ts` sobre `next start`:
  - **caso 24**: el admin rechaza un costo cero, fija uno, ve el margen y el recargo con su base, el margen negativo con su aviso, el motivo con monedas distintas y el historial;
  - **caso 25**: un `viewer` no ve la tarjeta, ni el enlace en las tres páginas del producto, ni el monto en el cuerpo, y `/costos` le muestra el acceso denegado;
  - axe en claro y en oscuro en cuatro estados.
- **AC-6**: cumplido. `cost_change` con el antes y el después, y el primero en `null` (`product-costs.test.ts`). «Cambio de costo» y «Costo: … → …» en `audit-summary.test.ts` y en el caso 24.
- **AC-7**: cumplido. `cost-writes` pasa con 22 casos. Las mutaciones sobre `src/`:
  - en rojo: un `update` de Drizzle en el servicio, un `delete` en SQL con esquema y comillas, la función autorizada renombrada (dos tests en rojo) y un `insert` con la tabla interpolada fuera de ella;
  - en verde, como se esperaba: una lectura;
  - restaurado, 22 de 22.
- **AC-8**: cumplido. `read-api.test.ts`, caso 6c. Con un costo cargado, la búsqueda y el detalle son idénticos a los de antes, y el cuerpo crudo no contiene el monto ni «cost». **Mutación**: la lectura de servicio leyó `findCurrentCosts` en lugar de `findCurrentPrices`, que es una fuga con el nombre del precio; el caso se puso en rojo, y al restaurar volvió a verde.
- **AC-9**: ver §Batería, al final del brief. *Cerrado con la CI de `0c2f322`: §Cierre.*
- **AC-10**: cumplido. DataModel (la tabla, el diagrama, el enum y las reglas 8, 10 y 14), FR-PROD-19 a 21, Screens (la pantalla 5c), TraceabilityMatrix y EngineeringStandards. No se reescribió ninguna decisión anterior.
- **AC-11**: pendiente. El despliegue se autoriza aparte (D-10). *Cumplido el 2026-10-10: §Cierre.*

### Alcance real

Todos los archivos tocados están en la lista autorizada, más las dos specs que el usuario autorizó. No se tocaron `src/shared/money/`, ningún seed, ni la página, la acción o los mensajes del precio.

## Revisión independiente — 2026-10-10 (D-9)

La hizo un agente de solo lectura que no participó del trabajo (`self_assessment: false`). No ejecutó nada: leyó el código, los tests y los documentos. Cada hallazgo se verificó contra el código antes de aceptarlo. El veredicto fue **R1**, con dos bloqueantes, cuatro no bloqueantes y una observación.

- **B-1 (bloqueante, verificado)**: `setCostAction` no estaba declarada en `tests/guards/exposed-surface.test.ts`. La guarda lista los archivos con `git ls-files`, así que, mientras `costos/actions.ts` no estuviera en git, daba un **falso verde**, igual que en la 11.1. En la CI del commit habría fallado. **Corregido**, con la autorización del usuario del 2026-10-10 para tocar ese archivo: `setCostAction` se declaró con `requirement: "sesion"`. También se actualizaron los recuentos de SecurityModel: 76 puntos de entrada, 20 páginas y 37 Server Actions bajo `(autenticado)`.
- **B-2 (bloqueante, verificado)**: `tests/e2e/security-headers.spec.ts` vaciaba `products` sin `product_costs`, en su `afterAll` y en su `beforeEach`. **Corregido** con la autorización del usuario, sin otro cambio. Un `grep` sobre `tests`, `scripts`, `seeds` y `deploy` no encuentra ningún otro `TRUNCATE` de `products` sin `product_costs`.
- **N-1 (verificado)**: SecurityModel decía «Lectura permitida a ambos roles dentro de su organización», y FR-PROD-21 lo contradice. **Corregido** en SecurityModel, con la autorización del usuario: la frase suma las excepciones (la auditoría, los datos de contacto completos del cliente y, desde la 18.2, el costo y el margen).
- **N-2 (verificado)**: las mutaciones de `cost-writes` no eran una por forma, como exige EngineeringStandards. **Completadas sobre `src/modules/catalog/service.ts`**:
  - en rojo, una por forma: el `insert` y el `delete` de Drizzle, el espacio de nombres (`schema.productCosts`), `INSERT INTO`, `UPDATE ONLY`, `TRUNCATE TABLE ONLY`, el `update` con la tabla interpolada y `DELETE FROM` con esquema sin comillas;
  - en verde, como declara su cabecera: los dos límites (la tabla bajo un alias y el nombre armado con `sql.raw`) y una tabla de nombre parecido (`product_costs_archive`);
  - restaurado, 22 de 22.
- **N-3 (verificado)**: la sección propia de la pantalla 4 de Screens no mencionaba la tarjeta. **Corregido** en «Información mostrada» y en «No mostrar».
- **N-4 (verificado)**: los motivos sin margen dicen «Sin margen: el producto no tiene precio.» y equivalentes, en lugar de «Sin precio» de D-6. **Se conserva el texto implementado**: en una tarjeta que ya muestra «Costo: Sin costo» y «Precio: Sin precio», el motivo necesita decir que se refiere al margen. El sentido de D-6 no cambia, y FR-PROD-21 no fija el texto.
- **O-1**: `.claude/settings.json` no es de esta subfase, y nunca entra en un commit (regla vigente).
- **AC-9**: la revisión marcó que faltaba §Batería. Se agrega después de correr la batería completa con estas correcciones.

**La revisión no encontró fugas** del costo ni del margen a un `viewer`, al agente, a la API de lectura, a la auditoría ni a la caché. Verificó las tres funciones del servicio, las lecturas de servicio, la barra asíncrona y la Server Action.

## Batería — 2026-10-10 (AC-9, local)

Corrida desde Git Bash con las correcciones de la revisión independiente:

- formato, lint, typecheck y build: OK;
- unitarios: 659 de 659;
- guardas: 506 de 507. La que falla es «toda Server Action declarada sigue existiendo» de `exposed-surface`, y es esperable: `setCostAction` ya está declarada, pero `costos/actions.ts` todavía no está en git, y la guarda lista con `git ls-files`. Para comprobarlo, se marcó el archivo con `git add -N` sin commit: la guarda pasó 27 de 27, y sin la declaración falló en «toda Server Action exportada está declarada». Después se desmarcó;
- end-to-end: 154 de 154;
- integración:
  - dos corridas completas fallaron cada una en **un test distinto, por tiempo**: `ingestion.test.ts`, caso 1, en la primera, y dos de `crm.test.ts`, con un test colgado 777 s, en la segunda. Son módulos que esta subfase no tocó, y corridos solos pasaron todas las veces (13 de 13 tres veces y 55 de 55 dos veces);
  - **la tercera corrida completa: 897 de 897, en 274 s**.

  Se atribuye a la máquina, no al cambio: los fallos no se repitieron, fueron siempre por tiempo y no tocaron nada de esta subfase. Queda como observación, sin investigar.

La CI del SHA del cierre es la que cierra AC-9.

## Cierre de la subfase 18.2, 2026-10-10

- **AC-1 a AC-11 cumplidos.**
  - **AC-1 a AC-10**: en local y en la CI de `0c2f322`, run 38073281349, `success`, leída por `headSha`, en 10 min 25 s. En esa CI pasó también `exposed-surface`, ya con `costos/actions.ts` en git; en local, antes del commit, dio 27 de 27 con el archivo en el índice.
  - **AC-11**: en producción.
- **El despliegue**, según [deploy/production/README.md](../../deploy/production/README.md) §Desplegar un cambio:
  - se anotó `45e7b70` en el registro de despliegues, y es la versión para volver atrás;
  - el checkout de `0c2f322`, `npm ci`, la migración, el build y el reinicio terminaron sin errores, con HEAD igual al SHA pedido;
  - migraciones de 35 a 36;
  - `product_costs` existe vacía, con `SELECT, INSERT` exactos para `crm_app`, el trigger `product_costs_insert_only` y `cost_change` en el enum;
  - los recuentos de `products` (5), `product_prices` (6), `audit_logs` (57), `organizations` (2), `clients` (2) y `messages` (84) quedaron iguales;
  - el servicio está activo, sin avisos en el journal desde el reinicio, y `/login` responde `200`.
- **La lectura del agente** sigue respondiendo `401` sin token desde afuera, y entre `45e7b70` y `0c2f322` no cambió nada en `src/app/api` ni en `deploy/`. **No se probó con token**: el token no pasa por la conversación. Lo que la respalda es el caso 6c de `read-api.test.ts` (AC-8), en local y en CI.
- **El recorrido del usuario**: en la organización del operador, como `admin`, fijó dos costos a un producto con precio y vio el margen, el recargo y el historial. Lo dio por correcto el 2026-10-10. Después, producción tenía 2 filas en `product_costs` y 2 eventos `cost_change` (`audit_logs` pasó de 57 a 59), con productos y precios sin cambios.
- **Revisión**: la independiente de D-9, con B-1, B-2 y N-1 a N-3 corregidos y N-4 conservado con su motivo. La batería, el despliegue y este cierre son autoevaluación declarada.
- **Decisiones del usuario**:
  - el brief, con las recomendaciones de D-1 a D-10;
  - sin seed de costos;
  - el `TRUNCATE` de las tres specs end-to-end fuera de la lista;
  - `exposed-surface` y SecurityModel fuera de la lista;
  - el commit y el push de `0c2f322`, el despliegue, este cierre y el de la Fase 18.
- **Nivel**:
  - validado localmente y en CI;
  - **validado en integración** para la pantalla, con end-to-end sobre `next start`, y para `read-v1`;
  - desplegado en producción y recorrido por el usuario (`isolated-runtime`).

  No es «preparado para producción».
- **No certifica**:
  - que el margen sea exacto para un responsable inscripto: el monto incluye el IVA, y el porcentaje solo es exacto con alícuotas iguales (ADR 0019, punto 5). La condición del negocio real frente al IVA es una pregunta de la 13.5.2-b;
  - que un `viewer` no vea el costo **en producción**: se probó en el end-to-end (caso 25), no en el recorrido;
  - la lectura del agente con su token (arriba);
  - los fallos por tiempo de `ingestion` y `crm` en la integración local: observados, sin investigar.
- **Permiso de la sesión**: para el despliegue, el usuario agregó a su configuración local una regla que permite `ssh crm-production` sin pedir confirmación, después de que el clasificador del modo automático rechazara el primer acceso. Esa regla no está versionada. **Una regla de permiso no es una autorización**: cada despliegue se sigue autorizando en su turno.
- **Pendiente heredado**:
  - `TraceabilityMatrix.md` §3, atrasada;
  - el paso 7 de la verificación de `deploy/production/README.md` pide recuentos en cero, y producción tiene datos desde la 13.5;
  - el simulacro de restauración del 2026-11-01.
