# Changelog

Registro de cierres de fase y subfase. Cada entrada dice qué se certifica y qué explícitamente no, sin inferir nunca un nivel de validación superior al alcanzado. El seguimiento de tareas vive en [Notion](https://app.notion.com/p/3d8702be6f4e81659e43c3d8bd9a6e1c); el porqué de cada decisión, en [docs/decisions](docs/decisions/README.md).

## 2026-09-13 — Fase 2 cerrada (Fundación técnica)

**Certifica:**

- **Las cinco subfases cerradas con confirmación del usuario**, en el orden 2.2 → 2.1 → 2.3 → 2.4 → 2.5.
- **Criterios de aceptación del [Roadmap](docs/planning/Roadmap.md)**:
  - lint, typecheck, test y build pasan en local y en CI;
  - la guarda falla ante una referencia prohibida (AC-3 de la 2.5 y casos versionados).
- **Gate de salida**:
  - CI en verde en el commit `e820ca4`;
  - estructura ([RepositoryStructure.md](docs/architecture/RepositoryStructure.md)) aprobada por el usuario el 2026-09-13.
- **Entregables**:
  - app Next.js que compila;
  - PostgreSQL 18 local con health check;
  - CI en verde;
  - ADR 0004 aceptado y ADR 0011 para el lint.
- **Nivel alcanzado: validado localmente y en CI** para la fundación técnica, que incluye la conexión a la base, el health check y las guardas.

**No certifica:**

- **Lógica de negocio, tablas, migraciones, autenticación ni pantallas**: empiezan en la Fase 3.
- **Aislamiento de la base de test**: se decide en la 3.1.
- **Bloqueo de merges en rojo**: no hay protección de rama en el plan gratuito de GitHub; el control es por procedimiento (brief-2.5, D-3).
- **Seguridad de dependencias**: 4 avisos moderados de `npm audit` a través de `drizzle-kit`, que quedan para la Fase 8.
- **Revisión independiente**: es autoevaluación del mismo agente. El usuario aprobó los briefs, los cierres y la estructura.

## 2026-09-13 — Subfase 2.5 cerrada (Pipeline de CI)

**Certifica:**

- **`.github/workflows/ci.yml`** corre en cada push a `main` y en cada pull request:
  - pasos: `npm ci`, lint, typecheck, formato, guardas, tests de integración contra PostgreSQL 18.6 efímero y build;
  - permisos solo de lectura, acciones fijadas por SHA y sin secrets.
- **Primera ejecución en verde**: [34783979325](https://github.com/benjamurilloo/AI-WhatsApp-Agent-CRM/actions/runs/34783979325), del commit `e820ca4`. Terminó en 62 s con los 11 pasos en verde.
- **Guardas versionadas en `tests/guards/`**, que corren en local y en CI sin base de datos:
  - **referencias prohibidas**: detecta Airtable, `AIRTABLE_*` y el repositorio del agente de WhatsApp fuera de `.md`, y permite `ai-whatsapp-agent-crm`;
  - **frontera entre módulos**: los 9 casos de la 2.3, ahora como archivos virtuales con `ESLint#lintText`.
- **Caso forzado (AC-3)**: con una referencia a Airtable agregada temporalmente en `src/app/page.tsx`, la guarda falló e indicó `src/app/page.tsx:8 (Airtable)`. El archivo se restauró.
- **Suite local**: `npm run test` pasa 24 de 24 (19 de guardas y 5 de integración), con typecheck, lint y format en verde.
- **Decisiones D-1 a D-4 del [brief-2.5](docs/decisions/brief-2.5-pipeline-de-ci.md)** resueltas según la recomendación: guardas como tests, alcance sin `.md`, CI sin protección de rama aceptada y acciones por SHA.
- Enlaces internos verificados: 0 rotos.

**No certifica:**

- **Que la CI bloquee un push o un merge en rojo**: GitHub no ofrece protección de rama en repositorios privados del plan gratuito.
- **Scripts de instalación de npm en CI**: el runner avisa que los `postinstall` de tres versiones de `esbuild` no están cubiertos por `allowScripts`. No afecta al pipeline actual, pero puede afectar a `drizzle-kit` en la Fase 3.
- **Tests end-to-end**: llegan con Playwright en la Fase 3.
- **Revisión independiente**: es autoevaluación del mismo agente.

## 2026-09-13 — Subfase 2.4 cerrada (Base de datos local)

**Certifica:**

- **PostgreSQL 18 local** con Docker Compose:
  - imagen `postgres:18.6-trixie`;
  - puerto publicado solo en `127.0.0.1:5432`;
  - volumen en `/var/lib/postgresql`, la ruta que exige la imagen 18. Se verificó que los datos persisten tras `down` y `up`: el `system_identifier` no cambió.
- **Conexión con Drizzle 0.45 y `pg` 8.23**, en `src/shared/db/`. La conexión se abre en el primer uso, con una sola instancia por proceso y timeout de 2 s.
- **`/api/health`** responde 200 `{"status":"ok"}` o 503 `{"status":"unavailable"}`, con `Cache-Control: no-store` y sin detalles. En runtime local respondió 200, luego 503 en 69 ms con la base detenida y otra vez 200 al levantarla, sin reiniciar `next dev`.
- **Cinco tests de integración contra PostgreSQL real** pasan:
  - consulta con Drizzle;
  - versión 18.x del servidor;
  - health check disponible;
  - conexión cortada por el servidor;
  - health check sin servidor, que no expone credenciales.
  - `--passWithNoTests` se retiró.
- **Defecto encontrado y corregido**: sin un manejador de `error`, el pool de `pg` lanzaba un `uncaughtException` cuando la base cortaba una conexión inactiva. Eso podía tirar el proceso, y el volcado incluía la contraseña. Primero se reprodujo con un test que falló; después se corrigió con `pool.on("error")`.
- **Instalación y chequeos**:
  - `npm ci` desde cero sin conflictos de dependencias pares;
  - typecheck, lint, format y build pasan con la base detenida.
- **Decisiones D-1 a D-5 del [brief-2.4](docs/decisions/brief-2.4-base-de-datos-local.md)** resueltas según la recomendación:
  - driver `pg`;
  - una sola base local;
  - health check sin detalles;
  - `process.loadEnvFile()` nativo;
  - imagen `18.6-trixie`.
- Enlaces internos verificados: 0 rotos.

**No certifica:**

- **Tablas, migraciones, tipos de datos ni reglas de negocio**: no existen. `drizzle-kit` está instalado, pero nunca se ejecutó.
- **Aislamiento entre la base de desarrollo y la de tests**: los tests usan la misma base porque solo leen. La separación se decide en la 3.1.
- **Ejecución en CI**: corresponde a la 2.5.
- **`postgres` 3.4 (postgres.js)**: no se probó.
- **Seguridad de dependencias**: `npm audit` informa 4 avisos moderados de `esbuild` a través de `drizzle-kit`, y 0 altos o críticos. Se tratan en la Fase 8.
- **Revisión independiente**: es autoevaluación del mismo agente.

## 2026-09-12 — Subfase 2.3 cerrada (Bootstrap de la aplicación)

**Certifica:**

- **Instalación manual autorizada por el usuario**, sin `create-next-app`, con las dependencias de primer nivel que lista el [brief-2.3](docs/decisions/brief-2.3-bootstrap-de-la-aplicacion.md). `npm install` y `npm ci` corrieron sin avisos de dependencias pares, sin forzar nada y con 0 vulnerabilidades en `npm audit`.
- **[ADR 0011](docs/decisions/0011-lint-con-eslint-10-sin-eslint-config-next.md) aceptado**: lint con ESLint 10 y plugins sueltos, porque `eslint-config-next` arrastra plugins que solo aceptan ESLint 9.
- **Scripts que salen con 0**: `typecheck`, `lint`, `format:check`, `build` y `test`. `test` pasa con `--passWithNoTests`, porque todavía no hay tests.
- **Regla de frontera entre módulos**: se probó con 9 archivos temporales, 6 importaciones prohibidas y 3 permitidas, entre ellas las excepciones de `schema.ts` y `analytics`. Las 6 prohibidas fallaron y las 3 permitidas pasaron; los archivos se borraron.
- **`next dev`**: sirve `/` con 200, `lang="es"` y el título.
- **Ajustes durante la ejecución**, registrados en el brief:
  - TypeScript con rango `~6.0.3`;
  - `vitest.config.mts`;
  - `agentRules: false`, porque `next dev` escribía un bloque propio en `CLAUDE.md`. El bloque se descartó y se verificó que no vuelve a aparecer.
- Enlaces internos verificados: 0 rotos.

**No certifica:**

- **Validación local.** No hay tests: el nivel es *implementado*.
- **Regla de frontera en CI**: la prueba fue local y temporal. El caso versionado llega en la 2.5.
- **Accesibilidad**: no hay lint mientras `eslint-plugin-jsx-a11y` no soporte ESLint 10.
- **Base de datos, Drizzle, Playwright y estilos**: fuera del alcance.
- **Revisión independiente.** Es autoevaluación del mismo agente.

## 2026-09-12 — Subfase 2.1 cerrada (Estructura del repositorio)

**Certifica:**

- **2.1 como subfase de diseño**, sin fusionar con la 2.3, aprobada por el usuario.
- **Seis decisiones resueltas por el usuario** según la recomendación del [brief-2.1](docs/decisions/brief-2.1-estructura-del-repositorio.md):
  - código en `src/`;
  - módulos en `src/modules/<modulo>/` con `index.ts`, `service.ts`, `repository.ts`, `schema.ts` y `types.ts`;
  - cliente de base en `src/shared/db/`;
  - migraciones en `drizzle/` y seeds en `seeds/`;
  - tests unitarios junto al código, integración en `tests/integration/` y end-to-end en `tests/e2e/`;
  - frontera entre módulos con `no-restricted-imports` de ESLint.
- **[RepositoryStructure.md](docs/architecture/RepositoryStructure.md)**: árbol, ubicación de los nueve módulos, reglas de importación y una tabla que asigna cada carpeta a la subfase que le pone su primer archivo real.
- **Consecuencia documentada**: un `schema.ts` puede importar el `schema.ts` de otro módulo para declarar claves foráneas; sin esa excepción, D-3 y D-6 se contradicen.
- Documentos alineados: `Overview.md` (interfaz pública = `index.ts`), `TestingStrategy.md` (`seeds/`) y `EngineeringStandards.md` (forma del módulo). Enlaces internos verificados: 0 rotos.

**No certifica:**

- **Nada creado ni ejecutado.** Ninguna carpeta ni archivo de código existe todavía; todo sigue en nivel *diseñado*.
- **Que la regla de ESLint funcione** como se describe, incluida la excepción de `schema.ts`: se configura en la 2.3 y se prueba en la 2.5.
- **Que Drizzle Kit lea el esquema repartido por módulos** sin problemas: se valida en la 2.4 y con la primera migración de la Fase 3.
- **Revisión independiente.** Es autoevaluación del mismo agente.

## 2026-09-12 — Subfase 2.2 cerrada (Re-verificación del stack)

**Certifica:**

- **Orden de la Fase 2**: 2.2 → 2.1 → 2.3 → 2.4 → 2.5, decidido por el usuario y registrado en el [Roadmap](docs/planning/Roadmap.md). La estructura del repositorio depende del stack aceptado.
- **Versiones vigentes verificadas el 2026-09-12** contra el registro npm y las páginas oficiales de soporte, con fuente y fecha en [EngineeringStandards.md](docs/development/EngineeringStandards.md) y la tabla completa en el [brief-2.2](docs/decisions/brief-2.2-re-verificacion-del-stack.md).
- **Seis decisiones resueltas por el usuario** según la recomendación:
  - Node 24 LTS;
  - Drizzle ORM 0.45 y Drizzle Kit 0.31;
  - ESLint 10 + `eslint-config-next` + Prettier;
  - npm 11;
  - PostgreSQL 18;
  - TypeScript 6.0.
- **[ADR 0004](docs/decisions/0004-stack-tecnologico-propuesto.md) aceptado**, con alternativas descartadas y revisiones previstas (Node 26 en LTS, TypeScript 7.1, Drizzle 1.0 antes de la 3.1).
- **Hallazgo D-6**: TypeScript 7.0 salió sin API programática y `typescript-eslint` exige `<6.1.0`, así que el proyecto queda en TypeScript 6.0.
- Enlaces internos verificados: 0 rotos.

**No certifica:**

- **Nada instalado ni ejecutado.** Todo sigue en nivel *diseñado*: sin `package.json`, lockfile, código, base de datos ni CI. La instalación es la 2.3 y requiere autorización.
- **Soporte de PostgreSQL 18 en Drizzle y sus drivers**: no se encontró declaración oficial. Se valida con conectividad real en la 2.4.
- **Compatibilidad en ejecución** entre los componentes: solo se contrastaron `engines` y `peerDependencies` declarados.
- **Revisión independiente.** Es autoevaluación del mismo agente.

## 2026-09-12 — Fase 1 cerrada (Diseño UX y validación del modelo)

**Certifica:**

- **Las tres subfases cerradas con aprobación del usuario**, ejecutadas en el orden 1.3 → 1.1 → 1.2:
  - 1.3: nueve decisiones de producto y ADRs 0007 a 0009;
  - 1.1: wireframes de las 10 pantallas;
  - 1.2: once decisiones de modelo, ADR 0010 y [matriz de trazabilidad](docs/architecture/TraceabilityMatrix.md).

  El detalle de cada una está en sus entradas, debajo.
- **Criterios de salida del [Roadmap](docs/planning/Roadmap.md), a nivel documental**:
  - cada dato mostrado en los wireframes tiene origen en `DataModel.md`;
  - cada FR tiene pantalla, endpoint o invariante con test;
  - cada índice tiene una consulta que lo usa;
  - toda decisión pendiente está resuelta o diferida con fase límite;
  - el usuario aprobó wireframes y decisiones.
- **Repositorio remoto** en GitHub privado desde el 2026-09-12, con todo el historial subido.

**No certifica:**

- **Nada de implementación.** Todo sigue en nivel *diseñado*: sin código, migraciones, dependencias, base de datos ni CI.
- **Que el modelo funcione sobre PostgreSQL.** Constraints, índices y consultas no se ejecutaron; se validan desde la Fase 2 (entorno) y la Fase 4 (`EXPLAIN` con volumen).
- **Usabilidad ni accesibilidad probadas** con usuarios o lectores de pantalla.
- **Que las personas y las reglas reflejen la operación real** más allá de lo que confirmó el usuario: se contrastan en el piloto de la Fase 9.
- **Revisión independiente.** Todas las revisiones de la fase son autoevaluación del mismo agente.

## 2026-09-12 — Subfase 1.2 cerrada (Validación cruzada del modelo)

**Certifica:**

- **Once decisiones del [brief-1.2](docs/decisions/brief-1.2-validacion-cruzada-del-modelo.md)**, resueltas por el usuario el 2026-09-12 según la recomendación, que cierran las brechas B-1 a B-11 de los wireframes:
  - `inventory_movements.balance_after`, con los tipos de movimiento reducidos a los dos ajustes;
  - `users.must_change_password`, con el cambio obligatorio de contraseña en la pantalla 1;
  - `products.min_stock` quitado;
  - auditoría del cliente en la pantalla 7;
  - disponibilidad de la métrica 12 tomada de la configuración;
  - última interacción y cantidad de mensajes derivadas, con índices propios.
- **[ADR 0010](docs/decisions/0010-un-usuario-una-organizacion-en-el-mvp.md)** aceptado: en el MVP un usuario pertenece a una sola organización.
- **Cinco hallazgos surgidos al armar la matriz**, resueltos por el usuario:
  - se quitaron `deleted_at` de `users`, `clients` y `products`, y `organizations.slug` (H-1, H-2);
  - se corrigieron `SecurityModel.md`, `Scope.md` y `Risks.md` con autorización ampliada (H-4);
  - quedan diferidos con fase límite el tipo de búsqueda (H-3, Fases 4 y 5) y el test de enmascarado para `viewer` (H-5, Fase 5).
- **[TraceabilityMatrix.md](docs/architecture/TraceabilityMatrix.md)** con cuatro vistas:
  - cada FR tiene pantalla, endpoint o invariante con test;
  - cada índice de [DataModel.md](docs/architecture/DataModel.md) tiene una consulta que lo usa;
  - cada filtro sin índice propio está justificado.

  En la revisión se agregaron 5 índices y se quitaron 2.
- **Verificaciones documentales**: los enlaces internos resuelven; no queda ningún `BRECHA` en los wireframes; no quedan menciones vigentes a lo quitado; los archivos tocados están dentro de lo autorizado.

**No certifica:**

- **Que los índices sirvan en la práctica.** Se asignaron por la forma de cada consulta, sin ejecutar ninguna. Se confirman con `EXPLAIN` sobre datos de volumen a partir de la Fase 4.
- **Que las derivaciones (última interacción, cantidad de mensajes) rindan bien.** Se revisan con medición en staging.
- **Nada de implementación.** Todo sigue en nivel *diseñado*: sin migraciones, código ni pruebas.
- **El cierre de la Fase 1**, que es un paso aparte con su propia aprobación.
- **Revisión independiente.** Todo el contraste es autoevaluación.

## 2026-09-12 — Subfase 1.1 cerrada (Wireframes de baja fidelidad)

**Certifica:**

- **Wireframes de las 10 pantallas** de [Screens.md](docs/product/Screens.md) en [docs/product/wireframes/](docs/product/wireframes/README.md), aprobados por el usuario el 2026-09-12. Formato Markdown con layout ASCII y variantes de escritorio y móvil, según W-1 y W-2 del [brief-1.1](docs/decisions/brief-1.1-wireframes-baja-fidelidad.md).
- **Cada dato visible tiene origen anotado**: una columna de [DataModel.md](docs/architecture/DataModel.md), una regla de derivación o una brecha. Cada pantalla separa lo que ven y hacen `admin` y `viewer`, y cubre carga, vacío, sin resultados y error.
- **Once brechas y discrepancias registradas** (B-1 a B-11) como entrada de la 1.2: siete datos que faltan en el modelo y cuatro discrepancias entre documentos. Las cinco detectadas al preparar el brief quedaron confirmadas.
- **Verificaciones documentales**: los enlaces internos resuelven; los archivos tocados están dentro de la lista autorizada; ningún wireframe muestra datos prohibidos (teléfono completo a `viewer`, vista previa de mensajes, hashes, auditoría a `viewer`) ni módulos fuera del MVP. Los nombres de archivo abreviados se aceptaron tal cual.

**No certifica:**

- **Que el modelo soporte las pantallas.** Las brechas están registradas, no resueltas: corregir `DataModel.md` y armar la matriz de trazabilidad es la 1.2.
- **Diseño visual, usabilidad ni accesibilidad probadas.** Los wireframes describen las pautas de accesibilidad; nadie los probó con usuarios ni con lectores de pantalla.
- **Nada de implementación.** Todo sigue en nivel *diseñado*.
- **Revisión independiente.** El contraste contra los criterios es autoevaluación del mismo agente que dibujó.

## 2026-09-12 — Subfase 1.3 cerrada (Decisiones de producto pendientes)

**Certifica:**

- **Las nueve decisiones del [brief-1.3](docs/decisions/brief-1.3-decisiones-de-producto-abiertas.md)**, resueltas por el usuario el 2026-09-11 y cerradas con su aprobación el 2026-09-12. Resumen: teléfono completo para `admin` y enmascarado para `viewer`, en la lista y en el detalle del cliente (la extensión al detalle fue interpretación del agente, confirmada por el usuario al cerrar); sin vista previa de mensajes; pantalla 10 de usuarios y roles dentro del MVP; zona horaria por defecto `America/Argentina/Buenos_Aires`; retención de mensajes diferida a la Fase 9; solo `admin` ajusta stock; personas aceptadas como supuesto declarado hasta el piloto.
- **ADRs [0007](docs/decisions/0007-identificador-de-cliente-solo-telefono.md), [0008](docs/decisions/0008-stock-nunca-negativo.md) y [0009](docs/decisions/0009-repositorio-remoto-github-y-ci.md)** aceptados: el cliente se identifica solo por teléfono, el stock nunca es negativo y el remoto es GitHub privado con Actions.
- **Propagación documental** a [Screens](docs/product/Screens.md), [FunctionalRequirements](docs/product/FunctionalRequirements.md), [DataModel](docs/architecture/DataModel.md) y [Risks](docs/planning/Risks.md), en el commit `cec1fc2`. Al cerrar se sumaron las adendas a [MetricsCatalog](docs/analytics/MetricsCatalog.md) (zona horaria por defecto) y [TestingStrategy](docs/development/TestingStrategy.md) (stock negativo rechazado sin movimiento y métricas cruzando un cambio de horario), y se corrigió el [Roadmap](docs/planning/Roadmap.md) para registrar que la 1.3 se ejecutó antes que la 1.1 y la 1.2.
- **Verificaciones documentales**: ninguna marca "pendiente de confirmación" sobre decisiones ya resueltas; los enlaces internos resuelven; no hay secretos ni archivos temporales.

**No certifica:**

- **Nada de implementación.** Todo sigue en nivel *diseñado*: sin código, pruebas, base de datos ni CI.
- **Que las decisiones reflejen la operación real del negocio.** Las reglas se confirmaron con el usuario, pero las personas siguen siendo un supuesto hasta el piloto de la Fase 9.
- **Wireframes ni matriz de trazabilidad**: siguen siendo la 1.1 y la 1.2.
- **Que el repositorio remoto exista.** El ADR 0009 elige el proveedor, pero decidirlo no es crearlo.
- **Revisión independiente.** La verificación es autoevaluación del mismo agente que redactó las decisiones.

## 2026-09-11 — Fase 0 cerrada (Descubrimiento, alcance y decisiones)

**Certifica:**

- **0.1 — Documentación**, aprobada por el usuario. Producto ([Vision](docs/product/Vision.md), [Scope](docs/product/Scope.md), [Personas](docs/product/Personas.md), [requisitos funcionales](docs/product/FunctionalRequirements.md) y [no funcionales](docs/product/NonFunctionalRequirements.md), [Screens](docs/product/Screens.md) con las 10 pantallas del MVP), arquitectura ([Overview](docs/architecture/Overview.md) con módulos, taxonomía de errores y observabilidad, [DataModel](docs/architecture/DataModel.md) con las 11 tablas y su ERD, [SecurityModel](docs/architecture/SecurityModel.md), [IntegrationBoundaries](docs/architecture/IntegrationBoundaries.md)), [catálogo de las 12 métricas](docs/analytics/MetricsCatalog.md) con fórmula, denominador, zona horaria y casos límite por métrica, y desarrollo ([estándares](docs/development/EngineeringStandards.md), [pruebas](docs/development/TestingStrategy.md), [entornos](docs/development/Environments.md), [protocolo de ejecución](docs/development/ExecutionProtocol.md)). Todo en nivel **diseñado**.
- **ADRs 0001 a 0006**: base de datos propia sin Airtable, monolito modular, migración del legado como proyecto separado, stack propuesto, métricas desde datos transaccionales y el repositorio como registro de decisiones. El [0004](docs/decisions/0004-stack-tecnologico-propuesto.md) queda como **propuesta** hasta re-verificar versiones en la subfase 2.2.
- **0.2 — Setup operativo**: repositorio Git en `main` con tres commits (`a3b45da`, `8b7bfa3`, `cf13247`) *(corregido el 2026-09-12: decía "dos commits")*; proyecto en Notion con 11 fases como subproyectos, 11 tareas espejo y 49 subfases como tareas; hub `80 Projects/AI WhatsApp Agent CRM` en el vault de Obsidian; semilla `docs/planning/Backlog.md` retirada tras verificar la carga.
- **Verificaciones documentales**: todos los enlaces internos resuelven (una referencia colgada detectada y corregida antes de cerrar); las menciones a Airtable son solo prohibiciones o contexto histórico, ninguna es una dependencia; las versiones del stack se verificaron contra fuentes oficiales en septiembre de 2026 y quedaron citadas.

**No certifica:**

- **Nada de implementación.** No hay código, dependencias instaladas, migraciones, base de datos, entorno ni CI. Ninguna afirmación de este repositorio supera el nivel *diseñado*.
- **Las decisiones de producto de la subfase 1.3 siguen abiertas**: teléfono enmascarado, vista previa de mensajes, alta de usuarios por pantalla o por script, identificador adicional de cliente, zona horaria por defecto, excepciones al stock negativo, retención de mensajes, y repositorio remoto y proveedor de CI.
- **Personas y varias reglas de negocio son supuestos** documentados, no confirmados con el dueño del negocio ([Risks](docs/planning/Risks.md)).
- **Wireframes y matriz de trazabilidad no existen**: son la Fase 1. `Screens.md` es especificación funcional, no diseño visual validado.
- **No hay repositorio remoto**: los tres commits viven solo en esta máquina *(corregido el 2026-09-12: decía "los dos commits")*.
- **Ninguna conexión con sistemas externos**: el contrato de ingestión está diseñado, sin emisor real ni tráfico.
