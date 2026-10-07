---
schema: task-brief.v1
task_id: "16.1"
task_type: implementation
generated_at: 2026-10-06
---

# Brief 16.1 — Etiquetas de clientes, manuales

- **Contrato**: `task-brief.v1`
- **Tipo de tarea**: `implementation`
- **Nivel de evidencia objetivo**: `deterministic` para el esquema, los privilegios, el servicio y los scripts de datos de un cliente, contra PostgreSQL real; `producer-consumer` para las pantallas (end-to-end sobre `next start`); `isolated-runtime` para el despliegue, con la migración aplicada en producción y la pantalla mirada por el usuario.
- **Nivel de validación alcanzable**: **validado localmente y en CI**, **validado en integración** para las pantallas, y **desplegado en producción** con la revisión del usuario. No es «preparado para producción» en el sentido del vocabulario del proyecto: ninguna subfase de la Fase 16 lo reclama.
- **Orden**: primera subfase de la Fase 16 ([Roadmap](../planning/Roadmap.md) §Fase 16), abierta el 2026-10-06. La 16.2 (etiquetas puestas por el agente) depende de esta: usa el mismo catálogo.
- **No abre ni cierra gate.** La revisión independiente no es obligatoria; se recomienda (D-12).
- **Estado de este documento**: **aprobado el 2026-10-06** por el usuario, con las recomendaciones de D-1 a D-13 y la precisión de D-4 del 2026-10-07; **cerrado el 2026-10-07** (§Cierre).

## Objetivo

Que quien atiende a los clientes pueda marcarlos con etiquetas — «Interesado», «Quiere señar», «Reclamo», «No interesado» y las que defina la organización — y encontrarlos después por esas etiquetas.

- Un `admin` administra el catálogo de etiquetas de su organización: crea, renombra, cambia el color, desactiva y reactiva.
- Un `admin` pone y quita etiquetas en la ficha de un cliente. Cada cambio queda auditado.
- Cualquier usuario ve las etiquetas en la lista y en la ficha, y filtra la lista por una etiqueta.

Resultado verificable: después de esta subfase, la 16.2 puede diseñar el evento del agente sobre un catálogo y unas asignaciones que ya existen, sin agregar tablas.

**«Quiere señar» es solo una etiqueta, nunca un pago** (Roadmap §Fase 16; [ADR 0016](0016-el-crm-se-amplia-hacia-un-erp-por-fases.md)). Ninguna etiqueta dispara nada.

## Lo que se verificó antes de escribir este brief

Verificado el 2026-10-06 contra el código y la documentación.

- **El CRM no tiene nada equivalente.** No hay tabla, columna ni pantalla de etiquetas. `clients` tiene `display_name`, `phone_e164`, `notes` e `is_active` ([DataModel](../architecture/DataModel.md) §`clients`; `src/modules/crm/schema.ts`). El fragmento «Explícitamente fuera de este modelo» no las excluye.
- **La lista de clientes la compone `conversations`**: `searchClientsByLastInteraction` (`conversations/service.ts:601`) pide a `crm` los ids que cumplen los filtros (`listClientOrderKeys`, `crm/service.ts:232`), los ordena por última interacción y pide las filas con `getClientsByIds` (`crm/service.ts:248`). **Consecuencia de diseño**: el filtro por etiqueta tiene que vivir en `crm`, dentro de `ClientListFilters` y de `findClientIdsByName`. Así `conversations` no conoce las etiquetas y no hace falta ningún `JOIN` entre módulos ([brief-6.3](brief-6.3-servicio-de-consulta-y-estado.md), D-1). Si los tipos obligan a tocar `conversations/service.ts`, es solo para dejar pasar el filtro (ver lista de archivos).
- **La auditoría**: `audit_entity_type` y `audit_action` (`audit/schema.ts:20-40`) no tienen valores para esto. Agregarlos es un `ALTER TYPE … ADD VALUE` aditivo, como en la `0017` y la `0018`. `recordAudit` exige `{ before, after }` con los mismos campos y valores primitivos, y reserva `before: null` para `create` (DataModel §`audit_logs`).
- **Los datos de un cliente (13.4)**: `scripts/client-data-export.ts` y `scripts/client-data-delete.ts`, con su [runbook](../runbooks/datos-de-un-cliente.md). La exportación enumera las tablas que lee, y el borrado tiene dos casos: sin conversaciones, borra la ficha; con conversaciones, la minimiza y vacía. **Una tabla nueva con datos de un cliente que esos scripts no conozcan rompe el borrado a pedido sin que nada falle.** La Fase 17 lo escribió como cuidado («cada campo entra con su cobertura en el borrado a pedido»), y vale igual acá.
- **Tests que enumeran todas las tablas**: `tests/integration/identity-schema.test.ts` y `tests/integration/audit.test.ts`. **La superficie expuesta**: `tests/guards/exposed-surface.test.ts` falla con cada Server Action nueva sin declarar, y `SecurityModel.md` lleva el recuento.
- **La convención de privilegios** pone los `GRANT` en una migración `--custom` aparte (brief-11.2). La última migración es la `0025`: esta subfase usa la `0026` (generada) y la `0027` (`--custom`).
- **El rol `viewer` no escribe nada en el CRM hoy**: ve listas y detalles sin formularios (FR-CLI-02, Screens §6 y §7). Que pueda etiquetar sería su primera escritura (D-5).

## Alcance incluido

Dos etapas (D-1).

**16.1.1 — Local**, un commit:

1. **Esquema** (migración `0026`, generada, y `0027`, `--custom`), en el módulo `crm` (D-2):
   - `client_tags`: el catálogo por organización, con nombre, color (D-4) y `is_active`;
   - `client_tag_assignments`: qué cliente tiene qué etiqueta, con claves foráneas compuestas que impiden mezclar organizaciones;
   - los valores nuevos de los enums de auditoría (D-7);
   - en la `0027`: `SELECT`, `INSERT` y `UPDATE` sobre `client_tags` para `crm_app`, **sin `DELETE`**; `SELECT`, `INSERT` y `DELETE` sobre `client_tag_assignments`, **sin `UPDATE`** (D-6).
2. **Servicio** en `crm`:
   - catálogo: listar (cualquier rol), crear, editar y desactivar o reactivar (solo `admin`), con `CONFLICT` por nombre repetido y auditoría en la misma transacción;
   - **crear las etiquetas sugeridas** en un catálogo vacío (D-3);
   - asignar y quitar una etiqueta a un cliente (solo `admin`, D-5), idempotente y auditado (D-6, D-7);
   - las etiquetas de un cliente en `getClient` y en `getClientsByIds`, y el filtro por una etiqueta en `ClientListFilters` (ver §Lo que se verificó).
3. **Pantallas** (D-9):
   - `/clientes/etiquetas` (pantalla 13, nueva): el catálogo;
   - la ficha del cliente (pantalla 7): un bloque «Etiquetas» con los chips, y para `admin` agregar y quitar;
   - la lista de clientes (pantalla 6): los chips en cada fila y el filtro por etiqueta en la URL, combinable con la búsqueda, la actividad y el orden de la 15.2.
4. **Datos de un cliente** (D-10): la exportación incluye sus etiquetas; el borrado de la ficha arrastra sus asignaciones y el vaciado las borra. El runbook lo dice.
5. **Requisitos**:
   - **FR-CLI-08**: un `admin` administra el catálogo de etiquetas de clientes de su organización. Puede crear, renombrar, cambiar el color, desactivar y reactivar, con el nombre único sin distinguir mayúsculas. Cada cambio queda auditado;
   - **FR-CLI-09**: un `admin` pone y quita etiquetas activas en un cliente. Cada cambio queda auditado en el historial del cliente;
   - **FR-CLI-10**: cualquier usuario ve las etiquetas de cada cliente en la lista y en la ficha, y filtra la lista por una etiqueta.
6. **Documentación**: `DataModel.md` (las dos tablas, los enums, los índices y la cobertura en el borrado), `FunctionalRequirements.md`, `Screens.md` (6, 7 y 13), `TraceabilityMatrix.md` y `SecurityModel.md` (recuento de la superficie).

**16.1.2 — Producción**, con autorización en su turno: la CI del commit en verde por `headSha`, el despliegue con las migraciones `0026` y `0027` según [deploy/production/README.md](../../deploy/production/README.md) §Desplegar, los recuentos de tablas iguales antes y después, y la revisión del usuario en `crm.vixoraai.app`.

## Alcance excluido

- **El agente**: ni el contrato de lectura (`read-v1`) ni el de ingestión exponen ni aceptan etiquetas. Que el agente las lea o las ponga es de la 16.2, con su contrato y su coordinación. Los tests de contrato no cambian.
- **Etiquetas en conversaciones o en productos.** Solo clientes.
- **Automatismos**: ninguna etiqueta cambia un estado, dispara un aviso ni registra un pago o una seña.
- **Borrar etiquetas del catálogo.** Se desactivan (D-8).
- **Filtrar por varias etiquetas a la vez** y las métricas por etiqueta en el dashboard. Si el uso las pide, son otra subfase.
- **Jerarquías, grupos de etiquetas o etiquetas exclusivas entre sí** («Interesado» y «No interesado» pueden convivir: decidirlo es de quien etiqueta).
- **Seeds con etiquetas** (D-13). **Datos en la migración** (D-3).
- **Los campos de cliente de la Fase 17** (email, documento, segmento…). El segmento, en particular, **no** es una etiqueta: se decide en la 17.
- **Las acciones rápidas del menú «…»** de cada fila (Roadmap §Fase 16: sin definir todavía).
- **Staging.** Esta subfase no se ensaya allá: la migración es aditiva y el despliegue sigue el procedimiento de la 15.x.

## Archivos autorizados

Crear o modificar solo estos. Tocar cualquier otro es una condición de detención.

- `drizzle/0026_*.sql` (generada con `drizzle-kit generate` y revisada a mano), `drizzle/0027_*.sql` (`--custom`) y `drizzle/meta/*`
- `src/modules/crm/`: `schema.ts`, `repository.ts`, `service.ts`, `index.ts`, `service.test.ts`, y como mucho un archivo nuevo para la paleta (`tag-colors.ts`) con su test
- `src/modules/audit/schema.ts`: **solo** los valores nuevos de los enums
- `src/modules/conversations/service.ts`: **solo** si el tipo del filtro no pasa solo hasta `listClientOrderKeys`; sin lógica de etiquetas
- `src/app/(autenticado)/clientes/`: la lista, sus `filters.ts`, `actions.ts`, `messages.ts` y sus tests; la ficha `[clientId]/` (página, un componente nuevo de etiquetas y `audit-summary.ts` con su test, para mostrar los cambios de etiqueta); y `etiquetas/` (nueva)
- `src/app/_components/`: un componente de chip de etiqueta (nuevo) y `icons.tsx` **solo** para un ícono de etiqueta copiado de Lucide
- `src/app/globals.css`: **solo** los tokens de los colores de etiqueta, en claro y en oscuro (D-4)
- `scripts/client-data-export.ts`, `scripts/client-data-delete.ts` y `docs/runbooks/datos-de-un-cliente.md` (D-10)
- `tests/integration/client-tags.test.ts` (nuevo), `tests/integration/client-data.test.ts`, `tests/integration/identity-schema.test.ts` y `tests/integration/audit.test.ts` (**solo** las tablas nuevas en sus listas)
- `tests/guards/exposed-surface.test.ts`: **solo** las Server Actions nuevas
- `tests/e2e/client-tags.spec.ts` (nuevo); `tests/e2e/clients.spec.ts` **solo** si una aserción existente cambia, y cada cambio se declara
- `docs/architecture/DataModel.md`, `TraceabilityMatrix.md` y `SecurityModel.md`; `docs/product/FunctionalRequirements.md` y `Screens.md`
- al cerrar: este brief, `docs/decisions/README.md`, `docs/planning/Roadmap.md` (estado de la 16.1), `CHANGELOG.md` y `HANDOFF.md`

*Ampliada el 2026-10-06 con autorización del usuario*, durante la 16.1.1:

- `tests/integration/crm.test.ts`: **solo** `tags: []` en la expectativa de `getClient`, que compara el cliente completo;
- `tests/e2e/clients.spec.ts`, `conversations.spec.ts`, `dashboard.spec.ts`, `dashboard-sin-ingestion.spec.ts`, `ingestion.spec.ts` y `security-headers.spec.ts`: **solo** `client_tag_assignments` en sus `TRUNCATE` de `clients`, porque PostgreSQL rechaza vaciar una tabla referenciada por otra que no se vacía en la misma sentencia.

## Fuentes de verdad

- **El código y las migraciones**: `crm` (unicidad, `CONFLICT` y la lista), `knowledge` (entidad editable sin `DELETE`, brief-11.2), `audit`, `drizzle/0009`, `0010`, `0019` y `0025`.
- **Las decisiones anteriores**: [ADR 0013](0013-rol-de-aplicacion-y-tablas-de-solo-insercion.md) (privilegios), [ADR 0014](0014-el-agente-de-whatsapp-como-consumidor-del-crm.md) (el agente consume, no define), [ADR 0015](0015-vaciado-de-una-sola-direccion-en-tablas-de-solo-insercion.md) y [brief-13.4](brief-13.4-retencion-y-borrado.md) (datos de un cliente), [brief-6.3](brief-6.3-servicio-de-consulta-y-estado.md) (la lista compuesta), [brief-15.1](brief-15.1-identidad-visual-y-marco.md) y [brief-15.2](brief-15.2-controles-de-los-listados.md) (identidad visual y controles de la lista).
- **[DataModel](../architecture/DataModel.md)**, reglas de diseño 2, 5, 7, 8 y 9.

## Decisiones pendientes

Cada una trae una recomendación. Se pueden aprobar en bloque o cambiar cualquiera.

### D-1 — Etapas

- **(a) Recomendada: dos etapas**, 16.1.1 local con un commit y 16.1.2 en producción, como las subfases de la Fase 15. La primera migración nueva desde la `0025` merece su propio paso, con los recuentos antes y después.
- (b) Una sola etapa con el despliegue incluido. Mezcla la revisión del código con el efecto en producción.

### D-2 — Forma del modelo

- **(a) Recomendada: catálogo y asignaciones**, en `crm`:
  - `client_tags`: `id`, `organization_id`, `name` (1 a 40 caracteres, recortado), `color` (D-4), `is_active`, `created_at` y `updated_at`. El nombre es **único por organización sin distinguir mayúsculas, también frente a las inactivas**, con un índice sobre `(organization_id, lower(name))`, como el título de `knowledge_entries`. Lleva `UNIQUE (organization_id, id)` como destino de la clave compuesta;
  - `client_tag_assignments`: `organization_id`, `client_id`, `tag_id` y `created_at`, con clave primaria `(client_id, tag_id)`. Sus claves foráneas son compuestas: `(organization_id, client_id)` → `clients (organization_id, id)`, con `ON DELETE CASCADE` porque la asignación depende del cliente (regla 5), y `(organization_id, tag_id)` → `client_tags (organization_id, id)`, con `RESTRICT`. Un índice `(organization_id, tag_id)` sirve al filtro de la lista.
  
  Quién puso la etiqueta y cuándo está en la auditoría, no en la fila.
- (b) Una columna `tags text[]` en `clients`. Es más simple, pero renombrar una etiqueta obliga a reescribir a todos los clientes, el filtro necesita un índice GIN y la 16.2 no tendría un catálogo contra el cual validar lo que mande el agente.
- (c) Un enum fijo de cuatro etiquetas. Cada etiqueta nueva sería una migración, y el Roadmap pide «las que defina la organización».

### D-3 — Las etiquetas sugeridas

- **(a) Recomendada: ningún dato en la migración.** Con el catálogo vacío, `/clientes/etiquetas` le ofrece al `admin` un botón «Crear las sugeridas», que crea en una transacción «Interesado», «Quiere señar», «Reclamo» y «No interesado», auditadas como cualquier alta. Funciona igual para las dos organizaciones de producción y para las que se creen después, sin tocar `org:create` ni el módulo `organizations`.
- (b) Una migración que las inserte en cada organización existente, más el alta de organizaciones. Mete datos en una migración de esquema y acopla `organizations` con `crm`.
- (c) Sin sugeridas: el `admin` las escribe a mano.

### D-4 — Color

- **(a) Recomendada: una paleta fija de seis colores** (gris, violeta, azul, verde, ámbar y rojo), guardada como `CHECK` sobre un texto con esos seis valores. Cada color tiene sus tokens de fondo y de texto en claro y en oscuro, con el contraste comprobado por axe en los dos temas. Sin color elegido, gris.
- (b) Color libre con selector. No se puede garantizar el contraste en los dos temas.
- (c) Sin color en la 16.1. Es lo más simple, pero las cuatro sugeridas se distinguen peor de un vistazo, que es su uso principal.

*Precisión aprobada por el usuario el 2026-10-07*, a partir de una duda de la revisión independiente: cinco de los seis colores reutilizan tokens del tema (`surface-muted`, `primary-soft`, `success-soft`, `warning-soft` y `danger-soft`), que ya pasan el contraste en los dos temas; solo el azul tiene tokens propios (`--tag-blue-soft`). Si un día cambia la paleta del tema, cambian también las etiquetas.

### D-5 — Quién etiqueta

Es la decisión de producto más importante del brief.

- **(a) Recomendada: solo `admin`**, para el catálogo y para las asignaciones. Es coherente con el modelo de roles de hoy, donde `viewer` es de solo lectura (FR-CLI-02, Screens §6 y §7), y el único cliente actual es el usuario.
- (b) `admin` administra el catálogo; **`admin` y `viewer` asignan y quitan**. Sirve si quien atiende todos los días va a tener rol `viewer`. Es la primera escritura de un `viewer` en todo el CRM: cambia `SecurityModel.md` y las pruebas de autorización, y conviene registrarla como decisión del modelo de roles.

### D-6 — Quitar una etiqueta

- **(a) Recomendada: la asignación se borra** (`DELETE` de la fila), con su auditoría en la misma transacción. Una asignación es una relación, no una entidad editable: la regla 8 (borrado lógico) es para entidades, y el historial queda en la auditoría. `crm_app` recibe `DELETE` solo sobre `client_tag_assignments`. Asignar una etiqueta que ya está, o quitar una que no está, no escribe nada y no es un error.
- (b) Una columna `is_active` en la asignación. Acumula filas muertas y duplica el historial que ya guarda la auditoría.

### D-7 — Auditoría

- **(a) Recomendada**:
  - **asignaciones**: en el historial del **cliente** (`entity_type = 'client'`, `entity_id` = el cliente), con una acción nueva, `tag_change`. El `diff` es `{ before: { tag: null }, after: { tag: "Reclamo" } }` al poner y el inverso al quitar, con el nombre que la etiqueta tenía en ese momento. Mismos campos a cada lado, valores primitivos, y `before` no es `null`: cumple la validación de `recordAudit`, como el primer precio de la 11.1;
  - **catálogo**: un tipo de entidad nuevo, `client_tag`, con las acciones que ya existen: `create` (`name`, `color`, `isActive: true`), `update` (solo lo que cambió), `deactivate` y `reactivate` (`{ isActive }`);
  - el resumen de auditoría de la ficha muestra «Etiqueta agregada: Reclamo» y «Etiqueta quitada: Reclamo».
- (b) Un `tagIds` en el `diff`. No es un valor primitivo, y el historial dejaría de leerse si la etiqueta se renombra.

### D-8 — Desactivar una etiqueta

- **(a) Recomendada**: una etiqueta inactiva **no se ofrece** para asignar ni aparece en el filtro de la lista. Los clientes que ya la tienen **la conservan**, se muestra atenuada con «(inactiva)» y un `admin` la puede quitar. Reactivarla la devuelve tal cual estaba. No se borra nunca: `crm_app` no tiene `DELETE` sobre `client_tags`.
- (b) Desactivar quita la etiqueta de todos los clientes. Es un borrado masivo, difícil de deshacer, desde un botón del catálogo.

### D-9 — Pantallas

- **(a) Recomendada**:
  - **pantalla 13, `/clientes/etiquetas`**: la lista del catálogo, con chip, nombre, estado y cantidad de clientes activos que la tienen. Un `admin` crea, edita nombre y color, desactiva con confirmación y reactiva, como en la información del negocio. Un `viewer` ve el catálogo sin formularios. Se llega desde un botón «Etiquetas» en el encabezado de la lista de clientes, **sin ítem nuevo en el panel lateral**, porque es una configuración de Clientes;
  - **pantalla 7, la ficha**: una tarjeta «Etiquetas» con los chips. Un `admin` agrega desde un selector con las etiquetas activas que el cliente no tiene, y quita con un botón por chip, con nombre accesible («Quitar Reclamo»). Funciona con teclado y sin JavaScript, con formularios y Server Actions como el resto de la ficha;
  - **pantalla 6, la lista**: hasta tres chips por fila y «+N» si hay más; un selector «Etiqueta» junto a los filtros de la 15.2, con la etiqueta en la URL (`etiqueta=<id>`). Un id inexistente o de otra organización se ignora, como los demás filtros inválidos.
  
  Cada pantalla tiene su end-to-end con axe en claro y en oscuro, teclado y móvil a 375 px.
- (b) Administrar el catálogo desde un diálogo en la misma ficha. Rompe la convención de diálogos como páginas.

### D-10 — Datos de un cliente (13.4)

- **(a) Recomendada**:
  - **exportar**: la exportación suma las etiquetas actuales del cliente (nombre y fecha de asignación). Su historial ya sale con la auditoría del cliente;
  - **borrar la ficha** (caso A): las asignaciones se van con ella por el `ON DELETE CASCADE`. El informe previo cuenta cuántas tiene;
  - **vaciar** (caso B): el vaciado **borra las asignaciones** del cliente minimizado. «Reclamo» o «Quiere señar» son datos sobre esa persona. La auditoría de `tag_change` ya se vacía con el resto de la auditoría del cliente;
  - el runbook y `client-data.test.ts` cubren los tres caminos.
- (b) Dejar las asignaciones en el vaciado. Una ficha minimizada seguiría diciendo «Reclamo».

### D-11 — Límites

- **(a) Recomendada**: hasta **50 etiquetas activas por organización** y **10 por cliente**, controlados en el servicio con `VALIDATION_ERROR` y un mensaje claro. Mantienen usables el selector, la fila de la lista y el filtro. Subirlos es un cambio de una constante.
- (b) Sin límites.

### D-12 — Revisión independiente

- **(a) Recomendada: sí**, al terminar la 16.1.1 y antes del commit. Toca el modelo de datos, da el primer `DELETE` nuevo a `crm_app` desde la 13.4 y cambia los scripts del borrado a pedido. Las tres últimas revisiones (13.4, 15.2 y 15.3) encontraron entre 5 y 14 hallazgos reales.
- (b) Solo autoevaluación declarada, porque no cierra gate.

### D-13 — Datos de ejemplo

- **(a) Recomendada: ningún seed.** Cada end-to-end crea sus etiquetas, y en desarrollo se usan las sugeridas (D-3).
- (b) Etiquetas en `seeds/basic.ts`. Los end-to-end reponen ese seed antes de cada caso, así que se mezclarían con las de cada spec.

## Invariantes

1. **Aislamiento por organización en la base**, no solo en el servicio: una asignación no puede unir un cliente y una etiqueta de organizaciones distintas, por las claves compuestas. Un test lo intenta con SQL directo y la base lo rechaza.
2. Cada asignación, cada retiro y cada cambio del catálogo escriben su auditoría **en la misma transacción**. Una operación que no cambia nada no escribe auditoría.
3. `crm_app` **no** tiene `DELETE` sobre `client_tags` ni `UPDATE` sobre `client_tag_assignments`. Los privilegios del resto de las tablas no cambian.
4. **Los contratos con el agente no cambian**: `read-v1`, `ingestion-v1` e `ingestion-v2`, y sus tests, quedan en verde sin tocarse.
5. **El enmascarado del teléfono para `viewer` (FR-CLI-06) no cambia** en la lista ni en la ficha.
6. Las migraciones son **aditivas**: no modifican ni borran ninguna fila existente. Volver a `0cbe314` no exige deshacerlas, porque el código anterior no lee ni escribe las tablas nuevas.
7. `conversations` no importa nada de las etiquetas, salvo el tipo del filtro que ya recibe de `crm`. La frontera de módulos de ESLint sigue en verde.
8. El borrado a pedido de la 13.4 sigue sin dejar datos del cliente fuera de su alcance (D-10).

## Criterios de aceptación

**16.1.1**

- **AC-1**: las migraciones `0026` y `0027` crean las dos tablas, sus restricciones, sus índices y los valores de los enums de auditoría, y otorgan exactamente los privilegios de D-6. Un test lo comprueba contra `information_schema` / `pg_catalog`, y `identity-schema.test.ts` y `audit.test.ts` cuentan las tablas nuevas.
- **AC-2**: una asignación entre un cliente y una etiqueta de organizaciones distintas la rechaza PostgreSQL (invariante 1).
- **AC-3** (FR-CLI-08): un `admin` crea, edita, desactiva y reactiva etiquetas. El nombre repetido, sin distinguir mayúsculas y también frente a una inactiva, devuelve `CONFLICT` en el campo. Un nombre vacío o de más de 40 caracteres y un color fuera de la paleta devuelven `VALIDATION_ERROR`. Un `viewer` recibe `FORBIDDEN`.
- **AC-4** (D-3): «Crear las sugeridas» solo existe con el catálogo vacío y crea las cuatro en una transacción, con cuatro entradas de auditoría `create`.
- **AC-5** (FR-CLI-09): asignar y quitar son idempotentes, solo para `admin` y solo con etiquetas activas al asignar. Cada cambio real escribe un `tag_change` con el `diff` de D-7 en el historial del cliente.
- **AC-6** (D-8): una etiqueta desactivada no se ofrece ni filtra, y sigue en los clientes que la tenían, marcada como inactiva.
- **AC-7** (FR-CLI-10): el filtro por etiqueta de la lista devuelve solo los clientes que la tienen, combinado con la búsqueda, la actividad y los dos órdenes de la 15.2, con el conteo y la paginación correctos. Un id ajeno o inválido se ignora.
- **AC-8** (D-11): los dos límites se aplican con `VALIDATION_ERROR`.
- **AC-9** (D-10): `client-data.test.ts` prueba que la exportación incluye las etiquetas, que el borrado de la ficha se lleva sus asignaciones y que el vaciado las borra. El runbook lo describe.
- **AC-10**: las pantallas 6, 7 y 13 cumplen D-9. Su end-to-end pasa con axe sin violaciones en claro y en oscuro, con el teclado y a 375 px, y comprueba que un `viewer` no ve ningún control de escritura.
- **AC-11**: los colores de D-4 pasan el contraste de axe en los dos temas.
- **AC-12**: `exposed-surface.test.ts` declara las Server Actions nuevas, y `SecurityModel.md` actualiza el recuento.
- **AC-13**: los invariantes 3 a 5 y 7 se comprueban: los tests de contrato del agente pasan sin cambios, y el enmascarado sigue cubierto por sus tests.
- **AC-14**: la batería completa de la CI pasa en local (`format:check`, `lint`, `typecheck`, unitarios, integración, guardas, `build` y end-to-end), y después en la CI del commit, leída por `headSha`.
- **AC-15**: la documentación de §Alcance incluido, punto 6, está actualizada, con los tres FR y cada uno nombrado en el caso de test que lo prueba.
- **AC-16** (D-12, si se aprueba): la revisión independiente se hace antes del commit, y cada hallazgo se verifica contra el código y se resuelve o se eleva al usuario.

**16.1.2**

- **AC-17**: con autorización, `0026` y `0027` se aplican en producción. `/login` responde `200`, los recuentos de las tablas existentes son iguales antes y después, y las dos tablas nuevas existen vacías.
- **AC-18**: el usuario recorre en producción el catálogo (con «Crear las sugeridas»), la ficha y el filtro, y aprueba el cierre.

## Pruebas y evidencia requerida

- `deterministic`: los tests de integración de `crm`, de la auditoría y de los datos de un cliente, contra PostgreSQL 18 real. Una corrida de mutación por cada defensa: quitar la clave compuesta (AC-2 tiene que fallar), otorgar `DELETE` sobre `client_tags` (AC-1 tiene que fallar) y no borrar las asignaciones en el vaciado (AC-9 tiene que fallar).
- `producer-consumer`: los end-to-end de las tres pantallas sobre `next start`.
- `isolated-runtime`: la 16.1.2 en producción, con los comandos y las salidas registrados en el brief, sin secretos ni IP.
- Cada afirmación del cierre usa el vocabulario de `CLAUDE.md`. Las pantallas no se declaran «funcionan» sin decir en qué nivel.

## Condiciones de detención

Parar y reportar, sin seguir, si:

- hace falta tocar un archivo fuera de la lista;
- el filtro por etiqueta exige que `conversations` lea las tablas de etiquetas o haga un `JOIN` con `crm`;
- `recordAudit` rechaza la forma de `diff` de D-7;
- algún test de contrato con el agente cambia de resultado;
- el vaciado o el borrado de la 13.4 no pueden cubrir las asignaciones sin cambiar sus triggers o el ADR 0015;
- `drizzle-kit generate` produce cambios en tablas existentes, además de los dos enums.

Y siempre **antes de**: el commit de la 16.1.1, el push, cada paso sobre producción (las migraciones y el despliegue), los cambios de estado en Notion y el cierre. Cada uno necesita autorización explícita en su turno.

## Cierre de la subfase 16.1, 2026-10-07

### 16.1.1 — Local

- **Commit**: `b5544d6` (CI 37553649605, `success`, leída por `headSha`; incluye el end-to-end), autorizado por el usuario. 53 archivos; fuera, `.claude/settings.json` y `scripts/migrar.ts`, que solo difería en los finales de línea.
- **Batería local**: formato, lint, tipos y build limpios; Vitest 1.781 casos, con la única falla de la guarda de superficie expuesta mientras `etiquetas/actions.ts` no estaba en el índice (con el archivo en el índice, las 16 guardas dan 485 de 485); Playwright 125 de 125 sobre `next start`.
- **Mutaciones**, todas en rojo y restauradas: M1, sin las claves compuestas de la `0026` (falla AC-2); M2, `DELETE` sobre `client_tags` en la `0027` (fallan 5 casos); M3, el vaciado sin borrar las asignaciones (falla el caso 19 de `client-data`); M4, la asignación sin `FOR SHARE` (falla la carrera con la desactivación); M5, la `0026` sin el índice del filtro (falla el caso del catálogo).
- **Revisión independiente (D-12, AC-16)**, de solo lectura, por un agente que no participó: 8 hallazgos (1 medio, 7 bajos) y 3 dudas, todos verificados contra el código:
  - 1 (medio), faltaban el teclado y los 375 px de la ficha: caso end-to-end 6. Destapó `scrollable-region-focusable` en el historial de auditoría compartido ([audit-card.tsx](../../src/app/_components/audit-card.tsx), de la 15.4), corregido con foco y nombre;
  - 2, paginación y orden del filtro sin probar: casos nuevos;
  - 3, el índice y los enums no se comprobaban contra el catálogo: caso nuevo;
  - 4, asignar mientras otro admin desactiva dejaba la etiqueta puesta: la asignación lee la etiqueta con `FOR SHARE`, con su test de concurrencia;
  - 5, el nombre del caso 3 decía «seis colores»: corregido;
  - 6, la CSP de la pantalla 13 no se probaba: sumada a `security-headers.spec.ts`;
  - 7, recuentos desactualizados en `SecurityModel.md`, `TestingStrategy.md` y `recorrer-pantallas.ts`: corregidos;
  - 8, la ampliación de la lista de archivos no estaba registrada: §Archivos autorizados;
  - dudas: D-4 (precisión aprobada arriba), `scripts/migrar.ts` (solo finales de línea, confirmado con `git diff --ignore-cr-at-eol`) y el límite de 50 en FR-CLI-09 (pasado a FR-CLI-08).
- **Archivos fuera de la lista**, autorizados por el usuario: los de §Archivos autorizados, más `audit-card.tsx`, `security-headers.spec.ts` (más allá del `TRUNCATE`), `scripts/recorrer-pantallas.ts` y `docs/development/TestingStrategy.md`.

### 16.1.2 — Producción

- **Despliegue de `b5544d6`**, autorizado por el usuario y corrido por el asistente en modo manual, después de que el clasificador de permisos lo bloqueara en modo automático. Pasos 1 a 3 de [deploy/production/README.md](../../deploy/production/README.md) §Desplegar: la CI del SHA en `success`; anotado `0cbe314` en el registro de despliegues; dependencias (12:38:55 UTC), migraciones (12:39:18, «Migraciones aplicadas»), build (12:39:21), reinicio (12:40:48) y HEAD igual al SHA pedido (12:40:49).
- **AC-17**, recuentos de `crm_production` en una transacción de solo lectura (`sudo -u postgres psql`), todas las tablas de `public` en orden alfabético:

  ```
  2026-10-07T01:07:01Z 26 migraciones
  audit_logs=23 clients=1 conversations=2 ingestion_credentials=7 ingestion_events=55 ingestion_rate_windows=3 inventories=4 inventory_movements=4 knowledge_entries=3 login_attempts=0 messages=37 organization_members=2 organizations=2 product_prices=6 products=5 sessions=2 users=2
  2026-10-07T12:41:04Z 28 migraciones
  audit_logs=23 client_tag_assignments=0 client_tags=0 clients=1 conversations=2 ingestion_credentials=7 ingestion_events=55 ingestion_rate_windows=3 inventories=4 inventory_movements=4 knowledge_entries=3 login_attempts=0 messages=37 organization_members=2 organizations=2 product_prices=6 products=5 sessions=2 users=2
  ```

  Las 17 tablas existentes, iguales; las dos nuevas, vacías. `crm_app` tiene `INSERT, SELECT, UPDATE` sobre `client_tags` y `DELETE, INSERT, SELECT` sobre `client_tag_assignments` (D-6); `tag_change` y `client_tag` existen en sus enums; 5 índices en las dos tablas. El servicio, `active` con `NRestarts=0`; `/login`, `200`; `/clientes/etiquetas` sin sesión, `307` a `/login`. Para volver atrás, `0cbe314`: las dos migraciones solo agregan.
- **AC-18**: el usuario recorrió en producción el catálogo, la ficha y el filtro, los dio por correctos y aprobó el cierre el 2026-10-07.

### Resultado

- **Criterios**: AC-1 a AC-18 cumplidos.
- **Revisión**: independiente (D-12) para la 16.1.1; el resto, autoevaluación declarada.
- **Nivel**: validado localmente y en CI, validado en integración para las pantallas (`producer-consumer`) y verificado en producción por el usuario (`isolated-runtime`). No es «preparado para producción».
- **Notion**: la sesión del cierre no tuvo el conector de Notion. Pasar la tarea 16.1 (`3f1702be6f4e8135830ddd1c5d574187`) a «Completado» queda para la sesión siguiente.
