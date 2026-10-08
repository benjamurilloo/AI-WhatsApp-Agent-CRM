---
schema: task-brief.v1
task_id: "17.2"
task_type: implementation
generated_at: 2026-10-08
---

# Brief 17.2 — Campos de productos

- **Contrato**: `task-brief.v1`
- **Tipo de tarea**: `implementation`
- **Nivel de evidencia objetivo**: `deterministic` para el esquema y el servicio, contra PostgreSQL real; `producer-consumer` para las pantallas (end-to-end sobre `next start`); `isolated-runtime` para el despliegue, con la migración aplicada en producción y las pantallas recorridas por el usuario.
- **Nivel de validación alcanzable**: **validado localmente y en CI**, **validado en integración** para las pantallas, y **desplegado en producción** con la revisión del usuario. No es «preparado para producción».
- **Orden**: segunda subfase de la Fase 17 ([Roadmap](../planning/Roadmap.md) §Fase 17), después de la 17.1, cerrada el 2026-10-08.
- **No abre ni cierra gate.** La revisión independiente no es obligatoria; se recomienda (D-13).
- **Estado de este documento**: **aprobado el 2026-10-08** por el usuario, con las recomendaciones de D-1 a D-13.

## Objetivo

Que la ficha de un producto tenga los datos de operación que los bocetos de la Fase 15 dibujan y el CRM no tiene, cada uno con su motivo, y que un producto se encuentre por su código de barras.

- Un `admin` carga y edita código de barras, peso, dimensiones (largo, ancho y alto), ubicación y estante, todos opcionales.
- Cualquier usuario los ve en la ficha, y encuentra un producto escribiendo o escaneando su código de barras en el buscador de la lista.
- Cada cambio queda auditado y nombrado en castellano en el historial.
- El agente no ve ningún cambio: ningún contrato cambia.

Resultado verificable: un producto con un código de barras se encuentra en la pantalla 3 escribiendo ese código, igual que con su SKU; otro producto de la misma organización no puede tener el mismo código; y la respuesta de `read-v1` para ese producto es idéntica a la de antes de la subfase.

## Lo que se verificó antes de escribir este brief

Verificado el 2026-10-08 contra el código y la documentación.

- **`products` tiene** `sku`, `name`, `description`, `unit`, `reorder_point`, `brand`, `category`, `condition`, `search` (generada), `is_active` y las fechas ([DataModel](../architecture/DataModel.md) §`products`; `src/modules/catalog/schema.ts`). La última migración es la `0031`; esta subfase usa **una sola**, la `0032`, generada.
- **`crm_app` ya tiene `UPDATE` sobre `products`**: agregar columnas no exige una migración de privilegios.
- **Las escrituras son solo de `admin`** y las lecturas, de `admin` y `viewer` (`catalog/service.ts`). `updateProduct` audita solo los campos que cambiaron, con valores primitivos. Los campos nuevos entran en la misma forma.
- **El buscador de la pantalla 3** (`findProducts`, `catalog/repository.ts:132`) busca por palabras sobre nombre, marca y categoría, **o** por SKU exacto sin distinguir mayúsculas. La búsqueda del agente es **otra función**, `findActiveProductsRanked` (`repository.ts:167`), con la misma coincidencia y su propio orden. **Las sugerencias del buscador (`suggestProducts`, brief-15.2, D-6) usan esa misma función**, no `findProducts`: sumar el código de barras a las sugerencias lo sumaría también a la búsqueda del agente, salvo que se separen (D-4).
- **`read-v1` arma cada producto campo por campo** (`src/app/api/read/v1/contract.ts:233`) y valida la respuesta con `z.strictObject`: una columna nueva de `products` **no llega** al agente sin cambiar ese archivo, y una clave de más hace fallar los tests de contrato.
- **Marcas y categorías ya tienen sugerencias y filtros** desde la 15.2: `listProductSuggestions` y `listProductFilterOptions` leen los valores distintos de la organización, con un tope de 200 (`SUGGESTIONS_LIMIT`).
- **Los productos no son datos personales**: no entran en el runbook de datos de un cliente ni en el vaciado.

### Contradicciones entre fuentes, documentadas antes de decidir

- **C-1. «Visible en catálogo» contra `is_active` y contra el contrato de lectura.** El Roadmap §Fase 17 lo lista «a decidir frente a `is_active` y frente a lo que lee el agente». Hoy un producto inactivo no aparece para el agente (`read-v1`: «busca productos **activos**», y un inactivo da `404`). Un producto activo pero no visible cambiaría **qué** productos ofrece el agente sin cambiar la forma de la respuesta, y `read-v1` §Versionado no lo cubre explícitamente. Se resuelve en D-7.
- **C-2. Marcas y categorías como listas administradas contra el brief-11.1, D-2**, que las decidió texto libre «sin tablas propias», y contra la columna generada `search`, que las lee como texto. Convertirlas en listas cambia la búsqueda, migra los valores existentes y abre la misma pregunta para el segmento de la 17.1 (brief-17.1, D-5). Se resuelve en D-8.
- **C-3. La ubicación por producto contra «varios depósitos»**, que el Roadmap deja «sin fase todavía». Con un solo depósito, la ubicación es del producto; con varios, sería del saldo de cada depósito. Se resuelve en D-6.

Ninguna se resuelve en silencio: cada una tiene su decisión y su recomendación.

## Alcance incluido

Dos etapas (D-1).

**17.2.1 — Local**, un commit:

1. **Esquema** (migración `0032`, generada y revisada a mano), en `products`: las columnas de D-2, todas **nulables**, con sus `CHECK` (D-3, D-5, D-6) y **un solo índice nuevo**, el único parcial del código de barras (D-3, D-12). Sin tablas nuevas y sin datos.
2. **Servicio** en `catalog`:
   - `validateProductInput`, `createProduct` y `updateProduct` aceptan los campos nuevos, con recorte y validación; un código de barras repetido en la organización da `CONFLICT` en su campo, como el SKU; la auditoría registra los que cambian, como hoy;
   - `getProduct` y la búsqueda de la pantalla 3 los devuelven;
   - el buscador de la pantalla 3 encuentra un producto por su código de barras exacto; las sugerencias, no (D-4);
   - las sugerencias de ubicación, con los valores ya cargados en la organización (D-6).
3. **Pantallas**:
   - **el formulario** de alta y edición (pantalla 4 y «Nuevo producto»): el código de barras en «Información básica», debajo del SKU; tarjetas nuevas «Logística» (peso y dimensiones) y «Ubicación» (ubicación y estante), debajo de las de hoy (D-11);
   - **la ficha** (pantalla 4): los mismos datos en lectura, con «—» en lo vacío; el peso en kg y las dimensiones como «largo × ancho × alto cm»;
   - **la lista** (pantalla 3): **sin columnas ni filtros nuevos**; el buscador encuentra por código de barras.
4. **Requisitos**:
   - **FR-PROD-14**: un `admin` carga y edita, todos opcionales, código de barras, peso, dimensiones, ubicación y estante de un producto, con el cambio auditado. El código de barras es único en la organización;
   - **FR-PROD-15**: cualquier usuario encuentra un producto en la lista buscando su código de barras exacto, sin distinguir mayúsculas;
   - **FR-PROD-11**, enmendado con fecha: el buscador de la lista suma el código de barras exacto; la búsqueda del agente no cambia.
5. **Documentación**: `DataModel.md` (las columnas, los `CHECK`, el índice y la razón de no indexar el resto), `FunctionalRequirements.md`, `Screens.md` (3 y 4), `TraceabilityMatrix.md`, y en `read-v1.md` una nota fechada de que los campos nuevos **no** se exponen (D-10).

**17.2.2 — Producción**, con autorización en su turno: la CI del commit en verde por `headSha`, el despliegue con la `0032` según [deploy/production/README.md](../../deploy/production/README.md) §Desplegar, los recuentos de tablas iguales antes y después, y la revisión del usuario en `crm.vixoraai.app`.

## Alcance excluido

- **«Visible en catálogo»**, si se aprueba D-7 (a): se decide cuando un negocio real lo pida.
- **Marcas y categorías como listas administradas**, si se aprueba D-8 (a): siguen como texto con sugerencias.
- **El agente**: ningún contrato cambia. `read-v1` no devuelve los campos nuevos y su búsqueda no encuentra por código de barras (D-4, D-10). Si el agente los necesita (por ejemplo, el peso para cotizar un envío), es una ruta nueva o una v2, con su coordinación, como la 16.6.
- **Validar el dígito verificador** de un EAN o UPC, generar códigos o imprimir etiquetas (D-3).
- **Leer el código con la cámara.** Un lector de códigos USB o Bluetooth escribe en el buscador como un teclado, y eso ya funciona con FR-PROD-15.
- **Varios depósitos**, la ubicación por depósito y el costo de envío calculado con el peso (17.4 o el ERP).
- **Columnas o filtros nuevos en la lista**, las imágenes (17.3) y las etiquetas de producto de los bocetos (brief-15.4, H-1).
- **Seeds con los campos nuevos.**
- **Staging.** La migración es aditiva y el despliegue sigue el procedimiento de la 17.1.

## Archivos autorizados

Crear o modificar solo estos. Tocar cualquier otro es una condición de detención.

- `drizzle/0032_*.sql` (generada con `drizzle-kit generate` y revisada a mano) y `drizzle/meta/*`
- `src/modules/catalog/`: `schema.ts`, `repository.ts`, `service.ts`, `index.ts` y `service.test.ts`
- `src/app/(autenticado)/productos/`: la lista (`page.tsx`), `product-form.tsx`, `actions.ts`, `messages.ts` y sus tests; `nuevo/page.tsx`; la ficha `[productId]/page.tsx` y `audit-summary.ts` con su test
- `tests/integration/catalog.test.ts` y `tests/integration/product-audit.test.ts` (los campos nuevos en las expectativas existentes, y los casos nuevos); `tests/integration/read-api.test.ts`, **solo** para el caso de D-10
- `tests/e2e/product-fields.spec.ts` (nuevo); `tests/e2e/products.spec.ts` **solo** si una aserción existente cambia, y cada cambio se declara
- `docs/architecture/DataModel.md` y `TraceabilityMatrix.md`; `docs/product/FunctionalRequirements.md` y `Screens.md`; `docs/contracts/read-v1.md`, **solo** la nota fechada de D-10
- al cerrar: este brief, `docs/decisions/README.md`, `docs/planning/Roadmap.md` (estado de la 17.2 y, si se aprueban D-7 (a) y D-8 (a), dónde quedan esas candidatas), `CHANGELOG.md` y `HANDOFF.md`

## Fuentes de verdad

- **El código y las migraciones**: `catalog` (validación, auditoría, búsqueda y sugerencias), `drizzle/0004`, `0005` y `0016`, y `src/app/api/read/v1/contract.ts`.
- **Las decisiones anteriores**: [brief-11.1](brief-11.1-catalogo-comercial.md) (marca, categoría, búsqueda y SKU exacto), [brief-11.3](brief-11.3-api-de-lectura.md) (búsqueda del agente), [brief-15.2](brief-15.2-controles-de-los-listados.md) (filtros y sugerencias), [brief-16.6](brief-16.6-la-cantidad-de-stock-para-el-agente.md) (cómo se agrega un dato para el agente), [brief-17.1](brief-17.1-campos-de-clientes.md) (el mismo patrón para clientes) y [ADR 0014](0014-el-agente-de-whatsapp-como-consumidor-del-crm.md).
- **[DataModel](../architecture/DataModel.md)**, reglas de diseño 4, 6 y 7; **FR-PROD-02**, **FR-PROD-10** y **FR-PROD-11**.

## Decisiones pendientes

Cada una trae una recomendación. Se pueden aprobar en bloque o cambiar cualquiera.

### D-1 — Etapas

- **(a) Recomendada: dos etapas**, 17.2.1 local con un commit y 17.2.2 en producción, como la 17.1.
- (b) Una sola etapa con el despliegue incluido.

### D-2 — Qué campos entran, y con qué motivo

- **(a) Recomendada: estos siete, todos opcionales y cargados solo por un `admin`.**

  | Campo | Columna | Motivo |
  |---|---|---|
  | Código de barras | `barcode` | encontrar el producto escaneándolo en el mostrador o el depósito (FR-PROD-15); lo usarán las ventas de la Fase 20 |
  | Peso | `weight_kg` | preparar y cotizar envíos a mano hoy; el costo de envío estructurado es de la 17.4 |
  | Largo, ancho y alto | `length_cm`, `width_cm`, `height_cm` | ídem: el volumen de un envío |
  | Ubicación | `location` | dónde está el producto (depósito, local, vidriera) |
  | Estante | `shelf` | dónde buscarlo dentro de esa ubicación |

- (b) Solo el código de barras y la ubicación, sin peso ni dimensiones, hasta que la 17.4 decida los envíos. Menos columnas, pero los bocetos los dibujan y la carga de un catálogo existente se hace una vez.
- (c) Los siete más «visible en catálogo» (D-7 (b)).

### D-3 — El código de barras: forma y unicidad

- **(a) Recomendada: como el SKU.** Texto de 1 a 64 caracteres sin espacios (`CHECK (barcode ~ '^\S{1,64}$')`), guardado como se escribió; **único por organización sin distinguir mayúsculas** con un índice único parcial sobre `(organization_id, lower(barcode)) WHERE barcode IS NOT NULL`. Un repetido da `CONFLICT` en el campo. **Sin validar el dígito verificador**: un comercio usa también códigos internos (Code 128, códigos de balanza) que no son EAN.
- (b) Solo GTIN: 8, 12, 13 o 14 dígitos con dígito verificador válido. Rechaza los códigos internos.
- (c) Sin unicidad. Dos productos con el mismo código harían ambigua la búsqueda de FR-PROD-15.

Un código de barras igual al SKU de **otro** producto no se rechaza: son espacios distintos, y la búsqueda devuelve los dos.

### D-4 — Dónde se busca por código de barras

- **(a) Recomendada: solo en el buscador de la pantalla 3** (`findProducts`), como el SKU exacto (`lower(barcode) = lower($1)`), por el índice de D-3. Un lector de códigos escribe el código y manda Enter, que envía el buscador: no pasa por las sugerencias. **`findActiveProductsRanked` no cambia**, así que ni las sugerencias ni la búsqueda del agente encuentran por código: el agente no recibe códigos de barras del cliente, y cambiar qué encuentra su búsqueda cambia el comportamiento de `read-v1` sin cambiar su forma.
- (b) También en las sugerencias: `findActiveProductsRanked` suma una opción para el código de barras, apagada por defecto, que solo `suggestProducts` enciende. Toca la función que comparte con el agente, y la defensa pasa a ser un parámetro.
- (c) También en la búsqueda del agente. Necesita coordinación con el agente y una nota en `read-v1`.

### D-5 — Peso y dimensiones

- **(a) Recomendada: unidades fijas, kg y cm.**
  - `weight_kg numeric(10, 3)`, `CHECK (weight_kg > 0)`: hasta 9 999 999,999 kg, con precisión de gramos.
  - `length_cm`, `width_cm` y `height_cm numeric(8, 1)`, cada uno `CHECK (> 0)`: hasta 9 999 999,9 cm, con precisión de milímetros.
  - **Las tres dimensiones van juntas o ninguna**: `CHECK` de las tres nulas o las tres con valor. Una dimensión sola no sirve para un envío. El formulario marca las que faltan.
  - Se leen con la misma conversión de decimales que el punto de reposición (coma o punto), y la ficha los muestra con la coma decimal.
- (b) Unidad elegible por producto (g, kg, mm, cm, m). Obliga a convertir en cada uso y no agrega información.
- (c) Dimensiones independientes, sin la regla de las tres juntas.

### D-6 — Ubicación y estante

- **(a) Recomendada: dos textos libres y opcionales.** `location` hasta 60 caracteres, con sugerencias de los valores ya cargados en la organización (el mismo `SuggestInput` de la marca, con el tope de 200); `shelf` hasta 30, sin sugerencias. Los dos con `CHECK` de largo y sin espacios solos, recortados, como la marca. **Cuando lleguen varios depósitos** (sin fase todavía), la ubicación pasa a ser del saldo de cada depósito, y estas columnas se migran: queda escrito en DataModel.
- (b) Un solo campo, «Ubicación», con el estante adentro. Menos estructura, y los bocetos dibujan dos.
- (c) Fuera de la 17.2.

### D-7 — «Visible en catálogo»

- **(a) Recomendada: fuera de la 17.2, hasta que un negocio real lo pida** (13.5.2-b). Hoy `is_active` saca un producto de la vista del agente, y no hay un caso concreto de un producto activo que el agente no deba ofrecer. Agregarlo cambia **qué** productos ofrece el agente, y eso se coordina con él. Queda en el Roadmap como candidata con su pregunta.
- (b) Una columna `is_listed boolean not null default true`: un producto no visible desaparece de `read-v1` con el mismo `404` que uno inactivo, con una nota fechada en el contrato y aviso al agente. Sigue en la lista interna y recibe ajustes de stock.

### D-8 — Marcas y categorías como listas administradas

- **(a) Recomendada: fuera de la 17.2.** Hoy son texto libre con sugerencias de lo ya cargado y filtros (15.2), y el único caso de producción tiene 5 productos. Una lista administrada (tablas propias, pantalla de catálogo como la de etiquetas de la 16.1, migración de los valores existentes, la columna `search` y el contrato del agente leyendo el nombre) pesa más que esta subfase entera, y su beneficio, evitar «Samsung» y «samsung», se mide con un catálogo real. Queda en el Roadmap como candidata, con el segmento de la 17.1 bajo el mismo criterio.
- (b) Incluirlas como una tercera etapa de la 17.2, con su propia revisión independiente.
- (c) Una subfase propia de la Fase 17, después de la 17.2.

### D-9 — Quién ve y quién edita

- **(a) Recomendada: como el resto del producto.** Edita solo `admin`; `admin` y `viewer` ven todo. Ninguno de los campos es un dato personal ni sensible.

### D-10 — El agente

- **(a) Recomendada: `read-v1` sin cambios, con un test que lo fija.** Un caso de `read-api.test.ts` carga los siete campos en un producto y comprueba que la respuesta de la búsqueda y la del producto por id son las mismas que sin ellos, y que buscar por su código de barras no lo encuentra. `read-v1.md` suma una nota fechada: los campos de la 17.2 no se exponen; exponerlos es una ruta nueva o una v2.
- (b) Exponer el peso y las dimensiones en `read-v1`. Es un cambio de v2 de la respuesta (`read-v1` §Versionado) y otra subfase.

### D-11 — El formulario y la ficha

- **(a) Recomendada**: el código de barras en «Información básica», debajo del SKU y con su misma tipografía de código; «Logística» (ícono `truck`, que ya existe en `_components/icons.tsx`) con peso y las tres dimensiones en una fila; «Ubicación» (ícono `mapPin`, el de la 17.1) con ubicación y estante. En la ficha, los mismos grupos en lectura. El orden de tabulación sigue el orden visual, y el caso de teclado del end-to-end lo recorre.

### D-12 — Índices

- **(a) Recomendada: solo el único parcial del código de barras** (D-3), que es una regla de unicidad (regla 7) y además sirve la búsqueda exacta. Ninguno para peso, dimensiones, ubicación ni estante: no hay consulta que filtre por ellos. Las sugerencias de ubicación leen los valores distintos de la organización, como las de marca, que tampoco tienen índice propio.

### D-13 — Revisión independiente

- **(a) Recomendada: sí, antes del commit de la 17.2.1**, de solo lectura, contra este brief. En la 17.1 encontró un archivo de documentación dañado que la batería entera dejó pasar.
- (b) Solo autoevaluación declarada.

## Invariantes

1. **Ningún contrato con el agente cambia**: las respuestas de `read-v1` y su búsqueda son idénticas para un producto con los campos nuevos (D-10).
2. **El código de barras es único por organización**, por un índice de la base y no solo por el servicio; dos organizaciones pueden repetirlo.
3. **Todo campo nuevo es nulable**: la migración no reescribe filas ni pone valores por defecto.
4. **Cada cambio real queda en la auditoría** con solo los campos que cambiaron; un guardado sin cambios no escribe.
5. **Las tres dimensiones van juntas**, por un `CHECK` de la base.
6. La guarda de módulos sigue en verde: `catalog` no importa de otros módulos para esto.

## Criterios de aceptación

**17.2.1**

- **AC-1**: la `0032` agrega las columnas de D-2 con sus `CHECK` y el índice de D-3, sin otros índices ni datos. Un test lo comprueba contra `information_schema` y `pg_catalog`, y `drizzle-kit generate` no produce cambios en otras tablas.
- **AC-2** (FR-PROD-14): un `admin` da de alta y edita un producto con cada campo nuevo. Un código de barras con espacios o de más de 64 caracteres, un peso o una dimensión no positivos o con más decimales que su escala, una o dos dimensiones sin la tercera, y un texto más largo que su límite, devuelven `VALIDATION_ERROR` en su campo. Un `viewer` recibe `FORBIDDEN` al escribir.
- **AC-3** (FR-PROD-14, invariante 2): un código de barras repetido en la misma organización, con otras mayúsculas, da `CONFLICT` en el campo, en el alta y en la edición; en otra organización se acepta. Un test lo prueba también contra la base, con SQL directo.
- **AC-4**: cada cambio real escribe un `update` del producto con solo los campos que cambiaron; el historial de la ficha los nombra en castellano («Código de barras», «Peso»…).
- **AC-5** (FR-PROD-15): el buscador de la pantalla 3 encuentra un producto por su código de barras exacto, sin distinguir mayúsculas, combinado con los filtros de actividad, marca y categoría; un código de otra organización no encuentra nada.
- **AC-6** (D-10, invariante 1): el caso de `read-api.test.ts` pasa, y la mutación que agrega `barcode` a `findActiveProductsRanked` lo hace fallar.
- **AC-7**: las pantallas cumplen D-11. Su end-to-end pasa con axe sin violaciones en claro y en oscuro, con el teclado y a 375 px, y comprueba que un `viewer` ve los campos y no los controles de escritura.
- **AC-8**: los tests de contrato del agente pasan sin cambios, y la guarda de módulos sigue en verde.
- **AC-9**: la batería completa de la CI pasa en local (`format:check`, `lint`, `typecheck`, unitarios, integración, guardas, `build` y end-to-end, en dos tandas si la memoria lo exige), y después en la CI del commit, leída por `headSha`.
- **AC-10**: la documentación del punto 5 de §Alcance incluido está actualizada, con FR-PROD-14 y 15 nombrados en el caso de test que los prueba y la enmienda fechada de FR-PROD-11.
- **AC-11** (D-13, si se aprueba): la revisión independiente se hace antes del commit, y cada hallazgo se verifica contra el código y se resuelve o se eleva al usuario.

**17.2.2**

- **AC-12**: con autorización, la `0032` se aplica en producción. `/login` responde `200`, los recuentos de todas las tablas son iguales antes y después, las columnas nuevas existen, nulas en todas las filas, y el índice del código de barras existe.
- **AC-13**: el usuario recorre en producción el alta y la edición con los campos nuevos, la ficha y la búsqueda por código de barras, y aprueba el cierre.

## Pruebas y evidencia requerida

- `deterministic`: los tests de integración de `catalog`, de la auditoría de productos y el caso de `read-api`, contra PostgreSQL 18 real. Una corrida de mutación por cada defensa: el índice único sin `lower` (AC-3), el `CHECK` de las tres dimensiones quitado (invariante 5), el código de barras en la búsqueda del agente (AC-6) y la búsqueda por código sin el filtro de organización (AC-5).
- `producer-consumer`: el end-to-end del formulario, la ficha y la búsqueda sobre `next start`.
- `isolated-runtime`: la 17.2.2 en producción, con los comandos y las salidas registrados en el brief, sin secretos ni IP.

## Condiciones de detención

Se detiene y se consulta al usuario si:

- hace falta tocar un archivo fuera de §Archivos autorizados;
- un campo nuevo exige cambiar `read-v1`, `ingestion-v2` o cualquier contrato con el agente;
- `drizzle-kit generate` produce cambios en otras tablas, propone un valor por defecto que reescriba las filas existentes, o no puede expresar el índice parcial de D-3;
- el código de barras de un producto existente en producción chocaría con el índice (no puede: hoy no hay códigos, pero se comprueba antes de migrar);
- la columna generada `search` tiene que cambiar.

Y siempre **antes de**: el commit de la 17.2.1, el push, cada paso sobre producción (la migración y el despliegue), los cambios de estado en Notion y el cierre. Cada uno necesita autorización explícita en su turno.

## Implementación de la 17.2.1, 2026-10-08

### Archivos fuera de lo previsto y aserciones existentes que cambiaron

- **`src/modules/inventory/service.test.ts`**, fuera de §Archivos autorizados, **autorizado por el usuario** el 2026-10-08: el producto de ejemplo suma los siete campos en `null`, sin tocar ninguna aserción.
- `tests/e2e/products.spec.ts`, caso 12: el alta con teclado pasa ahora por «Código de barras» después del SKU y por los seis campos de «Logística» y «Ubicación» antes de «Cancelar» (D-11).
- `tests/integration/catalog.test.ts`: el `CONFLICT` del SKU lleva ahora `field: "sku"` en tres aserciones, y el `diff` del alta registra los siete campos en nulo.
- `src/modules/catalog/service.test.ts`: «informa cada campo inválido» suma los siete campos.

### Precisiones, para la aprobación del usuario

- **P-1 (D-3)**: el `CONFLICT` del alta y la edición lleva el campo repetido (`sku` o `barcode`), detectado por el nombre del índice único. Un `23505` de cualquier otra restricción ya no se toma como SKU repetido: se relanza.
- **P-2 (D-6)**: la base exige el largo de la ubicación y el estante (`char_length` entre 1 y 60, y entre 1 y 30), no que no sean solo espacios. El servicio recorta antes de guardar, como con el segmento de la 17.1 y la marca, que no tiene `CHECK`.
- **P-3 (D-11)**: en la grilla de dos columnas de «Información básica», el código de barras queda **al lado** del SKU desde `sm`, y debajo en el móvil. El orden de tabulación es SKU, código de barras, nombre.
- **P-4 (AC-4)**: el historial de un alta no menciona los campos de operación que quedaron vacíos; una edición sí, con «vacío».

- **Aprobadas por el usuario el 2026-10-08**, junto con el commit y el push de la 17.2.1.

### Revisión independiente (D-13, AC-11)

De solo lectura, por un agente que no participó. 7 hallazgos (2 medios, 5 menores) y 4 dudas, verificados contra el código:

1. (medio) `TraceabilityMatrix.md` §3 no tenía la fila del índice del código de barras. **Corregido.** La sección ya estaba atrasada antes de la 17.2 (le falta `products_search_idx` y conserva el índice de prefijo de nombre que borró la `0016`): queda **registrado**, fuera de esta subfase.
2. (medio) El caso de FR-PROD-15 no combinaba el código con la categoría, que AC-5 nombra. **Corregido**.
3. (menor) La cabecera de estado de `DataModel.md` no mencionaba la 17.2. **Corregido**.
4. (menor) Dos comentarios desactualizados (`product-form.tsx` y `[productId]/page.tsx`) y la cabecera de la ficha sin la 17.2. **Corregido**.
5. (menor) D-11 dice peso y dimensiones «en una fila» y quedaban en dos. **Corregido**: cuatro columnas desde `lg`.
6. (menor) El párrafo de la 17.2 en la matriz iba antes del de la 17.1. **Corregido**.
7. (menor) `.claude/settings.json` sin seguimiento. No entra en el commit: se agregan los archivos por nombre.

Dudas: la 1 es P-2 y la 2 es P-3, para el usuario. La 3 (un posible hueco en la ficha en `lg` si la columna de precio y stock es más alta que las de la izquierda) no se observó en el end-to-end ni se mide: queda para el recorrido de AC-13. La 4 (el formulario a 375 px sin caso) **se corrigió**: el caso 2 de `product-fields.spec.ts` lo mide, con axe.

### Batería local de la 17.2.1 (AC-9, parte local)

- `format:check`, `lint` y `typecheck` limpios; `build` sin errores.
- Vitest: 1.929 de 1.929 (unitarios, guardas e integración), antes de las correcciones de la revisión; `catalog.test.ts` repetido después, 42 de 42.
- Playwright: 141 de 142 en dos tandas (65 de 66 y 76 de 76). La falla fue el caso 9 de `clients.spec.ts`, por el límite de 30 s, en una tanda que tardó 9,8 minutos contra 4,6 en la 17.1; ese archivo no cambia en la 17.2. Después de las correcciones, con el build nuevo, `product-fields.spec.ts`, `products.spec.ts` y `clients.spec.ts` dieron 45 de 45.
- Mutaciones, todas en rojo y revertidas: M1, el índice único sin `lower` (fallan AC-1 y el `CONFLICT` con otras mayúsculas); M2, sin el `CHECK` de las tres dimensiones (fallan AC-1 y los `CHECK` por SQL directo); M3, el código de barras en `findActiveProductsRanked` (fallan el caso 6b de `read-api`, el 2 y el de las sugerencias); M4, la búsqueda de la lista sin el filtro de organización (fallan seis casos, entre ellos FR-PROD-15).
