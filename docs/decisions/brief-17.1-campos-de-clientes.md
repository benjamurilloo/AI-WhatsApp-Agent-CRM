---
schema: task-brief.v1
task_id: "17.1"
task_type: implementation
generated_at: 2026-10-08
---

# Brief 17.1 — Campos de clientes

- **Contrato**: `task-brief.v1`
- **Tipo de tarea**: `implementation`
- **Nivel de evidencia objetivo**: `deterministic` para el esquema, el servicio y los scripts de datos de un cliente, contra PostgreSQL real; `producer-consumer` para las pantallas (end-to-end sobre `next start`); `isolated-runtime` para el despliegue, con la migración aplicada en producción y las pantallas recorridas por el usuario.
- **Nivel de validación alcanzable**: **validado localmente y en CI**, **validado en integración** para las pantallas, y **desplegado en producción** con la revisión del usuario. No es «preparado para producción»: ninguna subfase de la Fase 17 lo reclama.
- **Orden**: primera subfase de la Fase 17 ([Roadmap](../planning/Roadmap.md) §Fase 17), abierta el 2026-10-08 con el orden 17.1 a 17.4 aprobado por el usuario.
- **No abre ni cierra gate.** La revisión independiente no es obligatoria; se recomienda (D-13).
- **Estado de este documento**: **aprobado el 2026-10-08** por el usuario, con las recomendaciones de D-1 a D-14; **cerrado el 2026-10-08** (§Cierre).

## Objetivo

Que la ficha de un cliente tenga los datos que la operación pide y los bocetos de la Fase 15 dibujan, cada uno con su motivo, y que la lista se pueda filtrar por ellos.

- Un `admin` carga y edita email, tipo de cliente, empresa y cargo, dirección (calle, ciudad, provincia, código postal) y segmento, todos opcionales.
- Cualquier usuario ve en la ficha los que le corresponden según su rol (D-8) y filtra la lista por tipo, provincia y segmento.
- Cada cambio queda auditado y cada campo nuevo queda alcanzado por la exportación y el vaciado de los datos de un cliente.

Resultado verificable: un cliente con todos los campos nuevos cargados, exportado y después vaciado, no conserva ninguno de ellos, y un test lo comprueba recorriendo **todas** las columnas de `clients`, no una lista escrita a mano (invariante 3).

## Lo que se verificó antes de escribir este brief

Verificado el 2026-10-08 contra el código y la documentación.

- **`clients` tiene `display_name`, `phone_e164`, `notes` e `is_active`** y nada más ([DataModel](../architecture/DataModel.md) §`clients`; `src/modules/crm/schema.ts`). El formulario de alta y edición (`clientes/client-form.tsx`) tiene esos tres campos en dos tarjetas desde la 15.4.
- **`crm_app` ya tiene `UPDATE` sobre `clients`**: agregar columnas no exige una migración de privilegios. La última migración es la `0030`; esta subfase usa **una sola**, la `0031`, generada.
- **La auditoría**: `updateClient` (`crm/service.ts:411`) registra solo los campos que cambiaron, con valores primitivos, como exige `recordAudit`. Los campos nuevos entran en la misma forma sin tocar `audit`.
- **La lista la compone `conversations`** con los ids que le da `crm` (`listClientOrderKeys`, `crm/service.ts:270`), y el filtro por etiqueta de la 16.1 ya vive en `ClientListFilters`. Los filtros nuevos siguen el mismo camino: `conversations` no los conoce (brief-6.3, D-1).
- **Los datos de un cliente (13.4)**: `scripts/client-data-export.ts` lee `select * from clients`, así que la exportación **ya incluiría** las columnas nuevas sin cambios. `scripts/client-data-delete.ts` vacía con una lista escrita a mano (`display_name`, `phone_e164`, `notes`): **una columna nueva que no se agregue ahí sobrevive al vaciado sin que nada falle**. Es el riesgo principal de la subfase y lo cubre el invariante 3.
- **El agente no lee ni escribe datos de clientes más allá del teléfono y el nombre**: `client.resolved` lleva `phone` y `display_name` ([ingestion-v2](../contracts/ingestion-v2.md)), y ninguna ruta de [read-v1](../contracts/read-v1.md) devuelve datos de un cliente.
- **El enmascarado del teléfono para `viewer`** (FR-CLI-06) se aplica en `crm` (`toClient`, `phoneForRole`): el `viewer` nunca recibe el número. Es el modelo para D-8.

### Contradicciones entre fuentes, documentadas antes de decidir

- **C-1. Documento y CUIT/CUIL contra el [ADR 0007](0007-identificador-de-cliente-solo-telefono.md) y FR-CLI-05.** El Roadmap §Fase 17 los lista como candidatos. El ADR 0007, de mayor jerarquía, dice: «No se agregan columnas de documento ni de código interno», y descarta el documento por ser «un dato personal sensible que el MVP no necesita para operar». FR-CLI-05 exige que cada dato personal sea necesario para operar. Hoy **ningún flujo del CRM usa un documento**: lo usaría el comprobante de la Fase 20 (ventas). Se resuelve en D-2, y cualquier opción que lo incluya enmienda el ADR 0007.
- **C-2. «Consumidor final» como tipo de cliente.** El Roadmap lista «persona, empresa o consumidor final». «Consumidor final» no es un tipo de persona: es una **condición frente al IVA**, del mismo grupo que «responsable inscripto» o «monotributista», y la decide el comprobante. Mezclarla con «persona» y «empresa» en un solo campo obliga a reescribirlo cuando llegue la condición fiscal. Se resuelve en D-3.
- **C-3. El segmento.** El [brief-16.1](brief-16.1-etiquetas-de-clientes.md) dejó escrito que «el segmento **no** es una etiqueta: se decide en la 17». Se decide en D-5.

Ninguna de las tres se resuelve en silencio: cada una tiene su decisión y su recomendación.

## Alcance incluido

Dos etapas (D-1).

**17.1.1 — Local**, un commit:

1. **Esquema** (migración `0031`, generada y revisada a mano), en `clients`: las columnas de D-2, todas **nulables**, con sus `CHECK` de forma (D-4, D-6). Sin tablas nuevas, sin índices nuevos (D-10) y sin datos.
2. **Servicio** en `crm`:
   - `validateClientInput`, `createClient` y `updateClient` aceptan los campos nuevos, con recorte y validación; la auditoría registra los que cambian, como hoy;
   - `getClient` y `getClientsByIds` los devuelven **resueltos para el rol** (D-8);
   - `ClientListFilters` suma `kind`, `province` y `segment`, resueltos dentro de `crm` (D-9);
   - una función de sugerencias de segmento, con los valores ya cargados en la organización (D-5).
3. **Pantallas**:
   - **el formulario** de alta y edición (pantalla 7 y «Nuevo cliente»): tarjetas nuevas «Contacto», «Empresa», «Dirección» y «Clasificación», en ese orden, debajo de las de hoy (D-11);
   - **la ficha** (pantalla 7): los mismos grupos en lectura, con «—» en lo vacío y sin las tarjetas que el rol no ve (D-8);
   - **la lista** (pantalla 6): los selectores «Tipo», «Provincia» y «Segmento» junto a los de la 15.2 y la 16.1, en la URL, combinables con la búsqueda, la actividad, la etiqueta y el orden. **Sin columnas nuevas** en la tabla.
4. **Datos de un cliente** (D-12): la exportación incluye los campos nuevos (ya los incluye por el `select *`, y un test lo fija); el vaciado los lleva a nulo; el runbook lo dice.
5. **Requisitos**:
   - **FR-CLI-12**: un `admin` carga y edita, todos opcionales, email, tipo de cliente (persona o empresa), empresa y cargo, dirección (calle y número, ciudad, provincia y código postal) y segmento. Cada cambio queda auditado en el historial del cliente;
   - **FR-CLI-13**: un `viewer` ve tipo, empresa, cargo, ciudad, provincia y segmento, y **no recibe** del servidor el email, la calle ni el código postal, como el teléfono (FR-CLI-06);
   - **FR-CLI-14**: cualquier usuario filtra la lista de clientes por tipo, provincia y segmento, combinables entre sí y con los filtros existentes;
   - **FR-CLI-05**, enmendado con fecha: la lista de datos personales que se guardan pasa a incluir los de FR-CLI-12, cada uno con su motivo (tabla de D-2).
6. **Documentación**: `DataModel.md` (las columnas, sus `CHECK`, la cobertura en el borrado y la razón de no indexar), `FunctionalRequirements.md`, `NonFunctionalRequirements.md` §Privacidad (la lista de campos que vacía el borrado), `Screens.md` (6 y 7), `TraceabilityMatrix.md` y el [runbook](../runbooks/datos-de-un-cliente.md).

**17.1.2 — Producción**, con autorización en su turno: la CI del commit en verde por `headSha`, el despliegue con la `0031` según [deploy/production/README.md](../../deploy/production/README.md) §Desplegar, los recuentos de tablas iguales antes y después, y la revisión del usuario en `crm.vixoraai.app`.

## Alcance excluido

- **Documento y CUIT/CUIL**, si se aprueba D-2 (a): van con la condición frente al IVA a la Fase 20, donde el comprobante los usa.
- **El agente**: ningún contrato cambia. Ni `read-v1` devuelve los campos nuevos ni `client.resolved` los acepta. Que el agente cargue un email o una dirección que le dicta el cliente es un cambio de contrato (`ingestion-v2` o una v3) y otra subfase, con su coordinación.
- **Varias direcciones por cliente** (envío y facturación): llegan con los pedidos de la Fase 19 si el uso las pide (D-7).
- **Buscar por email o por dirección** en el buscador de la lista. La búsqueda sigue siendo por nombre y teléfono.
- **Validar que el email exista** o mandarle algo. El CRM no envía emails (Scope).
- **Un catálogo administrado de segmentos** (tabla y pantalla propias). Si la 17.2 decide listas administradas para marcas y categorías, el segmento se revisa con el mismo criterio (D-5).
- **Columnas nuevas en la tabla de la lista**, la foto de perfil (17.3) y las pestañas de los bocetos (brief-15.4, H-2).
- **Seeds con los campos nuevos** (D-14).
- **Staging.** La migración es aditiva y el despliegue sigue el procedimiento de la 16.x.

## Archivos autorizados

Crear o modificar solo estos. Tocar cualquier otro es una condición de detención.

- `drizzle/0031_*.sql` (generada con `drizzle-kit generate` y revisada a mano) y `drizzle/meta/*`
- `src/modules/crm/`: `schema.ts`, `repository.ts`, `service.ts`, `index.ts`, `service.test.ts`, y como mucho un archivo nuevo para la lista de provincias (`provinces.ts`) con su test
- `src/modules/conversations/service.ts`: **solo** si el tipo de los filtros no pasa solo hasta `listClientOrderKeys`; sin lógica de los campos nuevos
- `src/app/(autenticado)/clientes/`: la lista (`page.tsx`), `filters.ts`, `client-form.tsx`, `actions.ts`, `messages.ts` y sus tests; `nuevo/`; la ficha `[clientId]/page.tsx` y `audit-summary.ts` con su test, para nombrar los campos nuevos en el historial
- `scripts/client-data-delete.ts`, `scripts/client-data-export.ts` (solo si el test de D-12 lo exige) y `docs/runbooks/datos-de-un-cliente.md`
- `tests/integration/crm.test.ts` (los campos nuevos en las expectativas de `getClient`, y los casos nuevos), `tests/integration/client-data.test.ts`
- `tests/e2e/client-fields.spec.ts` (nuevo); `tests/e2e/clients.spec.ts` **solo** si una aserción existente cambia, y cada cambio se declara
- `docs/architecture/DataModel.md` y `TraceabilityMatrix.md`; `docs/product/FunctionalRequirements.md`, `NonFunctionalRequirements.md` y `Screens.md`
- si se aprueba D-2 (b): `docs/decisions/0007-identificador-de-cliente-solo-telefono.md`, **solo** una enmienda fechada
- al cerrar: este brief, `docs/decisions/README.md`, `docs/planning/Roadmap.md` (estado de la 17.1), `CHANGELOG.md` y `HANDOFF.md`

## Fuentes de verdad

- **El código y las migraciones**: `crm` (validación, auditoría, enmascarado y filtros), `drizzle/0008`, `0009` y `0026`, y los dos scripts de datos de un cliente.
- **Las decisiones anteriores**: [ADR 0007](0007-identificador-de-cliente-solo-telefono.md) (identificador), [ADR 0014](0014-el-agente-de-whatsapp-como-consumidor-del-crm.md) (el agente consume), [ADR 0015](0015-vaciado-de-una-sola-direccion-en-tablas-de-solo-insercion.md) y [brief-13.4](brief-13.4-retencion-y-borrado.md) (datos de un cliente), [ADR 0016](0016-el-crm-se-amplia-hacia-un-erp-por-fases.md) (el ERP por fases), [brief-15.2](brief-15.2-controles-de-los-listados.md) (filtros y sugerencias) y [brief-16.1](brief-16.1-etiquetas-de-clientes.md) (filtro en `crm`, cobertura en el borrado).
- **[DataModel](../architecture/DataModel.md)**, reglas de diseño 2, 4, 6 y 9; **FR-CLI-05** y **FR-CLI-06**.

## Decisiones pendientes

Cada una trae una recomendación. Se pueden aprobar en bloque o cambiar cualquiera.

### D-1 — Etapas

- **(a) Recomendada: dos etapas**, 17.1.1 local con un commit y 17.1.2 en producción, como la 16.1 y la 16.4.
- (b) Una sola etapa con el despliegue incluido.

### D-2 — Qué campos entran, y con qué motivo

Es la decisión más importante del brief: cada dato personal entra con su motivo (FR-CLI-05) y quién lo carga.

- **(a) Recomendada: estos nueve, todos opcionales y cargados solo por un `admin`; documento y CUIT/CUIL quedan para la Fase 20.**

  | Campo | Columna | Motivo operativo hoy |
  |---|---|---|
  | Email | `email` | contactar al cliente fuera de WhatsApp (presupuestos, reclamos que piden un respaldo escrito) |
  | Tipo | `kind` | distinguir a quien compra para sí de una empresa, que cambia cómo se la atiende; filtro de la lista |
  | Empresa | `company_name` | saber a nombre de quién compra un contacto de empresa |
  | Cargo | `job_title` | saber con quién se habla dentro de esa empresa |
  | Calle y número | `address_line` | coordinar entregas y retiros |
  | Ciudad | `city` | entregas, y saber de dónde es la clientela |
  | Provincia | `province` | ídem, y filtro de la lista |
  | Código postal | `postal_code` | cotizar envíos |
  | Segmento | `segment` | clasificación comercial que define el negocio (mayorista, minorista…); filtro de la lista |

  Documento y CUIT/CUIL no tienen hoy ningún uso en el CRM: los usa el comprobante de la Fase 20, y entran ahí con la condición frente al IVA (C-1, C-2). Así el ADR 0007 y FR-CLI-05 quedan intactos.
- (b) Los nueve más **documento y CUIT/CUIL**, opcionales, **sin unicidad** y sin ser identificador, con una enmienda fechada del ADR 0007 («se agregan como datos, no como identificadores»). Entran a la ficha antes de que algo los use, y suben el peso de lo que hay que proteger y vaciar.
- (c) Un subconjunto más chico (por ejemplo, solo email y dirección). Se dice cuál.

### D-3 — El tipo de cliente

- **(a) Recomendada: `kind`, enum `client_kind` (`person`, `company`), nulo = «sin dato».** «Persona» y «Empresa» en pantalla. «Consumidor final» no es un tipo sino una condición frente al IVA, que llega con la Fase 20 en su propio campo (C-2). Empresa y cargo no dependen del tipo: una persona puede trabajar en una empresa.
- (b) Tres valores, `person`, `company` y `final_consumer`, como el Roadmap. Mezcla dos dimensiones y obliga a migrar el valor cuando llegue la condición fiscal.

### D-4 — La provincia

- **(a) Recomendada: una lista fija de las 24 jurisdicciones de Argentina**, guardadas con su código ISO 3166-2 (`AR-B`, `AR-C`…) y un `CHECK` sobre esos 24 valores. En pantalla, el nombre. La lista vive en `crm/provinces.ts`, la misma que valida el servicio y ofrece el selector, como la paleta de etiquetas. Sin lista, el filtro se parte entre «CABA», «Capital» y «Ciudad de Buenos Aires». **Límite**: un cliente de otro país queda sin provincia; si aparece un negocio con clientes fuera de Argentina, se agrega el país.
- (b) Texto libre con sugerencias, como la ciudad. Más flexible, pero el filtro por provincia depende de cómo se escribió.

### D-5 — El segmento (C-3)

- **(a) Recomendada: texto libre por cliente, con sugerencias de los valores ya cargados**, recortado y de hasta 60 caracteres, con el componente de sugerencias de la 15.2 y el filtro armado desde los valores existentes, **igual que la marca y la categoría de productos hoy**. Un cliente tiene a lo sumo un segmento, y por eso no es una etiqueta. Si la 17.2 decide listas administradas para marcas y categorías, el segmento se revisa con el mismo criterio, sin migrar datos a ciegas.
- (b) Un catálogo administrado por organización (tabla `client_segments` y pantalla), como las etiquetas. Es una tabla y una pantalla más antes de saber si el negocio real usa segmentos.
- (c) Una lista fija (por ejemplo, mayorista y minorista). Cada negocio segmenta distinto.

### D-6 — Forma y validación de cada campo

- **(a) Recomendada**:
  - **email**: recortado, hasta 254 caracteres, validado con la forma de email de Zod y guardado **en minúsculas**; un `CHECK` simple de forma (`position('@' in email) > 1`). **Sin unicidad**: dos clientes pueden compartir un email (una familia, una empresa), y el único identificador sigue siendo el teléfono (ADR 0007);
  - **empresa, cargo, calle, ciudad**: texto recortado, vacío se guarda como nulo, hasta 120 caracteres (calle hasta 200);
  - **código postal**: hasta 10 caracteres, letras, números y espacios, en mayúsculas (`C1425ABC`, `1425`);
  - cada `CHECK` de largo vive también en la base, como `client_tags_name_length`.
- (b) Sin `CHECK` en la base, solo validación en el servicio. Un `UPDATE` en SQL crudo podría guardar cualquier cosa.

### D-7 — Una dirección o varias

- **(a) Recomendada: una dirección, en columnas de `clients`.** Alcanza para coordinar una entrega. Varias direcciones (envío y facturación) son una tabla `client_addresses` que llega con los pedidos de la Fase 19 si el uso las pide; mover una dirección a esa tabla es una migración de datos simple.
- (b) La tabla `client_addresses` desde ahora. Es estructura antes de su uso, lo que `CLAUDE.md` prohíbe.

### D-8 — Qué ve un `viewer`

- **(a) Recomendada: los datos de contacto se tratan como el teléfono.** El email, la calle y el código postal **no salen del servidor** hacia un `viewer`: `crm` los devuelve como «oculto», igual que el teléfono enmascarado, y la ficha muestra «Solo visible para administradores». Tipo, empresa, cargo, ciudad, provincia y segmento los ve, porque los necesita para filtrar y para atender. Un test de integración y uno de end-to-end comprueban que la respuesta que recibe un `viewer` no contiene esos valores.
- (b) El `viewer` ve todo. Es más simple, pero un `viewer` vería la dirección de una persona y no su teléfono, que no tiene sentido.
- (c) El `viewer` no ve ningún campo nuevo.

### D-9 — Filtros de la lista

- **(a) Recomendada: tipo, provincia y segmento**, cada uno un selector en la URL (`tipo=`, `provincia=`, `segmento=`), combinables entre sí y con la búsqueda, la actividad, la etiqueta y los dos órdenes de la 15.2. Se resuelven en `crm`, dentro de `findClientIdsByName` y `countClients`, como la etiqueta. Un valor inválido o inexistente se ignora, como los demás filtros. El selector de segmento ofrece los valores cargados en la organización; el de provincia, solo las provincias que tiene algún cliente.
- (b) Solo tipo y provincia, sin segmento.

### D-10 — Índices

- **(a) Recomendada: ningún índice nuevo** (regla 6: solo para consultas concretas y medidas). Los filtros se combinan con el orden por última interacción que calcula `conversations`, y en el volumen de hoy (1 cliente en producción) un índice no se puede justificar con un plan. El caso de integración de los filtros corre sobre el seed de volumen y registra el tiempo; si supera el umbral de la 13.2 (754 ms por consulta), se detiene y se eleva.
- (b) Índices `(organization_id, kind)`, `(organization_id, province)` y `(organization_id, lower(segment))` desde ahora.

### D-11 — El formulario

- **(a) Recomendada**: los campos nuevos en cuatro tarjetas, debajo de las dos de hoy y en este orden: «Contacto» (email), «Empresa» (tipo, empresa, cargo), «Dirección» (calle y número, ciudad, provincia, código postal) y «Clasificación» (segmento, con sugerencias). Todos opcionales; un error de validación marca su campo y conserva lo escrito, como hoy. Funciona con teclado y sin JavaScript, con la misma Server Action. Ningún campo nuevo es obligatorio para dar de alta.
- (b) Un formulario en pestañas, como algunos bocetos. Rompe el patrón de tarjetas de la 15.4 y esconde campos.

### D-12 — Datos de un cliente (13.4)

- **(a) Recomendada**:
  - **exportar**: los campos nuevos salen en `clients`, por el `select *` actual; un test lo fija;
  - **vaciar** (caso B): la ficha minimizada pierde **todos** los campos nuevos (quedan nulos), también tipo, provincia y segmento, porque describen a la persona. El vaciado de la auditoría ya se lleva los valores de los `update` del cliente;
  - **borrar la ficha** (caso A): no cambia, la fila se borra entera;
  - **una defensa contra la próxima columna**: el test del vaciado lee las columnas de `clients` desde `information_schema` y exige que, después de vaciar un cliente con todo cargado, **toda columna nulable** quede en nulo, salvo una lista explícita de las que conservan la forma (`id`, `organization_id`, `is_active`, `created_at`, `updated_at`). Una columna que se agregue después sin cubrirla hace fallar el test.
- (b) Solo agregar las columnas nuevas a la lista del script, sin la defensa. Repite el riesgo en la próxima subfase que toque `clients`.

### D-13 — Revisión independiente

- **(a) Recomendada: sí**, al terminar la 17.1.1 y antes del commit. Toca datos personales, el enmascarado por rol y el vaciado de la 13.4; las revisiones de la 16.1, la 16.4 y la 16.6 encontraron hallazgos reales en cada una.
- (b) Solo autoevaluación declarada, porque no cierra gate.

### D-14 — Datos de ejemplo

- **(a) Recomendada: ningún seed nuevo.** Cada end-to-end carga sus campos; el seed básico sigue igual.
- (b) Campos nuevos en algunos clientes de `seeds/basic.ts`.

## Invariantes

1. **Los contratos con el agente no cambian**: `read-v1`, `ingestion-v1` e `ingestion-v2` y sus tests quedan en verde sin tocarse. `client.resolved` sigue rechazando cualquier campo que no sea `phone` y `display_name`.
2. **El teléfono sigue siendo el único identificador de negocio** (ADR 0007): ningún campo nuevo es único ni se usa para encontrar a un cliente desde la ingestión.
3. **El vaciado alcanza toda columna nulable de `clients`**, comprobado contra el catálogo de la base y no contra una lista (D-12).
4. **Un `viewer` nunca recibe** el email, la calle ni el código postal, en la lista, en la ficha ni en ninguna respuesta del servidor; tampoco el teléfono completo (FR-CLI-06, sin cambios).
5. Cada cambio de un campo nuevo escribe su auditoría **en la misma transacción**; una edición que no cambia nada no escribe auditoría.
6. La migración es **aditiva**: solo columnas nulables, sin valores por defecto que reescriban filas y sin tocar las existentes. Volver a `40253d6` no exige deshacerla, porque el código anterior no lee las columnas nuevas.
7. `conversations` no conoce los campos nuevos, salvo el tipo de los filtros que recibe de `crm`. La frontera de módulos de ESLint sigue en verde.
8. Los privilegios de `crm_app` no cambian.

## Criterios de aceptación

**17.1.1**

- **AC-1**: la `0031` agrega las columnas de D-2 con sus `CHECK` (D-4, D-6) y el enum de D-3, sin índices ni datos. Un test lo comprueba contra `information_schema` y `pg_catalog`, y `drizzle-kit generate` no produce cambios en otras tablas.
- **AC-2** (FR-CLI-12): un `admin` da de alta y edita un cliente con cada campo nuevo. Un email, un código postal, una provincia o un tipo inválidos, y un texto más largo que su límite, devuelven `VALIDATION_ERROR` en su campo. Un `viewer` recibe `FORBIDDEN` al escribir.
- **AC-3**: cada cambio real escribe un `update` del cliente con solo los campos que cambiaron; el historial de la ficha los nombra en castellano («Email», «Provincia»…).
- **AC-4** (FR-CLI-13, invariante 4): la respuesta de `getClient` y de la lista a un `viewer` no contiene el email, la calle ni el código postal de un cliente que los tiene. La mutación que devuelve el email sin resolver para el rol hace fallar el test.
- **AC-5** (FR-CLI-14): los filtros por tipo, provincia y segmento devuelven solo los clientes que cumplen, combinados entre sí y con la búsqueda, la actividad, la etiqueta y los dos órdenes, con el conteo y la paginación correctos. Un valor inválido o de otra organización se ignora.
- **AC-6** (D-5): las sugerencias de segmento son solo de la organización del usuario.
- **AC-7** (D-12, invariante 3): `client-data.test.ts` prueba que la exportación incluye los campos nuevos, que el vaciado los deja en nulo, y que **toda columna nulable** de `clients` queda en nulo después de vaciar. La mutación que no vacía `email` en el script hace fallar el test, y también la que agrega una columna nulable a `clients` sin vaciarla.
- **AC-8**: las pantallas cumplen D-8, D-9 y D-11. Su end-to-end pasa con axe sin violaciones en claro y en oscuro, con el teclado y a 375 px, y comprueba que un `viewer` no ve los controles de escritura ni los datos de contacto.
- **AC-9**: los invariantes 1, 2, 7 y 8 se comprueban: los tests de contrato del agente pasan sin cambios, y la guarda de módulos sigue en verde.
- **AC-10**: la batería completa de la CI pasa en local (`format:check`, `lint`, `typecheck`, unitarios, integración, guardas, `build` y end-to-end), y después en la CI del commit, leída por `headSha`.
- **AC-11**: la documentación del punto 6 de §Alcance incluido está actualizada, con FR-CLI-12 a 14 nombrados en el caso de test que los prueba y la enmienda fechada de FR-CLI-05.
- **AC-12** (D-13, si se aprueba): la revisión independiente se hace antes del commit, y cada hallazgo se verifica contra el código y se resuelve o se eleva al usuario.

**17.1.2**

- **AC-13**: con autorización, la `0031` se aplica en producción. `/login` responde `200`, los recuentos de todas las tablas son iguales antes y después, y las columnas nuevas existen, nulas en todas las filas.
- **AC-14**: el usuario recorre en producción el alta y la edición con los campos nuevos, la ficha y los filtros, y aprueba el cierre.

## Pruebas y evidencia requerida

- `deterministic`: los tests de integración de `crm` y de los datos de un cliente, contra PostgreSQL 18 real. Una corrida de mutación por cada defensa: el email sin resolver para el rol (AC-4), el vaciado sin `email` (AC-7), una columna nulable nueva sin vaciar (AC-7) y un filtro sin el de organización (AC-5).
- `producer-consumer`: el end-to-end del formulario, la ficha y la lista sobre `next start`.
- `isolated-runtime`: la 17.1.2 en producción, con los comandos y las salidas registrados en el brief, sin secretos ni IP.
- Cada afirmación del cierre usa el vocabulario de `CLAUDE.md`.

## Condiciones de detención

Parar y reportar, sin seguir, si:

- hace falta tocar un archivo fuera de la lista;
- un filtro exige que `conversations` lea columnas de `clients` o haga un `JOIN` con `crm`;
- algún test de contrato con el agente cambia de resultado;
- el vaciado no puede cubrir una columna nueva sin cambiar los triggers o el ADR 0015;
- `drizzle-kit generate` produce cambios en otras tablas, o propone un valor por defecto que reescriba las filas existentes;
- la consulta de la lista con los filtros supera el umbral de la 13.2 sobre el seed de volumen (D-10).

Y siempre **antes de**: el commit de la 17.1.1, el push, cada paso sobre producción (la migración y el despliegue), los cambios de estado en Notion y el cierre. Cada uno necesita autorización explícita en su turno.

## Implementación de la 17.1.1, 2026-10-08 (commit `726a88d`)

### Archivos fuera de lo previsto y aserciones existentes que cambiaron

Todos dentro de la lista autorizada; se declaran como pide §Archivos autorizados:

- `tests/e2e/clients.spec.ts`, caso 11: el alta con teclado pasa ahora por los nueve campos nuevos antes de «Cancelar» (D-11).
- `tests/integration/crm.test.ts`: el `diff` del alta registra también los nueve campos, en nulo, y `getClient` devuelve los campos nuevos y `contact`.
- `src/modules/crm/service.test.ts` y `clientes/filters.test.ts`: dos expectativas exactas suman los campos nuevos en nulo.

### Precisiones, para la aprobación del usuario

- **P-1 (D-9, AC-5)**: el servicio filtra el segmento por el valor exacto, como la marca de un producto; un segmento ajeno o inexistente da 0 resultados en `crm`. Es la pantalla 6 la que ignora un tipo, una provincia o un segmento que ningún cliente de la organización tiene, como hace con una etiqueta ajena.
- **P-2 (D-9)**: el selector «Tipo» aparece solo si algún cliente tiene tipo, como la provincia, el segmento y la etiqueta. Así la URL de una búsqueda no suma `tipo=` vacío, y los casos 3 y 4 de `clients.spec.ts` no cambian.
- **P-3 (alcance y D-8)**: el alcance dice «sin las tarjetas que el rol no ve» y D-8 dice que la ficha muestra «Solo visible para administradores». Se siguió D-8: el `viewer` ve la tarjeta «Contacto» con ese texto, y en «Dirección», la calle y el código postal con el mismo texto.
- **P-4 (D-10)**: los 10 000 clientes de la medición se generan en el test, porque el seed de volumen no tiene clientes con estos campos.

### Revisión independiente (D-13, AC-12)

De solo lectura, por un agente que no participó. 10 hallazgos (1 mayor, 2 medios, 7 menores) y 5 dudas, verificados contra el código:

1. (mayor) `DataModel.md` corrupto: el reemplazo del script de documentación interpretó el `$`` de la expresión del código postal y metió una copia del principio del archivo. **Corregido**: el archivo se restauró desde Git y el cambio se aplicó de nuevo con un reemplazo literal.
2. (medio) `clients.spec.ts` cambiado sin declarar, y el árbol cambiando durante la revisión. **Declarado** arriba; la revisión vio la corrección de P-2 a mitad de camino.
3. (medio) La medición de D-10 cubría solo los ids de `crm`. **Corregido**: mide `searchClientsByLastInteraction`, la lista entera; 66,8 ms en local. La documentación ya no da un número que el test no mide.
4. (menor) La documentación no decía que el tipo también se limita a los valores existentes. **Corregido** en FunctionalRequirements, Screens y DataModel.
5. (menor) `SuggestInput` no acepta `maxLength`, así que el del segmento no tenía efecto. **Corregido**: se quitó; el largo lo valida el servidor.
6. (menor) Los segmentos más allá de los 200 primeros no se ofrecen ni se filtran, y la lista incluye los de clientes inactivos. **Registrado** como límite en DataModel, igual que las marcas de productos.
7. (menor) «Quedan fechas, direcciones, tipos y estados» era ambiguo ahora que el cliente tiene dirección y tipo. **Corregido** en NFR, el runbook y el script.
8. (menor) El runbook decía «validado en CI» para la parte de la 17.1. **Corregido**.
9. (menor) `.claude/settings.json` sin seguimiento. No entra en el commit: se agregan los archivos por nombre.
10. (menor) El aislamiento de los tipos en las opciones no estaba probado. **Corregido**: el cliente de la otra organización tiene tipo.

Dudas: la 1 es P-3 y la 2 es P-1, las dos para el usuario; la 3 (el alta por la ingestión no registra los campos nuevos, que ahí son nulos) es correcta y no cambia nada; la 4 (`SecurityModel.md` describe la protección del `viewer` solo para el teléfono) queda **pendiente de decisión**, porque el archivo está fuera de la lista; la 5 (el segmento distingue mayúsculas) está registrada en DataModel.

### Decisiones del usuario sobre la revisión, 2026-10-08

- **P-1 aprobada**: que la pantalla 6 ignore un segmento inexistente, y `crm` lo filtre por valor exacto, cumple AC-5.
- **P-3 aprobada**: la ficha del `viewer` sigue D-8, con «Solo visible para administradores».
- **`SecurityModel.md` autorizado** fuera de la lista (duda 4): describe ahora que el email, la calle y el código postal siguen la regla del teléfono.
- Notion: la tarea 17.1 en «En proceso», con la descripción ajustada al alcance aprobado (sin documento ni CUIT/CUIL).

### Batería local de la 17.1.1 (AC-10, parte local)

- `format:check`, `lint` y `typecheck` limpios; `build` sin errores.
- Vitest: 1.909 de 1.909 (unitarios, guardas e integración). Una corrida anterior perdió el proceso de `conversations.test.ts` (código 0xC0000409, sin relación con el cambio); ese archivo solo dio 32 de 32, y la suite repetida, completa.
- Playwright: 138 de 138, en dos tandas de siete specs (66 y 72). Dos corridas de una sola tanda se cortaron porque el servidor de prueba se apagó sin error con menos de 500 MB libres en la máquina (HANDOFF §7, memoria local); una tercera, con el servidor vivo, dio 135 de 138, y las tres fallas venían del cambio y están corregidas (P-2 y el caso 11 de `clients.spec.ts`).
- Mutaciones, todas en rojo y revertidas: M1, el contacto sin resolver para el rol (falla FR-CLI-13); M2, el vaciado sin `email` (fallan los casos 28 y 29 de `client-data`); M3, una columna nulable nueva en `clients` sin vaciar (falla el caso 29); M4, los filtros sin el de organización (falla FR-CLI-14).

### CI de la 17.1.1 (AC-10, parte de la CI)

- Commit y push autorizados por el usuario: `726a88d`. La corrida 37848046092 de ese `headSha` terminó en `success`, con todos los pasos, incluido el end-to-end.

## Despliegue de la 17.1.2, 2026-10-08

- **Despliegue de `726a88d`**, autorizado por el usuario y corrido por el asistente. Pasos 1 a 3 de [deploy/production/README.md](../../deploy/production/README.md) §Desplegar: la CI del SHA en `success` (corrida 37848046092); anotado `40253d6` en el registro de despliegues; dependencias (22:01:18 UTC), migraciones (22:01:42, «Migraciones aplicadas»), build (22:01:43), reinicio (22:02:47) y HEAD igual al SHA pedido (22:02:47).
- **AC-13**, recuentos de `crm_production` en una transacción de solo lectura (`sudo -u postgres psql`), todas las tablas de `public` en orden alfabético:

  ```
  2026-10-08T22:00:58Z 31 migraciones
  audit_logs=42 client_tag_assignments=2 client_tags=5 clients=1 conversation_notes=1 conversations=3 ingestion_credentials=7 ingestion_events=122 ingestion_rate_windows=3 inventories=4 inventory_movements=4 knowledge_entries=3 login_attempts=1 messages=70 organization_members=2 organizations=2 product_prices=6 products=5 sessions=3 users=2
  2026-10-08T22:03:08Z 32 migraciones
  audit_logs=42 client_tag_assignments=2 client_tags=5 clients=1 conversation_notes=1 conversations=3 ingestion_credentials=7 ingestion_events=122 ingestion_rate_windows=3 inventories=4 inventory_movements=4 knowledge_entries=3 login_attempts=1 messages=70 organization_members=2 organizations=2 product_prices=6 products=5 sessions=3 users=2
  ```

  Las 20 tablas, iguales. Las nueve columnas nuevas de `clients` existen y son nulables; el único cliente las tiene todas en nulo. `client_kind` existe con `person,company`; los ocho `CHECK` de D-4 y D-6 están en `clients`; la `0031` no tiene `CREATE INDEX`, y `clients` tiene 4 índices después del despliegue (no se contaron antes). El servicio, `active` con `NRestarts=0`; `/login`, `200`; `/clientes` sin sesión, `307` a `/login`. Para volver atrás, `40253d6`: la migración solo agrega columnas nulables, un enum y `CHECK`.
- **AC-14**: el usuario recorrió en producción el alta y la edición con los campos nuevos, la ficha y los filtros, los dio por correctos y aprobó el cierre el 2026-10-08.

## Cierre de la subfase 17.1, 2026-10-08

- **AC-1 a AC-14 cumplidos.** AC-10 en local (§Batería local) y en la CI de `726a88d`; AC-12 con la revisión independiente de la 17.1.1; AC-13 y AC-14 en producción.
- **Revisión**: independiente para la 17.1.1 (D-13), con sus 10 hallazgos resueltos o registrados; el despliegue y este cierre son autoevaluación declarada.
- **Decisiones del usuario**: el brief con D-1 a D-14; P-1 y P-3; `SecurityModel.md` fuera de la lista; el commit y el push de `726a88d`; el despliegue; el cierre.
- **Nivel**: validado localmente y en CI, **validado en integración** para las pantallas (end-to-end sobre `next start`) y desplegado en producción, recorrido por el usuario (`isolated-runtime`). No es «preparado para producción».
- **No certifica**: que el agente lea o escriba los campos nuevos (no cambia ningún contrato); el documento y el CUIT/CUIL, que van a la Fase 20; los segmentos más allá de los 200 primeros en las opciones; la medición de D-10 en la máquina de producción, que es local (66,8 ms con 10 000 clientes).
- **Pendiente heredado**: la CI de `075ccb6` quedó en `failure` por la intermitencia del caso 8 de `products.spec.ts`; el commit siguiente, `726a88d`, pasó completo.
