---
schema: task-brief.v1
task_id: "23.3"
task_type: implementation
generated_at: 2026-10-18
---

# Brief: 23.3 — Búsqueda global

**Estado: aprobado el 2026-10-18 por el usuario, con las recomendaciones de D-1 a D-7** (la (a) en D-1, D-2, D-3, D-4, D-6 y D-7, y la propuesta de D-5), y con la ampliación a ventas, compras y proveedores. La tarea 23.3 (`3fc702be6f4e815b9479da2de76f5896`) pasa a «En proceso». La aprobación no autoriza ningún commit, ninguna dependencia nueva ni el despliegue: cada uno se autoriza aparte, en el turno en que ocurre.

- **Nivel de evidencia objetivo**:
  - `deterministic`: tests unitarios de la composición de resultados y del texto de cada opción;
  - `producer-consumer`: Playwright sobre `next start` contra PostgreSQL real, con axe en claro y en oscuro, y la comprobación de H-6 para un `viewer`;
  - `isolated-runtime`: la versión desplegada en producción, recorrida por el usuario.
- **Nivel de validación alcanzable**: **validado en integración** (pantalla ↔ Server Action ↔ módulos ↔ base), desplegado y recorrido. No certifica «preparado para producción», que sigue siendo el gate de la Fase 13.
- **Orden**: tercera y última subfase de la Fase 23 ([Roadmap](../planning/Roadmap.md), §Fases 23 a 28), después de la 23.2, cerrada el 2026-10-18. La 13.5.2-b conserva su prioridad.
- **No abre ni cierra gate.** Suma una lectura de solo lectura que junta seis lecturas de cinco módulos (`crm`, `orders`, `catalog`, `sales` y `purchasing`), sin datos, migraciones ni contratos nuevos.
- **Ampliado el 2026-10-18, antes de aprobarse**: el usuario pidió sumar ventas, compras y proveedores «para que el usuario pueda hacer una búsqueda general del sistema». El borrador anterior buscaba solo clientes, pedidos y productos, y los dejaba en el alcance excluido.

## Objetivo

Que desde cualquier pantalla se pueda buscar un cliente, un pedido, un producto, una venta, una orden de compra o un proveedor con un solo campo en la barra superior, y llegar a su ficha en dos pasos: escribir y elegir. **Con las reglas y los permisos que cada módulo ya aplica**, sin consultas, índices ni contratos nuevos. El mockup dice «Buscar clientes, pedidos o productos…»; con seis tipos, el texto pasa a «Buscar en el sistema…» (D-5).

## Situación

La 23.1 dejó la barra superior con las migas, el selector de tema y el menú del usuario, y dejó la búsqueda para esta subfase porque «cruza módulos y permisos» (brief-23.1, D-1). Los mockups la ponen en el centro de la barra en escritorio (`00-sistema-visual/desktop/02-shell-desktop-v1.png`) y como un botón con lupa en el teléfono (`mobile/03-shell-mobile-v1.png`).

## Hallazgos antes de diseñar

- **H-1. Cada módulo ya tiene una lectura de sugerencias, de solo lectura y para los dos roles.**
  - **Clientes**: `suggestClients` (`crm/service.ts:403-442`) busca por **prefijo del nombre**, sin tildes ni mayúsculas, solo activos, en orden de nombre, hasta 8. Desde 2 caracteres. **Devuelve el id y el nombre, nunca el teléfono, sea cual sea el rol**, y no sugiere nada si el texto parece un teléfono.
  - **Productos**: `suggestProducts` (`catalog/service.ts:303-331`) busca por palabras sobre nombre, marca y categoría, o por SKU o código de barras exactos, solo activos, hasta 8, con el SKU y el código exactos primero. Devuelve el id, el nombre y el SKU.
  - **Pedidos**: no hay sugerencias. La lista busca por **número exacto** con `parseOrderNumberSearch` (`orders/service.ts:79-85`), que acepta `P-000123`, `p000123`, `000123` o `123`, y `listOrders` devuelve el número, el cliente, el total y el estado. **No busca por nombre del cliente ni por producto.**
  - **Ventas**: no hay sugerencias. `listSales` (`sales/service.ts:746`) busca por **número exacto**: `V-000123` o `123` con `parseSaleNumberSearch`, o el de su anulación, que lleva siempre el prefijo (`A-000045`, `a45`), con `parseSaleVoidNumberSearch` (`sales/service.ts:80-90`). Autoriza a los dos roles. Devuelve el número, el cliente (o null, «Consumidor final»), el total y, si está anulada, el número de la anulación. **No busca por cliente ni por producto.**
  - **Órdenes de compra**: no hay sugerencias. `listPurchaseOrders` (`purchasing/purchase-orders.ts:477`) busca por **número exacto** con `parsePurchaseOrderNumberSearch` (`OC-000123`, `oc000123`, `123`). **Solo `admin`.** Devuelve el número, el proveedor, el total y el estado.
  - **Proveedores**: no hay sugerencias. `listSuppliers` (`purchasing/service.ts:169`) busca **parte del nombre**, sin tildes ni mayúsculas, o el **CUIT exacto** de 11 dígitos con o sin guiones, con filtro de estado y páginas de 25. **Solo `admin`.**
- **H-1b. Un número sin prefijo es de tres tipos a la vez.** `123` es `P-000123`, `V-000123` y `OC-000123`; con el prefijo (`P-`, `V-`, `A-`, `OC-`) es de uno solo, porque cada expresión acepta solo el suyo.
- **H-1c. Un `viewer` no ve compras ni proveedores**: las dos lecturas devuelven `FORBIDDEN`, y la navegación ya los oculta para ese rol.
- **H-2. El patrón de lectura para escribir y elegir es una Server Action**, no un Route Handler: `suggestClientsAction` y `suggestProductsAction` llaman a `requireSession`, recortan el texto a 100 caracteres, registran un error sin el texto buscado y devuelven `RemoteSuggestion[]` con un `href` a la ficha. No existe ninguna ruta JSON interna de la aplicación.
- **H-3. El combobox compartido (`suggest-input.tsx`) sirve casi entero**: ARIA 1.2, el foco siempre en el campo, flechas, Enter y Escape, pedido al servidor desde 2 caracteres con 250 ms de espera, y descarte de respuestas viejas. **No tiene grupos**: una lista de tres tipos se leería como una sola, sin saber qué es cada opción.
- **H-4. La barra superior tiene lugar.** En `(autenticado)/layout.tsx:78-113` el `<header>` tiene las migas (que crecen) y un grupo a la derecha con el tema y el usuario. Debajo de 1024 px las migas pasan a una segunda línea (`order-last w-full`).
- **H-5. Las capas**: la lista de sugerencias usa `z-20`, la barra inferior `z-30` y el menú del usuario `z-40`.
- **H-6. Un `viewer` nunca recibe el teléfono entero de un cliente** (FR-CLI-06, enforced en `crm`, `phoneForRole`), ni su email ni su dirección (FR-CLI-13). El caso 9 de `clients.spec.ts` revisa **todo lo que llega al navegador** de un `viewer`, no solo lo visible. Una búsqueda nueva es un cuerpo nuevo que llega al navegador.
- **H-7. Buscar por el teléfono entero ya funciona en la lista de clientes**, también para un `viewer`: es un riesgo aceptado (un `viewer` puede confirmar que un número es de un cliente, `SecurityModel.md:112`).
- **H-8. Las guardas que tocan una lectura nueva**:
  - `exposed-surface.test.ts`: toda Server Action nueva se declara con `requirement: "sesion"`, y el recuento de puntos de entrada de `SecurityModel.md` se actualiza (163 al 2026-10-17; las 23.1 y 23.2 no sumaron ninguno, se recuenta);
  - `service-read-entry-points.test.ts`: fuera de los módulos no se nombra ninguna lectura `…ForService`;
  - `module-boundary`: la aplicación importa solo `@/modules/<módulo>`;
  - `log-surface.test.ts`: el `route` del log es un texto fijo.
- **H-9. Los productos no tienen límite en SQL en la lista** (`listProductStock` lee todo y pagina en memoria, límite declarado hasta 2.000 productos), pero `suggestProducts` sí: 8, con su índice GIN. Las sugerencias no heredan ese límite.
- **H-10. La búsqueda de proveedores por nombre no tiene índice**: `like '%…%'` sobre el nombre sin tildes, con solo el índice único de `(organization_id, lower(name))` (`drizzle/0047_suppliers.sql:21`). Recorre los proveedores de la organización, que son pocos; `listSuppliers` además cuenta antes de leer.

## Decisiones pendientes

### D-1 — Cómo se usa

- (a) **un combobox en la barra y, con Enter, una página de resultados**:
  - escribir muestra hasta tres resultados por tipo, agrupados («Clientes», «Pedidos», «Productos», «Ventas», «Compras», «Proveedores»), solo los grupos con resultados y en ese orden; elegir uno abre su ficha;
  - Enter sin una opción elegida, o el botón de la lupa, abre `/buscar?q=…` con hasta 8 por tipo y, en cada grupo, «Ver todos en …», que lleva a la lista del módulo con la búsqueda puesta;
  - sin JavaScript, el campo es un formulario GET a `/buscar`: funciona igual, sin las sugerencias;
- (b) solo la página de resultados, sin sugerencias mientras se escribe;
- (c) solo el combobox, sin página.

*Recomendación: (a).* Es lo que dibuja el mockup, reutiliza el combobox y las sugerencias de H-1, y la página sostiene el uso sin JavaScript y en el teléfono.

### D-2 — Qué busca en cada tipo

| Tipo | Regla | Lectura | Quién | Muestra |
|---|---|---|---|---|
| Clientes | prefijo del nombre, solo activos | `suggestClients` | los dos roles | el nombre |
| Pedidos | número exacto (`P-000123`, `123`) | `listOrders({ number })` | los dos roles | el número, el cliente y el estado |
| Productos | palabras de nombre, marca y categoría, o SKU o código exactos, solo activos | `suggestProducts` | los dos roles | el nombre y el SKU |
| Ventas | número exacto (`V-000123`, `123`) o de su anulación (`A-000045`) | `listSales({ number })` | los dos roles | el número, el cliente o «Consumidor final», y «Anulada» si lo está |
| Compras | número exacto de la orden (`OC-000123`, `123`) | `listPurchaseOrders({ number })` | solo `admin` | el número, el proveedor y el estado |
| Proveedores | parte del nombre o CUIT exacto, solo activos | `listSuppliers({ text, status: "active" })` | solo `admin` | el nombre |

- (a) **exactamente las reglas de hoy**, sin tocar `src/modules/`. Para un `viewer`, los grupos de compras y proveedores no se piden: la aplicación no llama a esas lecturas, en lugar de llamarlas y descartar el `FORBIDDEN`;
- (b) sumar la búsqueda de pedidos y ventas por el nombre del cliente, y de compras por el del proveedor, que necesita lecturas nuevas en `orders`, `sales` y `purchasing`.

*Recomendación: (a).* La búsqueda global da los mismos resultados que cada lista, y el usuario no tiene que aprender reglas nuevas. Los pedidos y las ventas de un cliente se ven desde su ficha, y las compras de un proveedor, desde la suya. (b) se puede sumar en la Fase 24 (24.4), con su brief. **Una diferencia que el usuario va a notar**: los proveedores se encuentran por cualquier parte del nombre y los clientes, solo por el comienzo, porque así buscan hoy sus listas.

### D-3 — Un teléfono escrito en la búsqueda

- (a) **como hoy en cada lugar**: las sugerencias no muestran nada para un texto que parece teléfono (H-1); la página `/buscar` muestra el cliente con ese teléfono exacto, **solo con su nombre**, como la lista de clientes (H-7, riesgo ya aceptado);
- (b) no buscar teléfonos en ningún lado de la búsqueda global: «Ver todos en Clientes» lleva a la lista, que sí los busca.

*Recomendación: (a).* No abre nada que la lista no abra hoy, y la página no muestra ningún dato de contacto. El end-to-end de H-6 lo comprueba para un `viewer`.

### D-4 — Dónde vive la composición

- (a) **en la aplicación**: una Server Action `searchEverythingAction` y la página `/buscar` en `src/app/(autenticado)/buscar/`, que llaman en paralelo a las lecturas públicas de H-1 que el rol puede usar: seis para un `admin`, cuatro para un `viewer`. Cada módulo autoriza y filtra por organización como siempre; la aplicación solo junta;
- (b) un módulo nuevo `search` en `src/modules/`.

*Recomendación: (a).* No hay regla de dominio nueva, solo una vista que junta tres lecturas, y un módulo nuevo sería el «módulo especulativo» que CLAUDE.md prohíbe. Si un módulo falla, su grupo queda vacío y los otros se muestran (con el error registrado sin el texto buscado, como H-2).

### D-5 — Dónde está el campo y cómo se ve

- **Escritorio (desde 1024 px)**: un campo con lupa en el centro de la barra, entre las migas y el grupo de la derecha, con un ancho máximo de unos 28 rem, como el mockup, y el texto «Buscar en el sistema…». La lista aparece debajo, con los grupos titulados y una altura máxima con desplazamiento propio: con seis grupos de tres, son hasta 18 opciones.
- **Teléfono y tableta (debajo de 1024 px)**: un botón con lupa en el grupo de la derecha, que lleva a `/buscar` con el campo enfocado. Sin un panel desplegable encima de la pantalla: la página es más simple, funciona sin JavaScript y no compite con la barra inferior (H-5).
- **Grupos accesibles**: el combobox suma grupos opcionales, con `role="group"` y su título como nombre (`aria-labelledby`), dentro del `listbox`. Además, cada opción dice su tipo en el texto que lee un lector de pantalla («P-000123, pedido, Ana Pérez, Confirmado»), porque no todos los lectores anuncian el grupo.
- **Sin atajo de teclado** (como `/` o Ctrl+K): choca con escribir en los campos y con el navegador. Queda para la Fase 24 si se pide.

*Recomendación: la de arriba.*

### D-6 — Despliegue a producción

- (a) como la 23.2: con la CI del SHA exacto en verde y la autorización del usuario, según el [README de producción](../../deploy/production/README.md), §Desplegar. Sin migraciones. Para volver atrás, `acdd402`;
- (b) esperar a la Fase 24.

*Recomendación: (a).*

### D-7 — Revisión

- (a) autoevaluación declarada, con el end-to-end de H-6 para un `viewer` y axe sobre la lista abierta y la página;
- (b) además, una revisión independiente de solo lectura, enfocada en lo que recibe el navegador de un `viewer`.

*Recomendación: (a).* Las Fases 23 a 25 se cierran con autoevaluación salvo que el brief diga otra cosa, y la búsqueda solo junta lecturas que ya existen, cada una con su permiso. Si el usuario prefiere una segunda mirada por el cruce de módulos, (b) cuesta poco.

## Alcance incluido

1. Registrar la resolución de D-1 a D-7.
2. **`searchEverythingAction`** en `src/app/(autenticado)/buscar/actions.ts`, según D-2 a D-4: hasta tres por tipo, con `requireSession`, el texto recortado a 100 caracteres y el log sin el texto. Declarada en `exposed-surface.test.ts`.
3. **La página `/buscar`**, con su formulario GET, hasta 8 por tipo, los «Ver todos en …» y los vacíos con `EmptyState` de la 23.2 («No encontramos nada para «…»»). Declarada en `exposed-surface.test.ts`.
4. **El campo en la barra** según D-5: el combobox con grupos, el botón con lupa debajo de 1024 px y el ícono de lupa en `icons.tsx` si falta.
5. **Los grupos del combobox** en `suggest-input.tsx` (o un componente hermano si los grupos lo complican), sin cambiar cómo se comportan los combobox que ya existen.
6. **Tests unitarios**: el texto accesible de cada opción y la composición cuando un módulo falla.
7. **End-to-end** (`search.spec.ts`):
   - un `admin` encuentra un cliente, un pedido por `P-000123` y por `123`, un producto por SKU, una venta por `V-…` y por el `A-…` de su anulación, una orden de compra por `OC-…` y un proveedor por parte del nombre y por CUIT, con el teclado, y llega a cada ficha;
   - `123` muestra el pedido, la venta y la orden de compra con ese número, cada uno en su grupo;
   - Enter abre `/buscar` con los grupos y «Ver todos en …» lleva a la lista con la búsqueda;
   - sin JavaScript, el formulario lleva a `/buscar` con resultados;
   - un `viewer` busca el teléfono entero de un cliente: ningún cuerpo que llega al navegador contiene el número (como el caso 9 de `clients.spec.ts`);
   - un `viewer` busca el número de una orden de compra y el nombre de un proveedor que existen: no aparecen los grupos «Compras» ni «Proveedores», ni sus datos en ningún cuerpo que llega al navegador;
   - a 375 px, el botón con lupa lleva a `/buscar` sin desplazamiento horizontal;
   - axe sin violaciones con la lista abierta y en `/buscar`, en claro y en oscuro.
8. **Documentación**: [Screens.md](../product/Screens.md), la barra superior y la pantalla de búsqueda; [SecurityModel.md](../architecture/SecurityModel.md), el recuento de puntos de entrada.
9. **Despliegue** según D-6.

## Alcance excluido

- Cambios en `src/modules/`, en las consultas, en los índices, en las migraciones, en los contratos o en los permisos.
- Buscar en conversaciones, cobros, devoluciones, caja, recepciones de mercadería, pagos a proveedores, información o usuarios.
- Buscar pedidos o ventas por cliente o producto, y compras por proveedor (D-2, b), y un atajo de teclado (D-5).
- Un historial de búsquedas, búsquedas recientes o resaltar el texto encontrado.
- Librerías nuevas y cambios en `package.json`.

## Criterios de aceptación

- **AC-1**: desde 2 caracteres, el campo de la barra muestra hasta tres resultados por tipo, agrupados y con su tipo en el texto accesible; elegir uno abre su ficha.
- **AC-2**: un pedido se encuentra por `P-000123`, `p000123`, `000123` o `123`; una venta por `V-000123` o `123` y por el `A-…` de su anulación; una orden de compra por `OC-000123` o `123`; un producto por SKU o código de barras exactos, y un proveedor por parte del nombre o por CUIT.
- **AC-3**: Enter, la lupa o el formulario sin JavaScript abren `/buscar` con hasta 8 por tipo y «Ver todos en …» hacia cada lista con la búsqueda puesta.
- **AC-4**: cada tipo aplica la regla y el permiso de D-2, los mismos que la lectura de su módulo; ninguna respuesta de un `viewer` contiene un teléfono entero, un email ni una dirección, ni una orden de compra ni un proveedor.
- **AC-5**: si una de las lecturas falla, los otros grupos se muestran y el error queda registrado sin el texto buscado.
- **AC-6**: a 375 px, la búsqueda se usa desde el botón con lupa, sin desplazamiento horizontal.
- **AC-7**: axe sin violaciones con la lista abierta y en `/buscar`, en claro y en oscuro, a 1280 y a 375 px.
- **AC-8**: las guardas pasan con la Server Action y la página declaradas, y `SecurityModel.md` tiene el recuento actualizado.
- **AC-9**: la CI pasa completa en el SHA que se despliega.
- **AC-10**: desplegado en producción y recorrido por el usuario.

## Condiciones de detención

- Si un resultado exige tocar `src/modules/`, una consulta, un índice o un permiso: se detiene y se consulta.
- Si los grupos del combobox cambian el comportamiento de los combobox que ya existen (sus end-to-end fallan): se separa en un componente hermano antes de seguir.
- Si axe reporta una violación que no se resuelve sin apartarse del mockup: gana la accesibilidad, y la diferencia se informa.
- Si la 13.5.2-b arranca: se pausa en el último punto con la CI en verde.

## Riesgos

- **R-1**: hasta seis lecturas por cada pausa al escribir, y algunas cuentan antes de leer (`listOrders`, `listSales`, `listPurchaseOrders` y `listSuppliers` paginan), así que son hasta diez consultas. Las de número no consultan si el texto no es un número válido, y la de proveedores recorre pocos registros sin índice (H-10). Se mitiga con la espera de 250 ms y los 2 caracteres mínimos que ya usa el combobox; si se nota lento, se mide antes de sumar índices, que serían otra subfase.
- **R-2**: la búsqueda de clientes es por prefijo del nombre: «Pérez» no encuentra a «Ana Pérez». Es la regla de hoy (D-2, a) y el usuario la conoce de la lista; un cambio de regla es otra subfase, con su índice.
- **R-3**: un lector de pantalla que no anuncia los grupos del `listbox`. Se mitiga con el tipo dentro del texto de cada opción (D-5).
