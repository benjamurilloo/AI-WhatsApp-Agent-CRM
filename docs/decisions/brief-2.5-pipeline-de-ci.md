---
schema: task-brief.v1
task_id: 2.5
task_type: implementation
generated_at: 2026-09-13
---

# Brief: 2.5 — Pipeline de CI

## Objetivo

Crear un workflow de GitHub Actions que corra en cada push y cada pull request. El workflow tiene que pasar en verde, y además incluye dos guardas versionadas y ejecutables también en local:

- **Guarda de referencias prohibidas**: falla si aparece una referencia a Airtable o al repositorio del agente de WhatsApp fuera de la documentación.
- **Regla de frontera entre módulos**: demuestra que `npm run lint` falla ante una importación prohibida.

Con esta subfase se cumple el criterio de salida de la Fase 2: "lint, typecheck, test y build pasan en local y en CI; la guarda falla ante una referencia prohibida" ([Roadmap](../planning/Roadmap.md)).

## Ubicación en la Fase 2

- **Orden**: 2.2 → 2.1 → 2.3 → 2.4 (cerradas) → **2.5**. Es la última subfase: su cierre habilita el cierre de la Fase 2, que el usuario aprueba por separado.
- **Gates de entrada**, que se piden por separado de la aprobación del brief:
  1. **autorización explícita para el push** que publica el workflow y lo ejecuta en GitHub (efecto externo);
  2. autorización para instalar dependencias, **solo si** D-1 las requiere. La recomendación no agrega ninguna.
- **Dependencias**: 2.4 cerrada (commit `2105423`).

## Hallazgos de la verificación previa (2026-09-13)

1. **Remoto**:
   - `benjamurilloo/AI-WhatsApp-Agent-CRM` es privado y GitHub Actions está habilitado sin restricciones de acciones.
   - Todavía no hay workflows ni ejecuciones.
   - `gh` 2.97 tiene sesión iniciada.
2. **Sin protección de rama**: la API responde "Upgrade to GitHub Pro or make this repository public to enable this feature" (HTTP 403). En un repositorio privado del plan gratuito, la CI **informa pero no bloquea** un push ni un merge. Afecta a la regla de [EngineeringStandards.md](../development/EngineeringStandards.md) "ninguna rama se mergea sin pasar lint, typecheck, tests y build en CI". Es la decisión D-3.
3. **Versiones vigentes de las acciones**:
   - `actions/checkout` v7.0.1 (2026-07-20), commit `3d3c42e5aac5ba805825da76410c181273ba90b1`;
   - `actions/setup-node` v7.0.0 (2026-07-14), commit `820762786026740c76f36085b0efc47a31fe5020`.
4. **Menciones actuales fuera de Markdown**:
   - solo `ai-whatsapp-agent-crm`, en `package.json`, `package-lock.json` y `docker-compose.yml`. Es el nombre de **este** repositorio y la guarda debe permitirlo;
   - "Airtable" aparece únicamente en archivos `.md` (24 archivos), donde la documentación lo nombra como contexto de negocio, cosa que el [ADR 0009](0009-repositorio-remoto-github-y-ci.md) permite.
5. **La prueba de frontera de la 2.3 fue temporal**: un script fuera del repositorio que creaba y borraba archivos. ESLint 10 expone `ESLint#lintText(código, { filePath })`, que permite aplicar la configuración real a un archivo virtual sin crearlo en disco.
6. **`npm run test` requiere PostgreSQL** desde la 2.4. En CI, la base es un *service container* efímero con la misma imagen `postgres:18.6-trixie` (ADR 0009). `vitest.config.mts` solo lee `.env` si existe, así que las variables llegan por entorno.

## Alcance incluido

1. Registrar la resolución de D-1 a D-4.
2. Crear `tests/guards/` con dos tests versionados, que no usan base de datos:
   - **`forbidden-references.test.ts`**:
     - una función que detecta referencias prohibidas en un texto: `airtable` sin distinguir mayúsculas, y el nombre del repositorio del agente (`AI-WhatsApp-Agent`) cuando no sigue `-CRM`;
     - casos que demuestran que detecta cada patrón prohibido y que permite `ai-whatsapp-agent-crm`;
     - un recorrido de los archivos versionados (`git ls-files`) con el alcance de D-2, que falla y lista archivo y línea si encuentra algo.
   - **`module-boundary.test.ts`**: aplica con `ESLint#lintText` la configuración real de `eslint.config.mjs` a los 9 casos de la 2.3 como archivos virtuales. Los 6 prohibidos deben dar error de `no-restricted-imports` y los 3 permitidos, no.
3. Agregar a `vitest.config.mts` un proyecto `guards` (`tests/guards/**/*.test.ts`).
4. Agregar los scripts `test:guards` (`vitest run --project guards`) y `test:integration` (`vitest run --project integration`). `test` sigue corriendo todo.
5. Crear `.github/workflows/ci.yml`:
   - **disparadores**: `push` a `main` y `pull_request`; `concurrency` que cancela ejecuciones anteriores de la misma rama;
   - **permisos y tiempos**: `permissions: contents: read` y `timeout-minutes`;
   - **entorno**: `ubuntu-latest`, Node 24 con caché de npm, y acciones fijadas según D-4;
   - **pasos**, en orden: `npm ci` → `npm run lint` → `npm run typecheck` → `npm run format:check` → `npm run test:guards` → `npm run test:integration` contra un service container `postgres:18.6-trixie` con healthcheck → `npm run build`;
   - **variables**: `DATABASE_URL` y las del contenedor, con valores efímeros de CI declarados en el workflow. No son secretos: la base solo existe durante la ejecución.
6. Actualizar la documentación:
   - [EngineeringStandards.md](../development/EngineeringStandards.md), sección CI: el pipeline real, las guardas, la limitación de D-3 y la fijación de acciones;
   - [RepositoryStructure.md](../architecture/RepositoryStructure.md): `tests/guards/`, el proyecto `guards` y el workflow;
   - [TestingStrategy.md](../development/TestingStrategy.md): el nivel de las guardas;
   - [Risks.md](../planning/Risks.md): la fila de la guarda pasa a mitigada con evidencia, y se agrega la ausencia de protección de rama.
7. Publicar con un push autorizado y verificar la ejecución en GitHub con `gh run watch` y `gh run view`.

## Alcance excluido

- Tests end-to-end, Playwright y despliegues: son de Fases 3 y 9.
- Dependabot, CodeQL, cobertura, badges, matrices de versiones de Node y caché de `.next`.
- Secrets de GitHub Actions: no hay servicios externos (ADR 0009). La gestión de secretos es de la 9.1.
- Cambiar la visibilidad del repositorio, contratar GitHub Pro o configurar reglas de rama o rulesets.
- Una rama con una violación deliberada para ver la CI en rojo: la evidencia de que la guarda falla son los casos versionados del punto 2 (D-1).
- Corregir los avisos de `npm audit`: son de la Fase 8.
- Cualquier dependencia nueva.

## Archivos o componentes autorizados

Lista cerrada:

- `.github/workflows/ci.yml`.
- `tests/guards/forbidden-references.test.ts` y `tests/guards/module-boundary.test.ts`.
- `vitest.config.mts` (proyecto `guards`) y `package.json` (scripts del punto 4).
- `docs/decisions/brief-2.5-pipeline-de-ci.md` (este archivo) y su fila en `docs/decisions/README.md`.
- `EngineeringStandards.md`, `RepositoryStructure.md`, `TestingStrategy.md` y `Risks.md`, en lo indicado en el punto 6.
- `CHANGELOG.md` y `HANDOFF.md`, al cerrar la subfase.
- Fuera del repositorio: las ejecuciones de GitHub Actions que produce el push autorizado.

## Fuentes de verdad

1. [ADR 0009](0009-repositorio-remoto-github-y-ci.md): GitHub Actions, guarda como job que falla el build y PostgreSQL efímero como service container.
2. [Roadmap](../planning/Roadmap.md): criterios y gate de salida de la Fase 2.
3. [RepositoryStructure.md](../architecture/RepositoryStructure.md): regla de frontera y sus 9 casos.
4. [CLAUDE.md](../../CLAUDE.md): prohibiciones que la guarda vigila.
5. Documentación de GitHub Actions y de ESLint (API de Node.js), al implementar.

## Decisiones pendientes

Cada decisión trae una recomendación, no una resolución: la resuelve el usuario.

### D-1 — Cómo se implementa y se demuestra la guarda

- **Opciones**:
  - (a) **Tests de Vitest en `tests/guards/`**. La detección es una función con casos positivos y negativos versionados, más un recorrido de los archivos del repositorio. Corre igual en local y en CI, sin base de datos y sin dependencias nuevas.
  - (b) **Script `scripts/check-forbidden-references.mjs`** con su propio script npm. Suma la carpeta `scripts/`, que no está en la estructura, y la prueba de que falla quedaría manual.
  - (c) **`git grep` inline en el workflow**. Solo corre en CI, y demostrar que falla exige empujar una violación a una rama temporal.
- **Recomendación**: (a).
  - La demostración de que la guarda falla queda versionada y se repite en cada ejecución, en vez de ser un evento único.
  - La frontera de módulos usa el mismo mecanismo con `ESLint#lintText`, sin crear archivos temporales como en la 2.3.
- **Consecuencia**: `tests/guards/` pasa a formar parte de la estructura, junto a `integration/` y `e2e/`.

### D-2 — Alcance del recorrido de la guarda

- **Opciones**:
  - (a) **Todos los archivos versionados, excepto los `.md` y el propio test de la guarda**, que contiene los patrones como casos. Incluye código, configuración, workflows, `package.json` y el lockfile.
  - (b) Lo mismo, pero también los `.md` con una lista de permitidos. Hoy son 24 documentos que nombran Airtable como contexto: la lista sería larga y frágil.
  - (c) Solo `src/` y `tests/`. Deja fuera `package.json`, que es donde entraría un SDK de Airtable.
- **Recomendación**: (a). La prohibición de `CLAUDE.md` apunta a código, dependencias, variables de entorno e integraciones, no a documentación. El ADR 0009 permite que los documentos nombren el contexto de negocio.
- **Consecuencia**: una mención en un comentario de código también falla. Es intencional: obliga a mantener esas referencias en `docs/`.

### D-3 — CI sin protección de rama

- **Opciones**:
  - (a) **Aceptar la limitación y documentarla**. La CI informa en cada push y pull request. La regla "no se mergea sin CI verde" pasa a ser procedimiento: antes de cerrar una subfase se verifica con `gh run view` la ejecución del commit.
  - (b) Hacer público el repositorio. Contradice el ADR 0009.
  - (c) Contratar GitHub Pro. Tiene costo y es decisión del usuario, no técnica.
- **Recomendación**: (a). Con un solo desarrollador que trabaja sobre `main`, la protección agrega poco. Cerrar cada subfase con la CI verificada da la misma garantía de forma explícita. Se revisa si entra otra persona o antes de producción (Fase 9).
- **Consecuencia**:
  - `EngineeringStandards.md` y `Risks.md` registran la limitación.
  - El protocolo de cierre suma un criterio: la ejecución de CI del commit de cierre está en verde.

### D-4 — Fijación de las acciones de GitHub

- **Opciones**:
  - (a) **Por SHA de commit, con la versión en un comentario**: `actions/checkout@3d3c42e… # v7.0.1`;
  - (b) por tag mayor: `actions/checkout@v7`.
- **Recomendación**: (a). Un tag se puede mover y un SHA no. Es la práctica que recomienda GitHub para evitar la sustitución de una acción, y con dos acciones el costo de actualizarlas a mano es mínimo.
- **Consecuencia**: actualizar una acción es un cambio explícito de una línea. La actualización automática (Dependabot) queda fuera del MVP.

## Resolución

Brief aprobado por el usuario el **2026-09-13**. D-1 a D-4 se resolvieron el mismo día, todas según la recomendación. No se agregan dependencias. El push que publica el workflow requiere una autorización propia en el turno en que se ejecute.

Subfase **cerrada el 2026-09-13** con confirmación del usuario. AC-1 a AC-10 están cumplidos, con la evidencia en [CHANGELOG.md](../../CHANGELOG.md). La CI del commit `e820ca4` terminó en verde: [ejecución 34783979325](https://github.com/benjamurilloo/AI-WhatsApp-Agent-CRM/actions/runs/34783979325), en 62 s.

| Decisión | Resolución |
|---|---|
| D-1 Guarda | Tests de Vitest en `tests/guards/`, con casos versionados que demuestran la detección |
| D-2 Alcance | Todos los archivos versionados, excepto `.md` y el propio test de la guarda |
| D-3 Protección de rama | Limitación aceptada y documentada; cada cierre de subfase verifica la CI verde del commit |
| D-4 Acciones | Fijadas por SHA de commit, con la versión en un comentario |

## Invariantes

- Sin referencias a Airtable ni al repositorio del agente de WhatsApp fuera de `.md`. Lo verifica la propia guarda.
- Ningún secreto real en el workflow ni en los secrets de Actions. Los valores de la base de CI son efímeros y locales al runner.
- El workflow solo tiene permiso de lectura sobre el repositorio (`contents: read`).
- Las guardas no requieren base de datos ni red.
- No se crean archivos temporales en disco para probar la regla de frontera.
- Ninguna dependencia nueva.

## Criterios de aceptación

- **AC-1**: D-1 a D-4 tienen resolución del usuario con fecha.
- **AC-2**: `npm run test:guards` pasa en local:
  - la función de detección señala `airtable`, `AIRTABLE_API_KEY` y `AI-WhatsApp-Agent`, y permite `ai-whatsapp-agent-crm`;
  - el recorrido del repositorio no encuentra referencias prohibidas.
- **AC-3**: con una referencia prohibida agregada temporalmente a un archivo versionable (por ejemplo `src/app/page.tsx`), `npm run test:guards` falla e indica archivo y línea. Se muestra la salida y el cambio se revierte antes de cerrar.
- **AC-4**: `module-boundary.test.ts` pasa: los 6 casos prohibidos producen `no-restricted-imports` y los 3 permitidos no.
- **AC-5**: `npm run test` pasa en local con la base levantada, e incluye los proyectos `guards` e `integration`.
- **AC-6**: `.github/workflows/ci.yml` tiene los pasos, disparadores, permisos, service container y acciones fijadas por SHA descritos en el punto 5.
- **AC-7**: tras el push autorizado, la ejecución de GitHub Actions del commit termina en verde. Se registran el enlace y la duración, y cada paso muestra su resultado, incluidos los tests de integración contra PostgreSQL 18.6 en el runner.
- **AC-8**: en local siguen pasando lint, typecheck, format y build.
- **AC-9**: `git status` muestra solo archivos autorizados.
- **AC-10**: `EngineeringStandards.md`, `RepositoryStructure.md`, `TestingStrategy.md` y `Risks.md` reflejan las resoluciones, y los enlaces internos siguen resolviendo.

## Pruebas y evidencia requerida

- **Local, evidencia `deterministic`**: salidas de `npm run test:guards`, del caso forzado de AC-3, de `npm run test` y de los chequeos.
- **CI**: identificador, enlace, conclusión y duración de la ejecución, obtenidos con `gh run view`.

**Nivel resultante esperado: validado localmente**, ahora también en CI, para la fundación técnica. Las guardas y los tests de conexión corren en un entorno limpio y reproducible. No hay lógica de negocio que validar.

La revisión es una autoevaluación (`self_assessment: true`).

## Condiciones de detención

- **Antes del push** que publica el workflow, si no hay autorización explícita en ese turno.
- Si la CI falla por una diferencia de entorno (Linux frente a Windows, rutas, fin de línea): se diagnostica con los logs y se reporta antes de cambiar archivos fuera de la lista. Cada push de corrección necesita su propia autorización.
- Si la guarda encuentra una referencia real existente: se reporta sin borrarla ni excluirla por cuenta propia.
- Si hace falta una dependencia, un secret o una configuración del remoto.
- Antes de commit, push o cambios de estado en Notion, y antes de proponer el cierre de la Fase 2.
