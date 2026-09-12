---
schema: task-brief.v1
task_id: 2.2
task_type: audit
generated_at: 2026-09-12
---

# Brief: 2.2 — Re-verificación del stack

## Objetivo

Confirmar contra fuentes oficiales las versiones vigentes del stack propuesto, cerrar las elecciones que [EngineeringStandards.md](../development/EngineeringStandards.md) dejó abiertas "para la Fase 2" y pasar el [ADR 0004](0004-stack-tecnologico-propuesto.md) de **propuesta** a **aceptada**. Sin instalar nada.

El resultado verificable es un stack con versión fijada por componente, cada una con su fuente y fecha de consulta, aprobado por el usuario.

## Ubicación en la Fase 2

- **Orden de ejecución**: **2.2** → 2.1 → 2.3 → 2.4 → 2.5, decidido por el usuario el 2026-09-12. La 2.2 va primero porque la estructura del repositorio (2.1) depende del framework y del ORM aceptados: Next.js impone su layout, y Drizzle y Prisma ubican distinto el esquema y las migraciones. La numeración se conserva para no romper referencias, como en la Fase 1.
- **Criterio de salida de la Fase 2 que cubre** ([Roadmap.md](../planning/Roadmap.md)): "ADR 0004 aceptado".
- **Qué no resuelve**: la autorización para instalar dependencias, que es gate de la 2.3 y se pide ahí.

## Alcance incluido

1. Verificar en fuentes oficiales (sitio, blog de releases, página de soporte o changelog del proyecto; `npm view` solo como lectura de metadatos, sin instalar) la versión estable vigente y el estado de soporte de:
   - Node.js (LTS activo y fechas de fin de soporte);
   - TypeScript;
   - Next.js (y la versión de React que exige);
   - PostgreSQL (versión mayor estable y fin de soporte);
   - Drizzle ORM y Drizzle Kit, incluido el estado de la 1.0;
   - Vitest y Playwright;
   - la herramienta de lint y formateo elegida.
2. Contrastar cada versión con la registrada en septiembre de 2026 y señalar cualquier cambio de versión mayor, deprecación o incompatibilidad entre componentes (por ejemplo, Node mínimo que exige Next.js o Vitest).
3. Presentar las decisiones pendientes (D-1 a D-5) con opciones, recomendación y consecuencia, y registrar la resolución del usuario en este archivo.
4. Actualizar `EngineeringStandards.md`: tabla de stack con la versión fijada, fuentes con fecha de consulta y la convención de lint y formateo resuelta.
5. Actualizar el ADR 0004 con las versiones y decisiones resueltas y pasarlo a **aceptada**, con su fila en el índice.
6. Registrar en `Roadmap.md` el orden de ejecución de la Fase 2, igual que la Fase 1 registra el suyo.

## Alcance excluido

- Instalar dependencias, crear `package.json`, lockfiles, `tsconfig.json`, ejecutar `create-next-app` o cualquier scaffolding: es la 2.3.
- Crear carpetas o archivos de código: es la 2.1.
- Docker, Docker Compose, imagen de PostgreSQL o `.env.example`: es la 2.4. Acá solo se fija la versión mayor de PostgreSQL.
- Workflows de GitHub Actions: es la 2.5. Acá solo se fija la versión de Node que CI usará.
- Mecanismo de sesión y librería de autenticación (3.2), hosting y base gestionada (Fases 8 y 9).
- Reabrir ADRs aceptados (0001 a 0003, 0005 a 0010). El monolito modular, PostgreSQL propio, GitHub y GitHub Actions no están en discusión.
- Corregir las líneas de estado desactualizadas de Notion y del hub de Obsidian. Se hace aparte, con autorización propia.

## Archivos o componentes autorizados

Lista cerrada:

- `docs/decisions/brief-2.2-re-verificacion-del-stack.md` (este archivo) y su fila en `docs/decisions/README.md`.
- `docs/decisions/0004-stack-tecnologico-propuesto.md` y su fila en `docs/decisions/README.md`. El nombre del archivo se conserva para no romper enlaces.
- `docs/development/EngineeringStandards.md`.
- `docs/planning/Roadmap.md`, solo la sección de la Fase 2.
- `CHANGELOG.md` y `HANDOFF.md`, al cerrar la subfase. El handoff corrige su `git_ref`, que todavía da por pendiente el commit `d7b9bf2`.

## Fuentes de verdad

1. Documentación oficial de cada proyecto, consultada en esta subfase. Manda sobre cualquier versión anotada en el repositorio o recordada por el modelo.
2. [ADR 0004](0004-stack-tecnologico-propuesto.md) y [EngineeringStandards.md](../development/EngineeringStandards.md), el punto de partida que se re-verifica.
3. [ADR 0002](0002-monolito-modular.md) y [ADR 0009](0009-repositorio-remoto-github-y-ci.md), restricciones que el stack respeta.
4. [Overview.md](../architecture/Overview.md) y [TestingStrategy.md](../development/TestingStrategy.md), lo que el stack tiene que poder sostener.

## Dependencias

Fase 1 cerrada (commit `d7b9bf2`, en `origin/main`). Acceso web a las fuentes oficiales.

## Decisiones pendientes

Cada una se presenta con la evidencia de la verificación. La recomendación se escribe después de verificar, no antes: acá se fija solo la pregunta y el criterio.

- **D-1 — Versión de Node.js**: LTS activo vigente o el que entra a LTS en octubre de 2026 (Node 26, según la planificación). Criterio: soporte hasta después del piloto de la Fase 9 y compatibilidad declarada por Next.js y el resto del stack.
- **D-2 — Drizzle o Prisma**: EngineeringStandards lo deja como "decisión abierta". Si se mantiene Drizzle, decidir también entre 0.45.x estable y 1.x si ya salió de beta. Criterio: migraciones SQL versionadas y legibles, tipado sin paso de generación, madurez de la versión.
- **D-3 — Lint y formateo**: ESLint + Prettier o Biome, "a evaluar en Fase 2". Criterio: soporte oficial en la configuración de Next.js vigente y cantidad de herramientas a mantener.
- **D-4 — Gestor de paquetes**: npm, pnpm u otro. No está documentado en ninguna parte. Criterio: reproducibilidad del lockfile en CI y fricción en Windows.
- **D-5 — Versión mayor de PostgreSQL**: la estable vigente (18 en la planificación). Criterio: soporte y disponibilidad futura como servicio gestionado, sin elegir proveedor.

Si la verificación revela otra elección abierta que no está en esta lista, se detiene y se pregunta antes de registrarla.

## Verificación (2026-09-12)

Fuente primaria de versiones y fechas: registro npm (`npm view <paquete> version|time|engines|peerDependencies`, solo lectura, con npm 11.12.1 y Node v24.15.0 locales). Estado de soporte: páginas oficiales de cada proyecto. Donde un resumen de la web contradijo al registro, manda el registro.

| Componente | Registrado en sep. 2026 | Vigente al 2026-09-12 | Cambio mayor | Fuente |
|---|---|---|---|---|
| Node.js | LTS activo: 24 | 24.x **Active LTS** (mantenimiento desde 2026-10-20, EOL 2028-04-30); 26.x **Current**, LTS desde 2026-10-28, EOL 2029-04-30; 22.x mantenimiento, EOL 2027-04-30 | no | [nodejs/release](https://github.com/nodejs/release), [endoflife.date](https://endoflife.date/nodejs) |
| TypeScript | sin versión | 7.0.2 (2026-07-08), **sin API programática**; 6.0.3 (2026-04-16) | sí: existe 7 | npm; [Announcing TypeScript 7.0](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/) |
| Next.js | 16.3.x | 16.3.5 (2026-09-11), 16.x Active LTS; Node `>=20.9.0` | no | npm; [Support Policy](https://nextjs.org/support-policy); [Installation](https://nextjs.org/docs/app/getting-started/installation) |
| React | sin versión | 19.3.0 (2026-09-09); Next acepta `^18.2.0 \|\| ^19.0.0` | no | npm |
| PostgreSQL | 18.x | 18.6, soportada hasta 2030-11-14; 19 en Beta 3 (2026-08-13) | no | [Versioning Policy](https://www.postgresql.org/support/versioning/) |
| Drizzle ORM / Kit | 0.45.x (1.0 beta) | `latest` 0.45.2 (2026-03-27) / 0.31.10; 1.0.0-rc.4 (2026-06-27) | no | npm; [Upgrade to v1](https://orm.drizzle.team/docs/upgrade-v1) |
| Prisma (alternativa) | — | estable 7.10.0 (2026-08-25); `latest` apunta a 8.0.0-rc.14 | — | npm |
| Vitest | sin versión | 5.0.0 (2026-09-03); Node `^22.12 \|\| ^24 \|\| >=26`; Vite 8.3.0 | sí: 5 | npm |
| Playwright | sin versión | 1.63.0 (2026-09-04); Node `>=20`; Next acepta `^1.51.1` | no | npm |
| ESLint + config Next | a evaluar | ESLint 10.10.0; `eslint-config-next` 16.3.5 (usa `typescript-eslint ^8.46`); Prettier 3.9.6 | sí: ESLint 10 | npm; [ESLint Plugin](https://nextjs.org/docs/app/api-reference/config/eslint) |
| Biome (alternativa) | a evaluar | 2.5.13 (2026-09-10); `create-next-app` lo ofrece como linter | — | npm; [Installation](https://nextjs.org/docs/app/getting-started/installation) |
| npm / pnpm | sin documentar | npm 11.12.1 incluido con Node; pnpm 12.4.1; Corepack deja de venir con Node desde 25.0.0 | — | npm; [nodejs/corepack](https://github.com/nodejs/corepack) |

### Compatibilidades cruzadas

- **TypeScript 7 bloqueado por el lint**: `typescript-eslint` 8.70.0 exige `typescript >=4.8.4 <6.1.0`, y TypeScript 7.0 no trae API programática (llega "nueva y distinta" en 7.1). Con ESLint el proyecto queda en TypeScript 6.0.x. Next.js exige como mínimo 5.1.
- **Node**: todos los componentes aceptan Node 24 y Node 26. El más restrictivo es Vitest (`^22.12 || ^24 || >=26`).
- **Drizzle 0.x → 1.0**: cambia el formato de migraciones (sin `journal.json`, una carpeta por migración, snapshots DDL) y existe `drizzle-kit up` para convertir. Hoy no hay migraciones, así que cuanto antes se defina la versión, menos hay que convertir.
- **Drizzle ↔ PostgreSQL 18**: Drizzle delega en los drivers `pg` 8.23.0 o `postgres` 3.4.9, que no declaran un máximo de versión de servidor. No se encontró una declaración oficial de soporte de PostgreSQL 18: se valida con conectividad real en la 2.4 (**pendiente**, no verificado).
- **Discrepancias de fuentes resueltas**: el resumen de la web daba 2024 como año de Vitest 5.0 y Playwright 1.63, y agosto para TypeScript 7.0.2; la página de releases de Drizzle mostraba una versión antigua. El registro npm corrige las cuatro.

### Decisión nueva detectada

- **D-6 — Versión de TypeScript**: 6.0.x o 7.0.x. No estaba en la lista original; se detiene y se pregunta, según el brief.

## Resolución

Brief aprobado por el usuario el **2026-09-12**. Decisiones D-1 a D-6 resueltas por el usuario el **2026-09-12**, las seis según la recomendación.

| Decisión | Resolución | Revisión prevista |
|---|---|---|
| D-1 Node.js | Node 24 LTS | Reevaluar Node 26 cuando entre a LTS (2026-10-28) |
| D-2 ORM | Drizzle ORM 0.45.2 y Drizzle Kit 0.31.10, estables | Si Drizzle 1.0 estable sale antes de la primera migración (3.1), adoptarla ahí para no convertir migraciones |
| D-3 Lint y formateo | ESLint 10 + `eslint-config-next` 16.3 + Prettier 3.9 con `eslint-config-prettier` | — |
| D-4 Gestor de paquetes | npm 11, el incluido con Node; CI instala con `npm ci` | — |
| D-5 PostgreSQL | 18 | — |
| D-6 TypeScript | 6.0.3 | Reevaluar con TypeScript 7.1 y soporte de `typescript-eslint` |

## Invariantes

- No se instala nada ni se crea ningún archivo fuera de la lista autorizada.
- Ninguna versión se registra sin fuente oficial y fecha de consulta. Una versión recordada sin fuente no cuenta como verificada.
- Ningún componente del stack introduce Airtable, referencias al repositorio del agente de WhatsApp, microservicios ni infraestructura distribuida.
- Sin autenticación como servicio de terceros salvo un ADR nuevo.
- Todo sigue en nivel **diseñado**: elegir una versión no la valida.

## Criterios de aceptación

- **AC-1**: cada componente del alcance incluido tiene en `EngineeringStandards.md` una versión fijada (mayor.menor como mínimo), el enlace a su fuente oficial y la fecha de consulta.
- **AC-2**: cada diferencia de versión mayor frente a lo registrado en septiembre de 2026 está señalada explícitamente, con su consecuencia o con "sin consecuencia".
- **AC-3**: las compatibilidades cruzadas relevantes (Node mínimo de Next.js, Vitest y Playwright; React que exige Next.js; PostgreSQL soportado por el ORM) están verificadas y registradas.
- **AC-4**: D-1 a D-5 tienen resolución del usuario con fecha en la sección "Resolución" de este archivo.
- **AC-5**: el ADR 0004 refleja las resoluciones, figura como **aceptada** en el archivo y en el índice, y ya no dice "a evaluar en Fase 2" ni "decisión abierta" en ningún documento autorizado.
- **AC-6**: `Roadmap.md` registra el orden de ejecución de la Fase 2 y su motivo.
- **AC-7**: no hay `package.json`, lockfile, `node_modules` ni código nuevo en el repositorio (`git status` limitado a los archivos autorizados).
- **AC-8**: los enlaces internos del repositorio siguen resolviendo.

## Pruebas y evidencia requerida

Subfase de auditoría documental, sin evidencia ejecutable:

- tabla de verificación con componente, versión anterior, versión vigente, fuente y fecha;
- `git status` y `git diff --stat` contra la lista autorizada;
- `grep` de "a evaluar en Fase 2" y "decisión abierta" en los documentos autorizados;
- verificador de enlaces internos.

La revisión es autoevaluación (`self_assessment: true`). Nivel resultante: **diseñado**.

## Condiciones de detención

- Antes de editar el ADR 0004 o `EngineeringStandards.md`, si alguna de D-1 a D-5 no está resuelta.
- Si una fuente oficial no está disponible o se contradice con otra: se registra la discrepancia y se pregunta, sin elegir en silencio.
- Si la verificación muestra que un componente es incompatible con un ADR aceptado o está discontinuado: se detiene y se plantea.
- Antes de instalar cualquier cosa o ejecutar un comando que escriba en el repositorio fuera de la lista autorizada.
- Antes de commit, push o cambios de estado en Notion.
