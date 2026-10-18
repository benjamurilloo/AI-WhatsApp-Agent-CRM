---
schema: task-brief.v1
task_id: "29.2"
task_type: implementation
generated_at: 2026-10-18
---

# Brief 29.2 — Capacidades y variantes

- **Contrato**: `task-brief.v1`
- **Tipo de tarea**: `implementation`. Migración, código, pruebas y despliegue.
- **Nivel de evidencia objetivo**: `deterministic` (tests contra PostgreSQL) y `producer-consumer` (pantallas ↔ servicio ↔ base, con end-to-end).
- **Nivel de validación alcanzable**: validado localmente y en CI, validado en integración, y desplegado y recorrido por el usuario en la organización demo.
- **Orden**: segunda subfase de construcción de la Fase 29, según el [ADR 0024](0024-rubros-y-capacidades.md), punto 17. En Notion, la tarea `3fd702be6f4e813bbb5aecdbb530558c` está en «En proceso» desde el 2026-10-18.
- **No abre ni cierra un gate.**
- **Estado de este documento**: **aprobado el 2026-10-18** por el usuario, con las recomendaciones de D-1 a D-12 y el nombre «iPhone Demo» para la organización demo.

## Decisión del usuario que abre la construcción (2026-10-18)

El brief-29.1, D-16, pide que la construcción de la Fase 29 empiece **con el negocio confirmado, o antes solo por decisión explícita del usuario registrada con fecha**. **El 2026-10-18 el usuario decidió construir sin el negocio confirmado**, «para obtener una impresión de cómo quedaría» y mostrárselo al cliente: cómo quedaría su negocio, o uno genérico del rubro. Ese mismo día eligió:

- **una organización demo aparte**, ficticia, en producción, junto a «Demostración Vixora». **El cliente real, si llega, recibe una organización nueva y limpia**, y la demo queda para mostrársela a otros negocios del rubro. Se descartó convertir la demo en la real, porque los comprobantes y los movimientos son de solo inserción: las pruebas quedarían para siempre en su historial y en su numeración;
- **empezar por la 29.2**, el orden del ADR 0024.

## Objetivo

Que una organización con la capacidad `variants` tenga **su catálogo agrupado por modelo, con capacidad y color**, y que la organización demo del rubro de iPhone **se vea como una tienda de iPhone**:

- la tabla de capacidades por organización, su lectura única y el menú que depende de ella;
- los modelos, y el producto que pertenece a un modelo;
- los atributos definidos por la organización, con sus opciones y sus valores tipados;
- la plantilla del perfil de iPhone, copiada a la organización con un script;
- la organización demo, con su catálogo de ejemplo.

## Lo que se verificó antes de escribir este brief

Releído el 2026-10-18 contra `main` (`b48b9af`). Un relevamiento de solo lectura del código, hecho ese día, citó cada punto.

- **El ADR 0024** fija para la 29.2:
  - punto 3: `organization_capabilities` en `organizations`, con un enum `capability` que nace solo con `variants`; la activa quien opera el CRM con un script; el autor auditado es un `admin` de la organización; no se desactiva con datos; una sola lectura, `hasCapability`, con una guarda; el menú por capacidad y 404 en cada página, acción y ruta de una capacidad que la organización no tiene;
  - punto 4: `attribute_definitions` con su tabla de opciones y `attribute_values` con una columna por tipo y un `CHECK`, sin `jsonb`; una definición con valores no cambia de tipo ni de entidad;
  - punto 5: cada combinación sigue siendo un producto; `product_models` con nombre único por organización; `products.model_id` opcional; dos productos activos del mismo modelo, con la misma condición y los mismos valores de variante, son un duplicado;
  - punto 13: la plantilla en `src/modules/organizations/profiles/`, copiada con el mismo script que activa la capacidad, en una transacción, con auditoría.
- **`src/modules/organizations/profiles/` no existe todavía.**
- **El alta de una organización**: `scripts/crear-organizacion.ts` (`npm run org:create`) llama a `createOrganizationWithAdmin` (`organizations/service.ts:423-490`), que audita con el `admin` nuevo como autor. En producción, los scripts corren como `crm_app` con `/etc/crm-production/app.env`, y los valores se leen con `read`, nunca como argumentos de `sudo` (`docs/runbooks/alta-de-un-negocio.md`).
- **«Demostración Vixora»** se creó con `org:create`, y su catálogo **lo cargó el usuario por la pantalla**. **Los seeds no corren en producción**: `seeds/basic.ts:50-74` exige una base `_dev`, `_test`, `_e2e` o `_staging`.
- **El catálogo**: `products` tiene `condition` (`new`, `refurbished`), SKU único sin mayúsculas, código de barras único y un `tsvector` de búsqueda (`catalog/schema.ts:47-141`). `createProduct` y `updateProduct` son de `admin` y auditan cada campo de `ProductValues` (`catalog/service.ts:475-568`). La edición es en la misma ficha, con `?editar=1`.
- **El menú** es una lista fija en `src/app/(autenticado)/layout.tsx:37-58`, filtrada por rol en línea; los datos del marco salen de `getAppFrame` (`organizations/service.ts:207-223`). **Ninguna página usa `notFound()`**: lo prohibido se muestra con `PageNotice`. El layout no se vuelve a ejecutar en cada navegación, así que cada página y cada acción comprueban por su cuenta.
- **La auditoría** solo acepta valores planos por campo (`audit/service.ts:19-22`), y no tiene columna de origen.
- **Los contratos del agente**: `read-v1` y `read-v2` usan objetos estrictos y un mapeo campo por campo (`read/v1/contract.ts:288-308`). Un campo nuevo del producto no llega al agente si no se toca el mapeo.
- **Los permisos**: cada tabla nueva necesita su `GRANT … TO crm_app` en la migración. Los tests locales corren como superusuario, así que solo un test de esquema lo detecta (como `tests/integration/suppliers-schema.test.ts`).
- **Las acciones**: cada Server Action nueva se declara en `tests/guards/exposed-surface.test.ts`.
- **La próxima migración** es la `0052`.

### Hallazgos

- **H-1. El 404 sería nuevo.** El ADR pide 404 para una capacidad ausente, y la app nunca usó `notFound()`. Mostrar «no existe» y no «no tenés permiso» es lo correcto: una organización sin la capacidad no tiene esa sección.
- **H-2. La auditoría no guarda objetos.** Los valores de los atributos de un producto tienen que entrar al diff como campos planos (por ejemplo `atributo.color`), y el origen «script» de una activación, como un campo del diff.
- **H-3. El catálogo de una demo no se puede cargar con un seed en producción.** Cargarlo a mano por la pantalla, como «Demostración Vixora», son decenas de productos. Hace falta otra forma, que no esquive las reglas ni la auditoría (D-9).
- **H-4. Los colores dependen del modelo**, y el ADR no tiene opciones por modelo. Con una sola lista, el formulario de un iPhone 11 ofrece «Titanio natural».
- **H-5. Un producto sin modelo sigue existiendo** en una organización con `variants`: accesorios, fundas, cargadores.

## Decisiones

Cada una trae una recomendación. El usuario la aprueba, la cambia o la rechaza.

### D-1 — Qué entra y qué no

**Recomendada**:

- **Entran**:
  - `organization_capabilities`, el enum `capability` con `variants`, `hasCapability` y su guarda;
  - el menú y el 404 por capacidad;
  - `product_models`, `products.model_id`, `attribute_definitions`, `attribute_options` y `attribute_values`;
  - el producto con modelo y atributos, y la regla del duplicado;
  - la lista de productos agrupada y filtrable por modelo;
  - la configuración de modelos y de atributos por un `admin`;
  - la plantilla del perfil de iPhone y el script que activa la capacidad y la copia;
  - la organización demo y su catálogo de ejemplo.
- **No entran**:
  - unidades, IMEI, usados, grados, batería y todo lo de la 29.5 en adelante;
  - generar todas las combinaciones de un modelo de una vez (ADR 0024, punto 5: «para después»);
  - cambios en `read-v1`, `read-v2` o la búsqueda global;
  - la moneda principal y el tipo de cambio (29.4): la demo tiene precios en USD, que ya se pueden cargar hoy;
  - stock, pedidos, ventas y cobros de la demo: los carga el usuario por la pantalla si los quiere mostrar.

### D-2 — La capacidad y su lectura

- **(a) Recomendada**: lo del ADR 0024, punto 3, y además:
  - **`hasCapability(organizationId, capability)`** en `organizations/index.ts`, y **`getAppFrame` suma la lista de capacidades** para armar el menú;
  - una **guarda** como `price-writes`: solo una función del repositorio de `organizations` lee `organization_capabilities`;
  - **el script** `npm run org:capability` activa una capacidad en una organización, exige el correo de un `admin` de ella como autor, y, si hay un perfil, lo copia en la misma transacción. Audita con `entity_type` nuevo `organization_capability`, y el diff lleva `origen: "script"` (H-2). Activar una capacidad ya activa no hace nada y lo dice;
  - **sin desactivación**: no hay comando. Desactivarla necesita su ADR.
- (b) Leer la tabla directamente desde cada módulo. Más simple, pero cualquiera la lee por otro camino.

### D-3 — El menú y el 404 (H-1)

- **(a) Recomendada**:
  - el menú suma **«Modelos»** como sección de Productos, solo con `variants`;
  - **cada página de una capacidad** llama a `hasCapability` y, si falta, **`notFound()`**: la página 404 del marco. Cada Server Action y cada lectura del servicio rechazan con `NOT_FOUND`;
  - **el formulario y la ficha del producto** muestran el modelo y los atributos solo con la capacidad. Sin ella, el producto se ve exactamente como hoy.
- (b) Responder «no tenés permiso». Confunde capacidad con rol.

### D-4 — Los modelos

- **(a) Recomendada**:
  - `product_models` (de `catalog`): organización, nombre (único sin mayúsculas por organización, hasta 120 caracteres), marca opcional, orden, `is_active` y fechas;
  - **un `admin`** crea, renombra, ordena y desactiva modelos en **Productos → Modelos**; un `viewer` los ve;
  - un modelo desactivado no se ofrece en el formulario, pero sus productos siguen;
  - **`products.model_id`**, opcional, con clave compuesta `(organization_id, model_id)` contra el modelo (H-5: un accesorio no tiene modelo);
  - la lista de productos suma el **filtro por modelo** y la opción de **agruparla por modelo**; la ficha del modelo lista sus productos con su condición y sus atributos de variante.
- (b) El modelo como un atributo más. No se puede agrupar ni ordenar bien, y el agente de la 29.8 lo necesita como entidad.

### D-5 — Los atributos

- **(a) Recomendada**, sobre el ADR 0024, punto 4:
  - **`attribute_definitions`**: organización, entidad (enum con solo `product` en esta subfase), clave (minúsculas, única por organización y entidad), nombre, tipo (`text`, `number`, `boolean`, `option`), obligatorio, de variante, orden, `is_active`;
  - **`attribute_options`**: una fila por opción de un `option`, con su etiqueta única dentro de la definición, su orden y `is_active`;
  - **`attribute_values`**: producto, definición y una columna por tipo (`text_value`, `number_value numeric(14, 3)`, `boolean_value`, `option_id`), con un `CHECK` de que hay exactamente una, la que corresponde al tipo, y `UNIQUE (product_id, definition_id)`. Claves compuestas por organización;
  - **la pantalla** Productos → Atributos, de `admin`: crear una definición, renombrarla, ordenar, agregar, renombrar y desactivar opciones, y desactivar una definición. **No se cambia el tipo ni la entidad**, ni se borra una opción en uso;
  - **un atributo de variante es obligatorio** y de tipo `option`, para que el duplicado se pueda comparar;
  - el valor se valida en el servicio contra su definición. Los atributos se guardan **con el producto, en la misma transacción**, y la auditoría del producto los suma como campos planos (H-2).
- (b) Atributos solo de variante, sin los demás. Deja afuera «Trae caja» y lo que el negocio sume.

### D-6 — El duplicado de variante

- **(a) Recomendada**: al crear o editar un producto con modelo, el servicio **bloquea la fila del modelo `FOR UPDATE`** y rechaza el producto si otro **activo** del mismo modelo tiene la misma condición y los mismos valores en **todos** los atributos de variante activos. El mensaje nombra el producto que choca. Reactivar un producto vuelve a comprobarlo.
- (b) Un índice único en la base. Los valores viven en otra tabla, una fila por atributo, y un índice no lo puede expresar sin una columna derivada.

### D-7 — Los colores por modelo (H-4)

- **(a) Recomendada**: **una sola lista de colores** en esta subfase, como dice el ADR. El formulario muestra todas las opciones. La plantilla trae los colores de los modelos que usa la demo. Opciones por modelo quedan como mejora, con su nota en el ADR si el negocio la pide.
- (b) Opciones por modelo ahora. Suma una tabla que el ADR no tiene.

### D-8 — La plantilla del perfil de iPhone

- **(a) Recomendada**: `src/modules/organizations/profiles/iphone.ts`, versionada, con:
  - **«Capacidad»** (`option`, de variante): 64 GB, 128 GB, 256 GB, 512 GB y 1 TB;
  - **«Color»** (`option`, de variante): la lista de los modelos del 11 en adelante (Negro, Blanco, Azul, Rojo, Verde, Violeta, Amarillo, Rosa, Medianoche, Blanco estelar, Grafito, Plata, Dorado, Azul Sierra, Morado oscuro, Titanio natural, Titanio negro, Titanio blanco, Titanio azul, Titanio desierto, Ultramarino, Verde azulado);
  - **«Trae caja»** (`boolean`, no de variante, opcional);
  - **sin modelos**: los modelos son de cada negocio.
  
  **La copia vive en la organización**: un `admin` la ajusta y cambiar la plantilla no toca las organizaciones que ya la copiaron. Las definiciones no llevan la marca `is_example`, que el ADR reserva para valores que el agente usa para cotizar.
- (b) Sin plantilla, cargando los atributos a mano. El segundo negocio del rubro repite todo.

### D-9 — La organización demo y su catálogo (H-3)

- **(a) Recomendada**:
  - **la organización**: «iPhone Demo», creada en producción con `org:create`, con un `admin` del usuario. El nombre lo puede cambiar el usuario antes de crearla;
  - **la capacidad**: activada con `org:capability`, que copia el perfil;
  - **el catálogo**: un script nuevo, **`npm run demo:catalog`**, que carga en una organización **unos 12 modelos** (del iPhone 11 al 16, con sus Pro y Pro Max) y **unos 40 productos** nuevos y reacondicionados, con capacidad, color y un **precio de ejemplo en USD**:
    - **usa los servicios del catálogo**, no SQL: las mismas validaciones, la regla del duplicado y la auditoría, con el `admin` nombrado como autor;
    - **se niega** si la organización ya tiene productos o modelos, o si no tiene la capacidad;
    - los datos de ejemplo viven en `seeds/demo-iphone.ts`, junto a los demás seeds, y el script los toma de ahí;
  - **los mismos datos** sirven al seed de desarrollo y de e2e, para probar la lista agrupada.
- (b) Que el usuario cargue el catálogo por la pantalla. Son 40 productos con sus atributos y precios.
- (c) Un seed que escriba directo en la base de producción. Esquiva la auditoría y la guarda de los seeds.

### D-10 — Roles

**Recomendada**: un `admin` configura modelos y atributos, y carga los valores en un producto. Un `viewer` ve modelos, atributos y valores, y filtra y agrupa. Ningún atributo es un costo, así que FR-PROD-21 no cambia.

### D-11 — Pruebas

**Recomendadas**:

- **Integración contra PostgreSQL**:
  - el esquema: tablas, `CHECK`, claves compuestas y los `GRANT` a `crm_app`;
  - el `CHECK` de una sola columna por valor;
  - el duplicado, incluso con dos altas simultáneas;
  - la copia del perfil en una transacción (si falla una parte, no queda nada);
  - el aislamiento: una organización no ve ni usa modelos, definiciones u opciones de otra;
  - **sin la capacidad, el producto se crea y edita como hoy**, y las acciones nuevas devuelven `NOT_FOUND`;
  - el script de la demo se niega con productos.
- **Unitarias**: la validación de un valor contra su definición.
- **Guardas**: la lectura única de capacidades, las Server Actions nuevas en `exposed-surface`, y las de siempre.
- **End-to-end**: crear un modelo, un atributo con opciones y un producto con variante; el rechazo del duplicado; la lista agrupada; un `viewer` sin edición; **una organización sin la capacidad no ve «Modelos» y recibe 404**; axe en claro y oscuro, y a 375 px.

### D-12 — Revisión independiente y cierre

**Recomendada**:

- **Revisión independiente**: sí, antes del despliegue. Es la primera capacidad y toca el catálogo y el marco, que usan todas las organizaciones. La hace un agente de solo lectura contra este brief, el ADR 0024 y el código.
- **Despliegue**, con la autorización del usuario: la migración `0052`, el código, y en producción `org:create` de la demo, `org:capability` y `demo:catalog`.
- **Recorrido del usuario** en la organización demo, y control de que «Demostración Vixora» no cambió.
- **Cierre**: DataModel con las tablas, FR-PROD con los requisitos nuevos, el runbook de alta de un negocio con `org:capability`, el Overview, el CHANGELOG, el HANDOFF y Notion.

## Alcance incluido

- `drizzle/0052_*.sql` y su snapshot.
- `src/modules/organizations/` (capacidades, `getAppFrame`, `profiles/iphone.ts`), `src/modules/catalog/` (modelos, atributos, producto).
- `src/app/(autenticado)/layout.tsx`, `src/app/_components/nav-links.ts`, `src/app/(autenticado)/productos/` (lista, ficha, formulario, Modelos, Atributos).
- `scripts/` (`org:capability`, `demo:catalog`), `seeds/demo-iphone.ts`, `package.json` (los dos scripts).
- `tests/` (integración, unitarias, guardas y end-to-end).
- La documentación del cierre.

## Alcance excluido

- Todo lo de la 29.4 en adelante.
- `read-v1`, `read-v2`, la ingestión y la búsqueda global.
- Cambios en «Demostración Vixora» o en cualquier organización que no sea la demo nueva.
- Dependencias nuevas.
- Cambios en el agente o en su repositorio.

## Invariantes

1. **Una organización sin `variants` se comporta exactamente como hoy**: productos, formularios, lista y menú.
2. **Aislamiento por organización**: ninguna definición, opción, modelo o valor se comparte; las claves compuestas lo exigen en la base.
3. **Sin `jsonb`** para los atributos.
4. **Solo `organizations` lee `organization_capabilities`**, por `hasCapability` y `getAppFrame`.
5. **Toda escritura de la demo pasa por los servicios** y queda auditada.
6. **Los contratos del agente no cambian.**
7. **La migración es aditiva** y da los `GRANT` a `crm_app`.

## Criterios de aceptación

- **AC-1**: con `variants`, un `admin` crea un modelo, un atributo de variante con opciones y un producto de ese modelo con sus valores; la lista lo agrupa y lo filtra por modelo.
- **AC-2**: el duplicado de variante se rechaza, también con dos altas simultáneas.
- **AC-3**: sin `variants`, nada cambia, y las páginas y acciones de la capacidad dan 404 o `NOT_FOUND`.
- **AC-4**: `org:capability` activa la capacidad y copia el perfil en una transacción auditada, y no hace nada si ya estaba activa.
- **AC-5**: `demo:catalog` carga el catálogo de ejemplo por los servicios, y se niega si la organización ya tiene productos.
- **AC-6**: un `viewer` ve modelos y atributos sin editarlos.
- **AC-7**: guardas, unitarias, integración y end-to-end pasan en CI, con axe sin violaciones.
- **AC-8**: la revisión independiente se hizo antes del despliegue, con cada hallazgo verificado.
- **AC-9**: desplegada, con la demo creada, y recorrida por el usuario.

## Implementación: precisiones y desvíos (2026-10-18)

Registrados al implementar, antes del despliegue. Los que cambian el alcance aprobado los decidió el usuario ese día.

- **P-1. Las rutas son `/modelos` y `/modelos/atributos`**, y «Modelos» es un ítem propio del menú, no una sección dentro de Productos (D-3, D-4, alcance incluido). El menú resalta la sección por el primer segmento de la ruta, y anidarlas bajo `/productos` habría marcado «Productos» en las dos. Los formularios del producto siguen en `/productos`.
- **P-2. Los obligatorios se exigen solo en un producto con modelo** (D-5). Un accesorio sin modelo, como una funda, no tiene color ni capacidad (H-5).
- **P-3. La base exige una sola columna con valor, no que sea la de su tipo** (D-5 decía «la que corresponde al tipo»). Un `CHECK` no puede leer la definición, que está en otra tabla, así que eso lo valida el servicio. El ADR 0024, punto 4, pide solo «exactamente una».
- **P-4. `getAdminContextForScript`** (en `organizations`) arma el contexto de un `admin` activo de la organización para los scripts del operador, que no tienen sesión. Una guarda impide nombrarla en `src/` fuera de `organizations`.
- **P-5. Archivos fuera de la lista del alcance**:
  - `src/modules/inventory/service.ts`, porque la lista de productos la arma `inventory`: el filtro y la agrupación por modelo pasan por ahí;
  - `src/modules/audit/schema.ts`, para los tres `entity_type` nuevos;
  - los `truncate` de 16 specs end-to-end, que suman `attribute_values`;
  - `src/app/(autenticado)/not-found.tsx`, la 404 dentro del marco (R1, H-14).
  
  No se tocó ningún contrato del agente ni ninguna dependencia.
- **P-6. La tienda de ejemplo del end-to-end la siembra su propia spec** y la borra al terminar, no la configuración global. Las demás specs borran toda organización que no sea la del seed básico, y las claves foráneas de la capacidad lo impedirían.
- **P-7. La clave de un atributo es única también entre los inactivos.** Desactivar un atributo y crear otro con el mismo nombre da `CONFLICT`; hay que darle otro nombre. Es la salida del ADR 0024, punto 4, con esa limitación.

## Revisión independiente (R1, 2026-10-18)

La hizo un agente de solo lectura que no participó del trabajo, contra este brief, los ADR 0024 y 0013, y el código, antes del despliegue (D-12, AC-8). Encontró **14 hallazgos: 1 alto, 4 medios, 8 bajos y 1 no verificable**, sin ninguno crítico de seguridad ni de aislamiento. Cada uno se verificó contra el código antes de aceptarlo, y los 14 se confirmaron. Las correcciones son autoevaluación.

| Hallazgo | Qué decía | Qué se hizo |
|---|---|---|
| H-1 (alto) | La lista no se puede agrupar por modelo (D-4, AC-1) | **Implementado**, por decisión del usuario: «Agrupar por modelo» en la lista (`?agrupar=modelo`), en el orden de los modelos, con el nombre como encabezado y los productos sin modelo al final; sin la capacidad no hace nada |
| H-2 (medio) | No se pueden ordenar modelos, atributos ni opciones (D-4, D-5) | **Implementado**, por decisión del usuario: subir y bajar un lugar, con la lista bloqueada, renumerada y auditada |
| H-3 (medio) | Rutas y archivos fuera del alcance | Declarados en P-1 y P-5 |
| H-4 (medio) | `demo:catalog` no es atómico y no tenía vuelta atrás | El script **retoma** una carga cortada si todo lo existente es del catálogo de ejemplo, y se niega con cualquier otro dato. Probado con un corte simulado |
| H-5 (medio) | El historial del producto no mostraba el modelo ni los atributos | El resumen de la auditoría los muestra, con el nombre vigente del atributo |
| H-6 (bajo) | Desactivar un atributo de variante bloqueaba editar productos que pasaban a coincidir | Una edición que no cambia la identidad de la variante no vuelve a comprobar el duplicado; el alta, la reactivación y los cambios de identidad sí. La clave única entre inactivos queda como P-7 |
| H-7 (bajo) | Guardar sin cambios borraba y reinsertaba los valores | No se reescriben si no cambiaron |
| H-8 (bajo) | El `CHECK` no exige la columna del tipo | Declarado en P-3 |
| H-9 (bajo) | `org:capability --profile` sobre una capacidad activa copiaba lo que faltara | El perfil se copia solo al activar; si ya estaba activa, lo dice y no copia nada |
| H-10 (bajo) | Un viewer sin la capacidad recibía `FORBIDDEN` | La capacidad se comprueba antes que el rol: `NOT_FOUND` para todos |
| H-11 (bajo) | Sin la capacidad, `?modelo=` filtraba | Se ignora, en el servicio y en la página |
| H-12 (bajo) | `updateOption` leía la opción antes de bloquear su definición | La vuelve a leer después del bloqueo |
| H-13 (bajo) | `applyAttributeTemplate` es pública y no autoriza | La guarda `capability-reads` impide nombrarla en `src/` fuera de `catalog` |
| H-14 (no verificable) | La 404 podía verse fuera del marco | Confirmado por cómo resuelve Next.js: se agregó la 404 de `(autenticado)`, y el end-to-end comprueba el menú en ella |

## Pruebas y evidencia requerida

Las de D-11, en CI sobre el SHA desplegado; el recorrido del usuario en la organización demo; y una consulta de solo conteos que muestre que «Demostración Vixora» no tiene capacidades ni modelos.

## Condiciones de detención

Detenerse y avisar si:

- la copia del perfil o el catálogo de la demo necesitan escribir sin pasar por un servicio;
- el duplicado no se puede garantizar con el bloqueo del modelo;
- una pantalla del núcleo cambia para una organización sin la capacidad;
- hace falta tocar un contrato del agente, una dependencia o un archivo fuera del alcance.

Pedir autorización explícita, en su turno, **antes de**:

- cualquier commit, push o despliegue;
- ejecutar la migración en producción;
- crear la organización demo, activar la capacidad o cargar el catálogo en producción.
