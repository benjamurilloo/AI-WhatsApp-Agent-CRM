---
schema: task-brief.v1
task_id: 4.4
task_type: implementation
generated_at: 2026-09-15
---

# Brief: 4.4 — UI de productos e inventario

## Objetivo

1. Implementar las pantallas 3 (lista de productos), 4 (detalle y edición) y 5 (ajuste de inventario e historial) sobre los servicios ya validados de `catalog` e `inventory`.
2. Implementar la lectura del historial de auditoría del producto para `admin` (FR-AUD-02), pendiente desde la 4.2 (D-6).
3. Cerrar las decisiones de presentación que las subfases 4.2 y 4.3.x dejaron para acá: cantidades, fechas, períodos, mensajes por regla y doble envío.
4. Dejar las tres pantallas **validadas en integración** (`producer-consumer`), con axe en claro y oscuro, teclado y móvil, y habilitar el gate de salida de la Fase 4.

## Ubicación en la Fase 4

- **Orden previsto**: 4.0 a 4.3.3 (cerradas) → **4.4** → cierre de la Fase 4.
- **Notion**: "M. Pantallas 3, 4 y 5 de Screens.md, con protección contra doble envío, e historial de auditoría del producto para admin (FR-AUD-02; brief-4.2, D-6)." Estado: "Bandeja de Entrada".
- **Necesario ahora**: las tres pantallas, la lectura de auditoría y la presentación de cantidades y fechas.
- **Gate de salida de la Fase 4** (Roadmap): suite de inventario en verde con los invariantes de no negatividad e inmutabilidad, ya cubiertos a nivel de servicio y base; falta el recorrido de UI.
- **Gates de entrada**: 4.3.3 cerrada con CI en verde (`daba7dc`); contenedor de PostgreSQL en marcha. No se esperan migraciones.

## Hallazgos de la verificación previa (2026-09-15)

1. **La auditoría de un producto vive bajo dos `entity_type`.** Las ediciones usan `product`; los ajustes de stock usan `inventory` con el id del producto como `entity_id` (4.3.1, D-4). El wireframe 4 muestra las dos en la misma tabla ("Ajuste stock: 10 → 6" junto a "Edición"), así que la consulta tiene que cubrir ambas en una sola lista paginada. El índice `(organization_id, entity_type, entity_id, created_at desc)` la sirve. Se resuelve en D-1.
2. **`audit` hoy solo escribe**: su interfaz expone `recordAudit` e `InvalidAuditEntryError`, y su repositorio solo tiene `insertAuditLog`. La lectura es código nuevo en ese módulo (4.2, D-6).
3. **`audit_logs.created_at` sigue con `DEFAULT now()`.** La 4.3.3 solo cambió `inventory_movements`. Acá no hay una cadena de saldos que contradecir, y dos registros del mismo producto en transacciones simultáneas son poco probables; el orden desempata por `id`. No se cambia en esta subfase; queda anotado como límite.
4. **Las cantidades se guardan y devuelven como texto en la escala de la base** ("2.500"). `src/shared/quantity/` tiene `parseQuantityInput`, `quantityFromDatabase` y `quantityToDatabase`, pero **no** un formateador para mostrar. Se resuelve en D-2.
5. **No hay formateo de fechas en el repositorio.** El historial devuelve `createdAt` como `Date` y la zona IANA de la organización (4.3.3). Se resuelve en D-3.
6. **`logEvent` no acepta organización ni duración**: `LogEvent` tiene `level`, `requestId`, `route`, `code`, `userId` y `error`. El pendiente "organization_id y duración en el log" está asignado a esta subfase, así que `src/shared/log/` suma los dos campos con su test.
7. **El `VALIDATION_ERROR` por id inválido no es uniforme**: `updateProduct` y `adjustStock` devuelven `fields: []`; `getProduct`, `getProductStock`, `listStockMovements`, `deactivateProduct` y `reactivateProduct`, solo el código. Se resuelve en D-6, y eso cambia aserciones de tests existentes.
8. **El seed básico no crea productos**: `seeds/basic.ts` siembra organización y usuarios, y el end-to-end corre contra esa base. Los productos de cada caso los crea el propio spec. Se resuelve en D-5.
9. **Precedentes de UI que se siguen sin decisión nueva** (3.5 y 3.7): filtros y página en la URL con un módulo `filters.ts` y su test; mensajes en un `messages.ts` con su test; Server Actions con `useActionState`, botón deshabilitado y texto en gerundio mientras responde; confirmaciones como una página aparte; tabla en escritorio y tarjetas en móvil, con la versión oculta fuera del árbol de accesibilidad; estilos solo con tokens de `globals.css`.
10. **El ajuste ya trae su propia defensa contra el reenvío**: `expectedQuantityOnHand` hace que un segundo envío del mismo formulario reciba `CONFLICT` en lugar de duplicar el movimiento. Se resuelve en D-4.

## Alcance incluido

1. Registrar la resolución de D-1 a D-6.
2. **`audit`**: lectura paginada del historial de una entidad (D-1), solo `admin`, con nombres de autor por la interfaz de `auth` y sin `JOIN` entre módulos.
3. **Presentación compartida**:
   - formateo de cantidades (D-2) con sus tests unitarios;
   - formateo de fechas en la zona de la organización (D-3) con sus tests unitarios;
   - `organization_id` y duración en `logEvent`, con su test (hallazgo 6).
4. **Pantalla 3 — lista de productos** (`/productos`): búsqueda por nombre o SKU, filtros de estado de stock y actividad, paginación, todo en la URL; tabla en escritorio y tarjetas en móvil; estado de stock con texto e ícono; vacío y sin resultados distinguidos; alta visible solo para `admin`.
5. **Alta de producto** (`/productos/nuevo`): formulario con SKU, nombre, descripción, unidad y punto de reposición; `CONFLICT` por SKU en el campo; solo `admin`.
6. **Pantalla 4 — detalle y edición** (`/productos/[productId]` y su modo edición): datos, stock, estado, punto de reposición, últimos movimientos con enlace a la pantalla 5, y el historial de auditoría solo para `admin`, paginado. Desactivar y reactivar como página de confirmación, siguiendo el precedente de la 3.7.
7. **Pantalla 5 — ajuste e historial** (`/productos/[productId]/movimientos`): formulario de ajuste para `admin` con tipo, cantidad, motivo y saldo resultante anunciado con `aria-live`; historial para `admin` y `viewer` con filtros de tipo y período y paginación en la URL; mensajes propios de cada rechazo (`negative_stock`, `stock_limit`, `inactive_product`, `CONFLICT` con el saldo nuevo).
8. **Navegación**: entrada "Productos" en el marco común.
9. **Tests**:
   - unitarios de `filters.ts` y `messages.ts` de cada ruta, de los formateadores y del log;
   - integración de la lectura de auditoría en `tests/integration/audit.test.ts` o un archivo propio: orden, paginación, ambos `entity_type`, autor, `admin` únicamente, aislamiento por organización;
   - end-to-end `tests/e2e/products.spec.ts` con axe en cada estado, en claro y oscuro, teclado y móvil a 375 px (D-5).

## Alcance excluido

- Migraciones y cambios de esquema, incluido `audit_logs.created_at` (hallazgo 3).
- Cambios en la lógica de `adjustStock`, `listStockMovements` y las escrituras de `catalog`; acá solo se consumen.
- Exportar el historial, imprimir, y cualquier acción sobre un movimiento: no existen.
- Pantallas 6 a 9 y la 2 (dashboard): Fases 5 a 7.
- Seeds de productos para desarrollo.
- `unaccent` para buscar sin acentos: Fase 8.

## Archivos o componentes autorizados

Lista cerrada:

- `src/modules/audit/`: `index.ts`, `service.ts`, `repository.ts` y su test unitario.
- `src/shared/quantity/index.ts` y su test; el módulo de fechas que resuelva D-3 y su test; `src/shared/log/index.ts` y su test.
- `src/app/(autenticado)/productos/` completo, incluidos `nuevo/`, `[productId]/` y `[productId]/movimientos/`, con sus `filters.ts`, `messages.ts`, `actions.ts`, componentes de formulario y tests unitarios.
- `src/app/_components/`: solo para agregar estilos o componentes compartidos que las tres pantallas necesiten, y la entrada de navegación en `app-nav.tsx`.
- `src/modules/catalog/service.ts` e `src/modules/inventory/service.ts`, **solo** para el cambio de D-6, con los tests que ese cambio toque.
- `tests/e2e/products.spec.ts` (nuevo) y el archivo de integración de la lectura de auditoría.
- `docs/product/Screens.md` y `docs/product/wireframes/03`, `04` y `05` (estado "implementado" y desvíos), `docs/architecture/Overview.md`, `RepositoryStructure.md`, `TraceabilityMatrix.md` y `docs/development/TestingStrategy.md`.
- Este brief y su fila en `docs/decisions/README.md`.
- `CHANGELOG.md`, `HANDOFF.md` y líneas de estado de `README.md` y `docs/README.md`, al cerrar.

## Fuentes de verdad

1. [Screens.md](../product/Screens.md) §3 a §5 y los wireframes [03](../product/wireframes/03-lista-de-productos.md), [04](../product/wireframes/04-detalle-de-producto.md) y [05](../product/wireframes/05-ajuste-de-inventario.md).
2. FR-PROD-01 a 09 y FR-AUD-02 en [FunctionalRequirements.md](../product/FunctionalRequirements.md).
3. [brief-4.2](brief-4.2-servicio-de-catalogo.md) (D-6), [brief-4.3.1](brief-4.3.1-transaccion-de-ajuste-de-stock.md) y [brief-4.3.3](brief-4.3.3-historial-de-movimientos.md).
4. [brief-3.7](brief-3.7-gestion-de-usuarios-y-roles.md) y [brief-3.5](brief-3.5-pantalla-de-inicio-de-sesion.md): convenciones de pantalla, Server Actions, filtros en la URL y end-to-end con axe.
5. [Roadmap.md](../planning/Roadmap.md), Fase 4: gate de salida y demostración "ajuste de stock con historial visible".

## Dependencias

- 4.3.3 cerrada, con `listStockMovements` y `getOrganizationTimezone` disponibles.
- Contenedor de PostgreSQL en marcha; `npm run build` antes del end-to-end.

## Resolución

El usuario aprobó el brief el 2026-09-15 con la recomendación de cada decisión: D-1 (a), D-2 (a), D-3 (a), D-4 (a) —incluido el período "Todo" por defecto—, D-5 (a) y D-6 (a). También autorizó pasar la tarea a "En proceso" en Notion. Sin autorización de migraciones: esta subfase no toca el esquema.

## Decisiones

Cada decisión conserva las opciones evaluadas y la recomendación.

### D-1 — Forma de la lectura de auditoría (FR-AUD-02)

- **Opciones**:
  - (a) **Una consulta que acepta varios tipos de entidad**: `listEntityAudit(context, { entityTypes, entityId, page })` en `audit`, solo `admin`, paginada en SQL de a 25, ordenada por `created_at desc, id desc`, con el autor compuesto desde `auth`. La pantalla 4 pide `["product", "inventory"]` con el id del producto.
  - (b) **Dos consultas, una por tipo, mezcladas en memoria**.
  - (c) **Solo `product`**: la tabla no mostraría los ajustes de stock.
- **Recomendación**: (a).
  - Es la única que pagina bien: mezclar dos listas en memoria obliga a leerlas enteras (el mismo problema que resolvió la 4.3.3, D-2).
  - (c) contradice el wireframe 4, que muestra el ajuste junto a la edición.
- **Consecuencia**: la firma queda genérica y la pantalla 7 de clientes (Fase 5) la reutiliza pidiendo `["client"]`. El `diff` se devuelve tal como está guardado; traducirlo a texto legible es trabajo de la pantalla.

### D-2 — Presentación de cantidades

- **Opciones**:
  - (a) **`formatQuantity` en `src/shared/quantity/`**: recibe el texto de la base ("2.500") y devuelve "2,5", sin ceros finales, con separador decimal de coma; una sola implementación para lista, detalle, historial y el saldo resultante del formulario.
  - (b) **`Intl.NumberFormat` en cada pantalla**.
  - (c) **Mostrar el valor crudo** ("2.500").
- **Recomendación**: (a).
  - La conversión exacta ya vive ahí y no se puede pasar por `number` sin arriesgar redondeos (4.1, D-4).
  - (c) se lee como "dos mil quinientos" en español y es justamente el error que la pantalla 5 no puede cometer.
- **Consecuencia**: los tests unitarios cubren enteros, decimales, ceros finales y el máximo. La entrada del formulario sigue aceptando coma o punto, como ya hace `parseQuantityInput`.

### D-3 — Formato de fechas y su zona

- **Opciones**:
  - (a) **Formatear en el servidor** con `Intl.DateTimeFormat("es-AR", { timeZone })`, usando la zona que devuelve el historial, en un módulo propio con tests; la tabla muestra "10/09 14:02" y el `<time dateTime>` lleva el instante completo.
  - (b) **Formatear en el cliente** con la zona del navegador.
  - (c) **Mostrar el instante ISO**.
- **Recomendación**: (a).
  - La zona de la organización es la fuente de verdad (DataModel, regla 3), no la del navegador de quien mira.
  - Evita diferencias entre lo que renderiza el servidor y lo que vería el cliente.
- **Consecuencia**: cada pantalla con fechas muestra al pie "Fechas en \<zona\>", como el wireframe. Sin dependencias nuevas.

### D-4 — Períodos del historial y protección contra doble envío

- **Opciones**:
  - (a) **Períodos predefinidos en la URL** (`todo`, `7d`, `30d`, `90d`) que la página traduce a fechas del día de hoy en la zona de la organización, más `desde` y `hasta` explícitos; por defecto, `todo`. Doble envío: `useActionState` con el botón deshabilitado mientras responde, apoyado en que el saldo esperado hace fallar con `CONFLICT` cualquier reenvío del mismo formulario.
  - (b) **Solo fechas libres**, sin atajos.
  - (c) **Un token de un solo uso** en un campo oculto para el ajuste.
- **Recomendación**: (a).
  - Los atajos son los del wireframe y el servicio ya recibe fechas, así que la traducción es de presentación (4.3.3, D-3).
  - El saldo esperado ya es una defensa real contra el reenvío; (c) agregaría estado nuevo para cubrir lo mismo.
  - **Desvío respecto del wireframe**: el valor por defecto que se propone es "Todo", no "Últimos 30 días", porque FR-PROD-09 pide el historial completo y así el estado vacío significa de verdad "este producto no tiene movimientos".
- **Consecuencia**: si el usuario prefiere "Últimos 30 días" por defecto, cambia una constante y el mensaje del estado vacío; se anota en el brief.

### D-5 — De dónde salen los productos del end-to-end

- **Opciones**:
  - (a) **Cada caso crea lo que necesita**: el camino feliz da de alta el producto por la pantalla 3, y los casos de volumen (paginación, filtros) insertan filas por SQL en el propio spec.
  - (b) **Extender el seed básico** con productos.
  - (c) **Todo por la UI**, incluidas las 30 filas de la paginación.
- **Recomendación**: (a).
  - El seed básico lo comparten todos los specs; sumarle productos ataría el estado de un spec a otro.
  - (c) haría lento y frágil el caso de paginación.
- **Consecuencia**: el spec limpia lo que crea, como ya hacen `login.spec.ts` y `users.spec.ts` con sus datos.

### D-6 — Unificar el `VALIDATION_ERROR` por id inválido

- **Opciones**:
  - (a) **Sin `fields`**: `updateProduct` y `adjustStock` dejan de devolver `fields: []` cuando el id no es un UUID, como ya hacen las demás funciones. Un id de la URL no es un campo del formulario.
  - (b) **Con `fields: []` en todas**.
  - (c) **Dejarlo como está**.
- **Recomendación**: (a).
  - La pantalla decide qué mostrar por el código, y un id inválido siempre termina en "este producto no existe".
  - (c) obliga a cada consumidor nuevo a recordar la excepción.
- **Consecuencia**: cambian aserciones de `inventory-adjustment.test.ts` y del test de `catalog`, y los tipos de resultado pierden esa variante. Es el único cambio autorizado sobre servicios ya cerrados.

## Invariantes

- La auditoría nunca llega a un `viewer`, ni en la respuesta del servidor.
- El stock no se edita desde la pantalla 4: solo cambia con un ajuste.
- Ninguna pantalla ofrece editar o borrar un movimiento.
- El estado de stock se comunica con texto e ícono, nunca solo con color.
- Los componentes de cliente no importan `@/modules/*`; toda mutación es una Server Action.
- Estilos solo con tokens de `globals.css`, y sin `transition-colors` en lo que axe analiza tras emular el esquema.
- Sin migraciones, sin dependencias nuevas y sin cambios en la lógica de los servicios, salvo D-6.
- Sin referencias a Airtable ni al repositorio del agente de WhatsApp.

## Criterios de aceptación

- **AC-1**: D-1 a D-6 tienen resolución del usuario con fecha.
- **AC-2**: la lectura de auditoría devuelve ediciones y ajustes del producto en una sola lista ordenada y paginada, con el nombre del autor; un `viewer` recibe `FORBIDDEN` y una entidad de otra organización no aparece. Verificado contra PostgreSQL real.
- **AC-3**: pantalla 3 — busca por nombre y por SKU, filtra por estado de stock y actividad, pagina, y refleja todo en la URL; distingue "no hay productos" de "sin resultados"; el `viewer` no recibe el botón de alta.
- **AC-4**: pantalla 4 — muestra datos, stock, estado y últimos movimientos; `admin` edita con validación en línea y `CONFLICT` por SKU en el campo; desactivar y reactivar piden confirmación; el `viewer` no recibe formularios ni auditoría.
- **AC-5**: pantalla 5 — `admin` registra un ajuste y ve el saldo nuevo; cada rechazo muestra su mensaje propio, con saldo actual y cantidad solicitada cuando corresponde; ante `CONFLICT` la pantalla muestra el saldo actualizado y pide confirmar de nuevo; el `viewer` ve el historial y no el formulario.
- **AC-6**: el historial de la pantalla 5 filtra por tipo y por período, pagina, y muestra fechas en la zona de la organización con la leyenda al pie; el estado vacío distingue "sin movimientos" de "sin resultados".
- **AC-7**: cantidades mostradas en formato local ("2,5"), con tests unitarios de los bordes; fechas formateadas en la zona de la organización, con test.
- **AC-8**: `logEvent` registra `organization_id` y la duración en cada Server Action de estas pantallas, sin datos personales, con su test.
- **AC-9**: `tests/e2e/products.spec.ts` cubre el camino feliz de las tres pantallas y al menos un error o estado vacío por pantalla, con axe sin violaciones en cada estado, en claro y oscuro, recorrido por teclado y móvil a 375 px.
- **AC-10**: `npm run test` y `npm run test:e2e` pasan completos; typecheck, lint y formato en verde; `db:generate` informa que no hay cambios de esquema.
- **AC-11**: CI en verde en el commit de la subfase, verificado con `gh run view`.
- **AC-12**: `git status` muestra solo archivos autorizados; Screens y los wireframes 03, 04 y 05 quedan en estado "implementado" con sus desvíos anotados, y TraceabilityMatrix, RepositoryStructure y TestingStrategy reflejan la cobertura.

## Pruebas y evidencia requerida

- **Evidencia `deterministic`**: tests unitarios y de integración contra PostgreSQL 18.6 real.
- **Evidencia `producer-consumer`**: end-to-end con Chromium sobre `next start` contra la base `_e2e`, sin mocks: UI ↔ Server Action ↔ servicio ↔ base.

**Nivel resultante esperado**: **validado en integración** para las pantallas 3, 4 y 5, y **validado localmente y en CI** para la lectura de auditoría y los formateadores. Con esto queda cubierto el gate de salida de la Fase 4.

**No se valida**:

- rendimiento con catálogos grandes ni el costo de `offset` (Fase 8);
- navegadores distintos de Chromium;
- la aplicación en staging o conectada con `crm_app` (Fases 8 y 9).

La revisión es una autoevaluación (`self_assessment: true`).

## Ajustes durante la implementación

1. **D-1 se aplica sin que `audit` autorice ni componga el autor.** Autorizar dentro de `audit` obligaba a importar `organizations`, que ya importa `audit` para registrar sus cambios: sería un ciclo, y Overview declara que `audit` depende de `auth` y `organizations` solo en `schema.ts` para sus claves foráneas. El nombre del autor tiene el mismo problema con `auth`. El usuario eligió el 2026-09-15 la opción (a): `audit` expone `listEntityAuditLogs(query)`, una consulta sin contexto ni rol, y `catalog` agrega `listProductAudit(context, productId, page)`, que autoriza `admin`, verifica que el producto sea de la organización y compone el autor con `auth`, igual que `inventory` en el historial de movimientos. La consulta sigue siendo una sola, con los dos tipos de entidad y paginada en la base, como aprobaste. En la Fase 5, clientes tendrá su equivalente en `crm`.

2. **Un ajuste rechazado perdía el motivo y dejaba la pantalla vieja.** Lo encontró el caso 7 del end-to-end, no una revisión: tras un `CONFLICT`, el campo Motivo aparecía vacío, porque React reinicia los campos no controlados al terminar una acción de formulario, y el segundo envío se rechazaba por motivo faltante. Además, el encabezado seguía mostrando el saldo viejo y el historial, "sin movimientos", mientras el mensaje decía que el saldo había cambiado. Se corrigió en el código: el motivo pasa a ser controlado y la acción revalida la ruta ante cualquier rechazo, para que el saldo y el historial sean los reales. El caso 7 verifica las dos cosas.
3. **"Bajo stock" sin color propio.** El diseño visual base no define un token de advertencia y `globals.css` quedó fuera del alcance, así que ese estado usa el token de énfasis existente. Lo que distingue los tres estados es el texto y el ícono, como exige Screens.md. Anotado como desvío en el wireframe 03.
4. **Un formulario GET envía todos sus campos**, también los que están en su valor por defecto: las URLs quedan como `?tipo=todos&periodo=30d`, no solo con el filtro cambiado. Es el mismo comportamiento de la pantalla 10 y los tests lo afirman así; los enlaces de paginación y de "Limpiar filtros" sí usan la URL canónica.
5. **Intermitencia observada, sin cambios**: en una corrida de la suite completa, un caso de autorización de `product-audit.test.ts` superó su tiempo de espera bajo carga; el archivo pasó solo en 4 s y la suite completa pasó en las tres corridas siguientes. Queda anotado por si reaparece en CI.

## Condiciones de detención

- Si alguna pantalla necesita un cambio de servicio más allá de D-6, una migración o una dependencia nueva.
- Si la lectura de auditoría no puede paginar con los dos tipos de entidad usando el índice existente.
- Si axe informa una violación que obligue a cambiar un token de color o el diseño base de la 4.0.
- Si un test existente distinto de los que toca D-6 necesita cambios.
- Si el end-to-end resulta intermitente en alguna de las corridas.
- Antes de commit, push o cambios en Notion.
