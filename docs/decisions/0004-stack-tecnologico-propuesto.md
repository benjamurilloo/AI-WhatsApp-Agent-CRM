# 0004 — Stack tecnológico

- Estado: aceptada
- Fecha: 2026-09-11 (propuesta); 2026-09-12 (aceptada tras la re-verificación de la subfase 2.2)

## Contexto

Las tareas de fundación técnica necesitan un stack concreto. El usuario propuso como hipótesis TypeScript, un full-stack tipo Next.js, PostgreSQL, un ORM o query builder con migraciones SQL versionadas, sesiones seguras y pruebas en tres niveles. Las versiones cambian con el tiempo y no deben fijarse solo de memoria, por eso la propuesta del 2026-09-11 quedó pendiente de re-verificación al iniciar la Fase 2.

La re-verificación ([brief-2.2](brief-2.2-re-verificacion-del-stack.md)) confirmó las versiones mayores planificadas y encontró un cambio que obliga a decidir: TypeScript 7.0 salió sin API programática, y `typescript-eslint`, del que depende la configuración de lint de Next.js, solo acepta TypeScript `<6.1.0`.

## Decisión

| Componente | Elección |
|---|---|
| Lenguaje | TypeScript 6.0.x |
| Runtime | Node.js 24 LTS |
| Gestor de paquetes | npm 11, con `npm ci` en CI |
| Framework | Next.js 16.3.x con React 19.3.x |
| Base de datos | PostgreSQL 18 |
| ORM y migraciones | Drizzle ORM 0.45.x y Drizzle Kit 0.31.x, con migraciones SQL generadas y versionadas |
| Tests | Vitest 5.0.x y Playwright 1.63.x |
| Lint y formateo | ESLint 10 con `eslint-config-next` 16.3.x, y Prettier 3.9.x con `eslint-config-prettier` |

Versiones exactas, compatibilidades y fuentes con fecha en [development/EngineeringStandards.md](../development/EngineeringStandards.md). Las seis decisiones las resolvió el usuario el 2026-09-12.

## Alternativas descartadas

- **Prisma** en lugar de Drizzle: suma un paso de generación de cliente y mayor footprint; además, su `latest` apunta a un RC.
- **Drizzle 1.0**: todavía en release candidate.
- **TypeScript 7.0**: sin API programática, rompe `typescript-eslint` y el plugin de tipos de Next.js hasta la 7.1.
- **Node 26**: en fase Current hasta el 2026-10-28.
- **Biome**: una sola herramienta, pero sin la configuración de lint que mantiene Next.js.
- **pnpm**: suma una herramienta a instalar, y Corepack ya no viene con Node desde la 25.
- **PostgreSQL 19**: en beta.
- **Autenticación como servicio de terceros**: suma una dependencia externa y datos de usuarios fuera de la base propia. Se reconsidera solo con un ADR nuevo.

## Consecuencias

- La 2.3 instala estas versiones, con autorización previa del usuario, y el lockfile fija la versión exacta.
- Revisiones previstas, cada una con evidencia y registrada en EngineeringStandards; si cambia una elección de esta tabla, con ADR nuevo:
  - Node 26 cuando entre a LTS (2026-10-28);
  - TypeScript 7.1 cuando `typescript-eslint` la soporte;
  - Drizzle 1.0 si sale estable antes de la primera migración (subfase 3.1), para no tener que convertir migraciones.
- El soporte de PostgreSQL 18 en Drizzle y sus drivers no tiene declaración oficial encontrada: se valida con conectividad real en la 2.4.
- El mecanismo de sesión concreto se decide en la Fase 3 y se registra como ADR propio.
