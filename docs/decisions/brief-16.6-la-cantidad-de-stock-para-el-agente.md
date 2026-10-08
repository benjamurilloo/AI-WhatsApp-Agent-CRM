---
schema: task-brief.v1
task_id: "16.6"
task_type: integration
generated_at: 2026-10-08
---

# Brief 16.6 — La cantidad de stock para el agente

- **Contrato**: `task-brief.v1`
- **Tipo de tarea**: `integration`
- **Nivel de evidencia objetivo**:
  - `deterministic` para la ruta, el servicio y el contrato, contra PostgreSQL real;
  - `isolated-runtime` para el despliegue;
  - `producer-consumer` para el agente como consumidor real.
- **Nivel de validación alcanzable**: validado localmente y en CI, desplegado en producción y validado en integración con el agente. No es «preparado para producción».
- **Orden**: sexta y última subfase de la Fase 16 ([Roadmap](../planning/Roadmap.md) §Fase 16). Con ella el usuario cierra la fase (decisión del 2026-10-08).
- **Estado**: **aprobado por el usuario el 2026-10-08**, con las recomendaciones de D-1 a D-8 y las dos precisiones de H-1, del mismo día, y la precisión de D-3 (R-1). La tarea 16.6 estuvo en «En proceso» en Notion desde entonces. **Cerrado el 2026-10-08**, junto con la Fase 16 (§Cierre).

## Objetivo

Que el agente sepa si alcanzan las unidades que pide un cliente. Hoy la lectura de productos trae solo `stock_status` (`disponible`, `bajo_stock` o `sin_stock`), y el Roadmap lo registró así:

> un turno real del 2026-10-05 mostró que, con solo `stock_status`, el agente no puede saber si alcanzan las unidades que pide el cliente.

## Lo que se verificó antes de escribir este brief

Contraste con las reglas vigentes, releídas el 2026-10-08:

- **Por qué no se expuso la cantidad**: la 11.3 la dejó afuera porque el documento de brechas decía que no hacía falta, y porque «es un dato de negocio que el cliente final no necesita saber» ([brief-11.3](brief-11.3-api-de-lectura.md), alternativa (b)). La 12.5 le preguntó al agente y cerró la N-1: no la necesitaba ([brief-12.5](brief-12.5-turno-completo-en-staging.md), D-9). Un turno real la reabrió.
- **El contrato**: el producto de read-v1 es estricto, y **un campo nuevo en una respuesta no es compatible dentro de v1**. Sí lo es una ruta nueva ([read-v1](../contracts/read-v1.md) §Versionado).
- **FR-API-01** dice «con su precio vigente y su estado de stock, sin la cantidad». Overview dice lo mismo de `inventory`. Exponer la cantidad cambia ese requisito, o suma uno nuevo.
- **El modelo**: `inventories.quantity_on_hand` es `numeric(14,3)`, nunca negativo ([ADR 0008](0008-stock-nunca-negativo.md)). El estado se deriva comparándolo con `reorder_point` (`catalog/service.ts`). La lectura de servicio del catálogo con stock vive en `inventory` (`getCatalogProductForService`), que ya depende de `catalog`.
- **El pedido del agente** se recibió en su respuesta a la 16.2, fuera del repositorio. Su texto exacto no está en el repositorio: el brief se apoya en lo que registraron el Roadmap y la 16.2.

### Hallazgo H-1 (después de aprobar el brief)

Al pasar la tarea a «En proceso», su descripción en Notion trajo el pedido del agente del 2026-10-07: la cantidad como «entero >= 0 o null», y que el brief decida «si la cantidad lleva tope». El brief no lo había visto.

- **`null` no hace falta**: un producto sin fila en `inventories` tiene saldo 0 por definición (`inventory/schema.ts`, D-7 de la 4.3). El CRM siempre tiene una cantidad.
- **Formato: decimal en texto**, como D-3, y no entero. `quantity_on_hand` es `numeric(14,3)` y la unidad es texto libre, así que un producto puede venderse por kilo o por metro. *Decidido por el usuario el 2026-10-08, con la recomendación.* El pedido al agente lo explica.
- **Sin tope**: la ruta devuelve la cantidad real. Qué le dice el agente al cliente es su política de venta, y se la pedimos explícita (D-1). *Decidido por el usuario el 2026-10-08, con la recomendación.*

## Decisiones

### D-1 — Qué se expone

- **(a) La cantidad disponible**, como decimal en texto, con la unidad del producto.
- **(b) Solo si alcanzan**: el agente pregunta por una cantidad y el CRM responde sí o no, sin revelar el número.

**Recomendación**: (a). Cubre «¿alcanzan?» y también «¿cuántas quedan?», que (b) no responde. Decidir si se le dice el número al cliente es una política de venta: queda del lado del agente, y se la pedimos explícita en la coordinación (D-6). Con (b), además, el agente igual puede deducir el número preguntando varias veces.

### D-2 — Dónde

- **(A) Lectura v2 de productos**: las dos rutas de productos en `/api/read/v2/`, con el campo nuevo. El agente migra las dos, y v1 y v2 conviven hasta que deje v1.
- **(B) Una ruta nueva en v1**: `GET /api/read/v1/products/{product_id}/stock`. Compatible dentro de v1: nada de lo que el agente ya lee cambia.

**Recomendación**: (B). Es un cambio compatible, sin migración ni dos versiones conviviendo. El agente la llama solo cuando un cliente pide una cantidad: un pedido más por producto, dentro del límite de 120 por minuto. Con (A), todas las búsquedas traerían la cantidad aunque no haga falta.

### D-3 — La respuesta

**Recomendación**:

```json
{ "contract_version": "1", "product_id": "…", "quantity_available": "12", "unit": "unidad", "stock_status": "disponible" }
```

- `quantity_available`: el saldo de `quantity_on_hand`, como decimal en texto, **nunca un número de JSON**, como `price.amount`. Forma canónica: sin ceros de más a la derecha y hasta tres decimales (`"12"`, `"2.5"`, `"0"`).
- `unit` y `stock_status` van en la misma respuesta, para que el agente no combine dos lecturas de momentos distintos. *Precisión aprobada el 2026-10-08* (revisión independiente, R-1): decía «leídos en la misma consulta». Son consultas separadas, porque Overview prohíbe el `JOIN` entre módulos, y el estado se deriva de la cantidad devuelta, así que nunca la contradice.
- **No trae** el punto de reposición, los movimientos ni quién los hizo.
- Estricto, como el resto del contrato.

### D-4 — Producto inactivo, ajeno o inexistente

**Recomendación**: `404 NOT_FOUND`, sin distinguir entre los tres, como el detalle del producto. Un id que no es UUID da `400` con el campo `product_id`.

### D-5 — Credencial y requisitos

**Recomendación**:
- alcance `read`, el mismo de los productos, con el mismo límite y el mismo log de ruta fija;
- **FR-API-01 no cambia**, y se suma **FR-API-09**: «Un sistema externo con una credencial de lectura puede leer la cantidad disponible de un producto activo de su organización, con su unidad y su estado de stock». FR-API-08 ya existe (2026-09);
- Overview: la fila de `inventory` dice que la cantidad se expone solo por esta ruta.

### D-6 — Etapas y coordinación con el agente

**Recomendación**, como la 16.2 y la 16.3:
- **16.6.1**: la ruta, el servicio, el contrato, fixtures con forma asumida, tests y documentos. Validado localmente.
- **16.6.2**: el despliegue, sin migraciones. Validado en producción con un `401` sin token y la ruta respondiendo con la credencial de prueba.
- **16.6.3**: el pedido al agente, con autorización, y una ventana en la organización de demostración: un turno real donde el cliente pide una cantidad y el agente responde con la cantidad leída. Conciliado contra el log y el catálogo de demostración. Una respuesta capturada pasa a fixture `"shape": "captured"`.

El pedido le pregunta además al agente si dice el número al cliente o solo si alcanza (D-1).

### D-7 — Revisión independiente

Cambia un contrato con el agente.

**Recomendación**: sí, antes del commit de la 16.6.1.

### D-8 — Cierre de la 16.6 y de la Fase 16

**Recomendación**: la 16.6 cierra con la 16.6.3 conciliada y tu aprobación. El cierre de la Fase 16 va en el mismo turno, con tu decisión, que es su gate de salida: el proyecto de la fase y su tarea espejo en «Completado» en Notion, el Roadmap y el HANDOFF.

## Alcance incluido

- `src/app/api/read/v1/products/[productId]/stock/route.ts` y su handler, nuevos;
- `src/app/api/read/v1/contract.ts` y `contract.test.ts`: el esquema de la respuesta y su forma canónica;
- `src/modules/inventory/` (`service.ts`, `repository.ts`, `index.ts`): la lectura de servicio de la cantidad;
- `tests/integration/read-api-product-stock.test.ts`, nuevo;
- `tests/fixtures/read/v1/`: fixtures nuevos de la ruta;
- `tests/guards/exposed-surface.test.ts`: la ruta nueva;
- `tests/e2e/read-api.spec.ts`: la ruta en las cabeceras de `proxy.ts`, si el spec las enumera;
- documentos:
  - `docs/contracts/read-v1.md`: la ruta, el log, el versionado y la evidencia;
  - `docs/product/FunctionalRequirements.md`: FR-API-09;
  - `docs/architecture/TraceabilityMatrix.md`, `SecurityModel.md` (inventario de entradas) y `Overview.md` (fila de `inventory`);
  - `docs/architecture/IntegrationBoundaries.md`, si enumera las rutas de lectura;
  - este brief;
- el pedido al agente, en el Escritorio, con autorización;
- en el cierre: `CHANGELOG.md`, `HANDOFF.md`, `docs/decisions/README.md`, `docs/planning/Roadmap.md` y, si la N-1 figura, `docs/planning/Risks.md`.

## Alcance excluido

- **Cambiar las rutas de productos existentes** o crear una v2 de la lectura (D-2).
- **El punto de reposición, los movimientos o el stock por depósito.**
- **Reservar stock** para un cliente o descontarlo: eso es de pedidos, en la Fase 19 ([ADR 0016](0016-el-crm-se-amplia-hacia-un-erp-por-fases.md)).
- **Migraciones.**
- **Cambios en el agente**: los hace él, en su repositorio.

## Fuentes de verdad

- El código y el contrato `read-v1`.
- DataModel (`inventories`), Overview, SecurityModel e IntegrationBoundaries.
- Los briefs de la 11.3 y la 12.5.
- El Roadmap §Fase 16.

## Invariantes

1. **Ninguna respuesta existente de la lectura cambia.**
2. **La ruta no escribe**: es de solo lectura, como todo read-v1.
3. **Ninguna organización lee la cantidad de otra**, y un producto inactivo no existe para la ruta.
4. **La cantidad nunca viaja como número de JSON.**

## Criterios de aceptación

- **AC-1** (D-3): con una credencial `read`, la ruta devuelve la cantidad de un producto activo, en forma canónica, con su unidad y su estado. Lo prueban casos con entero, con decimales, con cero y con el estado en cada valor.
- **AC-2** (D-4, invariante 3): un producto inactivo, de otra organización o inexistente da el mismo `404`; un id inválido da `400`.
- **AC-3** (D-5): sin credencial da `401`; con alcance `ingest` o `context`, `403`; el límite de `429` se comparte con las demás rutas de la credencial; el log lleva la ruta fija, sin el id.
- **AC-4** (invariantes 1 y 2): los tests y fixtures existentes de la lectura siguen iguales, y la ruta no escribe en ninguna tabla.
- **AC-5**: el validador estricto rechaza un campo de más y una cantidad como número de JSON.
- **AC-6**: la ruta está en la guarda de superficie expuesta, en SecurityModel y en read-v1. FR-API-09 aparece en los tests y en la matriz.
- **AC-7**: la batería completa da verde: formato, lint, tipos, unitarios, guardas, integración, build y end-to-end. Además, cada una de estas mutaciones da rojo:
  - la ruta sin el filtro por organización;
  - la ruta sin el filtro de activos;
  - la cantidad como número de JSON.
- **AC-8** (D-7): revisión independiente antes del commit, con cada hallazgo verificado.
- **AC-9** (16.6.2), con autorización: desplegado sin migraciones, con los recuentos iguales antes y después, y la ruta en `401` sin token.
- **AC-10** (16.6.3), con autorización: el agente lee la cantidad en un turno real de la demostración, y la conciliación del log coincide con lo que respondió.
- **AC-11**: el usuario aprueba el cierre de la 16.6 y de la Fase 16.

## Pruebas y evidencia requerida

- `deterministic`: la ruta y el servicio contra PostgreSQL real, con las mutaciones de AC-7 en rojo.
- `isolated-runtime`: el despliegue, con comandos y salidas en este brief, sin secretos ni IP.
- `producer-consumer`: la ventana con el agente, conciliada.

## Condiciones de detención

Detenerse y avisar si pasa algo de esto:

- hace falta tocar un archivo fuera de la lista, o una migración;
- hace falta cambiar una respuesta existente de la lectura;
- el agente pide algo que no es esta ruta, por ejemplo la cantidad en la búsqueda.

También hay que pedir autorización explícita en su turno **antes de**:

- pasar la 16.6 a «En proceso» en Notion;
- el commit de la 16.6.1 y el push;
- el despliegue;
- el pedido al agente y la ventana;
- el cierre de la 16.6 y de la Fase 16.

## Resultados 16.6.1

**Nivel alcanzado**: validado localmente (`deterministic`). Commit `40253d6`, con autorización del usuario del 2026-10-08; CI 37804285565, `success`, leída por `headSha`, con los end-to-end completos.

- **Implementado**:
  - `GET /api/read/v1/products/{product_id}/stock`, en `src/app/api/read/v1/products/[productId]/stock/`, con alcance `read`;
  - `getProductStockForService` en `inventory`, que lee el producto activo con `getActiveProductForService` de `catalog` y el saldo con `findBalances`, y deriva el estado de ese mismo saldo;
  - `productStockResponseSchema`, `contractQuantity` y `toContractProductStock` en el contrato;
  - tres fixtures con forma asumida, la ruta en la guarda de superficie y en las cabeceras del end-to-end;
  - FR-API-09, read-v1, la matriz, SecurityModel (66 puntos de entrada, 10 Route Handlers), Overview e IntegrationBoundaries.
- **Batería** (2026-10-08):
  - formato, lint, tipos y build pasan;
  - unitarios: 590 tests; guardas: 485, corridas con `git add -N` de los dos archivos nuevos, porque la guarda lista con `git ls-files`;
  - integración: 800 tests en 50 archivos, entre ellos los 8 de `read-api-product-stock.test.ts`;
  - end-to-end, en la tercera corrida, sobre el mismo build: 132 de 133, con la ruta nueva en `read-api.spec.ts`. El que falló es el caso 7 de `clients.spec.ts`, por el tiempo máximo de 30 s en su `beforeEach`, que hace un `TRUNCATE`; la corrida tardó 19,7 minutos, más del doble de lo normal. La máquina local estaba degradada; la corrida limpia es la de la CI del commit;
  - **Caídas de proceso sin causa encontrada**: en la primera corrida de integración, un worker de Vitest terminó con `3221226505` en `ingestion.test.ts`, y en la segunda corrida pasaron los 800. En la segunda corrida de end-to-end, `next start` dejó de responder en el caso 11 de conversaciones, y las 96 pruebas siguientes fallaron por conexión rechazada. Es el mismo síntoma de la 16.4: sucede en esta máquina, en archivos que la 16.6 no toca.
- **Mutaciones de AC-7**, cada una en rojo y revertida byte por byte (revisión independiente, R-3):
  - `findProduct` de `catalog` sin el filtro por organización: el caso 3 en rojo;
  - `getActiveProductForService` sin el filtro de activos: el caso 3 en rojo;
  - la cantidad como número de JSON: 5 casos de integración y 1 del contrato en rojo.

### Revisión independiente (D-7, AC-8)

La hizo un agente que no participó del trabajo, con acceso de solo lectura, el 2026-10-08. Fijó la escala antes de mirar. Ningún hallazgo bloqueante ni medio. Cada hallazgo se verificó contra el código.

- **R-1**, bajo: D-3 dice que la unidad y el estado se leen «en la misma consulta», y el código hace consultas separadas, sin transacción: el producto, su precio y el saldo. Overview prohíbe el `JOIN` entre tablas de módulos distintos, así que el código sigue la regla vigente. Lo esencial de D-3 se cumple: el estado se deriva de la misma cantidad que se devuelve, así que nunca la contradice. **Confirmado. Precisión de D-3 aprobada por el usuario el 2026-10-08**: «misma respuesta, con el estado derivado de la cantidad devuelta».
- **R-2**, bajo: IntegrationBoundaries enumera las rutas de lectura y no tenía la nueva. **Confirmado y corregido.**
- **R-3**, bajo: las mutaciones no estaban registradas. **Confirmado y corregido** arriba.
- **R-4**, bajo: el caso 8 no llevaba FR-API-09 y la matriz lo contaba. **Confirmado y corregido.**
- **R-5**, nota: «no escribe» se mira sobre cuatro tablas; `serveRead` escribe la ventana del límite por diseño. **Confirmado, sin cambio**: el servicio solo hace `SELECT`.
- **R-6**, nota: la lectura consulta el precio vigente, que la ruta descarta. **Confirmado, sin cambio**: una consulta más, dentro del límite.
- **R-7**, nota: `.claude/settings.json` no entra en el commit. **Confirmado.**
- **R-8**, nota: tres líneas ya falsas, anteriores a la 16.6, en archivos de la lista:
  - FunctionalRequirements e IntegrationBoundaries decían que la lectura no tenía consumidor conectado;
  - read-v1 contaba cuatro rutas en el end-to-end de cabeceras.

  **Confirmado y corregido**: las dos primeras quedan tachadas, con la corrección fechada y su evidencia; la tercera, con la cuenta actual.

Las correcciones son autoevaluación: el revisor no las vio.

## Resultados 16.6.2 (AC-9)

Desplegado en producción el 2026-10-08, con autorización del usuario en el turno, siguiendo «Desplegar un cambio» de `deploy/production/README.md`.

1. **CI del SHA exacto**: `40253d6be06e1c5abc6f6b0bd204d735f3339657`, `"conclusion":"success"`.
2. **Lo que estaba desplegado**, anotado en `/var/lib/crm-production/despliegues`: `975034fb5802575e972c699381f07aab8b00cb76`. Es el SHA para volver atrás; la 16.6 no tiene migraciones.
3. **Código, dependencias, migración, build y reinicio**: `db:migrate` no aplicó ninguna, la última línea dio `desplegado: 40253d6be06e1c5abc6f6b0bd204d735f3339657`, y el servicio quedó `active`.
4. **Recuentos de `crm_production`**, en una transacción de solo lectura, antes y después: las 20 tablas y las 31 migraciones, iguales.
5. **Desde afuera**: `GET /api/read/v1/products/{id}/stock` sin token responde `401`, igual que `GET /api/read/v1/products`; `/login` y `/api/health`, `200`.

Nivel: `isolated-runtime` para el despliegue. La ruta con la credencial del agente es la 16.6.3.

## Resultados 16.6.3 (AC-10)

El pedido al agente (D-6) se le pasó con autorización del usuario. El agente conectó la ruta en su flujo y contestó la política con el número (D-1), que queda en `read-v1.md` como la del consumidor. La conciliación es del lado del CRM, en solo lectura: el log estructurado, `messages`, `ingestion_events`, `inventories` e `inventory_movements`. Horas en UTC.

**La lectura de prueba**, a las 18:25:45, antes de la ventana. El agente buscó `q=aurora` y leyó la cantidad del Celular Aurora X3 64 GB. Los dos `X-Request-Id` que informó están en el log del CRM, con `code: OK`, emisor `agente-demo`, la organización de demostración y la ruta fija. La pidió como texto, y el cuerpo que llegó fue, byte por byte:

```json
{"contract_version":"1","product_id":"293164d9-b293-4f28-a62b-b2c5b76ac7a0","quantity_available":"1","unit":"unidad","stock_status":"bajo_stock"}
```

Coincide con la base: 1 unidad y punto de reposición 2. Es `tests/fixtures/read/v1/captured-product-stock.json`, `"shape": "captured"`; el archivo lo guarda con sangría.

**La ventana**, de 19:06 a 19:36, en la organización de demostración de producción, con el teléfono del usuario como único cliente y el guion del agente. El stock de los tres productos se leyó antes de empezar y no hubo ningún movimiento de inventario en el día.

| Paso | Pregunta del cliente | El agente informó | El CRM registró | Coincide |
|---|---|---|---|---|
| 1 | 3 celulares Aurora X5 | lectura `cb20dde1…`, `"8"`, `disponible`; contestó que hay 8 | búsqueda y `/stock` `OK` a las 19:09:10.353 | sí |
| 2 | 2 celulares Aurora X3 | lectura `90740c8e…`, `"1"`, `bajo_stock`; contestó que queda 1 y si le sirve | búsqueda y `/stock` `OK` a las 19:10:15.038 | sí |
| 3 | si quedan cargadores Voltio | sin lectura: la búsqueda trajo `sin_stock`; contestó que no hay | búsqueda `OK` a las 19:11:03, ninguna lectura de `/stock` | sí |
| 4 | cuántos quedan del Aurora X5 | lectura `b9d60f1b…`, `"8"`; contestó que tiene 8 | búsqueda y `/stock` `OK` a las 19:12:01.672 | sí |
| 5 | cuánto sale el Aurora X3 | ninguna lectura; dio el precio sin el stock | ninguna búsqueda ni lectura en ese turno | sí |

- En la ventana hubo exactamente **3 lecturas de `/stock`**, las del agente, todas `OK` y del emisor `agente-demo`. Ninguna ruta dio `4xx` ni `5xx`. Las horas del CRM van unos 0,3 s detrás de las del agente: el log se escribe al responder.
- En `messages`: 5 entrantes y 5 salientes del agente; en `ingestion_events`: 20 eventos, todos `processed`.
- **El paso 3 no ejercitó el `"0"`** de un producto sin fila de inventario: el agente contestó con el estado de la búsqueda. Ese caso queda validado localmente (caso 2 de integración).
- **El catálogo de demostración no tiene ningún producto con otra unidad**: la cantidad decimal queda probada solo localmente y en la suite del agente.

**Hallazgo del agente: la correlación lleva el `wamid`.** El `X-Correlation-Id` de sus lecturas en producción empieza con el id del mensaje de Meta, que codifica el teléfono del cliente. Contradice `read-v1.md` §Transporte («No debe llevar datos personales»). Verificado del lado del CRM, contando sin imprimir ningún valor:

- **En la base, nada**: ninguna `external_ref` de `ingestion_events`, `conversations` ni `messages` contiene `wamid`. La regla de la 13.4 para el emisor se cumple.
- **En el journal, 25 líneas** desde el 2026-10-03: 20 de búsqueda de productos, 2 de información del negocio y 3 de la ruta nueva, las de la ventana. La cuarta lectura de la ruta, la de prueba, no salió de un mensaje de Meta: su correlación fue `agent-probe-3.45`. El único cliente de producción es el teléfono del usuario. El journal guarda 30 días ([brief-13.4](brief-13.4-retencion-y-borrado.md), D-6): esas líneas vencen solas hacia el 2026-11-03.

**Decisión del usuario del 2026-10-08**, con la recomendación: se corrige en el origen, como H-4 de la 13.4, en una subfase del agente; el CRM lo registra en Risks y en `read-v1.md`, y no vacía el journal. Rechazar del lado del CRM una correlación con forma de `wamid` sería un cambio de contrato, en una subfase propia.

Nivel: **validado en integración** (`producer-consumer`), en producción, con el agente como consumidor real de la ruta, sobre el catálogo de demostración.

## Cierre

**Cerrada el 2026-10-08**, con la aprobación del usuario, junto con la Fase 16 (D-8).

| Criterio | Estado |
|---|---|
| AC-1 a AC-7 | cumplidos en la 16.6.1 (§Resultados 16.6.1); la batería local, con el end-to-end degradado por la máquina, y limpia en la CI de `40253d6` |
| AC-8 | revisión independiente: R-1 a R-8, verificados; R-1 resuelto con la precisión de D-3 |
| AC-9 | cumplido en la 16.6.2 |
| AC-10 | cumplido en la 16.6.3, con la conciliación del agente coincidente en los cinco pasos |
| AC-11 | el usuario aprobó el cierre de la 16.6 y de la Fase 16 el 2026-10-08 |

- **Nivel**: validado localmente y en CI; desplegado en producción sin migraciones (`isolated-runtime`); **validado en integración** (`producer-consumer`) con el agente. No es «preparado para producción».
- **Decisiones del usuario durante la subfase**: H-1 (decimal en texto, sin tope, sin `null`), la precisión de D-3 (R-1), y la correlación con el `wamid` corregida en el origen.
- **En Notion**: la tarea pendiente del CI («la instalación de Chromium de Playwright corta la corrida por el límite de 15 minutos») pasó del proyecto de la Fase 16 al proyecto raíz, en «Esperando», por decisión del usuario, antes de cerrar la fase.
- **Archivos fuera de la condición literal del alcance** (revisión independiente del cierre, R-9): la fila nueva de Risks no es la N-1, que no figura ahí; la respalda la decisión del usuario sobre la correlación (§Resultados 16.6.3).
- **Contradicción registrada, sin corregir** (revisión independiente del cierre, R-2): `docs/runbooks/datos-de-un-cliente.md`, fuera de la lista de archivos, dice que el journal no guarda el teléfono. Desde el 2026-10-03 no es cierto para la correlación del agente, hasta su corrección y el vencimiento de esas líneas. Risks lo dice en la fila de la correlación y en «Lo que el borrado no alcanza».
- **No certifica**:
  - el `"0"` de un producto sin movimientos ni una cantidad decimal, leídos por el agente: validados solo localmente;
  - una lectura fallida (`404`, `429`, `5xx`), que no se provocó: el agente dice que contesta con el estado de la búsqueda;
  - los bytes de las lecturas de la ventana: n8n las guarda parseadas. La de prueba sí son los bytes.
- **Revisión independiente del cierre**, de solo lectura, el 2026-10-08: 12 hallazgos, ninguno bloqueante (2 medios, 6 bajos, 4 notas), verificados contra los archivos. Corregidos: R-1 (la fila de Risks estaba en la tabla de tres columnas), R-3, R-4, R-5, R-6, R-7, R-12 y R-9 (anotado arriba). R-2 queda registrado arriba. R-8: la verificación de la corrección es una tarea en Notion. R-10 y R-11 son anteriores a este cierre y no se tocaron.
- **Autoevaluación declarada** para la 16.6.2, la 16.6.3 y las correcciones de este cierre. La revisión independiente cubrió la 16.6.1 y los documentos del cierre.
