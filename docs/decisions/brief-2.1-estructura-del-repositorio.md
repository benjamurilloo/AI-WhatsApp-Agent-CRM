---
schema: task-brief.v1
task_id: 2.1
task_type: design
generated_at: 2026-09-12
---

# Brief: 2.1 — Estructura del repositorio

## Objetivo

Fijar por escrito la estructura de carpetas del repositorio y las reglas de frontera entre módulos sobre el stack aceptado ([ADR 0004](0004-stack-tecnologico-propuesto.md)), para que la 2.3, la 2.4 y la 2.5 creen cada archivo en su lugar sin decidir estructura sobre la marcha.

El resultado verificable es `docs/architecture/RepositoryStructure.md`: el árbol, dónde vive cada uno de los nueve módulos de [Overview.md](../architecture/Overview.md), cómo se hace cumplir la regla de dependencias y qué subfase crea cada parte.

## Ubicación en la Fase 2

- **Orden**: 2.2 (cerrada) → **2.1** → 2.3 → 2.4 → 2.5.
- **Por qué es solo diseño**: Git no versiona carpetas vacías, y crear carpetas de módulos sin contenido sería el "módulo especulativo" que prohíbe `CLAUDE.md`. Cada carpeta nace cuando la subfase que la usa le pone su primer archivo real. Así la 2.3 conserva una sola responsabilidad: instalar y configurar siguiendo un contrato ya aprobado, que la revisión puede contrastar.
- **Alternativa**: fusionar la 2.1 con la 2.3 y decidir la estructura al hacer el bootstrap. Se descarta en este brief porque juntaría decisiones de estructura con instalación en la misma revisión (regla 8 del [ExecutionProtocol](../development/ExecutionProtocol.md)). Si el usuario prefiere fusionarlas, este brief no se ejecuta y la 2.3 absorbe su alcance.
- **Criterio de salida de la Fase 2 que prepara**: "estructura revisada".

## Alcance incluido

1. Presentar D-1 a D-6 con opciones, recomendación y consecuencia, y registrar la resolución del usuario en este archivo.
2. Crear `docs/architecture/RepositoryStructure.md` con:
   - el árbol de carpetas y archivos de configuración del nivel raíz;
   - la ubicación de los nueve módulos y la forma interna de un módulo;
   - dónde viven rutas, handlers HTTP, esquema de base de datos, migraciones, seeds y tests;
   - cómo se hace cumplir que un módulo solo importe la interfaz pública de otro, con la excepción de `analytics`;
   - una tabla "qué crea cada subfase" (2.3, 2.4, 2.5 y el primer módulo de la Fase 3), para que ninguna carpeta se cree vacía.
3. Enlazar el documento desde `Overview.md` y `docs/README.md`, y concretar las referencias que hoy son indicativas (`/seeds o equivalente` en `TestingStrategy.md`).

## Alcance excluido

- Crear carpetas, archivos de código, `package.json`, `tsconfig.json`, configuraciones de ESLint o Drizzle: es la 2.3 y siguientes.
- Instalar dependencias.
- Decidir rutas de URL de las pantallas o nombres de endpoints más allá de `/api/health`, que ya está fijado en `Overview.md`.
- Taxonomía de errores, logging o sesión en código: se diseñaron en `Overview.md` y se implementan en la Fase 3.
- Reabrir el ADR 0002 (monolito modular) o la tabla de módulos y dependencias de `Overview.md`.
- Monorepo, workspaces o paquetes internos: un solo paquete, conforme al ADR 0002.

## Archivos o componentes autorizados

Lista cerrada:

- `docs/decisions/brief-2.1-estructura-del-repositorio.md` (este archivo) y su fila en `docs/decisions/README.md`.
- `docs/architecture/RepositoryStructure.md` (nuevo).
- `docs/architecture/Overview.md`, solo para enlazar el documento nuevo junto a las reglas de dependencia.
- `docs/README.md`, solo para enlazar el documento nuevo.
- `docs/development/TestingStrategy.md`, solo la ubicación de seeds y fixtures.
- `docs/development/EngineeringStandards.md`, solo la convención de módulos en "Convenciones de código", si una resolución la cambia.
- `CHANGELOG.md` y `HANDOFF.md`, al cerrar la subfase.

## Fuentes de verdad

1. [Overview.md](../architecture/Overview.md): módulos, dependencias y reglas de acceso. Esta subfase las ubica en carpetas; no las cambia.
2. [ADR 0004](0004-stack-tecnologico-propuesto.md) y [EngineeringStandards.md](../development/EngineeringStandards.md): stack y convenciones.
3. [TestingStrategy.md](../development/TestingStrategy.md) y [Environments.md](../development/Environments.md): niveles de test, seeds, Docker Compose y `.env.example`.
4. Documentación de Next.js 16.3 ([Project structure](https://nextjs.org/docs/app/getting-started/project-structure)) y de Drizzle Kit ([drizzle.config](https://orm.drizzle.team/docs/drizzle-config-file)), consultadas el 2026-09-12: Next.js no impone organización fuera de `app/` y admite `src/`; Drizzle Kit acepta el esquema en varios archivos por glob y genera migraciones en `drizzle/` por defecto.

## Dependencias

2.2 cerrada (commit `2b23ee7`).

## Decisiones pendientes

Cada una lleva una recomendación, que no es una resolución: la resuelve el usuario.

### D-1 — Carpeta `src/`

- **Opciones**: (a) código en `src/` y configuración en la raíz; (b) `app/` y el resto del código directamente en la raíz.
- **Recomendación**: (a). Separa el código de los archivos de configuración (Next.js, TypeScript, ESLint, Prettier, Drizzle, Vitest, Playwright, Docker Compose), que en este stack son muchos. Next.js lo soporta de forma oficial.
- **Consecuencia**: el alias `@/*` apunta a `src/*`.

### D-2 — Dónde viven los módulos

- **Opciones**:
  - (a) `src/modules/<modulo>/`, fuera de `app/`, y `src/app/` solo para rutas, layouts y handlers delgados;
  - (b) código colocado dentro de los segmentos de ruta de `app/`, en carpetas privadas `_lib`.
- **Recomendación**: (a).
  - `Overview.md` exige que los módulos de dominio no conozcan HTTP ni presentación: separarlos físicamente de `app/` hace visible la frontera.
  - Varias pantallas usan más de un módulo (la ficha de cliente usa `crm`, `conversations` y `audit`), así que colocar por ruta obligaría a elegir un dueño arbitrario.
- **Consecuencia**: una página o un `route.ts` llama a la interfaz pública del módulo y traduce errores tipados a HTTP; no contiene lógica de negocio.

### D-3 — Forma interna de un módulo y esquema de base de datos

- **Opciones**:
  - (a) cada módulo tiene `index.ts` (interfaz pública: servicios y tipos exportados), `service.ts`, `repository.ts`, `schema.ts` (sus tablas de Drizzle) y `types.ts`; Drizzle Kit lee `src/modules/*/schema.ts`;
  - (b) igual, pero con todo el esquema centralizado en `src/db/schema/`.
- **Recomendación**: (a). `Overview.md` dice que cada módulo posee sus tablas y expone su propio repositorio: el esquema junto al módulo lo materializa. Las claves foráneas entre módulos (por ejemplo, hacia `organizations`) importan la tabla desde el `schema.ts` del módulo dueño, y esa es una dependencia ya declarada en la tabla de `Overview.md`.
- **Consecuencia**: un módulo crece a subcarpetas solo cuando un archivo se vuelve grande, no por adelantado. El cliente de base de datos y la configuración compartida viven en `src/shared/db/`.

### D-4 — Migraciones y seeds

- **Opciones**:
  - (a) migraciones en `drizzle/` (valor por defecto de Drizzle Kit) y seeds en `seeds/`, ambos en la raíz;
  - (b) todo agrupado en `db/migrations/` y `db/seeds/`.
- **Recomendación**: (a). Usar el valor por defecto de la herramienta evita configuración y sorpresas con `drizzle-kit up` si se adopta Drizzle 1.0. `seeds/` es el nombre que ya usa `TestingStrategy.md`.
- **Consecuencia**: `TestingStrategy.md` pasa de "`/seeds` o equivalente" a `seeds/`.

### D-5 — Ubicación de los tests

- **Opciones**:
  - (a) unitarios junto al código (`*.test.ts`), integración en `tests/integration/` y end-to-end en `tests/e2e/`;
  - (b) todos los tests en `tests/`, espejando la estructura de `src/`.
- **Recomendación**: (a). El unitario se mantiene cerca de lo que prueba. Los de integración y los end-to-end necesitan base de datos o navegador y corren con otra configuración y en otro paso de CI, así que conviene separarlos físicamente.
- **Consecuencia**: la 2.3 configura Vitest con dos proyectos (unitario e integración) y Playwright apunta a `tests/e2e/`.

### D-6 — Cómo se hace cumplir la frontera entre módulos

- **Opciones**:
  - (a) regla `no-restricted-imports` de ESLint (incluida en ESLint, sin dependencia nueva) que prohíbe importar `@/modules/<otro>/<archivo interno>` y solo permite `@/modules/<otro>`; `analytics` queda exceptuado para leer esquemas ajenos;
  - (b) un plugin dedicado de fronteras (por ejemplo `eslint-plugin-boundaries`);
  - (c) solo convención y revisión.
- **Recomendación**: (a). Cubre la regla sin sumar dependencias. (c) no detecta una violación hasta la revisión, y (b) suma una dependencia para una regla que la herramienta ya resuelve.
- **Consecuencia**: la 2.3 configura la regla; la 2.5 agrega un caso que demuestre que el lint falla ante una importación prohibida, como hace con la guarda de referencias prohibidas.

## Resolución

Brief aprobado por el usuario el **2026-09-12** como subfase de diseño, sin fusionar con la 2.3. Decisiones D-1 a D-6 resueltas el mismo día, las seis según la recomendación.

| Decisión | Resolución |
|---|---|
| D-1 Carpeta `src/` | Código en `src/`, configuración en la raíz; alias `@/*` → `src/*` |
| D-2 Módulos | `src/modules/<modulo>/`; `src/app/` solo rutas, layouts y handlers delgados |
| D-3 Forma de un módulo | `index.ts`, `service.ts`, `repository.ts`, `schema.ts`, `types.ts`; cliente de base en `src/shared/db/` |
| D-4 Migraciones y seeds | `drizzle/` y `seeds/` en la raíz |
| D-5 Tests | Unitarios junto al código; `tests/integration/` y `tests/e2e/` |
| D-6 Frontera | `no-restricted-imports` de ESLint, con excepción de `analytics`; la 2.5 prueba que falla |

## Invariantes

- No se crea ninguna carpeta ni archivo fuera de la lista autorizada.
- La estructura no introduce Airtable, referencias al repositorio del agente de WhatsApp, módulos fuera del MVP ni módulos que no estén en `Overview.md`.
- Un solo paquete desplegable, conforme al ADR 0002.
- La tabla de módulos y dependencias de `Overview.md` no cambia.
- Todo sigue en nivel **diseñado**.

## Criterios de aceptación

- **AC-1**: D-1 a D-6 tienen resolución del usuario con fecha en la sección "Resolución" de este archivo.
- **AC-2**: `RepositoryStructure.md` existe con el árbol, la forma interna de un módulo, la ubicación de rutas, esquema, migraciones, seeds y tests, y la regla de frontera con su mecanismo.
- **AC-3**: los nueve módulos de `Overview.md` tienen ubicación, y ninguno aparece fuera de esa tabla.
- **AC-4**: la tabla "qué crea cada subfase" asigna cada carpeta del árbol a la subfase que le pone su primer archivo real, sin carpetas creadas vacías.
- **AC-5**: la estructura es consistente con `Overview.md`, `TestingStrategy.md`, `Environments.md` y `EngineeringStandards.md`, sin texto que la contradiga en ningún documento autorizado.
- **AC-6**: `Overview.md` y `docs/README.md` enlazan el documento nuevo, y los enlaces internos del repositorio siguen resolviendo.
- **AC-7**: `git status` muestra solo archivos de la lista autorizada y ningún archivo de código o configuración nuevo.

## Pruebas y evidencia requerida

Subfase de diseño, sin evidencia ejecutable:

- contraste de cada AC contra los archivos;
- recorrido de la tabla de módulos de `Overview.md` contra `RepositoryStructure.md`;
- `grep` de "o equivalente" y de rutas contradictorias en los documentos autorizados;
- verificador de enlaces internos;
- `git status` contra la lista autorizada.

La revisión es autoevaluación (`self_assessment: true`). Nivel resultante: **diseñado**.

## Condiciones de detención

- Antes de escribir `RepositoryStructure.md`, si alguna de D-1 a D-6 no está resuelta.
- Si una resolución contradice `Overview.md` o un ADR aceptado: se detiene y se plantea.
- Si aparece la necesidad de un módulo, carpeta compartida o paquete que no esté en `Overview.md`: se detiene y se pregunta, sin agregarlo.
- Antes de crear cualquier carpeta o archivo de código.
- Antes de commit, push o cambios de estado en Notion.
