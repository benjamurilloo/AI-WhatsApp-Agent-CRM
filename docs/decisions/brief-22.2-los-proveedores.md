---
schema: task-brief.v1
task_id: "22.2"
task_type: implementation
generated_at: 2026-10-15
---

# Brief 22.2 — Los proveedores

- **Contrato**: `task-brief.v1`
- **Tipo de tarea**: `implementation`
- **Nivel de evidencia objetivo**:
  - `deterministic` para el esquema, el servicio, la serialización, las guardas y la frontera del módulo, contra PostgreSQL real;
  - `producer-consumer` para las pantallas (end-to-end sobre `next start`) y para los contratos del agente, que no cambian;
  - `isolated-runtime` para el despliegue, si se autoriza (D-12).
- **Nivel de validación alcanzable**: **validado localmente y en CI**, **validado en integración** para las pantallas y, con D-12, **desplegado en producción** con el recorrido del usuario. No es «preparado para producción».
- **Orden**: segunda subfase de la Fase 22 — Compras y proveedores ([Roadmap](../planning/Roadmap.md) §Fase 22), después de la 22.1, cerrada el 2026-10-15. Implementa la fila «22.2» del punto 15 del [ADR 0023](0023-compras-y-proveedores.md). Va primero porque la orden de compra, la recepción y el pago nombran al proveedor por su clave.
- **No abre ni cierra gate.** Crea el módulo `purchasing` con una tabla editable, sin dinero, sin stock y sin numeración. Mueve la validación del teléfono de `crm` a `src/shared/` (D-3). Se recomienda igual la revisión independiente (D-11), por ser el primer código del módulo y por ese movimiento.
- **Estado de este documento**: **aprobado por el usuario el 2026-10-15**, con todas las recomendaciones, de D-1 a D-12. La tarea 22.2 (`3fa702be6f4e8123b500cf63664877b4`) pasó a «En proceso» el 2026-10-15 con autorización del usuario. **Cerrado el 2026-10-15** (§Cierre, abajo).

## Objetivo

Que un `admin` pueda llevar la **lista de proveedores** de su organización:

- dar de alta un proveedor con su nombre y, si los tiene, su teléfono, su email y su CUIT;
- editarlo;
- desactivarlo y reactivarlo;
- ver la lista, buscar por nombre y abrir la ficha de cada uno con su historia.

Un `viewer` no ve nada de esto. El agente tampoco. Todavía no hay órdenes, recepciones ni pagos: los suman la 22.3 a la 22.6.

## Lo que se verificó antes de escribir este brief

Releído o verificado en el código el 2026-10-15, sobre `main` (`c4f551e`, el cierre de la 22.1; CI 38788768887 `success`, leída por el SHA completo).

**Ya está fijado** por el ADR 0023, puntos 2, 10, 11, 12, 14 y 15:

- **la ficha**:
  - una por organización, separada de `clients`, editable y con borrado lógico (regla 8);
  - `crm_app` con `SELECT`, `INSERT` y `UPDATE`, sin `DELETE`;
  - el nombre obligatorio y **único por organización sin distinguir mayúsculas**, como `payment_methods`;
  - el teléfono, el email y el CUIT, opcionales;
  - sin notas ni texto libre;
- **el CUIT** se valida por su forma: once dígitos con el dígito verificador, y no entra en ningún cálculo;
- **un proveedor no es un cliente**, aunque comparta el teléfono, y no aparece en nada que lea el agente;
- **un proveedor desactivado** no recibe órdenes ni recepciones nuevas y sí recibe pagos. En esta subfase no hay ninguna de las tres cosas: la regla la aplican la 22.3, la 22.4 y la 22.6;
- **la auditoría**, con el `entity_type` nuevo `supplier`;
- **la edición** lo bloquea `FOR UPDATE`, como la del cliente (punto 10);
- **`purchasing`** depende de `catalog`, `inventory`, `numbering`, `organizations`, `audit` y `auth`. En esta subfase usa solo `organizations` y `audit`. Entra en la lista de módulos de dominio de `eslint.config.mjs` y en el Overview. **Ningún módulo depende de `purchasing`** en esta subfase: `cash` lo hace recién en la 22.6;
- **solo `admin`** ve y opera los proveedores (punto 12);
- **los datos personales** (punto 14): la ficha guarda lo mínimo; un proveedor con compras o pagos no se borra; **el vaciado queda diseñado y no se construye**.

**Hallazgos de esta verificación**:

- **H-1. La validación del teléfono vive dentro de `crm`.**
  - `normalizePhone` y `parsePhoneInput` están en `src/modules/crm/phone.ts`. Son puras: no leen la base ni importan otro módulo.
  - `crm/index.ts` no las exporta. Lo único que importa ese archivo de afuera es `MemberRole`, y solo lo usa `phoneForRole`, el enmascarado por rol.
  - El ADR 0023, punto 11, no pone a `crm` entre las dependencias de `purchasing`, así que el proveedor no puede validar su teléfono importándolas.
  - Decide D-3.
- **H-2. El ADR no dice si el CUIT es único.** Solo exige el nombre único. Decide D-2.
- **H-3. El punto 15 nombra «la desactivación», no la reactivación.**
  - Con el nombre único también contra los inactivos, un proveedor desactivado por error no se podría volver a dar de alta.
  - `clients`, `payment_methods` y `client_tags` se reactivan.
  - Decide D-5.
- **H-4. La regla 10 de DataModel no cambia en esta subfase.**
  - El HANDOFF dice que «las reglas 8 y 10» se enmiendan con la tabla, y el ADR 0023 dice lo mismo en §Consecuencias.
  - La regla 10 lista las tablas de solo inserción y las que admiten `UPDATE` con un trigger que lo limita. `suppliers` no es ninguna de las dos: es editable como `clients`, sin trigger.
  - La 22.2 enmienda solo la regla 8. La regla 10 la tocan la 22.3 en adelante, con `purchase_orders` y las tablas de solo inserción.
  - Es una precisión, no una contradicción.
- **H-5. La auditoría del proveedor va a guardar datos personales.**
  - El alta y la edición auditan el teléfono, el email y el CUIT, y el trigger de `audit_logs` no deja vaciarlos.
  - El ADR lo acepta (punto 14 y §Riesgos): el vaciado y la extensión del trigger se construyen cuando un caso lo pida.
  - Este brief no lo reabre. Solo lo escribe en D-8, para que no sorprenda.
- **H-6. El vaciado de un cliente no alcanza a un proveedor con el mismo teléfono**, y así tiene que ser: son fichas distintas (punto 2). `client-data.test.ts` busca los valores de un cliente en todas las tablas, pero solo encuentra lo que el mismo test inserta, así que no cambia.
- **H-7. El ícono `truck` ya existe** en `src/app/_components/icons.tsx`, así que `icons.tsx` no se toca.
- **H-8. La entrada de solo `admin` en la navegación ya tiene molde**: «Usuarios». Lo mismo la página que a un `viewer` le muestra un aviso: `/usuarios`, con `PageNotice` y `FORBIDDEN_PAGE_MESSAGE`.
- **H-9. La última migración es la `0046`**, así que esta subfase escribe la `0047`.

## Alcance incluido

1. **Esquema** (migración `0047`, generada con `drizzle-kit generate` y completada a mano):
   - el valor `supplier` en `audit_entity_type` (aditivo);
   - **`suppliers`** (D-1), con `SELECT`, `INSERT` y `UPDATE` para `crm_app`, sin `DELETE`.
2. **`src/shared/phone/`**, nuevo (D-3): `normalizePhone` y `parsePhoneInput`, movidos sin cambiar su conducta. `crm/phone.ts` las importa de ahí y conserva `phoneForRole`.
3. **`purchasing`**, módulo nuevo:
   - el esquema y el repositorio de `suppliers`;
   - el CUIT (D-2) y las reglas de la ficha (D-4);
   - listar con búsqueda y página, ver una ficha, crear, editar, desactivar y reactivar (D-5, D-10);
   - la historia del proveedor, con la auditoría;
   - las respuestas de D-7.
4. **Pantallas** (D-9): «Compras» en la navegación, solo para `admin`, con la lista, el alta, la ficha y la edición.
5. **Guardas**:
   - `module-boundary`: los casos de `purchasing` como módulo de dominio;
   - `exposed-surface`: las acciones nuevas;
   - `eslint.config.mjs`: `purchasing` en la lista de módulos de dominio;
   - `organization-isolation`: las escrituras por id del proveedor (D-6).
6. **Documentación**:
   - DataModel: `suppliers`, la regla 8, la regla 14 implementada para `suppliers`, `audit_logs` y la nota de §«Explícitamente fuera»;
   - Overview: la fila de `purchasing`;
   - RepositoryStructure: `purchasing` y `src/shared/phone`;
   - FunctionalRequirements: una sección nueva, «Compras» (`FR-COMP`);
   - Screens, TraceabilityMatrix y SecurityModel, con sus recuentos.

## Alcance excluido

- **La orden de compra, la recepción, su anulación, los pagos y la cuenta del proveedor** (22.3 a 22.6).
- **Que la desactivación bloquee algo.** En esta subfase no hay nada que bloquear. La regla la aplican la 22.3, la 22.4 y la 22.6.
- **El vaciado de un proveedor y la extensión del trigger de `audit_logs`** (ADR 0023, punto 14). **La exportación de los datos de un proveedor** tampoco entra.
- **Notas, dirección, condición frente al IVA, contacto o cualquier campo más** (punto 2).
- **Que un `viewer` vea algo de compras**, y cualquier lectura para el agente: `read-v1`, `read-v2` e `ingestion-v2` no cambian.
- **Importar proveedores por CSV** (Fase 14).
- **Cambiar la conducta del teléfono del cliente**: D-3 lo mueve sin tocarlo.
- **La guarda de dependencias entre módulos** (brief-19.4, R-2), que sigue como tarea aparte.

## Archivos autorizados

Crear o modificar solo estos. Tocar cualquier otro es una condición de detención.

- `drizzle/0047_*.sql` y `drizzle/meta/*`
- `src/modules/purchasing/` (nuevo), con sus tests unitarios
- `src/shared/phone/` (nuevo), con el test que hoy está en `crm/phone.test.ts` para estas dos funciones
- `src/modules/crm/phone.ts` y `src/modules/crm/phone.test.ts`, **solo** para importar de `src/shared/phone` y quitar lo movido (D-3)
- `src/modules/audit/schema.ts`, **solo** `supplier`
- `src/app/(autenticado)/compras/` (nuevo)
- `src/app/(autenticado)/layout.tsx`, **solo** el enlace «Compras»
- `eslint.config.mjs`, **solo** `purchasing` en la lista de módulos de dominio
- `tests/integration/`:
  - `suppliers.test.ts` y `suppliers-schema.test.ts` (nuevos);
  - `audit.test.ts` y los que fijan los valores de `audit_entity_type`, **solo** el valor nuevo;
  - `organization-isolation.test.ts`, **solo** las escrituras del proveedor
- `tests/guards/`: `module-boundary.test.ts` y `exposed-surface.test.ts`, **solo** lo de `purchasing`
- `tests/e2e/suppliers.spec.ts` (nuevo)
- en `docs/architecture/`: `DataModel.md`, `Overview.md`, `RepositoryStructure.md`, `TraceabilityMatrix.md` y `SecurityModel.md`
- `docs/product/FunctionalRequirements.md` y `Screens.md`
- al cerrar la subfase: este brief, `docs/planning/Roadmap.md`, `docs/decisions/README.md`, `CHANGELOG.md` y `HANDOFF.md`

**No se tocan**:

- los módulos `cash`, `sales`, `orders`, `catalog`, `inventory`, `numbering`, `knowledge`, `conversations` e `ingestion`. Tampoco `crm`, fuera de los dos archivos de arriba;
- el resto de `src/shared/`;
- `scripts/`, los seeds y los contratos del agente.

## Fuentes de verdad

- **El código y las migraciones**:
  - `audit` (`recordAudit` y su regla del `diff`);
  - `crm`: `updateClient` y `setClientActive` con `forUpdate`, el rescate de `23505` por el nombre de la restricción y el `CHECK` del email;
  - `cash`: `payment_methods`, con el índice único sobre `lower(name)`;
  - la `0042`, como molde de una tabla editable sin `DELETE`;
  - las guardas `module-boundary` y `exposed-surface`.
- **Las decisiones**:
  - el [ADR 0023](0023-compras-y-proveedores.md), puntos 2, 10, 11, 12, 14 y 15;
  - el [ADR 0013](0013-rol-de-aplicacion-y-tablas-de-solo-insercion.md);
  - el [ADR 0015](0015-vaciado-de-una-sola-direccion-en-tablas-de-solo-insercion.md), solo como contexto del vaciado diseñado;
  - el [brief-21.2](brief-21.2-los-medios-de-pago-y-la-caja.md) (los medios de pago) y el [brief-17.1](brief-17.1-campos-de-clientes.md) (el email del cliente), como molde.
- **Los contratos**: [read-v1](../contracts/read-v1.md), [read-v2](../contracts/read-v2.md) e [ingestion-v2](../contracts/ingestion-v2.md), que no cambian.

## Decisiones pendientes

Cada una con su recomendación. El usuario aprueba o cambia.

**D-1. La tabla `suppliers`.** **Recomendada**:

- **columnas**: `id`, `organization_id`, `name`, `phone_e164`, `email`, `cuit`, `is_active`, `created_at`, `updated_at`;
- `UNIQUE (organization_id, id)`, el destino de las claves compuestas de la 22.3 en adelante;
- **el índice único `suppliers_organization_name_lower_unique`** sobre `(organization_id, lower(name))`, que alcanza también a los inactivos;
- **los `CHECK`**:
  - el nombre, de 1 a 120 caracteres y sin espacios al borde, como `company_name` del cliente;
  - el teléfono en E.164, con la misma expresión que `clients_phone_e164_format`;
  - el email, con la forma de `clients_email_format`;
  - el CUIT, once dígitos (`^[0-9]{11}$`). El dígito verificador lo comprueba el servicio (D-2);
- `ON DELETE RESTRICT` hacia `organizations`;
- **sin trigger**: todas las columnas son editables, salvo `organization_id` y `id`, que ningún `UPDATE` del repositorio toca. Lo comprueba `organization-isolation`.

**D-2. El CUIT.** **Recomendado**:

- **la entrada**:
  - acepta los once dígitos con guiones, espacios o puntos (`20-12345678-9`, `20 12345678 9`);
  - los quita y exige once dígitos;
  - el dígito verificador se calcula con los pesos `5, 4, 3, 2, 7, 6, 5, 4, 3, 2`. El resto de la suma por 11 da `11 − resto`: 11 vale 0, y 10 es un CUIT inválido;
  - vacío es «sin CUIT»;
- **se guarda** con los once dígitos y **se muestra** como `20-12345678-9`;
- **único por organización cuando no es nulo**, con un índice parcial `suppliers_organization_cuit_unique`, también contra los inactivos:
  - dos fichas con el mismo CUIT son el mismo proveedor cargado dos veces;
  - desde la 22.6 eso partiría su cuenta en dos, y lo que se le debe no se vería entero;
  - un alta con el CUIT de un inactivo responde `duplicate_cuit`, para que se reactive el existente, como el teléfono del cliente;
- **la función vive en `purchasing`**, pura y con su test de propiedades: acepta cada CUIT válido con cualquier separador, y rechaza cada cambio de un dígito.

*Alternativa*: el CUIT sin unicidad. Admite dos fichas de la misma persona, por ejemplo dos vendedores de un mismo distribuidor, al precio de partir la cuenta en la 22.6.

**D-3. El teléfono.** **Recomendado**: mover `normalizePhone` y `parsePhoneInput` a **`src/shared/phone/`** sin cambiar su conducta (H-1):

- `crm/phone.ts` las importa de ahí y conserva `phoneForRole`, que depende de `organizations`;
- los tests de esas dos funciones se mudan con ellas, sin cambiar;
- **el precedente** es la 20.3, que sacó las reglas de línea a `src/shared/lines/` para que el pedido y la venta usaran las mismas.

**El teléfono del proveedor no es único**: no lo identifica, como el email del cliente. Tampoco choca con el de un cliente: son fichas distintas (punto 2).

*Alternativas*:

- copiar la expresión en `purchasing`: dos reglas del mismo dato pueden divergir;
- exportarlas desde `crm`: haría depender a `purchasing` de `crm`, que el ADR no admite;
- guardar el teléfono como texto: es el texto libre que el punto 2 excluye.

**D-4. El nombre y el email.** **Recomendados**:

- **el nombre**:
  - se recorta y no puede quedar vacío; hasta 120 caracteres;
  - es único sin distinguir mayúsculas, también frente a los inactivos. Un repetido responde `duplicate_name`;
  - distingue acentos, como `payment_methods`: «Distribuidora Ávila» y «Distribuidora Avila» son dos nombres distintos;
- **el email**: la regla del cliente (brief-17.1). Se recorta, va en minúsculas, tiene hasta 254 caracteres y pasa por `z.email()`. No es único.

**D-5. Las operaciones.** **Recomendadas**, todas solo de `admin`:

- **crear**: nombre obligatorio; teléfono, email y CUIT opcionales;
- **editar** los cuatro campos. Vaciar uno opcional lo lleva a nulo. Un cambio que no cambia nada no escribe ni audita;
- **desactivar y reactivar** (H-3). Hacerlo sobre uno que ya está en ese estado no escribe ni audita;
- **listar**, con el filtro de estado y la búsqueda (D-10);
- **ver la ficha** con su historia.

**D-6. La serialización.** **Recomendada**:

- **la edición, la desactivación y la reactivación** leen el proveedor `FOR UPDATE` (punto 10) y deciden con lo leído. Dos ediciones simultáneas se ordenan, y la auditoría de la segunda tiene como «antes» lo que dejó la primera;
- **el alta y la edición** no toman ningún bloqueo de organización. La unicidad del nombre y del CUIT la asegura la base: el `23505` se rescata por el **nombre de la restricción** como `duplicate_name` o `duplicate_cuit`, como `phone_taken` en `crm`. Cualquier otro `23505` se relanza;
- **toda escritura por id filtra por `organization_id`**, y `organization-isolation` lo prueba para la edición y el cambio de estado;
- **el aislamiento sigue siendo `READ COMMITTED`.**

**D-7. Las respuestas.** **Recomendadas**:

- **`FORBIDDEN`**: a un `viewer`, en toda lectura y toda escritura de proveedores;
- **`VALIDATION_ERROR`**, con el campo:
  - un id que no es uuid;
  - un nombre vacío o largo;
  - un teléfono que no normaliza;
  - un email inválido;
  - un CUIT con otra cantidad de dígitos o con un dígito verificador que no cierra;
- **`NOT_FOUND`**: un proveedor que no existe en la organización;
- **`BUSINESS_RULE_VIOLATION`**, con su razón: `duplicate_name` o `duplicate_cuit`;
- **al escribir**: el id del proveedor y si cambió algo.

**Ningún rechazo escribe ni audita.**

**D-8. La auditoría.** **Recomendada**, con `entity_type` `supplier` y el id del proveedor:

- **`create`**: `{ before: null, after: { name, phone, email, cuit, isActive: true } }`, con los nulos incluidos;
- **`update`**: solo los campos que cambiaron;
- **`deactivate` y `reactivate`**: `{ isActive }`.

**Lleva los datos de la persona** cuando el proveedor es una persona física (H-5). Es lo que acepta el ADR 0023, punto 14, hasta que se construya el vaciado. La historia de la ficha la muestra como «Alta», «Edición», «Desactivación» y «Reactivación».

**D-9. Las pantallas.** **Recomendadas**:

- **en la navegación**, «Compras» entre «Caja» y «Conversaciones», **solo para `admin`**, como «Usuarios», con el ícono `truck` (H-7). La entrada lleva a `/compras/proveedores`;
- **`/compras`** redirige a `/compras/proveedores` hasta que la 22.3 sume las órdenes. La navegación interna de Compras la arma la 22.3, que tiene la segunda pantalla;
- **`/compras/proveedores`**:
  - la lista, con el nombre, el teléfono, el email, el CUIT formateado y el estado;
  - la búsqueda y el filtro de estado (D-10);
  - el botón «Nuevo proveedor»;
- **`/compras/proveedores/nuevo`**: el formulario, que funciona sin JavaScript, como el del cliente;
- **`/compras/proveedores/[supplierId]`**: la ficha, con «Editar», «Desactivar» o «Reactivar» y su historia. Un proveedor inactivo lo dice arriba;
- **`/compras/proveedores/[supplierId]/editar`**: el mismo formulario, con los valores actuales;
- **un `viewer`** que entra por la URL ve el aviso de página prohibida, como en `/usuarios`, y no ve la entrada en la navegación.

**D-10. La lista.** **Recomendada**:

- **el orden**: alfabético por `lower(name)`, que sirve el índice único;
- **el filtro de estado**: activos (por defecto), inactivos o todos;
- **la búsqueda**: por parte del nombre, sin distinguir mayúsculas ni acentos (`immutable_unaccent(lower(name)) like …`, con `%` y `_` escapados). También por CUIT: con once dígitos, con o sin separadores, busca el exacto;
- **la página**: de 25, como la de clientes (`CLIENTS_PAGE_SIZE`);
- **sin índice nuevo** (regla 6). Un negocio tiene decenas de proveedores, no miles. Un test con 2.000 proveedores mide la lista con búsqueda contra el umbral de 754 ms de la 13.2, como la lista de clientes de la 17.1.

**D-11. La revisión independiente.** **Recomendada**: un agente de solo lectura, antes del commit, contra este brief, el ADR 0023 y las reglas vigentes. Es el primer código de `purchasing`, y D-3 toca la validación de un dato de `crm` que identifica al cliente (ADR 0007).

**D-12. El despliegue a producción y el recorrido.** **Recomendado**: sí, con autorización aparte en su turno:

- **cuándo**: después de la revisión independiente y con la CI del SHA exacto en `success`;
- **cómo**: según [deploy/production/README.md](../../deploy/production/README.md) §Desplegar, con la migración `0047`.

**Volver a `55aeb1a`, que es lo que corre hoy, es limpio**: ese código no conoce `suppliers`, que queda sin usar, y el valor `supplier` del enum no lo lee nadie. El recorrido, en Demostración Vixora:

1. dar de alta un proveedor con todos los campos y otro solo con el nombre;
2. intentar un nombre repetido con otras mayúsculas y un CUIT con el dígito verificador mal;
3. editar uno y vaciarle el email;
4. desactivarlo, filtrar por inactivos y reactivarlo;
5. buscar por parte del nombre y por CUIT;
6. entrar con un `viewer` y no ver «Compras».

## Invariantes

1. Un proveedor nunca se borra: se desactiva. `crm_app` no tiene `DELETE` sobre `suppliers`.
2. Dos proveedores de una organización no comparten el nombre sin distinguir mayúsculas, ni el CUIT si D-2 se aprueba como está, aunque uno esté inactivo.
3. Todo CUIT guardado tiene once dígitos y su dígito verificador cierra. Todo teléfono guardado está en E.164.
4. Ninguna escritura del proveedor alcanza a otra organización.
5. Solo un `admin` lee o escribe proveedores. Ninguna lectura del agente los incluye.
6. La ficha no guarda texto libre ni más datos que los del punto 2.
7. Ningún rechazo escribe ni audita, y un cambio que no cambia nada tampoco.
8. `purchasing` depende solo de `organizations` y `audit` en esta subfase, y **ningún módulo depende de `purchasing`**.
9. La conducta del teléfono del cliente no cambia: los tests de `crm` pasan sin cambios, salvo la ruta del import.
10. `read-v1`, `read-v2` e `ingestion-v2` no cambian.

## Criterios de aceptación

- **AC-1 (esquema)**: la migración `0047` suma `supplier` a `audit_entity_type` y crea `suppliers`. En `suppliers-schema.test.ts`, con el rol dueño:
  - **privilegios**: `crm_app` tiene `SELECT`, `INSERT` y `UPDATE` sobre `suppliers`, sin `DELETE`;
  - **los `CHECK`**: el nombre vacío, largo o con espacios al borde; el teléfono fuera de E.164; el email inválido; el CUIT con otra cantidad de dígitos o con letras;
  - **los índices únicos**: rechazan el nombre repetido con otras mayúsculas y el CUIT repetido (si D-2), también contra un inactivo, y admiten dos proveedores sin CUIT;
  - **`UNIQUE (organization_id, id)`** existe.
- **AC-2 (CUIT y teléfono)**:
  - el CUIT tiene sus tests de propiedades (D-2): acepta los válidos con cualquier separador y rechaza cada cambio de un dígito;
  - las funciones del teléfono en `src/shared/phone` pasan los mismos tests que tenían en `crm`;
  - `crm` las usa desde ahí, y sus tests de integración pasan sin cambios.
- **AC-3 (operaciones)**:
  - el servicio crea, edita, desactiva y reactiva con la auditoría de D-8;
  - vaciar un campo opcional lo lleva a nulo;
  - un cambio que no cambia nada, o desactivar uno inactivo, no escribe ni audita;
  - la lista ordena, filtra por estado, busca por nombre sin mayúsculas ni acentos y por CUIT, y pagina.
- **AC-4 (rechazos)**: cada respuesta de D-7, sin escribir ni auditar; un `viewer` recibe `FORBIDDEN` en cada lectura y cada escritura.
- **AC-5 (serialización)**:
  - **la edición** espera el `FOR UPDATE` retenido desde otra conexión, y dos ediciones simultáneas dejan la auditoría de la segunda con el «antes» que dejó la primera;
  - **dos altas simultáneas** con el mismo nombre terminan en una creada y un `duplicate_name`. Con el mismo CUIT, en una creada y un `duplicate_cuit` (si D-2);
  - **el rescate** de `23505` es por el nombre de la restricción, y otro `23505` se relanza.

  Cada escenario lleva su mutación.
- **AC-6 (aislamiento)**: `organization-isolation` prueba que la edición y el cambio de estado de un proveedor no alcanzan a otra organización, y que la lista y la ficha no la ven.
- **AC-7 (rendimiento)**: con 2.000 proveedores en una organización, la lista con búsqueda queda bajo 754 ms en local. El resultado va a §Resultados.
- **AC-8 (pantallas)**: un end-to-end sobre `next start`:
  - **un `admin`**, con teclado y sin JavaScript donde el formulario lo permite:
    - da de alta un proveedor y ve el rechazo de un CUIT inválido y de un nombre repetido;
    - lo edita, lo desactiva y lo reactiva;
    - lo busca;
    - ve su historia;
  - **un `viewer`** no ve «Compras» y recibe el aviso de página prohibida en `/compras/proveedores`;
  - **axe** sin violaciones en claro y en oscuro.
- **AC-9 (guardas)**:
  - `module-boundary` cubre `purchasing` como módulo de dominio;
  - `exposed-surface` declara las acciones nuevas;
  - `eslint.config.mjs` lo incluye.
- **AC-10 (fronteras)**:
  - `purchasing` no importa ningún módulo fuera de `organizations` y `audit`;
  - ningún módulo importa `purchasing`;
  - ningún módulo existente está en el diff, salvo `audit` y `crm` en lo autorizado.
- **AC-11 (contratos)**: `read-api`, `read-api-v2` e `ingestion-v2` pasan sin cambios.
- **AC-12**: la batería de la CI completa pasa en local (formato, lint, typecheck, build, unitarios, guardas, integración y end-to-end) y en la CI del SHA del cierre.
- **AC-13**: la documentación del punto 6 del alcance queda actualizada, sin reescribir ninguna decisión anterior.
- **AC-14** (si D-12): producción corre el SHA del cierre con la `0047`. En Demostración Vixora, el recorrido de D-12 se concilia contra la base: los proveedores, sus estados y la auditoría.

## Pruebas y evidencia requerida

- `deterministic`: AC-1 a AC-7 y AC-9 a AC-11, contra PostgreSQL real de desarrollo y de la CI.
- `producer-consumer`: AC-8 (UI ↔ servicio ↔ base) y AC-11.
- `isolated-runtime`: AC-14, si se despliega.
- **Las mutaciones** de AC-5 y del CUIT se corren y se revierten una por una, y su resultado va a §Resultados. Como mínimo:
  - la edición sin `FOR UPDATE`;
  - el rescate sin mirar el nombre de la restricción;
  - el dígito verificador sin comprobar;
  - la búsqueda sin escapar `%` y `_`;
  - una escritura por id sin `organization_id`.
- La batería se corre **desde Git Bash**, y los archivos nuevos van al índice con `git add -N` antes de la batería final.

## Condiciones de detención

Parar e informar antes de seguir si:

- hace falta tocar un archivo fuera de la lista autorizada, en especial otro módulo, otra parte de `src/shared/` o los contratos del agente;
- mover el teléfono a `src/shared/` exigiría cambiar su conducta o un test de `crm` más allá del import;
- el diseño exigiría cambiar el texto del ADR 0023, del 0013 o del 0007;
- `purchasing` tendría que importar otro módulo que `organizations` y `audit`, o un módulo existente importar `purchasing`;
- un proveedor pudiera borrarse, repetir su nombre o su CUIT, o guardar un CUIT o un teléfono inválido;
- aparece una vía por la que un `viewer` o el agente lea o escriba un proveedor;
- un texto libre o un dato fuera del punto 2 entra a la ficha;
- `read-v1`, `read-v2` o `ingestion-v2` tendrían que cambiar;
- un test que pasaba deja de pasar y la causa no es de esta subfase.

Y siempre **antes** de cada una de estas acciones, que necesita autorización explícita en su turno:

- el commit y el push;
- pasar tareas de estado en Notion;
- ejecutar migraciones contra una base que no sea la local o la de la CI;
- desplegar.

## Resultados — 2026-10-15 (autoevaluación)

Implementado el 2026-10-15. **Esta sección es autoevaluación**: la escribió quien implementó. La revisión independiente de D-11 va aparte, abajo.

### Lo que la implementación encontró que el brief no decía

**Desvío aprobado por el usuario el 2026-10-15:**

- **`identity-schema.test.ts` y la lista de tablas de `audit.test.ts`.**
  - Los dos fijan la lista completa de tablas de la base, y la primera corrida de la integración dio 5 fallas sin `suppliers`.
  - `identity-schema.test.ts` no estaba en la lista autorizada, y `audit.test.ts` lo estaba solo para el valor nuevo del enum.
  - Se sumó solo `suppliers`: en la lista exacta de tablas y entre las que se actualizan pero no se borran, junto a `payment_methods`. Es el mismo desvío de la 21.2.

**Precisiones que no cambian una decisión:**

- **`crm/service.ts` no cambia** (D-3). No estaba autorizado, así que `crm/phone.ts` reexporta `normalizePhone` y `parsePhoneInput` desde `src/shared/phone`, y el resto de `crm` las sigue importando de ahí. Los casos de esas dos funciones se mudaron sin cambios a `src/shared/phone/phone.test.ts`, y `crm/phone.test.ts` conserva los de `phoneForRole`.
- **Las propiedades del CUIT recorren una semilla fija** (D-2). El proyecto no tiene `fast-check`, y no se instalan dependencias sin autorización. `cuit.test.ts` genera 500 CUITs con un generador congruencial y comprueba los separadores, y 200 con cada cambio de un dígito.
- **La entrada «Compras» apunta a `/compras`**, que redirige a los proveedores (D-9). Así queda marcada también en las pantallas de la 22.3 en adelante.
- **Dos exportaciones para tests**:
  - `SUPPLIER_FIELD_LIMITS` sale de la interfaz pública, para que `messages.test.ts` compare los textos con los límites de la tabla;
  - `uniqueRuleOf` se exporta del repositorio, no del `index.ts`, para su test unitario: el rescate por el nombre de la restricción y que otro `23505` se relance.
- **El primer test de serialización no distinguía el `FOR UPDATE` del cambio de estado.** El `UPDATE` también espera la fila bloqueada, así que la mutación M2 sobrevivía. Se sumó «dos desactivaciones simultáneas», que sin el `FOR UPDATE` deja dos auditorías de una sola desactivación. Con eso, M2 queda detectada. La edición la distingue «dos ediciones simultáneas» (M1).
- **El orden de dos auditorías simultáneas no se lee de `created_at`**, que es la hora de inicio de cada transacción. El test de las dos ediciones busca cuál partió del original y exige que la otra parta de lo que dejó esa.

### Criterios

| Criterio | Estado | Evidencia |
|---|---|---|
| AC-1 | cumplido | `suppliers-schema.test.ts`: privilegios, 11 casos contra los 5 `CHECK`, los dos índices únicos, también contra un inactivo, y `UNIQUE (organization_id, id)` |
| AC-2 | cumplido | `cuit.test.ts`, `src/shared/phone/phone.test.ts` y la integración de `crm` sin cambios |
| AC-3 | cumplido | `suppliers.test.ts`: las cuatro operaciones con su auditoría, vaciar un opcional, el cambio que no cambia nada, la lista |
| AC-4 | cumplido | `suppliers.test.ts`: `FORBIDDEN` en las tres lecturas y las cuatro escrituras, cada campo inválido, el id inválido o ajeno, el nombre y el CUIT repetidos, sin escribir ni auditar |
| AC-5 | cumplido | `suppliers.test.ts`: la espera del bloqueo, dos ediciones y dos desactivaciones simultáneas, dos altas con el mismo nombre o CUIT; `repository.test.ts` para el rescate. Mutaciones abajo |
| AC-6 | cumplido | `organization-isolation.test.ts`: `updateSupplierValues`, `updateSupplierActive` y `findSupplier` |
| AC-7 | cumplido | con 2.000 proveedores, en local, tres corridas: la lista entera de 6,8 a 9,8 ms; la búsqueda por nombre, de 16,7 a 24,5 ms; por un número que no es CUIT, de 12,7 a 14,8 ms; por CUIT, de 2,5 a 3,3 ms. El umbral es de 754 ms |
| AC-8 | cumplido | `suppliers.spec.ts`, 4 casos, incluido uno sin JavaScript, con axe en claro y en oscuro |
| AC-9 | cumplido | `module-boundary` con 6 casos de `purchasing`; `exposed-surface` con las 4 acciones; `eslint.config.mjs` |
| AC-10 | cumplido | `purchasing` importa solo `organizations`, `audit` y `src/shared`; ningún módulo importa `purchasing` |
| AC-11 | cumplido | `read-api`, `read-api-v2` e `ingestion-v2` pasan en la integración completa |
| AC-12 | cumplido en local | local: formato, lint, typecheck, build, 794 unitarios, 660 guardas, la integración completa (1339 en verde y las 5 fallas del desvío, que con el arreglo pasan: 42 de 42 en esos dos archivos) y el end-to-end completo en dos mitades, 108 y 91 casos, como desde la 21.5. Falta la CI del SHA |
| AC-13 | cumplido | DataModel, Overview, RepositoryStructure, FunctionalRequirements (`FR-COMP-01` a `04`), Screens (40 a 42), TraceabilityMatrix y SecurityModel (139 puntos de entrada) |
| AC-14 | pendiente | depende de D-12, con autorización aparte |

### Mutaciones

Corridas una por una con un script que aplica el cambio, corre los tests que deberían atraparlo y restaura el archivo; las sumas de los tres archivos tocados se verificaron iguales al terminar.

- **M1**, la edición sin `FOR UPDATE`: detectada por «dos ediciones simultáneas».
- **M2**, la desactivación y la reactivación sin `FOR UPDATE`: detectada por «dos desactivaciones simultáneas». Sin ese caso sobrevivía (arriba).
- **M3**, el rescate sin mirar el nombre de la restricción: detectada por `repository.test.ts` (2 fallas) y por la integración del CUIT repetido (2 fallas).
- **M4**, el dígito verificador sin comprobar: detectada por `cuit.test.ts` y por «cada campo inválido».
- **M5**, la búsqueda sin escapar `%` y `_`: detectada por «la lista ordena…».
- **M6** y **M7**, `updateSupplierValues` y `updateSupplierActive` sin `organization_id`: detectadas por `organization-isolation.test.ts`.
- **M8**, un `viewer` lee la lista: detectada por el caso de `FORBIDDEN`.

## Revisión independiente — 2026-10-15

Un agente de solo lectura que no participó del trabajo revisó la entrega contra este brief, el ADR 0023 y las reglas vigentes (D-11). Fijó la escala de severidad antes de mirar.

**Veredicto: R1**, con 8 hallazgos, **todos bajos**, y 6 notas. Encontró correctos:
- la validación, que es la misma del email del cliente;
- el rescate del `23505` por el nombre de la restricción;
- que ningún rechazo escribe ni audita;
- el escape de la búsqueda;
- la autorización de `admin` en las tres lecturas y las cuatro escrituras;
- el filtro por organización en cada consulta;
- que el log no lleva datos del proveedor;
- el recuento de 139 puntos de entrada.

Cada hallazgo se verificó contra el código o el documento antes de aceptarlo. Los ocho se confirmaron y se corrigieron:

- **R-1**: SecurityModel decía que la guarda fija 80 puntos que no son páginas. Son 85 (69 Server Actions y 16 Route Handlers): el número se había quedado en el de la 21.5. Corregido, con la serie anterior conservada.
- **R-2**: la lista de lecturas reservadas a `admin` de SecurityModel no nombraba a los proveedores. Sumados.
- **R-3**: a DataModel le faltaba `supplier` en el tipo de `entity_type`, `suppliers` en las convenciones de esquemas y de privilegios, y en el estado. Completadas las cuatro.
- **R-4**: §«Explícitamente fuera» seguía listando `suppliers` con «las demás siguen fuera». Precisado con el molde de la 20.2, conservando el texto.
- **R-5**: TraceabilityMatrix no tenía las filas por pantalla de la 40 a la 42. Sumadas, con sus tablas e índices.
- **R-6**: RepositoryStructure no contaba que `organization-isolation` importa también el repositorio de `purchasing`, ni el de `ingestion`, que es de la 9.0.4. Precisado.
- **R-7**: el generador del test de propiedades del CUIT multiplicaba en coma flotante por encima de 2^53, el producto se redondeaba a par y casi no salían dígitos impares. Se verificó: 25 impares en 5.000 dígitos. Ahora usa `Math.imul` y los bits altos. Un caso nuevo exige que aparezcan los diez dígitos, y 9 de 9 pasan.
- **R-8**: AC-6 pide que `organization-isolation` pruebe también la lista, y no lo hacía. Se sumó el caso de `countSuppliers` y `findSuppliers`. La mutación que quita el filtro por organización de la lista lo hace fallar.

**Las notas, sin cambios:**
- N-1: el desvío, aprobado por el usuario.
- N-2: el snapshot no mira `updated_at`; el código responde antes de escribir.
- N-3: la edición, la desactivación y la reactivación se prueban con clic, no con el teclado, y sin JavaScript solo se prueba el alta.
- N-4: omitir un opcional en `updateSupplier` lo vacía. Es un reemplazo completo, y el formulario siempre manda los cuatro campos.
- N-5: las tarjetas móviles no muestran el email, como dice Screens.
- N-6: la frontera.

**Fuera del alcance, anterior a esta subfase**: RepositoryStructure dice que `module-boundary` aplica la configuración «a los 20 casos de esta tabla», y hoy son 47.

## Cierre de la subfase 22.2, 2026-10-15

Cierra el 2026-10-15, después del recorrido del usuario en producción («Listo, esta todo perfecto») y de la conciliación contra la base.

- **AC-1 a AC-14 cumplidos**, con el desvío aprobado (`suppliers` en `identity-schema.test.ts` y en la lista de `audit.test.ts`). AC-12 se cumple con la batería de arriba y la CI; AC-14, con el despliegue y el recorrido de abajo.
- **Commit, CI y despliegue**:
  - `317750d`, la implementación. La CI 38807899061 terminó en `success` en 20 minutos al primer intento, con la suite completa, y se leyó por el SHA completo. Cubre la integración entera, que en local no se volvió a correr completa después de las correcciones de la revisión.
  - Desplegado el 2026-10-15 según [deploy/production/README.md](../../deploy/production/README.md) §Desplegar, con `55aeb1a` anotado como la versión para volver atrás. La migración `0047` se aplicó, y la última línea comparó HEAD con el SHA pedido.
  - **El clasificador de permisos del modo automático frenó el paso 3** como despliegue a producción, aunque la regla de `ssh` estaba en la configuración local: la regla no lo destraba. El usuario pasó al modo manual para ese paso y volvió al automático después.
  - Después del despliegue: el servicio, `active`; `/login` en `127.0.0.1:3000`, con `200`; 48 migraciones aplicadas; `suppliers` vacía, con `SELECT`, `INSERT` y `UPDATE` para `crm_app` y sus cuatro índices; `supplier` en `audit_entity_type`.
- **El recorrido del usuario (AC-14)**, en «Demostración Vixora». **Conciliado contra la base**, solo con lecturas:
  - un proveedor, «Importaciones Sur», activo, con teléfono, email y CUIT; ninguna otra organización tiene proveedores;
  - la auditoría: un alta con los cinco campos, una edición que guardó solo el que cambió (`cuit`), una desactivación y una reactivación, todas del proveedor y de su organización, ninguna suelta;
  - los rechazos (el nombre y el CUIT repetidos, el dígito verificador mal) no dejan filas, por diseño. Que un `viewer` no vea «Compras» no se lee en la base: lo cubren el recorrido y el end-to-end.
- **Hallazgo del recorrido, mejora posible** (fuera de este brief): el usuario probó `20-12345679-2`, cuyo verificador es 4, y el mensaje es el mismo que el de una cantidad de dígitos equivocada. Separarlo en dos («El dígito verificador no corresponde a este CUIT») ayudaría. Sin decisión del usuario todavía.
- **Revisión**: la independiente (arriba). La batería, el despliegue, la conciliación y este cierre son autoevaluación declarada.
- **Autorizaciones usadas**, cada una en su turno: el desvío de los dos tests de esquema; el commit con su push; el despliegue y el paso a «En proceso»; el cierre con su commit y el paso a «Completado».
- **Nivel**: validado localmente y en CI, validado en integración para las pantallas, desplegado en producción y recorrido por el usuario en la organización de demostración. No es «preparado para producción».
- **Volver a `55aeb1a`**: el código no conoce `suppliers` ni el valor `supplier` del enum, pero ninguna otra tabla los referencia todavía. La tabla y el valor quedarían sin uso; las pantallas de compras desaparecen.
