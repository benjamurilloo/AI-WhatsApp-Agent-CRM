# Brief 11.3 — API de servicio de lectura

- **Contrato**: `task-brief.v1`
- **Tipo de tarea**: `feature`
- **Nivel de evidencia objetivo**: `deterministic` para la credencial, el límite de tasa, las lecturas y el contrato, contra PostgreSQL real; `isolated-runtime` local para las cabeceras de las rutas nuevas (end-to-end sobre `next start`).
- **Nivel de validación alcanzable**: **validado localmente y en CI**. **No** llega a validado en integración: el contrato no tiene consumidor. Según el gate de la Fase 11, eso se declara y no se infiere ([Roadmap](../planning/Roadmap.md) §Fase 11). Nada se despliega a staging. El primero en usarlo allá es el piloto (11.4).
- **Orden**: va después de la 11.1 y de la 11.2, que cerraron el 2026-09-24. La 11.4 depende de esta subfase.
- **No abre ni cierra gate.** El gate de salida de la Fase 11 lo cierra la 11.4. La revisión independiente no es obligatoria. Se recomienda igual (D-12): es la primera superficie de lectura del CRM hacia otro sistema.
- **Estado de este documento**: **aprobado el 2026-09-24**, con las doce decisiones resueltas por la recomendación (ver §Resolución). En implementación.

## Objetivo

Que el agente de WhatsApp pueda leer del CRM, con una credencial de servicio y sin sesión humana, las dos cosas que la Fase 11 construyó para él:

- **productos activos** buscados por palabras, con su precio vigente y su estado de stock;
- **información del negocio vigente hoy**, con o sin texto de búsqueda.

Todo por un **contrato de lectura v1** versionado en `docs/contracts/`, con validador ejecutable y fixtures declarados como forma asumida, como el de ingestión.

El resultado verificable: un request sintético con una credencial de lectura recibe exactamente lo que el contrato dice, y el log permite encontrar ese request por el identificador de correlación que mandó el emisor. Una credencial de lectura no puede escribir por la ingestión, ni al revés.

**Obligaciones que toma** (mapa de la [brief-11.0](brief-11.0-instrumentos-antes-de-construir-encima.md), fila 11.3; [brief-10](brief-10-evaluacion-del-mvp.md), fila 11.3):

- **La parte de lectura de B-2** del documento de brechas.
- **R-1, pieza 1**: `logEvent` en cada ruta, con `request_id`, `source`, ruta, resultado y duración.
- **R-1, pieza 2**: un identificador de correlación del emisor, registrado.
- **O-22**: comprobar que `proxy.ts` sigue aplicando las cabeceras a las rutas nuevas.
- **O-33**: comprobar que la revocación de credenciales no queda expuesta por HTTP.
- **C-6**: nombrar al emisor sin que la guarda de referencias prohibidas dispare, y sin tocar la guarda.
- **Pregunta 5 de las brechas**: ¿el límite de 120 pedidos por minuto alcanza para el tráfico del agente? (D-6).
- **Lo que la 11.1 y la 11.2 le dejaron** (HANDOFF §3): el hueco de `stock-writes.test.ts`, el `EXPLAIN` del precio vigente y la búsqueda con volumen, que ahora incluye la de `knowledge` (D-10).

## Lo que se verificó antes de escribir este brief

Verificado el 2026-09-24 contra el código. Nada de esta sección es supuesto.

- **Qué necesita leer el agente, como contexto de negocio.** El documento de brechas del usuario (repositorio del agente, rama `agent/brechas-crm-airtable`, `b75e484`) se leyó con `git show`, sin cambiar de rama. De ahí sale solo **qué** lee el agente:
  - productos buscados por palabras sobre nombre, categoría y marca, **hasta 10 resultados**, con descripción, marca, categoría, condición, precio y estado de inventario;
  - información del negocio **activa y sin vencer**, buscada por palabras;
  - «no hace falta exponer la cantidad exacta al agente: alcanza con el estado de stock» (B-8);
  - cada turno hace varias llamadas: B-2 pregunta si 120 por minuto alcanza.
  
  **Ningún campo, ruta ni nombre de este brief viene de las tablas del sistema actual del agente.** La forma sale del modelo del CRM ([ADR 0014](0014-el-agente-de-whatsapp-como-consumidor-del-crm.md), punto 2).
- **Lo que ya existe y se repite** (6.5.3, `src/modules/ingestion/`):
  - token con prefijo, 32 bytes aleatorios, guardado solo como SHA-256 (`credentials.ts`);
  - `organization_id` y `source` salen de la credencial, nunca del request;
  - límite de 120 por minuto por credencial, en ventanas fijas de PostgreSQL (`rate-limit.ts`, tabla `ingestion_rate_windows`);
  - modo de prueba con `INGESTION_ENABLED` y una allowlist de ids (`config.ts`): apagado responde `404` sin cuerpo;
  - el handler registra con `logEvent` cada respuesta, con `request_id`, `route` fija, `code`, organización, `source` y duración, sin token ni payload (`handler.ts:188-203`).
- **Las lecturas existentes no sirven tal cual**: todas reciben un `AuthContext` de una persona (`organizations/service.ts:21-27`) y pasan por `authorize`, que mira el rol y la contraseña pendiente. Un servicio no tiene ni rol ni contraseña.
- **Las consultas que la API necesita, y cómo están hoy**:
  - `catalog.findProducts` trae **todos** los productos que coinciden, sin orden ni límite, y `inventory` los ordena por nombre en memoria (`inventory/service.ts:76-108`, límite aceptado en la 4.2, D-1). Para el agente hacen falta los 10 más relevantes, con `ts_rank` y `LIMIT` en SQL, como ya hace `knowledge.findEntries`;
  - el precio vigente de varios productos (`catalog.findCurrentPrices`) existe, sin `EXPLAIN` medido (M-6 de la 11.1);
  - el saldo de varios productos (`inventory.findBalances`) y el estado de stock (`catalog.deriveStockStatus`) existen;
  - las entradas vigentes de `knowledge` ya se calculan en SQL, con el día de la zona de la organización.
- **El log**: `LogEvent` (`src/shared/log/index.ts:9-21`) escribe por lista blanca. No tiene un campo para la correlación. La guarda `log-surface.test.ts` exige que `route` sea un valor fijo.
- **Las cabeceras** (O-22): el `matcher` de `src/proxy.ts:105` cubre todo menos los estáticos, así que las rutas nuevas **deberían** recibir la CSP y las demás. Hoy ningún test lo comprueba para una ruta `/api`.
- **La revocación** (O-33): `revokeIngestionCredential` filtra solo por id y la usa **solo** `scripts/ingestion-credential.ts`. Ningún archivo de `src/app` la importa (`git grep`).
- **La guarda de referencias prohibidas** (C-6) busca `/ai-whatsapp-agent(?!-crm)/i` en todo archivo versionado fuera de la documentación (`forbidden-references.test.ts:11`).
- **La superficie expuesta**: `exposed-surface.test.ts:107-117` declara dos Route Handlers. Cada ruta nueva se declara ahí, y `SecurityModel.md` lleva el recuento (hoy 45 puntos de entrada).
- **El carácter NUL** (N-6 de la 11.2): un NUL en un texto que llega a PostgreSQL produce un error del driver (`22021`) y un `500`. El texto de búsqueda del agente llega de lo que escribe un cliente, así que esta vez hay que rechazarlo en la validación.

## Alcance incluido

Dos etapas (D-1).

### Etapa 11.3.1 — credencial, observabilidad, contrato y productos

1. **Credencial de lectura** (D-2):
   - migración `0020`, generada: columna `scope` en `ingestion_credentials`, con los valores `ingest` y `read`. Las credenciales existentes quedan en `ingest`;
   - la autenticación recibe el alcance exigido. Una credencial `read` en la ingestión da `FORBIDDEN`, y una `ingest` en la lectura, también;
   - el script de credenciales acepta `--scope`.
2. **Modo de prueba de la lectura** (D-7): `READ_API_ENABLED` y `READ_API_ALLOWED_CREDENTIALS`, con la misma conducta que los de ingestión.
3. **Límite de tasa** (D-6): el mismo mecanismo y la misma tabla, con su propio presupuesto por credencial.
4. **Observabilidad** (D-5):
   - `logEvent` en cada respuesta de cada ruta, incluidos los rechazos, con `request_id`, `source`, ruta fija, código y duración;
   - el encabezado opcional `X-Correlation-Id` del emisor: se valida, se registra como `correlation_id` y se devuelve;
   - `X-Request-Id` en toda respuesta.
5. **Lecturas de productos** (D-3 y D-4):
   - `GET /api/read/v1/products?q=…&limit=…`: productos **activos** que coinciden por palabras o por SKU exacto, ordenados por relevancia en SQL, con `LIMIT`;
   - `GET /api/read/v1/products/{product_id}`: un producto activo;
   - cada producto con su precio vigente (o `null`) y su estado de stock, **sin la cantidad**.
6. **Contrato de lectura v1** (D-8): `docs/contracts/read-v1.md`, un validador ejecutable de las respuestas y fixtures con `"shape": "assumed"`.
7. **Las comprobaciones**: O-22 (cabeceras en las rutas nuevas, end-to-end), O-33 (revocación sin ruta HTTP, guarda) y C-6 (el nombre del emisor, D-9).
8. **Requisitos**:
   - **FR-API-01**: un sistema externo con una credencial de lectura de una organización puede buscar los productos activos de esa organización por palabras, y leer uno por su id, con su precio vigente y su estado de stock, sin la cantidad;
   - **FR-API-03**: la lectura exige una credencial de alcance `read`, no revocada (decía «no activa», errata corregida el 2026-09-24 por R-9 de la revisión independiente) y en la allowlist, con un límite de pedidos por minuto. Cada respuesta queda en el log con su identificador de correlación.

### Etapa 11.3.2 — información del negocio y herencias

1. **Lectura de información del negocio**: `GET /api/read/v1/knowledge?q=…&limit=…`, **solo las entradas vigentes hoy**, con texto opcional.
   - **FR-API-02**: un sistema externo con una credencial de lectura puede leer las entradas de información del negocio vigentes hoy en la zona de la organización, con o sin texto de búsqueda. Nunca recibe una inactiva, programada o vencida.
2. **Herencias** (D-10):
   - el hueco de `stock-writes.test.ts`: las formas que M-2 encontró en `price-writes`;
   - el `EXPLAIN` del precio vigente y de las dos búsquedas de la API, en los tests de integración;
   - **las rutas de la API medidas con volumen** en `scripts/medir-caminos.ts`, contra el seed de volumen de desarrollo;
   - N-3 de la 11.2: los casos de `knowledge` en `module-boundary.test.ts`;
   - el comentario de `catalog/repository.ts` que todavía nombra `productSearchQuery`.
3. **Documentación**, en las dos etapas:
   - `docs/contracts/read-v1.md`;
   - `IntegrationBoundaries.md`: la superficie de lectura deja de ser «no existe todavía»;
   - `DataModel.md`: la columna `scope`;
   - `SecurityModel.md`: los Route Handlers nuevos, el alcance de la credencial y el recuento;
   - `FunctionalRequirements.md`: FR-API-01 a FR-API-03;
   - `Environments.md` y `.env.example`: las dos variables nuevas;
   - `Risks.md`: la respuesta a la pregunta 5 y la condición de O-33;
   - `TraceabilityMatrix.md`, `Overview.md` y `RepositoryStructure.md`.

## Alcance excluido

- **Toda escritura del agente** que no sea la ingestión de mensajes. Es la Fase 12.
- **El contexto del turno**: cliente, conversación, historial, memorias. Es la Fase 12.
- **Conectar el agente**, configurar una credencial real o desplegar a staging. El contrato no se declara validado en integración.
- **La cantidad en stock** en las respuestas (B-8). Si el piloto o el agente la necesitan, es un cambio del contrato.
- **Paginación** en las lecturas: v1 tiene solo `limit` (D-4).
- **Productos inactivos** y entradas no vigentes en cualquier respuesta.
- **Renombrar `ingestion_credentials`** o separar la credencial en un módulo propio (D-2). Se registra como deuda de nombre.
- **Cachés, ETag o respuestas condicionales.** Toda respuesta lleva `Cache-Control: no-store`, como la ingestión.
- **APM o tracing distribuido**: R-1 lo dejó para la Fase 13.
- **Un NUL en los formularios de las pantallas** (N-6 de la 11.2). Esta subfase lo rechaza solo en la API.
- **El agente, su repositorio y cualquier cosa del sistema que hoy usa.**

## Archivos autorizados

Crear o modificar solo estos. Tocar cualquier otro es una condición de detención.

**Etapa 11.3.1**:
- `drizzle/0020_*.sql`, con `drizzle/meta/*`, generada con `drizzle-kit generate` y revisada a mano
- `src/modules/ingestion/`: `schema.ts`, `credentials.ts`, `credentials.test.ts` e `index.ts`, **solo** para el alcance
- `src/modules/catalog/`: `repository.ts`, `service.ts` e `index.ts`, **solo** para la lectura de servicio (y el comentario de la 11.2, en la 11.3.2)
- `src/modules/inventory/`: `service.ts` e `index.ts`, **solo** para componer la lectura de servicio
- `src/shared/log/index.ts` y su test: **solo** el campo de correlación
- `src/app/api/read/v1/` (nuevo): las rutas, sus handlers, la configuración, el validador del contrato y sus tests unitarios
- `scripts/ingestion-credential.ts`: **solo** `--scope`
- `tests/integration/read-api.test.ts` (nuevo) y `tests/integration/ingestion-http.test.ts` (**solo** los casos del alcance)
- `tests/guards/exposed-surface.test.ts`: **solo** los Route Handlers nuevos y el caso de O-33
- `tests/guards/service-read-entry-points.test.ts` (nuevo, D-3)
- `tests/e2e/read-api.spec.ts` (nuevo)
- `tests/fixtures/read/v1/` (nuevo)
- `.env.example`
- `docs/contracts/read-v1.md` (nuevo); `docs/architecture/IntegrationBoundaries.md`, `DataModel.md`, `SecurityModel.md`, `TraceabilityMatrix.md`, `Overview.md` y `RepositoryStructure.md`; `docs/product/FunctionalRequirements.md`; `docs/development/Environments.md`; `docs/planning/Risks.md`

**Etapa 11.3.2**, además:
- `src/modules/knowledge/`: `repository.ts`, `service.ts` e `index.ts`, **solo** para la lectura de servicio
- `tests/guards/stock-writes.test.ts` y `tests/guards/module-boundary.test.ts`: **solo** las herencias
- `scripts/medir-caminos.ts`: **solo** las rutas de la API

**Al cerrar**: este brief, `docs/decisions/README.md`, `CHANGELOG.md` y `HANDOFF.md`.

## Fuentes de verdad

- **El código**: `src/modules/ingestion/` (credencial, límite, modo de prueba, handler), `catalog`, `inventory`, `knowledge`, `src/shared/log`, `src/proxy.ts`.
- **Los contratos y las decisiones anteriores**:
  - [contracts/ingestion-v1.md](../contracts/ingestion-v1.md): el patrón que este contrato repite;
  - el [ADR 0014](0014-el-agente-de-whatsapp-como-consumidor-del-crm.md): consumidor, contratos desde el modelo del CRM, dependencia unidireccional;
  - [brief-6.5.3](brief-6.5.3-autenticacion-de-servicio-y-rate-limit.md) (credencial, límite y modo de prueba), [brief-8.2](brief-8.2-logs-y-privacidad.md) (superficie de log) y [brief-8.4](brief-8.4-revision-de-seguridad.md) (superficie expuesta);
  - la [evaluación 10.1](evaluacion-10.1-mvp.md): R-1, O-22 y O-33;
  - [brief-11.1](brief-11.1-catalogo-comercial.md) y [brief-11.2](brief-11.2-informacion-del-negocio.md): lo que heredan.
- **La documentación de PostgreSQL 18**, búsqueda de texto (`ts_rank`). Se cita con su sección exacta al implementar.
- **Contexto de negocio, nunca dependencia técnica**: el documento de brechas del usuario, B-2, B-8, B-9 y la pregunta 5.

## Decisiones pendientes

Cada una trae una recomendación. El usuario puede aprobarlas en bloque o cambiar cualquiera.

### D-1 — Etapas

- **(a) Recomendada: dos etapas**, cada una con su commit y su CI, como la 11.1. La 11.3.1 arma todo el borde (credencial, modo de prueba, límite, log, contrato) con productos, que es la lectura más compleja. La 11.3.2 suma la información del negocio sobre ese borde ya probado, y las herencias.
- (b) Una sola etapa. Es un cambio grande que toca cuatro módulos, el log y una migración, y un defecto del borde se encontraría recién al final.

### D-2 — Credencial

- **(a) Recomendada: la misma tabla, con alcance.** Una columna `scope` en `ingestion_credentials`, con `ingest` o `read`: **cada credencial tiene un solo alcance**. El agente usa dos credenciales, una para escribir mensajes y otra para leer. Así:
  - una credencial de lectura filtrada no puede escribir;
  - cada una se revoca por separado;
  - cada una tiene su propio presupuesto del límite de tasa;
  - el hash, el formato del token, la revocación y la tabla de ventanas se reutilizan, sin copiar código.
  
  El token de lectura lleva otro prefijo, `crm_read_`, para que se reconozca a la vista en un log o un gestor de secretos. El costo es de nombre: la tabla y el módulo `ingestion` quedan guardando credenciales que no son de ingestión. Se registra en `DataModel.md` y se deja el cambio de nombre para cuando aparezca un tercer alcance.
- (b) Una sola credencial con los dos permisos. Es lo más simple para el agente, pero una filtración de la credencial de lectura, que el agente usa en cada turno, permitiría escribir mensajes.
- (c) Una tabla y un módulo nuevos para las credenciales de servicio, con la ingestión migrada a ellos. Es el diseño más limpio, pero toca todo lo validado en la 6.5.3 para una ganancia de nombre.

### D-3 — Dónde vive la lectura de servicio

- **(a) Recomendada**:
  - **cada módulo dueño expone una función de lectura de servicio** que recibe el `organizationId` de la credencial, no un `AuthContext`:
    - `catalog` busca los activos con relevancia y `LIMIT` en SQL, y lee el precio vigente;
    - `inventory` compone el saldo y el estado, como hoy compone la pantalla 3;
    - `knowledge` lee las vigentes.
  - **Las rutas viven en `src/app/api/read/v1/`**, con un envoltorio común que hace, en este orden: modo de prueba, credencial, alcance, allowlist, límite, validación del request, lectura, respuesta y log. Es el orden de la ingestión.
  - **Una guarda nueva, `service-read-entry-points.test.ts`**, exige que esas funciones se importen **solo** desde `src/app/api/read/`. Una pantalla que las usara se saltearía el rol del usuario. La guarda nace con su caso en rojo versionado y con la lista de formas sintácticas de importación que reconoce (la lección de la 9.0.1: `import { }`, `import * as`, `export { } from` y `export * from`).
- (b) Reutilizar las lecturas existentes armando un `AuthContext` falso con rol `viewer`. Es menos código, pero inventa un usuario que no existe, y `authorize` pasaría a validar algo que no es una persona.

### D-4 — Rutas y respuestas

- **(a) Recomendada**:
  - **`GET /api/read/v1/products?q=…&limit=…`**:
    - `q` es obligatorio, de 1 a 200 caracteres después de recortar, sin caracteres de control;
    - `limit` va de 1 a 25, y por defecto es 10;
    - solo productos activos, que coinciden por palabras sobre nombre, marca y categoría, o por SKU exacto;
    - el orden es por relevancia (`ts_rank`), con desempate por nombre y por id.
  - **`GET /api/read/v1/products/{product_id}`**: un producto activo. Uno inactivo, de otra organización o inexistente da `404 NOT_FOUND`, sin distinguir entre los tres.
  - **`GET /api/read/v1/knowledge?q=…&limit=…`**:
    - solo las entradas vigentes hoy;
    - `q` es opcional. Con texto, ordena por relevancia; sin texto, por categoría y título;
    - `limit` va de 1 a 50, y por defecto es 20.
  - **Forma de un producto**: `product_id`, `sku`, `name`, `description`, `unit`, `brand`, `category`, `condition`, `price` y `stock_status`:
    - `price` es `{ "amount": "1234.50", "currency": "ARS" }` o `null`. El monto es un decimal en texto, **nunca un número de JSON**, con los decimales de la moneda;
    - `stock_status` es `disponible`, `bajo_stock` o `sin_stock`, sin la cantidad.
  - **Forma de una entrada**: `entry_id`, `title`, `category`, `content`, `valid_from` y `valid_until`. Las fechas son de calendario, o `null`.
  - **Sobre**: `{ "contract_version": "1", "items": [...] }` para las listas, y `{ "contract_version": "1", "product": {...} }` para el detalle.
  - **Nombres**: los campos van en inglés con guion bajo, como la ingestión v1. Los valores enumerados son los del modelo del CRM, sin traducir: `new` y `refurbished`, `disponible`, `bajo_stock` y `sin_stock`. Una capa de traducción sería un segundo modelo que mantener.
  - **Sin paginación en v1.** Diez resultados alcanzan para una respuesta por WhatsApp, y el agente puede refinar la búsqueda. Agregar un cursor después es un cambio compatible dentro de v1.
- (b) Exponer la cantidad en stock. El documento de brechas dice que no hace falta, y es un dato de negocio que el cliente final no necesita saber.
- (c) Traducir los valores enumerados al inglés, como `in_stock`.

### D-5 — Correlación y log

- **(a) Recomendada**:
  - el emisor puede mandar `X-Correlation-Id`, con las reglas de las referencias opacas del contrato de ingestión: de 1 a 200 caracteres, sin espacios en los bordes ni caracteres de control;
  - uno inválido da `400 VALIDATION_ERROR` con el campo `correlation_id`, para que el emisor lo corrija en vez de perder la correlación sin saberlo;
  - se registra en el log como `correlation_id` y se devuelve en la respuesta;
  - `LogEvent` suma el campo, que pasa por la lista blanca como los demás. **Ni `q`, ni `limit`, ni ids buscados entran al log**: el texto buscado viene de lo que escribió un cliente;
  - el contrato dice que el identificador **no lleva datos personales**. El CRM no puede verificarlo, y lo declara.
- (b) Ignorar uno inválido. Es más tolerante, pero la correlación se pierde en silencio, que es lo que R-1 quiere evitar.
- (c) Usar `traceparent` de W3C. Es el estándar, pero exige un formato que el agente no produce hoy, y sin APM no aporta más que un identificador opaco. Se reevalúa con R-1, pieza 3 (Fase 13).

### D-6 — Límite de tasa (pregunta 5)

- **(a) Recomendada: 120 por minuto por credencial, con presupuestos separados** para la credencial de lectura y la de ingestión (D-2).

  **La respuesta a la pregunta 5 es una estimación, no una medición**, y así se registra en `Risks.md`:
  - un turno del agente hace, según las brechas, de una a tres búsquedas de producto y una de información del negocio: unas cuatro lecturas;
  - 120 lecturas por minuto dan unos 30 turnos por minuto, uno cada dos segundos, sostenido;
  - para el primer negocio, que atiende a mano hoy, alcanza con margen. En el borde de dos ventanas pasan hasta 240.
  
  Se vuelve a medir con tráfico real en la 12.3, que conecta al emisor. La constante queda con nombre, para cambiarla sin tocar el mecanismo.
- (b) Un límite más alto para la lectura, 600 por minuto. Sin medición, es un número tan arbitrario como el otro, y agranda el daño de una credencial filtrada.
- (c) Un límite configurable por variable de entorno. Agrega una configuración que hoy nadie necesita.

### D-7 — Modo de prueba

- **(a) Recomendada: variables propias**, `READ_API_ENABLED` y `READ_API_ALLOWED_CREDENTIALS`, con la conducta de las de ingestión: apagado por defecto, `404` sin cuerpo, una configuración inválida apaga y queda en el log, y encendido solo acepta los ids de la lista. Encender la lectura no enciende la escritura, que es lo que pide el orden de corte del agente (brechas, §6: primero las lecturas).
- (b) Reutilizar las variables de ingestión. Una sola llave encendería las dos superficies a la vez.

### D-8 — Contrato, validador y fixtures

- **(a) Recomendada**:
  - `docs/contracts/read-v1.md`, con la estructura del de ingestión: transporte, autenticación, límite, modo de prueba, orden de las comprobaciones, cada ruta con sus parámetros y su respuesta, errores, versionado y evidencia;
  - **el validador ejecutable** son esquemas `zod` de las respuestas, en `src/app/api/read/v1/contract.ts`. Cada test de integración valida contra ellos **toda** respuesta de éxito, no solo algunos campos. Un campo de más en una respuesta hace fallar el test: el objeto es estricto, como en la ingestión;
  - fixtures de respuestas en `tests/fixtures/read/v1/`, con `"shape": "assumed"` porque ningún consumidor las verificó. Un test comprueba que el validador los acepta.
- (b) Una especificación OpenAPI. Es el formato de la industria, pero agrega una herramienta y un segundo lugar donde el contrato puede desviarse del código, sin un consumidor que la use todavía.

### D-9 — Nombre del emisor (C-6)

- **(a) Recomendada**: el `source` de ejemplo en el contrato, en los fixtures y en los tests es **`agente-whatsapp`**. No coincide con el patrón de la guarda, que busca el nombre del repositorio. `forbidden-references.test.ts` no se toca y sigue en verde.
- (b) Otro nombre que el usuario prefiera, con la misma condición.

### D-10 — Herencias de la 11.1 y la 11.2

- **(a) Recomendada: todas en la 11.3.2**:
  - **`stock-writes`**: se amplía a la tabla interpolada, el esquema, el espacio de nombres y `TRUNCATE`, con la lista de formas y una mutación por forma, como `price-writes` en la 11.1. La 11.3 toca `inventory`, que es la condición que puso la 11.1;
  - **`EXPLAIN`**: el precio vigente de varios productos, la búsqueda de productos con `ts_rank` y `LIMIT`, y la de información vigente, en los tests de integración. Las aserciones van sobre el `Index Cond` o el `Bitmap Index Scan`, no sobre el nombre del índice (vault, *A Mutation Run Must Change What the Query Returns*, adenda 3);
  - **volumen**: las tres rutas medidas con `medir-caminos.ts` contra el seed de volumen de desarrollo, que tiene 10 001 productos, **sin precios, marcas ni entradas de información**. Se declara lo que eso no mide;
  - **N-3** y el comentario de `catalog`: son de un minuto, y los dos archivos ya se tocan.
- (b) Dejarlas para la 11.4. La 11.4 es el piloto, y sumarle deuda técnica le quita foco.

### D-11 — O-22 y O-33

Son comprobaciones, no decisiones. Se proponen así:

- **O-22**: un caso end-to-end sobre `next start` pide cada ruta nueva y comprueba la CSP, `nosniff`, `Referrer-Policy` y `Cache-Control: no-store`. **Mutación**: con las rutas `/api/read` excluidas del `matcher` de `proxy.ts`, el caso falla. La mutación se restaura y `proxy.ts` no entra en el commit.
- **O-33**: un caso en `exposed-surface.test.ts` exige que ningún archivo de `src/app` importe una función de revocación. Con eso, la condición de O-33 («se reabre si la revocación se expone por HTTP») queda fijada por guarda, no por lectura. **Mutación**: un `import` de la revocación en un handler hace fallar el caso.

### D-12 — Revisión independiente

- **(a) Recomendada**: una revisión de un agente que no participó, de solo lectura, al final de la 11.3.2, contra este brief y `CLAUDE.md`. No es obligatoria porque no hay gate, pero es la primera superficie que otro sistema va a leer, y las dos revisiones anteriores de la Fase 11 encontraron defectos reales.
- (b) Solo autoevaluación, declarada como tal.

## Resolución — 2026-09-24

El usuario aprobó el brief **con las recomendaciones** de las doce decisiones: D-1 a D-12, cada una en su opción (a).

En el mismo turno autorizó el commit del brief, pasar la tarea 11.3 de Notion (`3e4702be6f4e8123b407cb8d477cb71d`) a «En proceso» y empezar la implementación. No autorizó push.

**Ampliación de la lista, autorizada por el usuario el 2026-09-24**, durante la 11.3.1. Se paró antes de tocarlos, como pide la condición de detención; los dos faltaban en la lista:

- `src/modules/ingestion/repository.ts`: **solo** para que `insertCredential` guarde `scope` y `findCredentialByTokenHash` lo devuelva. Sin eso, `credentials.ts` no compilaba (tres errores de `typecheck`, todos por `scope`).
- `docs/contracts/ingestion-v1.md`: **solo** para que su tabla de errores diga que una credencial de otro alcance también da `403`, con fecha.

**Segunda ampliación, autorizada por el usuario el 2026-09-24**, durante la 11.3.2 (opción 1 de las tres que se le plantearon). La lectura de vigentes necesita la zona de la organización, y la única función que la da, `getOrganizationTimezone`, recibe un `AuthContext`:

- `src/modules/organizations/service.ts` e `index.ts`: **solo** para agregar `getOrganizationTimezoneForService(organizationId)`, la misma consulta con la organización de la credencial. Su nombre la pone bajo `service-read-entry-points.test.ts`.
- Se descartaron un `AuthContext` armado a mano, que es la opción (b) de D-3, y leer `organizations` por SQL desde `knowledge`, que esquiva `module-boundary`.

## Invariantes

- Ninguna prohibición de `CLAUDE.md` cambia. `forbidden-references.test.ts` no se toca y sigue en verde.
- El CRM no llama al agente: las rutas nuevas solo responden.
- La organización sale siempre de la credencial, nunca del request. Toda consulta filtra por ella.
- Una credencial `read` no escribe por la ingestión, y una `ingest` no lee.
- Ninguna respuesta de lectura trae un producto inactivo, una entrada no vigente, la cantidad en stock, el historial de precios ni datos de la auditoría.
- Ningún log trae el token, `q`, `limit` ni un id buscado.
- Toda ruta nueva registra con `logEvent` cada respuesta, incluidos los rechazos y el `500`.
- La ingestión no cambia de conducta: `ingestion-http.test.ts` y `ingestion.spec.ts` siguen en verde, salvo los casos nuevos del alcance.
- La búsqueda de productos de las pantallas no cambia de conducta ni de plan.

## Criterios de aceptación

**Etapa 11.3.1**:

- **AC-1 (esquema)**: la `0020` agrega `scope` con un `CHECK` de los dos valores y `ingest` por defecto, y no toca otra tabla. Las credenciales existentes quedan en `ingest`. `DataModel.md` la describe.
- **AC-2 (alcance)**:
  - una credencial `read` en la ingestión da `403 FORBIDDEN` y no consume el límite de ingestión;
  - una `ingest` en la lectura, también;
  - un token `crm_read_` se reconoce, y el script crea las dos clases.
- **AC-3 (borde de la lectura)**, contra PostgreSQL real, con el orden de la ingestión:
  - apagada o con configuración inválida: `404` sin cuerpo;
  - sin credencial, con credencial desconocida o mal formada: `401` con `WWW-Authenticate: Bearer`;
  - revocada, de otro alcance o fuera de la allowlist: `403`;
  - sobre el límite: `429` con `Retry-After`, y un rechazo anterior al límite no lo consume;
  - una sesión del CRM no autentica;
  - toda respuesta lleva `Cache-Control: no-store` y `X-Request-Id`.
- **AC-4 (FR-API-01, productos)**:
  - la búsqueda devuelve solo activos de la organización de la credencial, por palabras o por SKU exacto, en orden de relevancia y con `limit`;
  - cada producto trae su precio vigente o `null`, y su estado de stock, sin la cantidad;
  - el detalle de uno inactivo, de otra organización, inexistente o con id inválido da `404`, `404`, `404` y `400`;
  - `q` vacío, de más de 200 caracteres, con un NUL o con caracteres de control, y `limit` fuera de rango, dan `400 VALIDATION_ERROR` con el campo. **Un NUL nunca llega a PostgreSQL**;
  - los caracteres de `tsquery` no producen errores.
- **AC-5 (FR-API-03, log y correlación)**:
  - cada ruta registra cada respuesta, con los rechazos, con `request_id`, `source`, ruta fija, código, duración y `correlation_id` cuando lo hay;
  - `X-Correlation-Id` se devuelve, y uno inválido da `400`;
  - **ninguna línea del log** de un recorrido completo contiene el token, el texto buscado ni un id buscado;
  - `log-surface.test.ts` sigue en verde sin modificarlo.
- **AC-6 (contrato)**: `read-v1.md` existe. Toda respuesta de éxito de los tests pasa el validador estricto. Los fixtures tienen `"shape": "assumed"` y pasan el validador. **Mutación**: un campo de más en la respuesta de productos hace fallar el test.
- **AC-7 (guardas)**:
  - `exposed-surface.test.ts` declara las rutas nuevas;
  - `service-read-entry-points.test.ts` falla con una importación de una función de lectura de servicio fuera de `src/app/api/read/`, en cada una de las formas sintácticas que declara. **Mutación**: una importación real desde una página, con la forma menos parecida a la del detector;
  - O-33: el caso de revocación, con su mutación (D-11).
- **AC-8 (O-22)**: el end-to-end de cabeceras sobre las rutas nuevas, con su mutación (D-11).
- **AC-9 (C-6)**: el `source` de ejemplo es el de D-9, y `forbidden-references.test.ts` está en verde **sin haberlo modificado** (`git diff` vacío).

**Etapa 11.3.2**:

- **AC-10 (FR-API-02, información del negocio)**:
  - devuelve solo las vigentes de la organización de la credencial, con los casos de vigencia de la 11.2: sin fechas, programada, vencida, inactiva y la zona donde ya es mañana;
  - con texto, por relevancia; sin texto, por categoría y título; con `limit`;
  - las mismas validaciones de `q` y `limit` que AC-4.
- **AC-11 (herencias)**:
  - `stock-writes` detecta las cuatro formas, con una mutación en rojo por forma;
  - `EXPLAIN` de las tres consultas, con aserciones sobre cómo se usa el índice. **Mutación** en cada una;
  - `medir-caminos.ts` mide las tres rutas contra el volumen de desarrollo, con la salida cruda en el brief y lo que no mide declarado;
  - `module-boundary.test.ts` tiene los casos de `knowledge`;
  - el comentario de `catalog/repository.ts` está corregido.
- **AC-12 (pregunta 5)**: `Risks.md` tiene la respuesta de D-6, marcada como estimación, con su fase de revisión.

**En las dos etapas**:

- **AC-13 (documentación)**: los documentos de §Alcance tienen lo nuevo. `SecurityModel.md` tiene el recuento nuevo, contado contra `exposed-surface.test.ts` y `src/app`. FR-API-01 a FR-API-03 están etiquetados en los casos que los prueban.
- **AC-14**: `format:check`, `lint` y `typecheck` en verde. `npm run test` y `npm run test:e2e` completos en verde, con el recuento en este brief. La CI de cada commit en `success`, leída por `headSha`.
- **AC-15**: `git status` muestra solo archivos de la lista. `forbidden-references.test.ts` y `proxy.ts` no cambiaron.

## Pruebas y evidencia requerida

- **Contra PostgreSQL real**: la credencial y su alcance, el límite, las lecturas, el aislamiento, la vigencia y los `EXPLAIN`. Nada con mocks de base.
- **Las corridas de mutación** de AC-6, AC-7, AC-8 y AC-11, con su salida antes y después, y cada archivo restaurado.
- **El log** de un recorrido completo, revisado línea por línea para AC-5.
- **La salida cruda de `medir-caminos.ts`** para AC-11.
- **Los end-to-end** sobre `next start`, declarados como requests sintéticos: no son evidencia de integración con el agente.

## Condiciones de detención

- Antes de commit, push, merge o de abrir un PR.
- Antes de tocar un archivo fuera de la lista.
- Si la migración generada toca algo más que la columna `scope`.
- Si algún test existente de la ingestión falla por el alcance, fuera de los casos nuevos.
- Si la búsqueda de productos de las pantallas cambia de conducta o de plan.
- Si hace falta tocar `proxy.ts` para que las cabeceras apliquen: eso sería un hallazgo de O-22, y se reporta antes de corregirlo.
- Si algún test existente fuera de la lista falla por los cambios.
- Antes de instalar dependencias.
- Antes de ejecutar migraciones contra una base que no sea la local de desarrollo, la de test o la de e2e.
- Antes de crear una credencial en cualquier base que no sea local.

## Resultados — etapa 11.3.1, 2026-09-24 (autoevaluación)

Todo lo de esta sección es **autoevaluación**. La revisión independiente (D-12) va al final de la 11.3.2.

### Lo que la implementación encontró que el brief no decía

- **Faltaban dos archivos en la lista**: `src/modules/ingestion/repository.ts` y `docs/contracts/ingestion-v1.md`. Se paró antes de tocarlos, y el usuario los autorizó (ver §Resolución).
- **HTTP recorta los espacios de los bordes de un encabezado**, y `Headers` también. `" turno"` llega como `"turno"` y es válido, así que la regla «sin espacios al borde» de las referencias opacas no se aplica a `X-Correlation-Id`: nunca le llega un valor con espacios. Tampoco pueden llegar otros caracteres de control, porque `Headers` los rechaza antes. Lo mostró el caso 12, que esperaba `400` para `" turno"` y recibió `200`. El caso quedó con lo que sí llega: una tabulación interna y el largo. El contrato lo dice.
- **Sin el filtro de caracteres de control, un NUL en `q` llega a PostgreSQL y la API responde `500`.** Lo mostró la mutación de AC-4. Era la sospecha de N-6 de la 11.2, ahora medida para esta superficie.
- **El `404` de la API apagada no lleva `X-Request-Id`**, a propósito: responde como una ruta que no existe, igual que la ingestión. «Toda respuesta lleva `X-Request-Id`» vale para la API encendida, y así quedó escrito en el contrato.
- **O-22 se comprobó con la API apagada.** Encenderla en `next start` exigía tocar `playwright.config.ts` y la preparación global, fuera de la lista. `proxy.ts` agrega las cabeceras a toda respuesta de las rutas que cubre su `matcher`, sin mirar qué devolvió la ruta, así que el `404` alcanza para saber si la ruta está cubierta. La mutación lo confirma. **No hay un end-to-end de una lectura con la API encendida**: las lecturas se prueban en integración.
- **El orden de la búsqueda pone primero el SKU exacto**, antes que la relevancia. El brief decía «por relevancia». Un SKU exacto es la señal más fuerte que puede mandar el agente, y la relevancia de un SKU sin palabras en común es cero. Quedó en el contrato.
- **El monto en CLP**: la base guarda `300000.00`, y el contrato escribe `300000`. Si una moneda sin decimales trae centavos, que la escritura nunca deja guardar, la API responde `500` en vez de redondear. El caso 14 usa justamente eso para provocar el error inesperado.

### Corridas de mutación

| Criterio | Mutación | Resultado | Restaurado |
|---|---|---|---|
| AC-6 | un campo de más (`is_active`) en cada producto de la respuesta | 4 casos de `read-api.test.ts` fallan con «respuesta fuera del contrato» | 14 de 14 |
| AC-7 | una página real (`productos/page.tsx`) importa `inventory` como namespace y usa `searchCatalogForService`: la forma menos parecida a un import con nombre | la guarda falla nombrando `src/app/(autenticado)/productos/page.tsx` | 18 de 18 |
| AC-7, O-33 | la ruta de productos importa `ingestion` como namespace y nombra `revokeIngestionCredential` | `exposed-surface` falla nombrando `src/app/api/read/v1/products/route.ts` | 24 de 24 |
| AC-4 | `q` sin el filtro de caracteres de control | el caso 5 falla: `expected 500 to be 400`. El NUL llega a PostgreSQL | 14 de 14 |
| AC-8, O-22 | `matcher` de `proxy.ts` sin `/api/read` y `npm run build` | `read-api.spec.ts`: 2 de 2 fallan, sin CSP | `proxy.ts` sin cambios en `git status`, y build repetido |

### Contraste por criterio

- **AC-1 (esquema)** — cumplido. La `0020`, generada, tiene dos sentencias: la columna `scope` con `'ingest'` por defecto y el `CHECK` `ingestion_credentials_scope_valid`. `drizzle-kit generate` después responde «No schema changes». Aplicada a la base de desarrollo, que tiene 21 migraciones. `DataModel.md` la describe, con la deuda de nombre.
- **AC-2 (alcance)** — cumplido. `ingestion-http.test.ts` caso 14: una credencial `read` en la ingestión da `403`, sin escribir ni consumir ventanas, y la de ingestión del mismo emisor sigue escribiendo. `read-api.test.ts` caso 9: una `ingest` en la lectura da `403`. El token `crm_read_` tiene su test unitario, y el script crea las dos clases con `--scope`.
- **AC-3 (borde)** — cumplido. Casos 7 a 12 de `read-api.test.ts`: apagada o mal configurada da `404` sin cuerpo, y encender la ingestión no la enciende; `401` con `WWW-Authenticate` en cuatro variantes; `403` revocada, de otro alcance o fuera de la allowlist; `429` con `Retry-After` y presupuestos separados por credencial; ninguno de los rechazos anteriores al límite consume ventanas; la sesión no autentica; `no-store` y `X-Request-Id` en las respuestas de la API encendida.
- **AC-4 (FR-API-01)** — cumplido. Casos 1 a 6: solo activos y de la organización de la credencial; precio vigente o `null`; estado sin cantidad; el monto en ARS y en CLP; palabras sin acentos, SKU exacto primero y `limit`; el detalle con `404` igual para inactivo, ajeno e inexistente, y `400` para un id inválido; diez variantes de `q` y `limit` inválidos; seis textos con caracteres de `tsquery` sin error. El NUL, con su mutación.
- **AC-5 (FR-API-03, log)** — cumplido. El caso 13 recorre seis respuestas (éxito, validación, detalle, `404`, `403` y `401`). Cada una deja una línea con la ruta fija, el código y la correlación cuando la hubo. Ninguna contiene los tokens, el texto buscado ni los dos ids buscados. El caso 14 comprueba que el `500` también queda en el log. `log-surface.test.ts` pasa sin cambios.
- **AC-6 (contrato)** — cumplido. `read-v1.md` existe. Toda respuesta de éxito de los tests pasa por el validador estricto. Los tres fixtures tienen `"shape": "assumed"` y pasan el validador. La mutación está arriba.
- **AC-7 (guardas)** — cumplido. `exposed-surface` declara las dos rutas. `service-read-entry-points.test.ts` es la **decimotercera guarda**: 11 casos, uno por cada una de sus siete formas sintácticas, y cinco que no debe detectar. La regla de O-33 está en `exposed-surface`, con seis formas y tres negativas. Las dos mutaciones están arriba.
- **AC-8 (O-22)** — cumplido, con la API apagada (ver arriba).
- **AC-9 (C-6)** — cumplido. El `source` de los tests y de los ejemplos es `agente-whatsapp`. `forbidden-references.test.ts` pasa, y `git diff` sobre él está vacío.
- **AC-13 (documentación de la etapa)** — cumplido:
  - `read-v1.md` y la enmienda fechada de `ingestion-v1.md`;
  - `IntegrationBoundaries.md`, `DataModel.md`, `Overview.md`, `RepositoryStructure.md` y `TraceabilityMatrix.md`;
  - `FunctionalRequirements.md`, con FR-API-01 y FR-API-03. FR-API-02 va en la 11.3.2;
  - `Environments.md` y `.env.example`;
  - `Risks.md`, con O-33 fijada por guarda;
  - `SecurityModel.md` pasa a **47 puntos de entrada**: 19 páginas, 24 Server Actions y 4 Route Handlers, con 28 fijados por la guarda. Contados contra `src/app`: cuatro `route.ts`.
- **AC-14** — `format:check`, `lint` y `typecheck` limpios. `npm run test` da **1129 de 1129 en 89 archivos**, con los archivos nuevos registrados con `git add -N` para que las guardas los vieran. El end-to-end completo y la CI van en §Cierre de la etapa.
- **AC-15** — `git status` muestra solo archivos de la lista, con las dos ampliaciones autorizadas. `forbidden-references.test.ts` y `proxy.ts` no cambiaron.

## Cierre de la etapa 11.3.1, 2026-09-24 (autoevaluación)

- **Vitest**: 1129 de 1129 en 89 archivos, contra PostgreSQL real de desarrollo.
- **End-to-end completo** (`npm run build` y `npm run test:e2e`): **95 de 96**. Los dos casos nuevos de `read-api.spec.ts` pasaron.
  - Falló `ingestion.spec.ts`, caso 2, y **no por una aserción**: el proceso worker de Playwright terminó con el código 3221226505 (`0xC0000409`, una caída del proceso en Windows) antes de reportar un resultado.
  - Corrido solo, `ingestion.spec.ts` dio 2 de 2.
  - Se registra como caída del entorno local, no como un paso. La CI de esta etapa es la evidencia del end-to-end completo.
- **Mutaciones**: las cinco de §Resultados fallaron como debían y se restauraron.
- **CI**, commit `2eb1110`, run 36065777017:
  - **Intento 1: `failure`.** Falló un solo caso, `conversations.spec.ts` caso 2, que la etapa no toca. Llegó al tiempo máximo de 30 s con «Target page, context or browser has been closed» (línea 246). Es la misma firma registrada en HANDOFF y en la 11.1. Los otros 95 casos pasaron, incluidos los de `read-api.spec.ts`.
  - **Intento 2: `success`**, relanzando solo el job fallido y sin cambiar código: 96 de 96 end-to-end.
  - El caso intermitente sigue sin corregir. Se suma una aparición más a su registro.
- **Nivel**: validado localmente (`deterministic`). No validado en integración: ningún consumidor usa el contrato y los fixtures tienen forma asumida.

## Resultados — etapa 11.3.2, 2026-09-24 (autoevaluación)

### Lo que la implementación encontró que el brief no decía

- **La zona de la organización solo se leía con un `AuthContext`.** `getOrganizationTimezone` recibe el contexto de una persona. Se paró antes de tocar `organizations`, que no estaba en la lista, y el usuario autorizó la segunda ampliación (ver §Resolución): `getOrganizationTimezoneForService(organizationId)`, que la guarda de lecturas de servicio vigila por su nombre.
- **La lectura de vigentes reusa el repositorio de la 11.2.** `listCurrentEntriesForService` llama a `findEntries` con `status: "current"`, así que el estado sale de la misma expresión SQL que la pantalla 12. `knowledge/repository.ts` estaba autorizado y no hizo falta tocarlo.
- **Los planes miran la consulta real.** Los tres `EXPLAIN` capturan el SQL y los parámetros que la lectura ejecuta, espiando `pool.query`, y le piden el plan a PostgreSQL. No usan una copia de la consulta. `mockRestore` borra las llamadas registradas, así que se copian antes de restaurar.
- **La búsqueda de productos combina dos índices.** El plan es un `BitmapOr` del GIN de `search` y del único `(organization_id, lower(sku))`. PostgreSQL resuelve `lower('cafe molido')` a una constante, y la aserción lo tiene en cuenta.
- **El volumen de desarrollo no tiene precios, marcas ni entradas de información.** Por eso la medición de las rutas no mide el costo del precio vigente ni de la búsqueda de información con filas. Eso lo cubren los planes, con 15 000 precios y 5 000 entradas sintéticas.

### Salida cruda de `medir-caminos.ts` (AC-11)

`npx tsx scripts/medir-caminos.ts 5eed0000-0000-4000-8000-000000000021 "volumen de desarrollo"`, contra `crm_dev`: 10 000 productos, 9 491 activos, sin precios ni entradas de información. Salida 0 y ninguna corrida fallida. Las filas de la API:

| Camino | Mediana | Mínimo | Máximo | Resultado |
| --- | --- | --- | --- | --- |
| API products: palabras («cafe molido») | 8.9 ms | 8.3 ms | 10.1 ms | 10 filas |
| API products: SKU exacto | 7.4 ms | 6.1 ms | 8.4 ms | 1 filas |
| API products: sin coincidencias | 3.5 ms | 2.6 ms | 4.1 ms | 0 filas |
| API products/{product_id} | 7.1 ms | 5.8 ms | 8.1 ms | 1 filas |
| API knowledge: vigentes sin texto | 4.6 ms | 3.7 ms | 5.3 ms | 0 filas |
| API knowledge: vigentes con texto | 4.2 ms | 4.0 ms | 4.4 ms | 0 filas |

Mediana de 5 corridas, después de una de calentamiento, en la máquina local. **Lo que no mide**:

- el borde: la credencial, la ventana del límite de tasa y el log;
- la concurrencia;
- el precio vigente con historial;
- la información del negocio con filas, porque el seed no las tiene: las dos filas de `knowledge` miden una consulta que devuelve 0 filas.

Las demás filas del script, las de listados y métricas, no cambiaron de orden de magnitud respecto de la 11.0.

### Corridas de mutación

Cada una se aplicó, se corrió el caso y se restauró el archivo.

| Criterio | Mutación | Antes | Con la mutación |
|---|---|---|---|
| AC-11, plan de productos | `upper(sku) = upper(q)` en lugar de `lower` | caso 20 en verde | caso 20 falla: `Seq Scan on products`, sin `Index Cond: (search @@` |
| AC-11, precio vigente | sin `organization_id` en `findCurrentPrices` | caso 21 en verde | caso 21 falla: `Index Cond: (product_id = ANY (…))`, sin la organización |
| AC-11, plan de información | `coalesce(search, ''::tsvector) @@ …` en `knowledgeSearchCondition` | caso 22 en verde | caso 22 falla: `Seq Scan on knowledge_entries` |
| AC-11, `stock-writes` | una escritura real en `inventory/service.ts` por cada forma: tabla interpolada, esquema entre comillas, espacio de nombres y `TRUNCATE TABLE ONLY` | **con la guarda anterior, las cuatro pasaban** | con la guarda nueva, las cuatro hacen fallar «ningún archivo de src/ escribe el saldo» |
| AC-11, `module-boundary` | `knowledge` fuera de la lista de módulos de dominio de `eslint.config.mjs` | 24 en verde | falla el caso de `next/cache` en `knowledge/service.ts`. Los otros tres los cubren las reglas generales |
| AC-10, contrato | `status` de más en `toContractKnowledgeEntry` | casos 15 a 17 en verde | los tres fallan por el validador estricto |
| AC-10, vigencia | `status: "all"` en `listCurrentEntriesForService` | casos 15 a 17 en verde | los tres fallan: salen entradas programadas, vencidas e inactivas |
| R-7 | la regex anterior contra `revokeCredentials` y `revokeCredentialById` | — | la anterior no ve ninguno; la nueva, los dos |
| R-8 | `export { listCurrentEntriesForService as listCurrentEntries }` en `knowledge/index.ts` | 24 en verde | falla «ningún archivo de src/, módulos incluidos, renombra una lectura de servicio» |

`eslint.config.mjs`, `catalog/repository.ts`, `knowledge/schema.ts`, `knowledge/index.ts` e `inventory/service.ts` quedaron como estaban antes de cada mutación.

### Revisión independiente (D-12)

Un agente que no participó, de solo lectura, revisó las dos etapas contra este brief y `CLAUDE.md`. No corrió nada. Encontró **nueve hallazgos: ninguno crítico, dos mayores, cuatro menores y tres notas**. Cada uno se verificó contra el código antes de aceptarlo, y los nueve se confirmaron.

| Hallazgo | Verificación | Resolución |
|---|---|---|
| **R-1** (mayor). Un `401`, `403` o `429` no registra el `correlation_id`, y `Risks.md` y FR-API-03 decían que sí | **Confirmado**: `serve.ts` valida la correlación después del límite, en el orden que fija el contrato (`read-v1.md`, §Orden de las comprobaciones). La fila de `Risks.md` la escribió esta misma etapa | La conducta queda como está: es la del contrato, y manda el código. Se corrigieron `Risks.md` y FR-API-03. Registrar una correlación antes de autenticar pondría en el log un texto de quien no se autenticó. Si la 12.3 necesita la correlación en los `429`, es un cambio del contrato |
| **R-2** (mayor). Varias respuestas `200` no pasaban por el validador, contra AC-6 y D-8 | **Confirmado**: casos 11, 12, 13, 19 y 20 a 22 | Todas pasan por `valid()`. En `read-api.test.ts` no queda ningún `toBe(200)` fuera de `valid()` |
| **R-3** (menor). La tabla de `SecurityModel.md` decía 4 Route Handlers | **Confirmado**: la tabla sumaba 47 y el párrafo, 48 | 5 |
| **R-4** (menor). Faltaban §Resultados y §Cierre de la 11.3.2 | **Confirmado**: el enlace de `read-v1.md` apuntaba a una sección que no existía | Esta sección |
| **R-5** (menor). Un comentario de `knowledge/service.ts` hablaba de la 11.3 en futuro | **Confirmado** | Reescrito |
| **R-6** (menor). Los casos 5, 6, 10, 12, 14 y 18 no llevaban la etiqueta del FR | **Confirmado** | Etiquetados |
| **R-7** (nota). La regla de O-33 no veía `revokeCredentials` ni `revokeCredentialById` | **Confirmado**: `\b` exigía terminar en «Credential» | Regex ampliada y dos casos, con la comprobación de la tabla de mutaciones |
| **R-8** (nota). Un `index.ts` podía reexportar una `…ForService` con otro nombre | **Confirmado** | Segunda regla de la guarda, en todo `src/`, con cinco casos y su mutación |
| **R-9** (nota). El brief decía «no activa» en FR-API-03 | **Confirmado**: errata | Corregida en §Alcance, con fecha |

### Contraste por criterio (etapa 11.3.2)

- **AC-10 (FR-API-02)** — cumplido. Los casos 15 a 18 cubren:
  - solo las vigentes de la organización, con las dos fechas inclusivas;
  - una entrada programada, una vencida, una inactiva y una de otra organización, que no salen;
  - la zona donde ya es mañana, con Kiritimati y Pago Pago;
  - por relevancia, con el título primero, y sin texto por categoría y título;
  - `limit` y las validaciones de `q` y `limit`, con el NUL.
  
  Toda respuesta pasa el validador estricto. Las dos mutaciones están arriba.
- **AC-11 (herencias)** — cumplido:
  - `stock-writes` detecta las cuatro formas. El hueco se comprobó antes de cerrarlo;
  - los tres `EXPLAIN` miran la consulta real, con su mutación cada uno;
  - `medir-caminos.ts` mide las tres rutas, con la salida cruda y lo que no mide;
  - `module-boundary` tiene los casos de `knowledge` (N-3 de la 11.2);
  - el comentario de `catalog/repository.ts` está corregido.
- **AC-12 (pregunta 5)** — cumplido: `Risks.md` tiene la estimación, su razonamiento y la revisión en la 12.3, con la corrección de R-1.
- **AC-13 (documentación)** — cumplido:
  - `read-v1.md` tiene la ruta y la entrada;
  - `FunctionalRequirements.md` tiene FR-API-02;
  - `TraceabilityMatrix.md`, `SecurityModel.md`, `IntegrationBoundaries.md`, `RepositoryStructure.md` y `DataModel.md` están actualizados. `DataModel.md` tiene el plan del precio vigente, que la 11.1 dejó sin medir;
  - el recuento: **48 puntos de entrada** (19 páginas, 24 Server Actions y 5 Route Handlers), con **29 fijados por la guarda**, contados contra `src/app` y `exposed-surface.test.ts`;
  - FR-API-01 a FR-API-03 están etiquetados en los casos.
- **AC-14** — en §Cierre.
- **AC-15** — cumplido. `git status` muestra solo archivos de la lista y de las dos ampliaciones. `forbidden-references.test.ts`, `proxy.ts` y `eslint.config.mjs` no cambiaron.

## Cierre de la etapa 11.3.2, 2026-09-24 (autoevaluación)

- **Vitest**: 1164 de 1164 en 89 archivos, contra PostgreSQL real de desarrollo, después de las correcciones de la revisión. Antes de ellas eran 1155. Son 35 casos más que en la 11.3.1:
  - 8 en `read-api.test.ts`;
  - 3 en el contrato;
  - 4 en `module-boundary`;
  - 11 en `stock-writes`;
  - 3 en `exposed-surface`;
  - 6 en `service-read-entry-points`.
- **End-to-end completo** (`npm run build` y `npm run test:e2e`): **97 de 97**, con el caso nuevo de `/api/read/v1/knowledge`. Corrió antes de las correcciones de la revisión. Esas correcciones tocan tests de integración, guardas, documentos y un comentario de `knowledge/service.ts`; ninguna cambia código que corra en `next start`.
- `format:check`, `lint` y `typecheck`, limpios.
- **CI**: pendiente del push, que necesita autorización.
- **Nivel**: validado localmente (`deterministic`). **No validado en integración**: ningún consumidor usa el contrato, y los fixtures tienen forma asumida. Se valida con el agente en la 12.3.
