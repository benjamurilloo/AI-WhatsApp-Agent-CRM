---
schema: task-brief.v1
task_id: 5.1
task_type: implementation
generated_at: 2026-09-16
---

# Brief: 5.1 — Migración de clientes

## Objetivo

1. Crear en PostgreSQL la tabla `clients` de [DataModel.md](../architecture/DataModel.md), con la unicidad parcial del teléfono por organización ([ADR 0007](0007-identificador-de-cliente-solo-telefono.md), FR-CLI-07), sus constraints e índices.
2. Otorgar sus privilegios a `crm_app` ([ADR 0013](0013-rol-de-aplicacion-y-tablas-de-solo-insercion.md)).
3. Validar cada invariante **localmente y en CI** contra PostgreSQL real, intentando violarlo.

Es una subfase de esquema: no crea servicios, casos de uso, pantallas ni seeds. Esos llegan en la 5.2 (servicio) y la 5.3 (pantallas 6 y 7).

## Ubicación en la Fase 5

- **Orden previsto**: **5.1** → 5.2 → 5.3.
- **Notion**: "Tabla `clients` con unicidad parcial de teléfono por organización". Estado: "En proceso" desde el 2026-09-16.
- **Necesario ahora**: tabla, constraints, índices, privilegios y sus tests.
- **Pendientes de la fase que esta subfase adelanta en parte**: H-3 (búsqueda por prefijo o por contenido) necesita decidir el índice de nombre ahora (D-2). H-5 (test de enmascarado para `viewer`) no se toca: es de la 5.2 y la 5.3.
- **Fuera de esta fase**: la clave foránea `conversations.client_id` (Fase 6) y conectar la aplicación con `crm_app` (Fases 8 y 9).
- **Gates de entrada**:
  1. Fase 4 cerrada, con CI en verde en `d05756e` (ejecución 35103706114).
  2. Contenedor de PostgreSQL en marcha.
  3. **Autorización para ejecutar las migraciones** contra la base local de desarrollo. Las bases `_test` y `_e2e` se recrean solas en cada ejecución.

## Hallazgos de la verificación previa (2026-09-16)

1. **Estado**: `main` limpio en `d05756e`, igual que `origin/main`. Migraciones existentes: 0000 a 0007.
2. **Módulo dueño**: Overview asigna los clientes a `crm`, que depende solo de `organizations`. La carpeta `src/modules/crm/` no existe. Nace solo con `schema.ts`, como `catalog` en la 4.1.
3. **El formato del teléfono no está restringido en la base.** DataModel dice "formato E.164" en `phone_e164`, pero no tiene `CHECK`. La unicidad compara texto: `+5491155551234` y `+54 9 11 5555-1234` serían dos clientes distintos con el mismo número. Se resuelve en D-1.
4. **El índice de nombre de DataModel distingue mayúsculas**: `(organization_id, display_name text_pattern_ops)`. En la 4.2 (D-3) productos pasó a `lower(name) text_pattern_ops` para resolver H-3. Se resuelve en D-2.
5. **La unicidad del teléfono alcanza también a los clientes inactivos**, tal como está escrita (`WHERE phone_e164 IS NOT NULL`). Un cliente desactivado sigue reteniendo su número. DataModel no dice si es intencional. Se resuelve en D-3.
6. **`clients` todavía no tiene quién la referencie.** En la Fase 6, `conversations.client_id` la va a referenciar, y la convención de la 4.1 (D-3) pide una clave foránea compuesta hacia un `UNIQUE(organization_id, id)` del dueño. Se resuelve en D-4.
7. **Drizzle 0.45.2 expresa índices únicos parciales** (`uniqueIndex(...).on(...).where(sql\`...\`)`), `check()` e índices por expresión con `text_pattern_ops`, como ya se usó en la 4.1 y la 4.2. Los privilegios necesitan una migración a medida, como la `0005`.
8. **Tests existentes que hay que tocar**: `identity-schema.test.ts` exige la lista exacta de tablas en `public`, y hay que sumar `clients`. El test de cobertura de privilegios de `audit.test.ts` detecta la tabla nueva sin cambios: `clients` es escribible, así que no va a `INSERT_ONLY_TABLES`.
9. **`audit_logs` ya admite `client`** como `entity_type`. No hace falta tocar sus enums.
10. **`resetDatabase` vacía todas las tablas de `public`**, así que `clients` entra sola. El `beforeEach` de los end-to-end borra organizaciones distintas de la del seed, y ningún end-to-end crea clientes, así que `ON DELETE RESTRICT` no lo bloquea.
11. **Texto vacío en `display_name`**: siguiendo la 4.1 (D-5), los campos editables vacíos los valida el servicio, que también recorta espacios. No se suma `CHECK`. No es una decisión nueva, es la convención vigente.

## Alcance incluido

1. Registrar la resolución de D-1 a D-4.
2. **`src/modules/crm/schema.ts`** con `clients`:
   - columnas de DataModel: `id`, `organization_id`, `display_name`, `phone_e164`, `notes`, `is_active`, `created_at`, `updated_at`;
   - `organization_id` con `ON DELETE RESTRICT`;
   - `updated_at` con `$onUpdate`;
   - índice único parcial `clients_organization_phone_unique` sobre `(organization_id, phone_e164)` con la condición de D-3;
   - índice de nombre según D-2;
   - `CHECK` del formato del teléfono según D-1;
   - lo que pida D-4.
3. **Migraciones**:
   - `drizzle/0008_*`, generada por `drizzle-kit generate`;
   - `drizzle/0009_*`, a medida (`--custom`): `GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE clients TO crm_app`. Las migraciones anteriores no se modifican.
4. **Tests de integración** en `tests/integration/clients-schema.test.ts`, con SQL directo:
   - defaults: `id`, `is_active = true` y timestamps; `phone_e164` y `notes` admiten `null`;
   - `NOT NULL` de `organization_id` y `display_name` → `23502`;
   - teléfono repetido en la misma organización → `23505` con el nombre del índice; el mismo teléfono en otra organización se acepta; varios clientes sin teléfono en la misma organización se aceptan;
   - el caso de D-3: teléfono repetido entre un cliente inactivo y uno nuevo;
   - teléfonos fuera de formato (espacios, guiones, sin `+`, con `+0`, más de 15 dígitos, texto vacío) → `23514`, y un E.164 válido se acepta;
   - organización inexistente → `23503`, y borrar una organización con clientes → `23001`;
   - `clients` como `crm_app` (`SET LOCAL ROLE`): `SELECT`, `INSERT`, `UPDATE` y `DELETE` permitidos;
   - lo que pida D-4, si corresponde.
5. **Tests existentes**, solo en lo indicado: `identity-schema.test.ts` suma `clients` a la lista exacta de tablas.
6. **Documentación**:
   - DataModel: estado de `clients`, módulo dueño, resoluciones de D-1 a D-4 y la convención de la línea "Los esquemas viven en el módulo dueño";
   - TraceabilityMatrix: índices según D-2 y D-3, y H-3 como resuelto para clientes si D-2 lo resuelve;
   - Risks: H-3 cerrado para clientes, si D-2 lo resuelve;
   - TestingStrategy: invariantes de esquema de clientes cubiertos;
   - RepositoryStructure: fila de la 5.1 y la carpeta `crm/`;
   - la tabla de módulos de Overview no cambia.

## Alcance excluido

- Servicio, casos de uso, normalización de la entrada del teléfono e interfaz pública (`index.ts`) de `crm`: 5.2.
- Enmascarado del teléfono para `viewer` y su test (H-5): 5.2 y 5.3.
- Consultas de búsqueda y listado: 5.2.
- Pantallas 6 y 7: 5.3.
- Última interacción y conversaciones del cliente (FR-CLI-04): Fase 6.
- La tabla `conversations` y su clave foránea hacia `clients`: Fase 6.
- Seeds de clientes o de volumen.
- Cambios en `audit_logs`, en sus enums o en `recordAudit`.
- Columnas que DataModel no declara (documento, código interno, email, dirección): ADR 0007 y FR-CLI-05.
- Exportación o eliminación de datos de un cliente (NonFunctionalRequirements): Fase 8.
- Conectar la aplicación con `crm_app`: Fases 8 y 9.

## Archivos o componentes autorizados

Lista cerrada:

- `src/modules/crm/schema.ts`.
- `drizzle/0008_*.sql`, `drizzle/0009_*.sql` y los archivos de `drizzle/meta/` que genera Drizzle Kit.
- `tests/integration/clients-schema.test.ts`.
- `tests/integration/identity-schema.test.ts`, solo en lo que dice el punto 5.
- Los documentos del punto 6.
- Este brief y su fila en `docs/decisions/README.md`.
- `CHANGELOG.md` y `HANDOFF.md`, al cerrar la subfase.

## Fuentes de verdad

1. [DataModel.md](../architecture/DataModel.md): reglas de diseño 1 a 14 y tabla `clients`.
2. [ADR 0007](0007-identificador-de-cliente-solo-telefono.md) y [ADR 0013](0013-rol-de-aplicacion-y-tablas-de-solo-insercion.md).
3. [FunctionalRequirements.md](../product/FunctionalRequirements.md): FR-CLI-01 a 07.
4. [brief-1.3](brief-1.3-decisiones-de-producto-abiertas.md), D-1 y D-4.
5. [Overview.md](../architecture/Overview.md): módulos y dependencias.
6. [TraceabilityMatrix.md](../architecture/TraceabilityMatrix.md): índices de las pantallas 6 y 7, H-3 y H-5.
7. [brief-4.1](brief-4.1-migraciones-de-catalogo-e-inventario.md) (precedente de migración) y [brief-4.2](brief-4.2-servicio-de-catalogo.md), D-3 (búsqueda por prefijo).

## Dependencias

- Fase 4 cerrada.
- Contenedor de PostgreSQL en marcha.
- Autorización para `npm run db:migrate` contra la base de desarrollo.

## Resolución (2026-09-16)

El usuario aprobó el brief con D-1 a D-4 según la recomendación: (a) en D-1, D-2 y D-3, y (b) en D-4. También autorizó ejecutar las migraciones contra la base local de desarrollo.

## Decisiones pendientes

Cada decisión trae una recomendación, no una resolución: la resuelve el usuario.

### D-1 — Formato del teléfono en la base

- **Opciones**:
  - (a) **`CHECK (phone_e164 ~ '^\+[1-9][0-9]{1,14}$')`**: solo E.164 canónico, un `+` y de 2 a 15 dígitos, el primero distinto de cero. El servicio de la 5.2 normaliza lo que escribe el usuario antes de guardar.
  - (b) **Sin `CHECK`**, como DataModel: el formato lo garantiza solo el servicio.
- **Recomendación**: (a).
  - La unicidad de FR-CLI-07 compara texto: sin forma canónica, dos escrituras del mismo número pasan como clientes distintos, y el ADR 0007 hace del teléfono el único identificador.
  - La ingestión de la Fase 6 va a escribir clientes por otro camino, y la base es la última defensa (mismo criterio que la 4.1, D-5).
  - Valida la forma, no que el número exista: validar por país queda fuera del MVP.
- **Consecuencia**: DataModel registra el `CHECK`. La 5.2 define la normalización de la entrada (quitar espacios, guiones y paréntesis) y devuelve `VALIDATION_ERROR` antes de llegar a la base.

### D-2 — Índice de búsqueda por nombre (H-3)

- **Opciones**:
  - (a) **Prefijo sin distinguir mayúsculas**: índice `clients_organization_display_name_lower_idx` sobre `(organization_id, lower(display_name) text_pattern_ops)`, con `lower(display_name) LIKE 'ana%'`, igual que productos (4.2, D-3).
  - (b) **Por contenido**: extensión `pg_trgm` e índice GIN, con `ILIKE '%ana%'`.
  - (c) **Como DataModel**: `(organization_id, display_name text_pattern_ops)`, que distingue mayúsculas.
- **Recomendación**: (a).
  - Resuelve H-3 con el mismo criterio que productos, así las dos búsquedas se comportan igual en pantalla.
  - (b) suma una extensión de PostgreSQL, que habría que habilitar también en el servicio gestionado de producción, sin una necesidad demostrada con el volumen del MVP.
  - (c) obliga a escribir "Ana" con mayúscula para encontrar a "Ana".
- **Consecuencia**: DataModel, TraceabilityMatrix y Risks registran H-3 como resuelto para clientes. Buscar por apellido ("Pérez" dentro de "Ana Pérez") no encuentra nada. La búsqueda no ignora acentos, igual que productos (pendiente de la Fase 8). La búsqueda por teléfono es exacta, sobre el número completo normalizado, y la sirve el índice único de D-3.

### D-3 — Unicidad del teléfono con clientes inactivos

- **Opciones**:
  - (a) **Incluye a los inactivos**, como DataModel: `WHERE phone_e164 IS NOT NULL`. Un número pertenece a un solo cliente de la organización, activo o no.
  - (b) **Solo entre activos**: `WHERE phone_e164 IS NOT NULL AND is_active`.
- **Recomendación**: (a).
  - FR-CLI-07 y el ADR 0007 dicen que el teléfono identifica al cliente: con (b), dos filas representarían al mismo cliente, y la ingestión de la Fase 6 no sabría a cuál asociar una conversación.
  - Con (b), reactivar un cliente puede fallar por un duplicado creado mientras estaba inactivo.
  - Con (a), dar de alta un número que ya tiene un cliente inactivo devuelve `CONFLICT`. El `admin` reactiva el cliente existente, que conserva su historial.
- **Consecuencia**: la 5.2 traduce el `23505` a `CONFLICT` sobre el campo teléfono, y la 5.3 decide cómo mostrar que el duplicado está inactivo.

### D-4 — `UNIQUE(organization_id, id)` para la futura referencia compuesta

- **Opciones**:
  - (a) **Ahora**: `clients` suma `clients_organization_id_id_unique`, igual que `products` en la 4.1.
  - (b) **En la Fase 6**, en la misma migración que crea `conversations` y la clave foránea compuesta que lo usa.
- **Recomendación**: (b).
  - En la 4.1 el índice nació junto con sus dos consumidores. Acá no hay consumidor hasta la Fase 6, y DataModel (regla 6) pide índices solo para consultas concretas.
  - Sumarlo después es una migración aditiva sin backfill.
- **Consecuencia**: DataModel deja escrito, en `conversations`, que la Fase 6 suma el `UNIQUE(organization_id, id)` a `clients` y la clave compuesta `(organization_id, client_id)`, que con `client_id` nulo no se verifica.

## Invariantes

- No hay referencias a Airtable ni al repositorio del agente de WhatsApp.
- `clients` tiene `organization_id` y su clave foránea usa `ON DELETE RESTRICT`.
- Nunca hay dos clientes de la misma organización con el mismo teléfono, cualquiera sea la vía de escritura, incluido SQL directo.
- Ninguna columna fuera de las de DataModel: ni documento ni código interno (ADR 0007).
- Cada tabla de `public` tiene los privilegios esperados para `crm_app`.
- Sin código de servicio, sin `index.ts` en `crm` y sin `JOIN` entre módulos: esta subfase es solo esquema.
- Sin dependencias ni extensiones de PostgreSQL nuevas.
- `drizzle-kit generate` no produce migraciones después de la 0009.

## Criterios de aceptación

- **AC-1**: D-1 a D-4 tienen resolución del usuario con fecha.
- **AC-2**: las migraciones 0008 y 0009 se aplican sobre una base vacía y sobre la de desarrollo, y aplicarlas otra vez no hace nada.
- **AC-3**: los casos del punto 4 pasan contra PostgreSQL real, cada uno con el SQLSTATE esperado.
- **AC-4**: el test de cobertura de privilegios de `audit.test.ts` pasa sin cambios con `clients` en la base.
- **AC-5**: `npm run test` pasa completo; los tests existentes solo cambiaron en lo que indica el punto 5.
- **AC-6**: con el contenedor detenido pasan `typecheck`, `lint`, `format:check`, `test:guards`, `test:unit` y `build`, y `db:generate` no produce migraciones nuevas.
- **AC-7**: `npm run test:e2e` sigue pasando 38 de 38.
- **AC-8**: CI en verde en el commit de la subfase, incluido el paso de desfase de migraciones, verificado con `gh run view`.
- **AC-9**: `git status` muestra solo archivos autorizados, y los documentos del punto 6 reflejan las resoluciones.

## Pruebas y evidencia requerida

- **Evidencia `deterministic`**: salida de `npm run test` con los tests de integración contra PostgreSQL 18.6 real, y verificaciones con la base detenida.
- **Evidencia de CI**: ejecución en verde con el paso de desfase y la integración.

**Nivel resultante esperado**: **validado localmente y en CI** para el esquema de clientes.

**No se valida**:

- la normalización de la entrada, el `CONFLICT` del servicio ni la búsqueda (5.2);
- el enmascarado del teléfono para `viewer` (5.2 y 5.3, H-5);
- la aplicación conectada con `crm_app` (Fases 8 y 9).

La revisión es una autoevaluación (`self_assessment: true`).

## Condiciones de detención

- Si Drizzle Kit no puede generar el índice parcial, el índice por expresión o el `CHECK` y hace falta SQL a mano fuera de la 0009.
- Si algún test existente necesita cambios distintos de los del punto 5.
- Si el paso de desfase de la CI detecta diferencias después de la 0009.
- Si aparece la necesidad de código de servicio, seeds, una dependencia o una extensión de PostgreSQL.
- Antes de ejecutar migraciones contra la base de desarrollo, de commit, de push o de cambios en Notion.
