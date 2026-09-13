---
schema: task-brief.v1
task_id: 2.3
task_type: implementation
generated_at: 2026-09-12
---

# Brief: 2.3 — Bootstrap de la aplicación

## Objetivo

Dejar una aplicación Next.js mínima que instala, compila, pasa typecheck estricto, lint y formateo, sin lógica de negocio. Crea exactamente lo que asigna a la 2.3 la tabla "Qué crea cada subfase" de [RepositoryStructure.md](../architecture/RepositoryStructure.md), con las versiones del [ADR 0004](0004-stack-tecnologico-propuesto.md).

Es la primera subfase que instala dependencias y escribe código.

## Ubicación en la Fase 2

- **Orden**: 2.2 (cerrada) → 2.1 (cerrada) → **2.3** → 2.4 → 2.5.
- **Gate de entrada**: autorización explícita del usuario para instalar dependencias. Aprobar este brief no la sustituye: se pide por separado.
- **Criterio de salida de la Fase 2 que prepara**: "lint, typecheck, test y build pasan en local". La parte de CI es la 2.5; la de base de datos, la 2.4.

## Hallazgos de la verificación previa (2026-09-12)

Consultados en el registro npm y la documentación oficial antes de escribir este brief.

1. **ESLint 10 es incompatible con `eslint-config-next` 16.3.5** según las dependencias declaradas:
   - `eslint-config-next` trae `eslint-plugin-react` 7.37.5 (`eslint ^9.7`), `eslint-plugin-import` 2.32.0 (`^9`) y `eslint-plugin-jsx-a11y` 6.10.2 (`^9`). Ninguno tiene una versión que acepte ESLint 10.
   - Un reporte público indica que 38 de las 101 reglas de `eslint-plugin-react` fallan en ejecución con ESLint 10.
   - El pedido de soporte en Next.js ([vercel/next.js#91702](https://github.com/vercel/next.js/issues/91702)) se cerró como duplicado, pero la versión estable publicada el 2026-09-11 sigue con esos plugins.
   - **ESLint 9 es EOL desde el 2026-08-06** ([Version Support](https://eslint.org/version-support)), y aun así la plantilla de `create-next-app` 16.3.5 instala `eslint: "^9"`.
   - Sí aceptan ESLint 10: `typescript-eslint` 8.70, `eslint-plugin-react-hooks` 7.1.1, `@eslint/js` 10.0.1, `eslint-config-prettier` 10.1.8 y `@next/eslint-plugin-next` 16.3.5 (sin restricción declarada).

   Esto afecta a una elección del ADR 0004 aceptado: es la decisión D-1.
2. **`create-next-app` no puede usarse en este repositorio**: solo acepta un directorio con archivos de una lista fija, y aquí existen `README.md`, `CLAUDE.md`, `CHANGELOG.md` y `HANDOFF.md`. Además agregaría por defecto Tailwind y un `AGENTS.md`/`CLAUDE.md` propios. La instalación es manual, como documenta [Installation](https://nextjs.org/docs/app/getting-started/installation).
3. **Vitest 5 no incluye Vite**: lo declara como dependencia par (`^6.4 || ^7 || ^8`), así que Vite 8.3 se instala explícitamente. Vite 8 resuelve los alias de `tsconfig` con `resolve.tsconfigPaths`, sin `vite-tsconfig-paths`.
4. **Next.js 16.3 hace el typecheck de `next build` con el `tsc` local** y pide ignorar `next-env.d.ts` en Git ([TypeScript](https://nextjs.org/docs/app/api-reference/config/typescript)).
5. **`@types/node`**: su `latest` es 22.x. Para Node 24 corresponde la línea 24 (24.13.x).

## Alcance incluido

1. Registrar la resolución de D-1 a D-4 y, si D-1 cambia el lint del ADR 0004, crear el ADR 0011 que lo supera en ese punto.
2. Instalar con `npm install`, sin `--force`, `--legacy-peer-deps` ni `overrides`, exactamente estas dependencias, con rango `^` y versión exacta fijada en `package-lock.json`:
   - **dependencies**: `next` 16.3.x, `react` 19.3.x, `react-dom` 19.3.x;
   - **devDependencies**:
     - `typescript` ~6.0.3;
     - `@types/node` 24.x, `@types/react` 19.3.x y `@types/react-dom` 19.3.x;
     - `prettier` 3.9.x;
     - `vitest` 5.0.x y `vite` 8.3.x;
     - el conjunto de lint que resulte de D-1.
3. Crear `package.json` con:
   - `"private": true`;
   - `"engines": { "node": ">=24 <25" }`;
   - los scripts `dev`, `build`, `start`, `lint`, `format`, `format:check`, `typecheck` (`tsc --noEmit`) y `test` (`vitest run`).
4. Crear `tsconfig.json` con `strict: true`, las opciones que resulten de D-3, alias `@/*` → `src/*` y el `include` que requiere Next.js.
5. Crear `next.config.ts` mínimo, sin opciones experimentales.
6. Crear `eslint.config.mjs` con el conjunto de D-1, `eslint-config-prettier` y la regla de frontera entre módulos tal como la describe `RepositoryStructure.md`, incluidas sus excepciones.
7. Crear `prettier.config.mjs` con los valores por defecto de Prettier y el alcance de D-4.
8. Crear `vitest.config.ts` con dos proyectos, `unit` (`src/**/*.test.ts`) e `integration` (`tests/integration/**/*.test.ts`), con `resolve.tsconfigPaths`, según D-2.
9. Crear `src/app/layout.tsx` y `src/app/page.tsx`: una página que muestra el nombre del producto, sin estilos, sin datos y sin enlaces.
10. Agregar a `.gitignore` `next-env.d.ts` y `*.tsbuildinfo`.
11. Actualizar `EngineeringStandards.md` (conjunto de lint, `@types/node`, Vite) y `RepositoryStructure.md` (archivos que agregue D-4).

## Alcance excluido

- Base de datos, Drizzle, `docker-compose.yml`, `.env.example`, `/api/health` y cualquier test: es la 2.4.
- GitHub Actions: es la 2.5.
- `src/modules/`, `src/shared/`, `drizzle/`, `seeds/`, `tests/`: los crean la 2.4 o las fases siguientes.
- Solución de estilos (CSS Modules, Tailwind u otra), React Testing Library, jsdom, Playwright y React Compiler. La solución de estilos queda como decisión pendiente de la primera pantalla, en la Fase 3.
- Autenticación, middleware o `proxy.ts`, i18n, fuentes e imágenes.
- `npm audit fix` o cambios de versión para corregir avisos de auditoría: se registran y se tratan en la Fase 8.
- Cualquier dependencia fuera de la lista del alcance incluido.

## Archivos o componentes autorizados

Lista cerrada:

- `package.json`, `package-lock.json` y `node_modules/` (ignorado por Git).
- `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `prettier.config.mjs`, `vitest.config.ts`.
- `.prettierignore`, solo si D-4 lo requiere.
- `src/app/layout.tsx`, `src/app/page.tsx`.
- `.gitignore`, solo las entradas del punto 10.
- `.next/` y `next-env.d.ts`, generados por Next.js e ignorados por Git.
- `docs/decisions/brief-2.3-bootstrap-de-la-aplicacion.md` (este archivo) y su fila en `docs/decisions/README.md`.
- `docs/decisions/0011-*.md` y su fila en el índice, solo si D-1 lo requiere.
- `docs/development/EngineeringStandards.md` y `docs/architecture/RepositoryStructure.md`, en lo indicado en el punto 11.
- `CHANGELOG.md` y `HANDOFF.md`, al cerrar la subfase.

## Fuentes de verdad

1. [ADR 0004](0004-stack-tecnologico-propuesto.md) y [EngineeringStandards.md](../development/EngineeringStandards.md): versiones.
2. [RepositoryStructure.md](../architecture/RepositoryStructure.md): ubicación de cada archivo y regla de frontera.
3. Registro npm, en el momento de instalar: dependencias pares y `engines`.
4. Documentación de Next.js 16.3 ([Installation](https://nextjs.org/docs/app/getting-started/installation), [TypeScript](https://nextjs.org/docs/app/api-reference/config/typescript), [ESLint Plugin](https://nextjs.org/docs/app/api-reference/config/eslint)) y de Vite ([resolve.tsconfigPaths](https://vite.dev/config/shared-options)).

## Dependencias

- 2.1 y 2.2 cerradas (commit `5d65dbf`).
- Node 24 y npm 11 locales (verificados el 2026-09-12: v24.15.0 y 11.12.1).
- Autorización para instalar dependencias.

## Decisiones pendientes

Cada una lleva una recomendación, que no es una resolución: la resuelve el usuario.

### D-1 — Conjunto de lint ante la incompatibilidad de ESLint 10

- **Opciones**:
  - (a) **ESLint 10 con plugins que lo soportan**: `@eslint/js`, `typescript-eslint`, `@next/eslint-plugin-next` (reglas `recommended` y `core-web-vitals`, usado directamente como indica la documentación de Next.js), `eslint-plugin-react-hooks` y `eslint-config-prettier`. Sin `eslint-plugin-react`, `eslint-plugin-import` ni `eslint-plugin-jsx-a11y`.
  - (b) **ESLint 10 con `eslint-config-next` forzado** mediante `overrides` de npm.
  - (c) **ESLint 9.39 con `eslint-config-next`**, lo que instala hoy la plantilla oficial de Next.js.
  - (d) **Biome 2.5**, reabriendo D-3 de la 2.2: una sola herramienta de lint y formateo, sin Prettier.
- **Recomendación**: (a).
  - Mantiene ESLint 10, con soporte vigente, y todas las dependencias pares declaradas se cumplen sin forzar nada.
  - Conserva las reglas propias de Next.js y las de hooks de React, que son las que más errores de runtime evitan. TypeScript estricto cubre buena parte de lo que aporta `eslint-plugin-import`.
  - (b) instala plugins con reglas que fallan en ejecución. (c) usa una herramienta sin parches de seguridad y obliga a migrar de todos modos. (d) es viable, pero reabre una decisión recién tomada por un problema que (a) resuelve con menos cambio.
- **Consecuencia**:
  - Se pierden las reglas de JSX de `eslint-plugin-react` y las de accesibilidad de `jsx-a11y`. La accesibilidad queda sin lint hasta que `jsx-a11y` soporte ESLint 10; se registra como riesgo con revisión antes de la primera pantalla (Fase 3).
  - Cambia una elección del ADR 0004 aceptado: se crea el **ADR 0011**, que lo supera solo en el conjunto de lint.
  - Revisión prevista: volver a `eslint-config-next` cuando su versión estable dependa de plugins compatibles con ESLint 10.

### D-2 — Tests mientras no exista ninguno

- **Opciones**:
  - (a) `vitest run --passWithNoTests` en la 2.3; la 2.4, al agregar el primer test, quita el flag;
  - (b) escribir en la 2.3 un test unitario de la página, lo que exige React Testing Library y jsdom.
- **Recomendación**: (a). (b) suma dos dependencias solo para tener un test que no protege ninguna regla. El flag queda con fecha de retiro explícita: si la 2.4 no lo quita, la revisión de la 2.4 lo marca como bloqueante.
- **Consecuencia**: la 2.3 no certifica ningún test; su evidencia es instalación, typecheck, lint, formateo y build.

### D-3 — Opciones de TypeScript además de `strict`

- **Opciones**:
  - (a) `strict` más `noUncheckedIndexedAccess` y `noImplicitOverride`;
  - (b) solo `strict`, lo que exige EngineeringStandards.
- **Recomendación**: (a). `noUncheckedIndexedAccess` obliga a tratar como posiblemente ausente un elemento leído de un arreglo o un mapa, que es exactamente el tipo de error que rompe el cálculo de métricas sobre intervalos vacíos. Activarlo después, con código escrito, cuesta mucho más.
- **Consecuencia**: `EngineeringStandards.md` agrega las dos opciones a la convención de typecheck.

### D-4 — Alcance de Prettier

- **Opciones**:
  - (a) Prettier formatea código y configuración, y excluye Markdown (`docs/`, `README.md`, `CLAUDE.md`, `CHANGELOG.md`, `HANDOFF.md`) mediante `.prettierignore`;
  - (b) Prettier formatea también el Markdown.
- **Recomendación**: (a). La documentación ya tiene su propio estilo y reformatearla ahora produciría un diff enorme sin cambio de contenido, que ocultaría cambios reales en el historial.
- **Consecuencia**: se agrega `.prettierignore` a la raíz y al árbol de `RepositoryStructure.md`.

## Resolución

Brief aprobado por el usuario el **2026-09-12**. D-1 a D-4 resueltas el mismo día, las cuatro según la recomendación. El usuario autorizó explícitamente instalar las dependencias de la lista del alcance incluido.

Subfase **cerrada el 2026-09-12** con confirmación del usuario. Nivel alcanzado: *implementado*. AC-1 a AC-12 cumplidos; la evidencia está en [CHANGELOG.md](../../CHANGELOG.md).

| Decisión | Resolución |
|---|---|
| D-1 Lint | ESLint 10 con `@eslint/js`, `typescript-eslint`, `@next/eslint-plugin-next`, `eslint-plugin-react-hooks` y `eslint-config-prettier` ([ADR 0011](0011-lint-con-eslint-10-sin-eslint-config-next.md)) |
| D-2 Tests | `vitest run --passWithNoTests` hasta la 2.4, que quita el flag |
| D-3 TypeScript | `strict`, `noUncheckedIndexedAccess` y `noImplicitOverride` |
| D-4 Prettier | Excluye Markdown mediante `.prettierignore` |

### Ajustes durante la ejecución

- **`typescript` con rango `~6.0.3`**: `npm install` guardó `^6.0.3`, que permitiría TypeScript 6.1, fuera del rango de `typescript-eslint`. Se corrigió a `~6.0.3`, como fija el alcance.
- **`vitest.config.mts` en vez de `vitest.config.ts`**: Vite avisó que el archivo usa ESM en un paquete CommonJS, algo que su cargador nativo, previsto como predeterminado, no soporta. `RepositoryStructure.md` permite ajustar la extensión cuando la herramienta lo exige, sin cambiar la ubicación.
- **Aviso de Next.js no corregido**: `next build` detecta un `package-lock.json` en `C:\Users\benja`, fuera del repositorio, y lo ignora. Es un archivo del entorno del usuario, no del proyecto: no se toca ni se agrega `turbopack.root`.
- **`agentRules: false` en `next.config.ts`**: durante AC-9, `next dev` detectó un agente de IA y agregó a `CLAUDE.md` un bloque de reglas propio, fuera de la lista de archivos autorizados. Con autorización del usuario se descartó el bloque y se agregó `agentRules: false`, una opción estable del esquema de configuración de Next.js 16.3, no experimental. Verificado: con la opción puesta, `next dev` sirve `/` con 200 y `CLAUDE.md` queda sin cambios.

## Invariantes

- Sin referencias a Airtable ni al repositorio del agente de WhatsApp en dependencias, código o configuración.
- Sin lógica de negocio, datos, conexión a base ni variables de entorno.
- Ninguna dependencia fuera de la lista autorizada, y ningún conflicto de dependencias pares resuelto por la fuerza.
- Ninguna carpeta vacía ni archivo fuera de la tabla de `RepositoryStructure.md` y de este brief.
- Ningún secreto en archivos versionados.

## Criterios de aceptación

- **AC-1**: D-1 a D-4 tienen resolución del usuario con fecha, y el ADR 0011 existe e indexado si D-1 lo requiere.
- **AC-2**: `npm install` termina sin errores ni avisos de dependencias pares no satisfechas, sin `--force`, `--legacy-peer-deps` ni `overrides`. Desde cero, `npm ci` reproduce la instalación con el lockfile.
- **AC-3**: las dependencias de primer nivel de `package.json` coinciden exactamente con la lista autorizada, y las versiones resueltas del lockfile pertenecen a las líneas del ADR 0004 o del ADR 0011.
- **AC-4**: `npm run typecheck` pasa con `strict: true` y las opciones de D-3.
- **AC-5**: `npm run lint` pasa. Un archivo temporal con una importación prohibida por la regla de frontera hace fallar el lint con esa regla; se muestra la salida y el archivo se borra antes de cerrar.
- **AC-6**: `npm run format:check` pasa sin tocar archivos Markdown.
- **AC-7**: `npm run build` termina sin errores e incluye el typecheck de Next.js.
- **AC-8**: `npm run test` termina con código 0, según D-2.
- **AC-9**: con `npm run dev`, `GET /` responde 200 y el HTML contiene el nombre del producto.
- **AC-10**: `git status` muestra solo archivos autorizados; `node_modules/`, `.next/` y `next-env.d.ts` no aparecen.
- **AC-11**: `npm audit` se ejecuta y su resumen por severidad queda registrado en el cierre, sin corregirlo.
- **AC-12**: `EngineeringStandards.md` y `RepositoryStructure.md` reflejan las resoluciones, y los enlaces internos siguen resolviendo.

## Pruebas y evidencia requerida

Evidencia `deterministic`, ejecutada localmente con Node v24.15.0 y npm 11.12.1: salidas de `npm ci`, `npm run typecheck`, `npm run lint` (incluido el caso de la importación prohibida), `npm run format:check`, `npm run build`, `npm run test`, la respuesta de `GET /` y `npm audit`.

**Nivel resultante: implementado.** Según la escala de `CLAUDE.md`, "validado localmente" exige tests pasando, y esta subfase no tiene tests. Lint, typecheck y build en verde no equivalen a validación.

La revisión es autoevaluación (`self_assessment: true`).

## Condiciones de detención

- **Antes de ejecutar cualquier `npm install`**, si el usuario no autorizó explícitamente instalar dependencias.
- Si npm informa una dependencia par no satisfecha o un conflicto de resolución: se detiene y se reporta, sin forzar.
- Si hace falta un paquete que no está en la lista autorizada.
- Si una herramienta exige un archivo o una ubicación distinta de `RepositoryStructure.md`.
- Si `npm audit` informa una vulnerabilidad crítica en `next` o `react`: se detiene y se consulta antes de cerrar.
- Antes de commit, push o cambios de estado en Notion.
