# Brief 11.1 — Catálogo comercial

- **Contrato**: `task-brief.v1`
- **Tipo de tarea**: `feature`
- **Nivel de evidencia objetivo**: `deterministic` para el esquema, los servicios y la búsqueda, contra PostgreSQL real; `producer-consumer` para las pantallas (end-to-end sobre `next start`).
- **Nivel de validación alcanzable**: **validado localmente y en CI**, y **validado en integración** para las pantallas. Nada de esta subfase se despliega a staging. El primero en usarlo allá es el piloto (11.4), y el agente, recién con el contrato de lectura (11.3).
- **Orden**: va después de la 11.0, que cerró el 2026-09-24, y en paralelo con la 11.2 ([Roadmap](../planning/Roadmap.md) §Fase 11). La 11.3 depende de esta subfase.
- **No abre ni cierra gate.** La revisión independiente no es obligatoria. Se recomienda igual (D-10).
- **Estado de este documento**: **aprobado el 2026-09-24**, con las diez decisiones resueltas por la recomendación (ver §Resolución). **Cerrado el 2026-09-24** por el usuario (ver §Cierre).

## Objetivo

Que el catálogo del CRM tenga lo que un vendedor necesita para responder «¿tienen X?, ¿cuánto sale?»:

- **precio con historial y moneda**, que ningún camino puede sobrescribir;
- **marca, categoría y condición** (nuevo o reacondicionado);
- una **búsqueda por palabras sueltas** sobre nombre, marca y categoría.

Un `admin` lo mantiene desde las pantallas 3 a 5 y una pantalla nueva de precios.

El resultado verificable es este: después de esta subfase, la 11.3 puede escribir el contrato de lectura sin agregar ninguna columna ni ninguna consulta de búsqueda. Solo tiene que exponer lo que ya existe.

**Obligaciones que toma** (mapa del [brief-11.0](brief-11.0-instrumentos-antes-de-construir-encima.md)):

- **O-17**: el token de advertencia para «bajo stock», con su condición: se suma si esta subfase autoriza `globals.css` (D-8).
- **La dirección del precio** que el usuario confirmó en el [brief-10](brief-10-evaluacion-del-mvp.md), D-5: una tabla de solo inserción, con moneda y el precio vigente derivado, con el patrón de `inventory_movements`.
- **La convención de los FR** ([EngineeringStandards](../development/EngineeringStandards.md)): los requisitos nuevos llevan su identificador en el caso de test que los prueba.

## Lo que se verificó antes de escribir este brief

Verificado el 2026-09-24 contra el código y contra PostgreSQL 18 local. Nada de esta sección es supuesto.

- **Precio**:
  - **El parser de cantidades leería «300.000» como 300.** `parseQuantityInput` (`src/shared/quantity/index.ts:13`) acepta la coma **o el punto** como separador decimal y no acepta separador de miles. Para una cantidad de stock es correcto. Para un precio en una moneda sin decimales, que se escribe con punto de miles, es un error de 1.000 veces que ninguna validación rechazaría. **El precio no puede reutilizar ese parser** (D-6).
  - **Decimales por moneda**, según `Intl` de Node 24: CLP y COP tienen 0, JPY 0, ARS, USD, MXN y PEN 2, y KWD 3. Node reconoce 162 códigos ISO 4217.
  - **El diseño parte del modelo del CRM, no de otro sistema.** Del documento de brechas del usuario (repositorio del agente, rama `agent/brechas-crm-airtable`, `b75e484`, B-8) solo se tomó *qué* necesita leer el agente —precio, marca, categoría, condición, búsqueda por palabras y el estado de stock sin la cantidad exacta—, como contexto de negocio. Ninguna tabla, campo ni nombre de este brief viene de las tablas de Airtable.
- **Búsqueda**:
  - **La búsqueda actual es por prefijo del nombre o por SKU exacto** (`catalog/repository.ts:107-127`), con el índice `products_organization_name_unaccent_idx`. La lista de la pantalla 3 lee todos los productos que cumplen el filtro y pagina en memoria (`inventory/service.ts:109-125`, límite aceptado en la 4.2).
  - **La búsqueda por palabras funciona en PostgreSQL 18 como la propone D-4.** Probado en una base local desechable, `crm_prueba_fts`, borrada después. La tabla llevaba una columna generada `to_tsvector('simple', immutable_unaccent(lower(nombre || marca || categoría)))` con un índice GIN. Resultados:
    - «cafe nesc» encuentra «Café con leche» de la marca «Nescafé»: sin acentos, por prefijo y con las dos palabras;
    - «pro max» encuentra «iPhone 15 Pro-Max», y «usb» encuentra «Cargador USB-C 20W»;
    - «phone» **no** encuentra «iPhone»: el prefijo va desde el comienzo de cada palabra. Es un límite, y se documenta;
    - con `enable_seqscan = off`, el plan es `Bitmap Index Scan` sobre el índice GIN.
  - **Drizzle 0.45 declara la columna generada** con `generatedAlwaysAs`, y el tipo `tsvector` con `customType` (`node_modules/drizzle-orm/pg-core/columns/common.d.ts:49` y `columns/custom.d.ts`). `drizzle-kit` 0.31 emite `generated always as`. Que la migración generada sea exactamente la esperada se comprueba al implementar, no se supone.
- **Tests y datos que se van a tocar**:
  - **Dos tests enumeran todas las tablas** y van a fallar con `product_prices`: `tests/integration/identity-schema.test.ts:56` (la lista exacta de tablas) y `tests/integration/audit.test.ts:135` (los privilegios de `crm_app` en cada tabla). Ya pasó en la 6.5.3. Van en la lista de archivos autorizados.
  - **El manifiesto del backup no necesita cambios**: `crm-backup.sh:82-84` y `crm-restore-check.sh:121-123` recorren `pg_class`, no una lista fija de tablas.
  - **`seeds/volume.ts:405` inserta productos** con `products.$inferInsert`. Una columna nueva con valor por defecto o que admite nulo no lo rompe, y la columna generada no entra en el tipo de inserción.
- **Auditoría**: el enum `audit_action` (`audit/schema.ts:24-32`) no tiene un valor para un cambio de precio. Agregar uno es un `ALTER TYPE … ADD VALUE` aditivo (convención de la 3.1), que PostgreSQL admite dentro de la transacción única del migrador mientras la misma transacción no lo use.

## Alcance incluido

La subfase se ejecuta en **dos etapas verticales** (D-1). Cada una termina con su propia evidencia y su propio commit.

### Etapa 11.1.1 — Marca, categoría, condición y búsqueda por palabras

1. **Esquema** (migración `0016`):
   - `products.brand` y `products.category`, texto que admite nulo (D-2);
   - `products.condition`, con el enum nuevo `product_condition` (`new`, `refurbished`), no nulo y con valor por defecto `new` (D-3);
   - la columna generada `products.search` con su índice GIN (D-4);
   - se borra `products_organization_name_unaccent_idx`, que la búsqueda nueva deja sin uso. **`clients` conserva el suyo.**
2. **Servicio `catalog`**:
   - crear y editar aceptan los tres campos nuevos, con su validación y su auditoría;
   - `searchProducts` busca por palabras sobre nombre, marca y categoría, más el SKU exacto;
   - la expresión de búsqueda sale de **una sola función**, como `searchNormalized`, para que el índice y la consulta no puedan separarse.
3. **Pantallas**:
   - la 3 muestra marca y categoría, y su buscador pasa a buscar por palabras;
   - la 4 muestra los tres campos;
   - el formulario de alta y edición los pide;
   - con D-8, «bajo stock» usa el token de advertencia nuevo.
4. **Requisitos**:
   - **FR-PROD-10**: un `admin` puede registrar la marca, la categoría y la condición de un producto, con el cambio auditado;
   - **FR-PROD-11**: cualquier usuario puede buscar productos por palabras sueltas sobre nombre, marca y categoría, sin distinguir mayúsculas ni acentos, o por SKU exacto. Enmienda la parte de búsqueda de FR-PROD-04 con fecha, sin borrar el texto anterior.
5. **Seed básico**: marca, categoría y condición en los productos de ejemplo, para que la búsqueda tenga algo que encontrar en desarrollo y en el end-to-end.

### Etapa 11.1.2 — Precio con historial y moneda

6. **Esquema** (migración `0017`):
   - la tabla `product_prices`, de solo inserción: privilegios `SELECT` e `INSERT` para `crm_app` y un trigger que rechaza `UPDATE` y `DELETE`, como `inventory_movements` (ADR 0013);
   - el valor `price_change` en `audit_action`.
7. **Representación exacta del dinero** en `src/shared/money/`: montos como `bigint` en centésimas, con un parser que conoce los decimales de cada moneda (D-6).
8. **Servicio `catalog`**:
   - **fijar el precio** de un producto: solo `admin`, con control de concurrencia y auditoría en la misma transacción (D-7);
   - **leer el precio vigente** de uno o de varios productos;
   - **leer el historial** de precios de un producto, paginado.
9. **Pantallas**:
   - pantalla nueva `/productos/[id]/precios`: el precio vigente, el formulario para fijar uno nuevo con confirmación del monto formateado, y el historial;
   - la 3 muestra el precio vigente;
   - la 4 lo muestra con el enlace a la pantalla de precios;
   - el resumen de auditoría del producto entiende `price_change`.
10. **Requisitos**:
    - **FR-PROD-12**: un `admin` puede fijar el precio de venta de un producto, con monto y moneda. El precio vigente es el último fijado, y cualquier usuario ve el historial completo;
    - **FR-PROD-13**: no existe ninguna vía en la aplicación para modificar ni borrar un precio ya fijado. Un precio nuevo se agrega; el anterior queda en el historial.
11. **Guarda nueva**, `tests/guards/price-writes.test.ts`, con el patrón de `stock-writes`: falla si algo en `src/` escribe `product_prices` fuera de la única función autorizada. Lleva sus casos de fallo versionados.
12. **Seed básico**: precios en algunos productos, incluido **uno con dos precios**, para que el historial tenga algo que mostrar, y **uno sin precio**.

### Las dos etapas

13. **Documentación**:
    - `DataModel.md`: las columnas, la tabla, el enum y los índices;
    - `FunctionalRequirements.md`: los FR nuevos y la enmienda de FR-PROD-04;
    - `Screens.md`: las pantallas 3 a 5 y la nueva;
    - `TraceabilityMatrix.md`: las filas nuevas;
    - `EngineeringStandards.md`: la guarda número doce.

## Alcance excluido

- **Toda lectura de servicio.** Ni rutas `/api`, ni credenciales, ni un contexto de servicio que no sea el de una persona: es la 11.3. Esta subfase deja funciones de servicio que la 11.3 va a envolver, pero no diseña su contrato.
- **Ventas, descuentos, listas de precios por cliente, impuestos, costo o margen.** El precio es un atributo del catálogo, no una transacción. `DataModel.md` regla 14 y `CLAUDE.md` siguen igual.
- **Precios programados a futuro** (una fecha de vigencia): el vigente es el último fijado (D-5).
- **Retirar el precio de un producto sin fijar otro.** Para dejar de vender algo está la desactivación (FR-PROD-03). Si el negocio necesita «precio a consultar», se decide aparte (D-5).
- **Tablas propias de marcas o categorías, y jerarquías de categorías** (D-2).
- **La búsqueda de clientes**: sigue igual, con su índice.
- **Datos de volumen con precios** (`seeds/volume.ts`). La 11.3 o la 11.4 deciden si los necesitan para medir. Queda registrado en §Resultados, no se hace acá.
- **El contrato de ingestión, el agente y su repositorio**, y cualquier cosa de Airtable.
- **Desplegar a staging.**

## Archivos autorizados

Crear o modificar solo estos. Tocar cualquier otro es una condición de detención.

**Etapa 11.1.1**

- `drizzle/0016_*.sql` y `drizzle/meta/*`, generados con `drizzle-kit generate` y revisados a mano
- `src/modules/catalog/schema.ts`, `repository.ts`, `service.ts`, `index.ts` y `service.test.ts`
- `src/modules/inventory/service.ts`: **solo** si la firma de `searchProducts` cambia
- `src/app/(autenticado)/productos/`: `page.tsx`, `filters.ts` y `filters.test.ts`, `product-form.tsx`, `actions.ts`, `messages.ts` y `messages.test.ts`, `stock-status.tsx`, `nuevo/page.tsx` y `[productId]/page.tsx`
- `src/app/globals.css`: **solo** el token de advertencia (D-8)
- `seeds/basic.ts`
- `tests/integration/catalog.test.ts`, `tests/integration/catalog-inventory-schema.test.ts` y `tests/e2e/products.spec.ts`

**Etapa 11.1.2**

- `drizzle/0017_*.sql` y `drizzle/meta/*`
- `src/modules/catalog/`: los mismos archivos de la etapa anterior
- `src/modules/audit/schema.ts`: **solo** el valor nuevo del enum
- `src/shared/money/index.ts` y `src/shared/money/money.test.ts` (nuevos)
- `src/app/(autenticado)/productos/[productId]/precios/` (nuevo), `productos/page.tsx`, `[productId]/page.tsx`, `[productId]/audit-summary.ts` y `audit-summary.test.ts`
- `tests/integration/product-prices.test.ts` (nuevo), `tests/integration/identity-schema.test.ts` y `tests/integration/audit.test.ts`: **solo** la tabla nueva en sus listas
- `tests/guards/price-writes.test.ts` (nuevo) y `tests/e2e/products.spec.ts`
- `seeds/basic.ts`

**Las dos etapas**

- `docs/architecture/DataModel.md`, `docs/architecture/TraceabilityMatrix.md`, `docs/product/FunctionalRequirements.md`, `docs/product/Screens.md`, `docs/development/EngineeringStandards.md`
- este brief, `docs/decisions/README.md`, `CHANGELOG.md` y `HANDOFF.md`, al cerrar

## Fuentes de verdad

- **El código y las migraciones**: `catalog`, `inventory` y `audit`, `drizzle/0004`, `0005` y `0015`.
- **Las decisiones anteriores**:
  - el [brief-10](brief-10-evaluacion-del-mvp.md), D-5 (dirección del precio);
  - el [ADR 0013](0013-rol-de-aplicacion-y-tablas-de-solo-insercion.md) (tablas de solo inserción);
  - el [ADR 0014](0014-el-agente-de-whatsapp-como-consumidor-del-crm.md) (diseñar desde el modelo del CRM);
  - [brief-4.2](brief-4.2-servicio-de-catalogo.md), [brief-4.3.1](brief-4.3.1-transaccion-de-ajuste-de-stock.md) y [brief-4.3.2](brief-4.3.2-concurrencia-de-ajustes.md) (los patrones que se repiten);
  - [brief-9.0.2](brief-9.0.2-busqueda-sin-distinguir-acentos.md) (`immutable_unaccent` y su límite).
- **La documentación de PostgreSQL 18**: los capítulos de búsqueda de texto y de columnas generadas. Se citan con su sección exacta al implementar.
- **Contexto de negocio, nunca dependencia técnica**: el documento de brechas del usuario, B-8.

## Decisiones pendientes

- **D-1 — Partición.**
  - (a) Una sola entrega.
  - (b) **Dos etapas verticales en este mismo brief**: la 11.1.1 (marca, categoría, condición y búsqueda) y la 11.1.2 (precio). Cada una va del esquema a la pantalla y cierra con su end-to-end y su commit.
  - (c) Por capas, como la Fase 4: primero las migraciones, después el servicio y al final las pantallas.

  *Recomendación: (b).* Por capas, la etapa del servicio dejaría a la pantalla de edición **borrando** los campos nuevos: el formulario no los enviaría y `updateProduct` los guardaría vacíos. Con (b), cada etapa deja el sistema coherente. La 11.1.1 va primero porque la 11.1.2 muestra el precio en las mismas pantallas.
- **D-2 — Marca y categoría.**
  - (a) Texto libre en `products`, que admite nulo, recortado y de hasta 100 caracteres.
  - (b) Tablas propias `brands` y `categories`, con claves foráneas y su pantalla de mantenimiento.

  *Recomendación: (a).* El agente busca por palabras, así que la búsqueda de D-4 cubre las dos. Las tablas propias suman dos entidades y dos pantallas que nada de la Fase 11 necesita, y `CLAUDE.md` prohíbe crear por si acaso. El costo son las variantes de escritura: «Celulares» y «celular» son dos categorías. Se mitiga con una lista de sugerencias en el formulario, armada con los valores que ya existen (`datalist`). Pasar a tablas después es una migración con transformación de datos, y se dice.
- **D-3 — Condición.**
  - (a) El enum `product_condition` con `new` y `refurbished`, no nulo y `new` por defecto.
  - (b) Lo mismo, pero admitiendo nulo, para distinguir «no se sabe».
  - (c) Sumar ya `used`.

  *Recomendación: (a).* Son los dos valores que el negocio usa hoy. Agregar uno después es un `ALTER TYPE … ADD VALUE` aditivo. El valor por defecto le asigna «nuevo» a los productos existentes, que son todos sintéticos. La Fase 14 carga la condición real desde el CSV.
- **D-4 — Búsqueda por palabras.**
  - (a) **Búsqueda de texto de PostgreSQL** con la configuración `simple`: la columna generada sin acentos sobre nombre, marca y categoría, un índice GIN y cada palabra buscada como prefijo, unidas con Y.
  - (b) Subcadena con `pg_trgm`: «phone» encontraría «iPhone». Exige una segunda extensión.
  - (c) `ILIKE` por palabra, sin índice.

  *Recomendación: (a).* Está probada arriba y usa el índice. No agrega extensiones. Coincide con cómo se escribe una búsqueda: por el comienzo de las palabras.

  **Límites que se documentan**:
  - no encuentra por el medio de una palabra («phone» no encuentra «iPhone»);
  - no reduce plurales: «celulares» no encuentra un producto llamado «Celular» si su categoría no dice «Celulares».

  **Qué pasa con la búsqueda actual**: el SKU exacto se mantiene como alternativa, y la búsqueda por prefijo del nombre queda reemplazada, porque la nueva la contiene: «caf con» encuentra «Café con leche». **La descripción no se busca**: B-8 pide nombre, marca y categoría.

  **Los términos que escribe el usuario** se reducen a letras y dígitos antes de armar la consulta, y nunca se pasan crudos a `to_tsquery`.
- **D-5 — Esquema del precio.** Tabla `product_prices`, de solo inserción:

  | Columna | Tipo |
  |---|---|
  | `id` | `uuid` |
  | `organization_id` | referencia a la organización |
  | `product_id` | clave foránea compuesta hacia `products(organization_id, id)`, como el inventario |
  | `amount` | `numeric(14, 2)`, `CHECK (amount > 0)` |
  | `currency` | `text`, `CHECK (currency ~ '^[A-Z]{3}$')` |
  | `created_by` | referencia al usuario |
  | `created_at` | `clock_timestamp()` |

  El índice es `(organization_id, product_id, created_at desc)`. **El precio vigente es la última fila del producto** (`created_at desc, id desc`). Un producto sin filas no tiene precio.

  Cuatro sub-decisiones:
  - **Moneda por fila**, validada contra la lista de `Intl`. La alternativa es una moneda fija por organización, que agrega una columna a `organizations`. Con la moneda en cada fila, cambiar de moneda es fijar un precio nuevo.
  - **Un solo precio vigente por producto.** La alternativa es uno por moneda, para vender en dos monedas a la vez. Nada de la Fase 11 lo pide.
  - **Dos decimales como máximo.** Las monedas con tres (KWD, BHD y otras cinco) se rechazan con un mensaje claro. La alternativa es `numeric(14, 3)`.
  - **Sin fecha de vigencia futura y sin retirar el precio** sin fijar otro.

  *Recomendación: las cuatro como están escritas.*
- **D-6 — Cómo se escribe un monto.**
  - (a) Parser propio de dinero: acepta un separador decimal, coma o punto, **solo si la moneda tiene decimales** y con esa cantidad de decimales como máximo. **Rechaza todo separador en las monedas sin decimales**, con el mensaje «escribí el monto sin puntos ni comas». Antes de guardar, la pantalla muestra el monto formateado en su moneda y pide confirmarlo, como el saldo resultante del ajuste de stock.
  - (b) Reutilizar `parseQuantityInput`.

  *Recomendación: (a).* Con (b), «300.000» en pesos chilenos se guarda como 300. La confirmación del monto formateado es la segunda defensa, para quien escribe bien los dígitos pero en otra moneda.
- **D-7 — Reglas de fijar un precio.**
  - **Concurrencia**: se bloquea el producto (`FOR UPDATE`) y se compara el id del precio vigente que vio el `admin`. Si cambió entre que abrió la pantalla y confirmó, la respuesta es `CONFLICT` y la pantalla recarga, como el saldo del ajuste de stock (FR-PROD-06).
  - **Producto desactivado**: `BUSINESS_RULE_VIOLATION`, como el ajuste de stock (FR-PROD-03).
  - **Mismo monto y misma moneda que el vigente**: no escribe y responde `changed: false`, como `updateProduct`.
  - **Sin motivo obligatorio**: el historial ya dice quién y cuándo.
  - **Auditoría** `price_change` con `{ amount, currency }` antes y después; el antes es `null` en el primer precio.

  *Recomendación: las cinco.* La alternativa del motivo obligatorio es la del stock. Un precio no descuadra nada si falta el motivo, y pedirlo en cada cambio es fricción que el negocio no pidió.
- **D-8 — O-17 y `globals.css`.** (a) Autorizar `globals.css` **solo** para agregar el token de advertencia, en claro y en oscuro, con contraste AA medido con axe como los demás. (b) No tocarlo. *Recomendación: (a).* La 11.1.1 toca la pantalla 3, que es donde está el estado de stock, y O-17 espera justo esta condición desde la 4.4.
- **D-9 — Datos de ejemplo.** (a) Actualizar solo `seeds/basic.ts`. (b) Actualizar también el seed de volumen. *Recomendación: (a).* El seed de volumen tiene dos guardas y un caso de idempotencia que la 11.0 acaba de corregir, y nadie mide con precios hasta la 11.3. Queda registrado como pendiente con destino.
- **D-10 — Revisión independiente.** No es obligatoria. *Recomendación: hacerla, una sola, al final de la 11.1.2*, de solo lectura y contra este brief. Esta subfase crea una tabla de solo inserción y un parser de dinero, dos lugares donde un error cuesta caro de corregir cuando haya datos reales, y ninguna ronda de correcciones propias del proyecto salió limpia hasta ahora.

## Invariantes

- `products` no pierde ni cambia ningún dato existente. La migración `0016` solo **agrega** columnas y un índice, y **borra** un índice.
- El SKU sigue siendo único por organización, sin distinguir mayúsculas, y su búsqueda sigue siendo exacta.
- **Un precio fijado no cambia nunca**:
  - `crm_app` no tiene `UPDATE` ni `DELETE` sobre `product_prices`, y un trigger rechaza las dos operaciones para cualquier rol;
  - la guarda nueva falla ante cualquier otra escritura en `src/`.
- Toda consulta filtra por `organization_id`, y un precio no puede apuntar al producto de otra organización (clave compuesta).
- Los montos nunca pasan por `number` de JavaScript.
- `forbidden-references.test.ts` no se modifica y sigue en verde.
- Sin dependencias npm nuevas ni extensiones de PostgreSQL nuevas.

## Criterios de aceptación

**Etapa 11.1.1**

- **AC-1 (esquema)**: la migración `0016` agrega `brand`, `category`, `condition` y `search`, crea el índice GIN y borra el índice de prefijo de nombre de `products`. Aplicada sobre la base de desarrollo con datos, **no cambia ninguna fila existente**: se compara una huella de `products` antes y después, sin las columnas nuevas. `DataModel.md` la describe.
- **AC-2 (FR-PROD-10)**: crear y editar guardan los tres campos, validados y recortados. La edición audita solo lo que cambió. **El tipo de entrada del servicio exige los tres campos**, así que ningún llamador puede omitirlos por olvido y borrarlos sin querer. Vaciar marca o categoría desde el formulario las deja en nulo a propósito, y hay un caso que lo prueba.
- **AC-3 (FR-PROD-11)**: la búsqueda por palabras encuentra por el comienzo de cualquier palabra de nombre, marca o categoría, sin distinguir mayúsculas ni acentos, con todas las palabras, o por SKU exacto. Los dos límites de D-4 tienen un caso cada uno, que afirma que **no** encuentra. Un término con caracteres de `tsquery` (`&`, `|`, `!`, `:`, `(`) no produce un error.
- **AC-4 (índice)**: un caso con `EXPLAIN` comprueba que la búsqueda usa el índice GIN. Reemplaza al de prefijo de nombre de la 9.0.2 para productos; el de clientes sigue igual. **Mutación**: con la expresión de la consulta distinta de la del índice, el caso falla.
- **AC-5 (pantallas)**: la 3, la 4 y el formulario muestran y editan los tres campos. El end-to-end busca por marca y por categoría, y comprueba que un `viewer` ve los campos y no puede editarlos. axe da cero violaciones en claro y en oscuro, también con el token de D-8.
- **AC-6 (FR)**: FR-PROD-10 y FR-PROD-11 están en `FunctionalRequirements.md`, la enmienda de FR-PROD-04 está fechada, y cada identificador aparece en el nombre o el comentario del caso de test que lo prueba.

**Etapa 11.1.2**

- **AC-7 (tabla de solo inserción, FR-PROD-13)**: `crm_app` tiene sobre `product_prices` exactamente `SELECT` e `INSERT`. Un `UPDATE` y un `DELETE` con el rol dueño fallan con el trigger (`P0001`). Un precio de otra organización lo rechaza la clave compuesta. `identity-schema` y `audit` incluyen la tabla.
- **AC-8 (dinero, D-6)**: `src/shared/money/` tiene tests unitarios de cada regla:
  - «300.000» y «300,000» se rechazan en CLP;
  - «300000» se acepta en CLP;
  - «1.234,5» y «1234,50» se aceptan en USD, y «1234,567» se rechaza;
  - KWD se rechaza;
  - un monto de más de 12 dígitos enteros se rechaza.
  
  **Mutación**: con el parser de cantidades en lugar del de dinero, el caso de «300.000» en CLP falla.
- **AC-9 (FR-PROD-12)**: fijar el precio es solo para `admin` y escribe precio y auditoría en la misma transacción. El vigente es el último. Se prueban el mismo monto sin escritura, el producto desactivado y el `CONFLICT` con un precio vigente que ya cambió. La concurrencia se prueba **con el bloqueo retenido desde una tercera conexión**, como en la 4.3.2, y con una corrida de mutación sin el `FOR UPDATE`.
- **AC-10 (guarda)**: `price-writes.test.ts` falla con un `insert(productPrices)` fuera de la función autorizada y con un `update` o un `delete` sobre la tabla, con sus casos virtuales versionados. Además, un control comprueba que el repositorio tiene exactamente la escritura autorizada, para que un cambio de patrón no deje la guarda vacía. `EngineeringStandards.md` la lista, y el recuento coincide con `ls tests/guards/*.test.ts | wc -l`.
- **AC-11 (pantallas)**: la pantalla de precios muestra el vigente y el historial paginado. Fija un precio con confirmación del monto formateado y recarga ante un `CONFLICT`. La 3 y la 4 muestran el precio vigente, o «Sin precio». El end-to-end cubre el `admin`, el `viewer` sin formulario, «300.000» rechazado en CLP y axe en claro y en oscuro.
- **AC-12 (FR)**: FR-PROD-12 y FR-PROD-13 están escritos y etiquetados en sus tests, y `TraceabilityMatrix.md` tiene las filas nuevas.

**Las dos etapas**

- **AC-13**: `format:check`, `lint` y `typecheck` en verde. `npm run test` y `npm run test:e2e` completos en verde, con el recuento en este brief. La CI del commit de cada etapa, en `success`, leída por `headSha`.
- **AC-14**: `git status` muestra solo archivos de la lista autorizada. `forbidden-references.test.ts` no cambió.

## Pruebas y evidencia requerida

- **Contra PostgreSQL real**: el esquema, los privilegios, el trigger, la búsqueda con su `EXPLAIN` y la concurrencia. Nada con mocks de base.
- **Las corridas de mutación** que nombran AC-4, AC-8 y AC-9, con su salida.
- **La huella de `products`** antes y después de la `0016`.
- **Los end-to-end** sobre `next start`.

## Condiciones de detención

- Antes de commit, push, merge o de abrir un PR.
- Antes de tocar un archivo fuera de la lista.
- Si la migración generada por `drizzle-kit` difiere de lo que el esquema declara, o si toca una tabla que no es `products`, `product_prices` o el enum de auditoría.
- Si la búsqueda por palabras no usa el índice con los datos del seed de volumen en la base de desarrollo.
- Si algún test existente fuera de la lista falla por los cambios.
- Antes de instalar dependencias o crear extensiones de PostgreSQL.
- Antes de ejecutar migraciones contra una base que no sea la local de desarrollo, la de test o la de e2e.

## Resolución — 2026-09-24

El usuario aprobó el brief **con las recomendaciones** de las diez decisiones:

- **D-1**: (b) dos etapas verticales en este brief. La 11.1.1 lleva marca, categoría, condición y búsqueda; la 11.1.2, el precio. Cada una cierra con su end-to-end y su commit.
- **D-2**: (a) marca y categoría como texto libre en `products`, que admite nulo, con sugerencias de los valores existentes.
- **D-3**: (a) enum `product_condition` (`new`, `refurbished`), no nulo y `new` por defecto.
- **D-4**: (a) búsqueda de texto de PostgreSQL con la configuración `simple`, sin acentos y por prefijo de cada palabra, con índice GIN. Reemplaza la búsqueda por prefijo del nombre; el SKU exacto se mantiene.
- **D-5**: `product_prices` de solo inserción, con moneda por fila y un solo precio vigente por producto, el último. Montos `numeric(14, 2)`, sin fecha de vigencia futura y sin retiro del precio.
- **D-6**: (a) un parser de dinero propio, que conoce los decimales de cada moneda, con confirmación del monto formateado.
- **D-7**: bloqueo del producto con `CONFLICT` si el precio vigente cambió, rechazo del producto desactivado, sin escritura si el precio es el mismo, sin motivo obligatorio y con auditoría `price_change`.
- **D-8**: (a) `globals.css` autorizado **solo** para el token de advertencia de «bajo stock» (O-17).
- **D-9**: (a) solo `seeds/basic.ts`. El seed de volumen queda con destino en la 11.3 o la 11.4.
- **D-10**: una revisión independiente al final de la 11.1.2.

En el mismo turno, el usuario autorizó registrar el brief, hacer su commit y mover la tarea 11.1 de Notion (`3e4702be6f4e818a88bec2cb52103821`) a «En proceso». No autorizó push.

**Ampliación de la lista de archivos, 2026-09-24** (etapa 11.1.1). Al hacer obligatorios en `ProductInput` los tres campos nuevos (AC-2), `typecheck` marcó dos datos de prueba escritos a mano fuera de la lista: `src/modules/inventory/service.test.ts` (el constructor `product()`) y `tests/integration/product-audit.test.ts` (el producto `coffee`). El usuario autorizó sumarlos **solo para completar esos datos de prueba**, sin cambiar ninguna afirmación. La alternativa, dejar los campos opcionales en el tipo, contradecía AC-2.

## Resultados — etapa 11.1.1, 2026-09-24 (autoevaluación)

Todo lo de esta sección es **autoevaluación**. La revisión independiente (D-10) va al final de la 11.1.2.

### Lo que la implementación encontró que el brief no decía

- **Cambió cómo se arma la consulta de búsqueda.** D-4 decía que los términos se reducen a letras y dígitos antes de armar la consulta. Eso rompía palabras que el parser de PostgreSQL guarda enteras: el documento guarda «Aceite 1.5 L» como `'1.5'`, y un `split` por lo que no es letra ni dígito buscaría `1` y `5`, y no lo encontraría. Probado en una base desechable. La consulta ahora pasa el texto buscado **por el mismo `to_tsvector('simple', …)` que el documento** y arma el `tsquery` con esas palabras como prefijo, en SQL (`productSearchQuery`). Lo que el brief quería asegurar se mantiene: el texto del usuario nunca llega crudo a `to_tsquery`. `&`, `|`, `!`, `:`, `(`, `'` y `\` no son sintaxis, y hay un caso que lo prueba.
- **La lista pendiente de GIN decide el plan.** Las filas insertadas después de crear el índice esperan en su lista pendiente hasta un vacuum, y el planificador cobra leerla. Con 10 000 filas recién insertadas, el `Bitmap Index Scan` costaba 259 contra 13 del índice construido sobre filas existentes, y el planificador eligió `Seq Scan`. No es un defecto: en uso normal lo resuelve el autovacuum. El test con `EXPLAIN` vacía la lista con `gin_clean_pending_list` antes de planificar, y quedó documentado en `DataModel.md`.
- **El índice no lleva `organization_id`**: un GIN no lo combina sin `btree_gin`, así que la organización se filtra después del índice. Quedó documentado.
- **`seeds/basic.ts` no tiene productos.** El brief suponía «los productos de ejemplo» del seed básico, y no existen: los productos de desarrollo vienen del seed de volumen, y cada end-to-end inserta los suyos. No se tocó el seed básico, porque agregarle productos era alcance nuevo. **D-9 queda sin efecto en esta etapa**, y los productos de volumen no tienen marca ni categoría.
- **Un defecto propio, encontrado antes de cerrar**: la primera versión del formulario ponía el `select` de condición después del punto de reposición, mientras el orden de los mensajes de error lo pone después de la categoría. El foco al primer error y el orden del teclado habrían divergido. Se corrigió con una sola lista de campos para los dos, y el caso 12 del end-to-end recorre el orden nuevo campo por campo.
- **`src/modules/inventory/service.ts` no se tocó**: la firma de `searchProducts` no cambió.
- **`scripts/medir-caminos.ts` no mide la búsqueda con texto**: solo mide la lista sin filtro. La búsqueda por palabras con volumen queda sin medir fuera del `EXPLAIN` de la base de desarrollo, que da `Bitmap Index Scan on products_search_idx` sobre las 10 000 filas de la organización de volumen, con 138 filas en 107 buffers. Queda para la 11.3, cuando la búsqueda pase a ser una lectura de servicio.

### Contraste por criterio

- **AC-1 (esquema)** — cumplido. La `0016` generada por `drizzle-kit` crea el enum, borra `products_organization_name_unaccent_idx`, agrega las cuatro columnas y crea `products_search_idx`. No toca ninguna otra tabla. Aplicada sobre la base de desarrollo con `npm run db:migrate` (`Migraciones aplicadas.`, salida 0). La huella de `products` sin las columnas nuevas dio `10001|26f26bca19c45ac0d573588372ba909f` **antes y después**. Las 10 001 filas quedaron con `condition = new` y marca y categoría nulas.
- **AC-2 (FR-PROD-10)** — cumplido. `ProductInput` exige los tres campos. Hay casos para crear con los tres recortados y auditados, editar solo lo que cambió con el antes real, y vaciar la marca para que quede nula a propósito. La validación rechaza marca o categoría de más de 100 caracteres y cualquier condición fuera del enum (`""`, `used`, `NEW`).
- **AC-3 (FR-PROD-11)** — cumplido:
  - encuentra por prefijo de palabras de campos distintos y en cualquier orden, por SKU exacto y sin acentos en las dos direcciones;
  - un número es una palabra («500»);
  - los dos límites de D-4 tienen su caso de lo que **no** encuentra: «zucar» e «yerbas»;
  - los caracteres de `tsquery` y de `LIKE` no producen errores;
  - «1.5» encuentra «Aceite 1.5 L».
  
  Dos cambios de conducta respecto de la 4.2, esperados: «500» ahora encuentra «Yerba 500 g», y el SKU sigue exacto.
- **AC-4 (índice)** — cumplido. El caso de `EXPLAIN` usa la misma función que el repositorio, `productSearchCondition`, y exige `Bitmap Index Scan on products_search_idx` con `Index Cond: (search @@`. **Mutación**: con la condición recalculando el vector en lugar de leer la columna, `Tests 1 failed | 27 passed (28)` (`expected 'Seq Scan on products…'`), y los resultados de la búsqueda no cambiaron. Restaurado: `28 passed (28)`.
- **AC-5 (pantallas)** — cumplido:
  - la lista muestra marca y categoría, también en las tarjetas de móvil;
  - el detalle muestra los tres campos;
  - el formulario los pide, con sugerencias (`datalist`) de los valores de la organización.
  
  «Bajo stock» usa `bg-warning-soft text-on-warning-soft`, con contraste de 7,59:1 en claro y 9,33:1 en oscuro, calculado. El end-to-end tiene los casos 1, 12 y el caso nuevo 14:
  - búsqueda por marca sin acentos, por categoría y con palabras de campos distintos;
  - un `viewer` ve los campos y no recibe el formulario;
  - axe da cero violaciones en claro y en oscuro sobre la lista con «Bajo stock» y sobre el detalle.
  
  Productos: `14 passed`.
- **AC-6 (FR)** — cumplido. FR-PROD-10 y FR-PROD-11 están en `FunctionalRequirements.md`, la enmienda de FR-PROD-04 está fechada con el texto anterior intacto, y los dos están en `TraceabilityMatrix.md`. Cada identificador aparece en el nombre de los casos que lo prueban: `service.test.ts`, `catalog.test.ts` y `products.spec.ts`.
- **AC-13, parte de la etapa**: `format:check`, `lint` y `typecheck` con salida 0; `npm run test` con **959 de 959 en 77 archivos**; `npm run test:e2e` con **82 de 82** (5,0 min). **CI**: el commit `487def8` corrió en la run 36013939490 con resultado `success`, con todos sus pasos en `success` y el de artefactos en `skipped`. El push necesitó tres intentos: GitHub respondió dos veces `Internal Server Error`, sin incidente publicado.
- **AC-14, parte de la etapa**: `git status` muestra 25 archivos modificados más la migración y su snapshot, todos de la lista, con los dos que el usuario sumó. `forbidden-references.test.ts` sin cambios.

## Resultados — etapa 11.1.2, 2026-09-24 (autoevaluación)

Todo lo de esta sección es **autoevaluación**. La revisión independiente (D-10) va aparte, más abajo.

**Segunda ampliación de la lista de archivos, 2026-09-24.** Dos archivos fuera de la lista quedaron afectados por la tabla nueva, y el usuario autorizó sumarlos **solo para estos cambios**:

- `tests/e2e/security-headers.spec.ts` ya fallaba: vaciaba `products` con TRUNCATE sin `product_prices`, y PostgreSQL respondía `cannot truncate a table referenced in a foreign key constraint`. Se sumó `product_prices` a sus dos TRUNCATE, sin cambiar ninguna afirmación.
- `tests/guards/exposed-surface.test.ts` tenía que declarar `setPriceAction` con la exigencia `sesion`, como las demás acciones de productos. Antes de declararla, la guarda daba un **falso verde**: lista los archivos con `git ls-files` y la acción todavía no estaba en git. Registrada solo como intención en el índice (`git add -N`, deshecho después), la guarda falló y señaló la acción.

### Lo que la implementación encontró que el brief no decía

- **El brief se contradecía sobre la representación del monto.** El ítem 7 decía «`bigint` en centésimas» y D-5, `numeric(14, 2)`. Son compatibles, y quedaron así: `numeric(14, 2)` en la base, texto con la escala de la base en Drizzle y `bigint` en centésimas en `src/shared/money`.
- **D-7 chocaba con la validación de auditoría.** D-7 pedía `before: null` en el primer precio, y `recordAudit` solo acepta `before: null` en `create`. El servicio de auditoría está fuera de la lista. El primer precio se audita con `before: { amount: null, currency: null }`: dice lo mismo sin tocar `audit`, y quedó documentado en `DataModel.md`.
- **AC-8 pide aceptar «1.234,5» en USD, y D-6 hablaba de un solo separador.** El parser acepta un separador decimal (coma o punto) y, además, separador de miles **solo con el otro signo, en grupos de tres y seguido del separador decimal**: «1.234,5» y «1,234.5». «1.234» en USD se rechaza, porque es ambiguo: mil doscientos treinta y cuatro, o uno con veintitrés. En una moneda sin decimales se rechaza cualquier separador, como decía D-6.
- **`Intl` asigna dos decimales a una moneda que no conoce.** «ZZZ» da 2. La validación exige primero que el código esté en `Intl.supportedValuesOf("currency")`, que en Node 24 tiene 162, y después rechaza las seis con tres decimales (BHD, JOD, KWD, LYD, OMR y TND).
- **`Intl` separa el símbolo del monto con un espacio que no se corta (U+00A0).** Las expectativas de los tests unitarios lo escriben explícito. En el end-to-end, los textos literales lo normalizan y las expresiones regulares no, así que la de CONFLICT usa `\s`.
- **Un defecto propio de la 11.1.1, encontrado en esta etapa.** El resumen de auditoría no tenía etiquetas para marca, categoría ni condición, así que una edición de solo la marca mostraba la columna «Cambio» vacía. La 11.1.1 no lo vio porque ningún caso editaba solo esos campos y miraba la auditoría. Se corrigió en `audit-summary.ts`, que está en la lista de esta etapa, con su test.
- **Un defecto propio de esta etapa, encontrado por el end-to-end.** Al terminar la acción, React reinicia el formulario. Un `select` controlado quedaba en la primera opción, vacía, mientras el estado decía otra moneda, y como la moneda es obligatoria, el navegador bloqueaba el envío siguiente **sin ningún aviso**: después de un rechazo, «Confirmar precio» no hacía nada. Pasar a un campo no controlado no alcanzó, porque React fija la opción por defecto de un `select` solo al montarlo. Quedó así: los campos se inicializan con lo enviado, que la acción devuelve en el estado, y el `select` se vuelve a montar con cada rechazo. El caso 16 comprueba que la moneda se conserva y que confirmar de nuevo guarda el precio. El trace mostró el síntoma: dos envíos donde tenía que haber tres.
- **`seeds/basic.ts` sigue sin productos**, así que el ítem 12 del brief (precios de ejemplo) tampoco tiene efecto en esta etapa, como D-9 en la 11.1.1. Los precios del end-to-end los inserta cada caso.
- **El brief no nombraba la pantalla nueva.** En `Screens.md` quedó como **5b**, para no renumerar las pantallas 6 a 10, que la matriz y los wireframes citan por número.

### Contraste por criterio

- **AC-7 (tabla de solo inserción, FR-PROD-13)** — cumplido. La `0017` generada por `drizzle-kit` crea la tabla, sus claves y su índice, y agrega `price_change` a `audit_action`. No toca otra tabla. Los privilegios y el trigger van escritos a mano al final, como la `0005`, y se aplicó a la base de desarrollo (`Migraciones aplicadas.`). `product-prices.test.ts` comprueba:
  - `crm_app` tiene exactamente `INSERT` y `SELECT`, y su `UPDATE` y su `DELETE` fallan con `42501`;
  - con el rol dueño, el trigger los rechaza con `P0001`, y la fila no cambia;
  - un precio que apunta al producto de otra organización falla con `23503` sobre `product_prices_product_fk`;
  - los `CHECK` de monto y moneda responden `23514`, y un monto de trece dígitos enteros, `22003`.

  `identity-schema` y `audit` incluyen la tabla.
- **AC-8 (dinero, D-6)** — cumplido. `money.test.ts`, con 13 casos:
  - «300.000» y «300,000» se rechazan en CLP (`separator`), y «300000» se acepta;
  - «1.234,5», «1,234.5» y «1234,50» se aceptan en USD, y «1234,567» se rechaza (`decimals`);
  - KWD y las otras cinco monedas de tres decimales se rechazan;
  - trece dígitos enteros se rechazan (`too_large`), y el máximo de `numeric(14, 2)` se acepta.

  **Mutación**: el servicio con `parseQuantityInput` en lugar del parser de dinero dio `2 failed | 12 passed` en `product-prices.test.ts`. «300.000» en CLP se **aceptó** y se habría guardado como 300, que es el error de mil veces de D-6, y «1.234,5» en USD no se entendió. Restaurado: `19 passed`.
- **AC-9 (FR-PROD-12)** — cumplido.
  - Solo `admin`: el `viewer`, el admin con contraseña pendiente y el admin de otra organización no escriben nada.
  - Precio y auditoría van en la misma transacción.
  - El vigente es el último, y el desempate por `id` tiene su caso.
  - Tienen caso: el mismo monto y la misma moneda sin escritura, el producto desactivado y el `CONFLICT` con el vigente cambiado.
  - Concurrencia: con el producto retenido desde una tercera conexión y las dos llamadas esperando en `pg_stat_activity`, una escribe y la otra recibe `CONFLICT` con el precio de la primera.

  **Mutación** sin el `FOR UPDATE`: `1 failed | 18 passed`, `expected [ …(2) ] to have a length of 1 but got 2`. Las dos escribieron. Restaurado: `19 passed`.
- **AC-10 (guarda)** — cumplido. `price-writes.test.ts` tiene 7 casos virtuales de detección, 2 de lo permitido y el control de que el repositorio tiene exactamente `insertProductPrice: insert product_prices`. **Seis corridas de mutación contra el código real**, una por forma, fallan todas y restauradas dan `11 passed`:
  - `update` con Drizzle dentro de `insertProductPrice`;
  - `delete` con Drizzle en otra función del repositorio;
  - `insert` con Drizzle en `service.ts`;
  - `insert`, `update` y `delete` en SQL literal.

  `EngineeringStandards.md` la lista como la número doce, y `ls tests/guards/*.test.ts | wc -l` da 12.
- **AC-11 (pantallas)** — cumplido. La pantalla `/productos/[id]/precios`:
  - muestra el vigente y el historial paginado;
  - fija un precio mostrando antes el monto formateado en su moneda, con `aria-live`;
  - ante un `CONFLICT`, muestra el vigente nuevo y conserva lo escrito.

  La 3 y la 4 muestran el precio vigente o «Sin precio», y la 4 enlaza a la pantalla nueva. Casos nuevos del end-to-end:
  - 15: el admin fija precios, con «300.000» en CLP rechazado;
  - 16: `CONFLICT` con otra sesión;
  - 17: el viewer ve precios e historial, sin formulario y sin ninguna acción de editar o borrar.

  axe da cero violaciones en claro y en oscuro en cada estado.
- **AC-12 (FR)** — cumplido. FR-PROD-12 y FR-PROD-13 están en `FunctionalRequirements.md` y en `TraceabilityMatrix.md` (por requisito, y la pantalla 5b en la vista por pantalla). Cada identificador aparece en el nombre de los casos que lo prueban: `product-prices.test.ts`, `audit-summary.test.ts` y `products.spec.ts`.
- **AC-13, parte de la etapa**:
  - `format:check`, `lint` y `typecheck` con salida 0;
  - `npm run test`: **1003 de 1004 en 80 archivos**. El que falta es `exposed-surface` > «toda Server Action declarada sigue existiendo», porque `git ls-files` no ve los archivos todavía sin registrar. Con `git add -N` de la carpeta de precios, deshecho después, las guardas dan **233 de 233**. En el commit pasa a ser 1004 de 1004;
  - `npm run test:e2e`: **85 de 85** (5,4 min), sobre un build nuevo.

  La CI se lee cuando haya commit.
- **AC-14, parte de la etapa**: `git status` muestra solo archivos de la lista autorizada, más los dos que el usuario sumó. `forbidden-references.test.ts` no cambió.

## Revisión independiente — 2026-09-24 (D-10)

La hizo un agente que no participó del trabajo, con acceso de solo lectura, contra este brief y `CLAUDE.md`, y **fijó la escala de severidad antes de leer**. No ejecutó nada. De la 11.1.1 leyó solo la migración `0016`, `ProductInput` y el armado de la búsqueda, así que AC-2 a AC-6 los dio como no verificables por lectura. **Informó 6 hallazgos**: 2 mayores y 4 menores, uno de ellos documental y fuera de la lista. Agregó 5 notas y encontró **el parser de dinero sin defectos**. Cada hallazgo se verificó contra el código antes de aceptarlo; cuando se pudo, **primero con un test que lo reproduce en rojo** y después con la corrección.

| Hallazgo | Verificación | Qué se hizo |
|---|---|---|
| **M-1** (mayor). Tras un rechazo que no era `CONFLICT`, el formulario tomaba el vigente nuevo de la página y D-7 dejaba de detectar el cambio | **Confirmado.** El caso 16 se amplió con un rechazo de validación («5.000», ambiguo en ARS) entre el precio de la otra sesión y la corrección, y falló: sin `CONFLICT` | Dos defensas: la acción revalida solo ante `CONFLICT`, producto desactivado o inexistente, y el id del precio esperado viaja en el estado del formulario, no en la prop. **Mutaciones**: sin ninguna de las dos, el caso 16 falla en el `CONFLICT`; con una sola de las dos, cualquiera, pasa. Cada una alcanza sola |
| **M-2** (mayor). `price-writes` no veía la tabla interpolada (`${productPrices}`), el esquema, el espacio de nombres ni `TRUNCATE` | **Confirmado.** Los 8 casos virtuales nuevos fallaron con la guarda original | Guarda ampliada, con su cabecera reescrita: qué ve, qué no ve y por qué el `INSERT` depende solo de ella. 22 casos. **Diez corridas de mutación** contra el código real dan rojo: las seis de antes y cuatro nuevas (interpolada, esquema, espacio de nombres y `TRUNCATE`). **Dos límites declarados** dan verde, como se esperaba: la tabla en una variable con otro nombre y el nombre armado en tiempo de ejecución. `stock-writes` tiene el mismo hueco desde la 4.3.1, pero está fuera de la lista: queda pendiente, abajo |
| **M-3** (menor). Un `productId` en mayúsculas salteaba el `CONFLICT` y la regla de mismo precio | **Confirmado.** `z.uuid()` acepta mayúsculas (lo comprobé en Node), y un caso nuevo de integración falló: se escribió en lugar de dar `CONFLICT` | `setProductPrice` usa el id que devuelve la base desde el bloqueo en adelante. `product-prices.test.ts`: **20 de 20** |
| **M-4** (menor, sospecha). Estado viejo del formulario al fijar dos precios seguidos desde `?aviso=fijado` | **No reproducido.** Dos mutaciones sin la corrección tentativa —la segunda con la redirección exactamente a la misma URL— pasaron en verde: con Next 16, la redirección reinicia el estado de la acción | La corrección tentativa se quitó, por ser código defensivo sin un defecto que la justifique. Quedan en el caso 16 los pasos que lo comprueban: fijar otro precio sin `CONFLICT` falso ni mensaje residual. Además, «mismo precio» ya no redirige: responde con estado y un aviso, con su paso en el caso 16 |
| **M-5** (menor, documental, fuera de la lista). `SecurityModel.md` sigue diciendo que la guarda fija «21» puntos de entrada y «36 revisados», y ahora son 22 | **Confirmado** (`SecurityModel.md:9`) | El archivo no está en la lista: se esperó la decisión del usuario, que **autorizó corregirlo** el 2026-09-24. Ahora dice 38 puntos de entrada (16 páginas, 20 Server Actions, 2 Route Handlers) y 22 fijados por la guarda, contados contra `exposed-surface.test.ts` y `src/app` |
| **M-6** (menor, documental). Se afirmaba que el índice sirve el precio vigente, sin ningún plan que lo mostrara | **Confirmado**: no hay `EXPLAIN` de esa consulta | El comentario del repositorio, `DataModel.md` y la matriz dicen ahora «asignado por la forma de la consulta, sin plan medido». Queda para la 11.3 |

**Las notas:**

- **N-1** («0.000,5» se aceptaba como 0,50): se corrigió. El primer grupo de miles ya no puede empezar en cero, y el test falló antes de la corrección.
- **N-2** (la vista previa depende del `Intl` del navegador): se acepta. Solo afecta la vista previa, y el servidor vuelve a validar.
- **N-3** (`TRUNCATE` con el rol dueño): quedó documentado en `DataModel.md`.
- **N-4**: es parte de M-1.
- **N-5**: se confirma. En `security-headers.spec.ts` también se editó **el comentario** que enumera las tablas de solo inserción, para sumar `product_prices`. No es solo el TRUNCATE; no cambia ninguna afirmación.

**Una explicación propia que resultó equivocada, y se corrige acá.** Durante la corrección de M-4, una `key` del formulario atada al precio vigente hizo fallar el caso 16. Primero lo atribuí a que la página se vuelve a renderizar después de cualquier acción, por una cookie de sesión. No había ninguna escritura de cookies, y las mutaciones mostraron la causa real: la `key` montaba de nuevo el formulario justo en el `CONFLICT`, que sí revalida la página, y así borraba el mensaje del conflicto.

**Pendientes con destino:**

- `stock-writes.test.ts`: el mismo hueco que M-2 (tabla interpolada, esquema, espacio de nombres, `TRUNCATE`). Está fuera de la lista de esta subfase y va a la 11.3, o a la próxima que toque `inventory`.
- El plan del precio vigente (M-6): la 11.3.

**Recuentos después de las correcciones**: los de §Contraste por criterio de la 11.1.2 son anteriores a la revisión. Los finales están en §Cierre.

## Cierre — etapa 11.1.2, 2026-09-24 (autoevaluación)

Recuentos finales, después de las correcciones de la revisión independiente:

- `format:check`, `lint` y `typecheck`: limpios.
- Vitest: **1016 de 1016**, en 80 archivos. Los archivos nuevos se registraron con `git add -N` para que `exposed-surface` los viera, y después se volvió atrás.
- `product-prices.test.ts`: 20 de 20. `price-writes.test.ts`: 22 de 22. `money.test.ts`: 13 de 13.
- End-to-end: **85 de 85 en 4,5 minutos**, con `products.spec.ts` en 17 de 17.
  - Una corrida anterior tardó 41 minutos y dio 84 de 85. Falló el caso 8, que no toca precios, por el tiempo máximo de 30 s dentro de la revisión de accesibilidad (`axe`).
  - `products.spec.ts` solo pasó 17 de 17 en 1,2 minutos, y la suite completa, 85 de 85 en 4,5. Se registra como una corrida lenta del entorno, no como un defecto. Si vuelve a pasar, se investiga.

**Nivel alcanzado**: validado localmente y en CI, y validado en integración (`producer-consumer`) para las pantallas: UI, servicio y base.

**CI**: el commit `aa29504` corrió en la run 36045565521.
- **Intento 1: `failure`.** Falló un solo caso, `conversations.spec.ts` caso 2, que no toca productos ni precios. Llegó al tiempo máximo de 30 s con «Target page, context or browser has been closed» (línea 246), y los otros 84 casos pasaron. Es **la misma firma** que HANDOFF ya registraba para ese caso, en la run 35646632631.
- **Intento 2 (`gh run rerun --failed`): `success`**, con todos los pasos en `success` y el de artefactos en `skipped`.

Es la tercera vez que aparece esta firma, y sigue sin causa. No se corrigió: está fuera de la lista.

**Cierre**: el usuario autorizó el commit y el push de la 11.1.2 y el cierre de la subfase el 2026-09-24.

**Tercera extensión de la lista**: `docs/architecture/SecurityModel.md`, por M-5, con autorización del usuario del 2026-09-24.

**Pendientes**: los de §Revisión independiente.
