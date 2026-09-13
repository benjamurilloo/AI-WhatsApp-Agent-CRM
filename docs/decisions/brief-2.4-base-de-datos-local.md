---
schema: task-brief.v1
task_id: 2.4
task_type: implementation
generated_at: 2026-09-13
---

# Brief: 2.4 — Base de datos local

## Objetivo

Levantar PostgreSQL 18 local con Docker Compose y conectarlo a la aplicación mediante Drizzle. La subfase incluye un health check en `/api/health` y los primeros tests de integración contra la base real. No crea tablas, migraciones ni datos.

Crea exactamente lo que asigna a la 2.4 la tabla "Qué crea cada subfase" de [RepositoryStructure.md](../architecture/RepositoryStructure.md), con las versiones del [ADR 0004](0004-stack-tecnologico-propuesto.md). También cierra el pendiente "no verificado" de [EngineeringStandards.md](../development/EngineeringStandards.md): la conectividad de Drizzle y su driver con PostgreSQL 18.

## Ubicación en la Fase 2

- **Orden**: 2.2 → 2.1 → 2.3 (cerradas) → **2.4** → 2.5.
- **Gates de entrada**, que se piden por separado de la aprobación del brief:
  1. autorización explícita para instalar las dependencias del alcance incluido;
  2. autorización explícita para descargar la imagen de PostgreSQL y levantar el contenedor local;
  3. Docker Desktop en marcha. Verificado el 2026-09-13: Docker 29.1.3 y Compose 5.0.1 están instalados, pero el daemon no responde. Lo arranca el usuario.
- **Criterio de salida de la Fase 2 que prepara**: "PostgreSQL local con health check" ([Roadmap](../planning/Roadmap.md)). La ejecución en CI con una base efímera corresponde a la 2.5.

## Hallazgos de la verificación previa (2026-09-13)

1. **Versiones en el registro npm**:
   - `drizzle-orm` 0.45.2 y `drizzle-kit` 0.31.10 son `latest`; la 1.0 sigue en rc.
   - `pg` 8.23.0 (2026-08-08), con `@types/pg` 8.23.1, que publica tipos para `ts6.0`.
   - `postgres` 3.4.9 (2026-04-05).
   - `drizzle-orm` acepta `pg >=8`, `@types/pg *` y `postgres >=3` como dependencias pares opcionales.
2. **`drizzle-kit` 0.31.10 depende de `@esbuild-kit/esm-loader`**, marcado como deprecado ("Merged into tsx"). Es esperable que `npm install` muestre un aviso de deprecación. No es un conflicto de dependencias pares.
3. **Cambio en la imagen oficial de PostgreSQL 18** ([Docker Hub](https://hub.docker.com/_/postgres)): `PGDATA` pasa a `/var/lib/postgresql/18/docker` y el volumen declarado, a `/var/lib/postgresql`. Montar el volumen en `/var/lib/postgresql/data`, como en las versiones 17 y anteriores, no es correcto en la 18. El volumen se monta en `/var/lib/postgresql`.
4. **Tags disponibles**: `18.6` (actualizado el 2026-08-26), `18.6-trixie`, `18.6-bookworm` y `18.6-alpine`. Las variantes Debian y Alpine se diferencian en la biblioteca de C y en las collations: glibc frente a musl.
5. **Los route handlers de Next.js 16.3 no se cachean por defecto** (`node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`). `GET /api/health` corre en cada request, así que `next build` no necesita la base, siempre que la conexión no se abra al importar el módulo.
6. **Puerto 5432**: sin nada escuchando y sin servicios `postgres*` en Windows el 2026-09-13.
7. **Soporte de PostgreSQL 18**: ni `pg` ni `postgres` declaran una versión máxima de servidor. La compatibilidad sigue sin verificar hasta el test de conectividad de esta subfase.

## Alcance incluido

1. Registrar la resolución de D-1 a D-5.
2. Instalar con `npm install`, sin `--force`, `--legacy-peer-deps` ni `overrides`:
   - **dependencies**: `drizzle-orm` 0.45.x y el driver de D-1 (`pg` 8.23.x);
   - **devDependencies**: `drizzle-kit` 0.31.x y los tipos del driver (`@types/pg` 8.23.x), si D-1 los requiere.
3. Crear `docker-compose.yml` con un único servicio de PostgreSQL:
   - imagen fijada con el tag de D-5;
   - volumen con nombre montado en `/var/lib/postgresql`;
   - puerto publicado solo en `127.0.0.1:5432`;
   - usuario, contraseña y base tomados de `.env`;
   - `healthcheck` con `pg_isready`.
4. Crear `.env.example` con `DATABASE_URL` y las variables del contenedor, con valores de ejemplo locales marcados como tales y ningún secreto real. El `.env` del usuario queda ignorado por Git, como ya indica `.gitignore`.
5. Crear `drizzle.config.ts` con `dialect: "postgresql"`, `schema: "./src/modules/*/schema.ts"`, `out: "./drizzle"` y la URL desde el entorno. En esta subfase solo se typechequea y se lintea: no se ejecuta `drizzle-kit generate` ni `migrate`, porque todavía no hay esquema.
6. Crear `src/shared/db/` con:
   - **cliente de Drizzle**:
     - usa el pool del driver;
     - no abre conexiones al importar el módulo;
     - si falta `DATABASE_URL`, falla con un error claro recién en el primer uso;
     - reutiliza una única instancia entre recargas de `next dev`;
   - **health check**: función que ejecuta `SELECT 1` con timeout y devuelve un resultado booleano. No lanza excepciones ni expone el error.
7. Crear `src/app/api/health/route.ts`: `GET` llama al health check de `src/shared/db/` y responde según D-3.
8. Crear `tests/integration/` con tests contra la base real:
   - Drizzle ejecuta `SELECT 1` y obtiene 1;
   - la versión del servidor pertenece a la línea 18 (`server_version_num` entre 180000 y 189999);
   - **caso forzado a fallar**: el health check contra una URL sin servidor (`127.0.0.1`, un puerto cerrado) devuelve "no disponible" dentro del timeout, sin lanzar excepciones.
9. Cargar `DATABASE_URL` en Vitest y en `drizzle.config.ts` según D-4. Next.js lee `.env` por su cuenta.
10. Quitar `--passWithNoTests` del script `test`, como fijó la D-2 de la 2.3. `npm run test` corre los dos proyectos y requiere la base levantada.
11. Actualizar la documentación:
    - [EngineeringStandards.md](../development/EngineeringStandards.md): driver, fila de contenedores con el tag de D-5 y resultado de la verificación de PostgreSQL 18;
    - [Environments.md](../development/Environments.md): cómo levantar y detener la base, y la base de test según D-2;
    - [RepositoryStructure.md](../architecture/RepositoryStructure.md): nombres de los archivos de `src/shared/db/` y de `tests/integration/`.

## Alcance excluido

- Tablas, `schema.ts`, módulos de dominio, migraciones, `drizzle/` y `seeds/`: son de la Fase 3 en adelante. Ejecutar `drizzle-kit generate`, `migrate` o `push`.
- Scripts `db:*` de Drizzle Kit: se agregan con la primera migración, en la 3.1.
- Workflows de CI y la base efímera de CI: son de la 2.5.
- Taxonomía de errores, log estructurado y `request_id`: los decide la Fase 3 ([HANDOFF](../../HANDOFF.md)).
- SSL, ajuste del pool, réplicas, backups y secretos de entornos no locales: son de la Fase 9.
- Otros servicios en Docker Compose (caché, colas, pgAdmin).
- `server-only`, `dotenv` o cualquier dependencia fuera de la lista del alcance incluido.
- `npm audit fix`: los avisos se registran y se tratan en la Fase 8.

## Archivos o componentes autorizados

Lista cerrada:

- `package.json` (dependencias y script `test`), `package-lock.json` y `node_modules/`.
- `docker-compose.yml`, `.env.example` y `drizzle.config.ts`.
- `.env` local del usuario, ignorado por Git. Se crea copiando `.env.example` y nunca se versiona.
- `src/shared/db/`, con el cliente y el health check en un máximo de dos archivos más su `index.ts`.
- `src/app/api/health/route.ts`.
- `tests/integration/`, con los tests del punto 8.
- `vitest.config.mts`, solo para la carga del entorno de D-4.
- `.next/`, generado por Next.js e ignorado por Git.
- `docs/decisions/brief-2.4-base-de-datos-local.md` (este archivo) y su fila en `docs/decisions/README.md`.
- `EngineeringStandards.md`, `Environments.md` y `RepositoryStructure.md`, en lo indicado en el punto 11.
- `CHANGELOG.md` y `HANDOFF.md`, al cerrar la subfase.
- Fuera del repositorio: la imagen `postgres` y el volumen con nombre de Docker.

## Fuentes de verdad

1. [RepositoryStructure.md](../architecture/RepositoryStructure.md): ubicación de cada archivo y regla de frontera. `src/shared/` no importa módulos.
2. [Overview.md](../architecture/Overview.md): "`/api/health` verifica la conectividad con la base sin exponer detalles".
3. [Environments.md](../development/Environments.md) y [TestingStrategy.md](../development/TestingStrategy.md): un solo servicio de PostgreSQL, y tests de integración contra PostgreSQL real, sin mocks.
4. [ADR 0004](0004-stack-tecnologico-propuesto.md) y [EngineeringStandards.md](../development/EngineeringStandards.md): versiones.
5. Registro npm y Docker Hub al momento de instalar. Documentación de Next.js incluida en `node_modules/next/dist/docs/` y de [Drizzle](https://orm.drizzle.team/docs/get-started-postgresql).

## Dependencias

- 2.3 cerrada (commit `f800e68`).
- Node v24.15.0 y npm 11.12.1 (verificados el 2026-09-13).
- Docker Desktop en marcha, además de las dos autorizaciones de los gates.

## Decisiones pendientes

Cada decisión trae una recomendación, no una resolución: la resuelve el usuario.

### D-1 — Driver de PostgreSQL

- **Opciones**:
  - (a) **`pg` 8.23 con `@types/pg`**;
  - (b) **`postgres` 3.4 (postgres.js)**, que trae sus propios tipos.
- **Recomendación**: (a).
  - Es el driver más usado con PostgreSQL en Node y el que Drizzle documenta primero.
  - Su última versión es de agosto de 2026; la de `postgres.js`, de abril.
  - Las librerías de sesiones que puede evaluar la 3.2 suelen integrarse con `pg`.
  - (b) es más liviano, pero no aporta nada concreto al MVP.
- **Consecuencia**: una dependencia de tipos más. `EngineeringStandards.md` fija el driver.

### D-2 — Base de test

- **Opciones**:
  - (a) **Una sola base local en la 2.4**. Los tests de esta subfase solo leen (`SELECT 1` y la versión), así que no ensucian nada. La base de test separada se crea con el primer test que escriba datos, en la 3.1, y ahí se decide cómo.
  - (b) **Una segunda base `crm_test` en el mismo contenedor**, creada con un script de inicialización. Suma una carpeta que `RepositoryStructure.md` no prevé.
  - (c) **Un segundo servicio de PostgreSQL en Compose**, en contra del diseño de `Environments.md`.
- **Recomendación**: (a). Crear ahora una base de test que nada usa es infraestructura anticipada. La 3.1 conoce la necesidad real: aislamiento por test, truncado o transacciones.
- **Consecuencia**: `Environments.md` registra que la separación de la base de test está pendiente para la 3.1. La 2.4 no certifica aislamiento entre desarrollo y tests.

### D-3 — Respuesta de `/api/health`

- **Opciones**:
  - (a) **200 con `{"status":"ok"}` o 503 con `{"status":"unavailable"}`**, con `Cache-Control: no-store` y timeout del health check de 2 segundos. Sin versión, latencia, host ni mensaje de error.
  - (b) Lo mismo, más la versión del servidor y la latencia.
- **Recomendación**: (a). Overview exige no exponer detalles, y el endpoint no tiene autenticación. La versión del servidor es información útil para un atacante. La latencia puede medirse del lado del cliente.
- **Consecuencia**: el error de conexión no se muestra. Hasta que exista el log estructurado de la Fase 3, se escribe con `console.error` en el servidor, sin la URL ni la contraseña.

### D-4 — Carga de `.env` fuera de Next.js

- **Opciones**:
  - (a) **`process.loadEnvFile()` nativo de Node 24**, llamado solo si `.env` existe, para que CI pueda inyectar las variables directamente;
  - (b) **`dotenv`** como dependencia de desarrollo.
- **Recomendación**: (a). Node 24 ya lo trae y `dotenv` sería una dependencia más.
- **Consecuencia**: `vitest.config.mts` y `drizzle.config.ts` cargan `.env` con esa llamada.

### D-5 — Tag de la imagen

- **Opciones**:
  - (a) **`postgres:18.6-trixie`**: Debian con glibc, versión menor y distribución fijadas;
  - (b) `postgres:18.6`: hoy apunta a trixie, pero puede cambiar de distribución sin aviso;
  - (c) `postgres:18.6-alpine`: imagen más chica, con musl.
- **Recomendación**: (a).
  - Los clientes se ordenan y buscan por nombre en español (H-3, Fases 4 y 5), así que la collation importa. glibc es lo habitual en PostgreSQL gestionado, y musl ordena distinto.
  - Fijar la distribución evita que un `docker compose pull` cambie la collation debajo de datos ya indexados.
- **Consecuencia**: una actualización menor (18.7) es un cambio explícito de una línea, registrado en `EngineeringStandards.md`.

## Resolución

Brief aprobado por el usuario el **2026-09-13**. D-1 a D-5 se resolvieron el mismo día, todas según la recomendación. El usuario autorizó explícitamente dos cosas: instalar las dependencias del alcance incluido, y descargar la imagen `postgres:18.6-trixie` y levantar el contenedor local.

Subfase **cerrada el 2026-09-13** con confirmación del usuario. Nivel alcanzado: *validado localmente*, solo para la conexión y el health check. AC-1 a AC-12 están cumplidos, con la evidencia en [CHANGELOG.md](../../CHANGELOG.md).

| Decisión | Resolución |
|---|---|
| D-1 Driver | `pg` 8.23 con `@types/pg` |
| D-2 Base de test | Una sola base local; la base de test separada se decide en la 3.1 |
| D-3 `/api/health` | 200 `{"status":"ok"}` o 503 `{"status":"unavailable"}`, `Cache-Control: no-store`, timeout de 2 s, sin detalles |
| D-4 Carga de `.env` | `process.loadEnvFile()` nativo, solo si `.env` existe |
| D-5 Imagen | `postgres:18.6-trixie` |

### Ajustes durante la ejecución

- **Manejador de `error` en el pool de `pg`**: al detener la base con `next dev` corriendo, `/api/health` respondió 503 como correspondía, pero el pool emitió un `uncaughtException` ("terminating connection due to administrator command", código `57P01`). Pasa cuando el servidor corta una conexión inactiva y nadie escucha el evento `error`. En `next start` puede tirar el proceso. Además, el error sin manejar serializa el cliente completo, **contraseña incluida**.
  - Primero se agregó un test de integración que reproduce el corte con `pg_terminate_backend` sobre la conexión inactiva de un pool propio del test. Falló con el `uncaughtException`.
  - Después se agregó en `createDb` el manejador `pool.on("error")`, que registra solo el código. Con el manejador, el test pasa y el pool se recupera.
  - **Nota sobre el invariante "solo `SELECT` de lectura"**: `pg_terminate_backend` se invoca con `SELECT` y solo corta la conexión que abrió el propio test. No crea, modifica ni borra datos.
- **Aviso de `npm audit`**: la instalación de `drizzle-kit` trae 4 avisos moderados, de `esbuild <=0.24.2` a través de `@esbuild-kit/*`, que afectan solo al servidor de desarrollo de esbuild. No son críticos ni tocan `drizzle-orm`, `pg` o `next`, así que no activan la condición de detención. Se registran sin `npm audit fix`, que propone bajar `drizzle-kit` a 0.18.
- **Tests**: son 5 y no 3. Además de los tres del punto 8, hay uno que confirma que el health check informa disponible y el de conexión cortada.

## Invariantes

- No hay referencias a Airtable ni al repositorio del agente de WhatsApp.
- No se crean tablas, esquemas, migraciones ni datos. La base solo recibe `SELECT` de lectura.
- Ningún secreto real en archivos versionados. `.env` nunca aparece en `git status`.
- PostgreSQL solo escucha en `127.0.0.1`.
- `src/shared/db/` no importa nada de `src/modules/`, y `src/app/` solo importa `@/shared/db`, sin rutas internas.
- `next build` no requiere la base levantada.
- `/api/health` no expone versión, host, credenciales ni mensajes de error.
- Ninguna dependencia fuera de la lista, ni conflictos de dependencias pares resueltos por la fuerza.

## Criterios de aceptación

- **AC-1**: D-1 a D-5 tienen resolución del usuario con fecha.
- **AC-2**: `npm install` termina sin avisos de dependencias pares no satisfechas y sin forzar nada. Los avisos de deprecación, como el de `@esbuild-kit/esm-loader`, quedan registrados. `npm ci` desde cero reproduce la instalación.
- **AC-3**: las dependencias nuevas de primer nivel coinciden exactamente con la lista autorizada, y el lockfile resuelve dentro de las líneas del ADR 0004.
- **AC-4**: con `docker compose up -d`, el contenedor llega a `healthy`, el puerto está publicado solo en `127.0.0.1:5432` y el volumen está montado en `/var/lib/postgresql`. Después de `docker compose down` y un nuevo `up`, la base sigue existiendo.
- **AC-5**: `npm run test` pasa con la base levantada. Corre los tests de integración del punto 8, incluido el caso forzado a fallar, y `package.json` ya no tiene `--passWithNoTests`.
- **AC-6**: el test de versión informa una versión 18.x del servidor. Con eso, la conectividad de PostgreSQL 18 con Drizzle y `pg` queda validada localmente en `EngineeringStandards.md`, solo en ese nivel.
- **AC-7**: con `npm run dev` y la base levantada, `GET /api/health` responde 200, `{"status":"ok"}` y `Cache-Control: no-store`. Con el contenedor detenido, responde 503 y `{"status":"unavailable"}` en menos de 3 segundos, sin versión, host ni error en el cuerpo. Al levantar la base otra vez, vuelve a 200 sin reiniciar `next dev`.
- **AC-8**: con el contenedor detenido, `npm run typecheck`, `npm run lint`, `npm run format:check` y `npm run build` pasan.
- **AC-9**: la regla de frontera sigue en verde. `src/shared/db/` no importa módulos y `route.ts` importa solo `@/shared/db`.
- **AC-10**: `git status` muestra solo archivos autorizados. `.env`, `node_modules/` y `.next/` no aparecen, y ningún archivo versionado contiene una contraseña distinta de los valores de ejemplo de `.env.example`.
- **AC-11**: `npm audit` se ejecuta y su resumen por severidad queda registrado, sin corregir nada.
- **AC-12**: `EngineeringStandards.md`, `Environments.md` y `RepositoryStructure.md` reflejan las resoluciones, y los enlaces internos siguen resolviendo.

## Pruebas y evidencia requerida

- **Evidencia `deterministic`**, ejecutada localmente contra PostgreSQL 18 real en Docker: salidas de `npm ci`, `docker compose ps`, `npm run test`, `typecheck`, `lint`, `format:check` y `build` con la base detenida, y `npm audit`.
- **Evidencia de runtime local**: respuestas de `/api/health` con la base arriba, detenida y levantada de nuevo.

**Nivel resultante esperado: validado localmente**, solo para la conexión y el health check: hay tests de integración pasando contra PostgreSQL real. No se valida ningún dato, tabla ni regla de negocio, porque no existen. Tampoco se valida la ejecución en CI, que corresponde a la 2.5.

La revisión es una autoevaluación (`self_assessment: true`).

## Condiciones de detención

- **Antes de `npm install`**, si no hay autorización explícita para instalar.
- **Antes de `docker compose pull` o `up`**, si no hay autorización explícita para la imagen y el contenedor, o si Docker Desktop no responde.
- Si el puerto 5432 está ocupado al levantar el contenedor: se consulta en vez de cambiar de puerto por cuenta propia.
- Si npm informa una dependencia par no satisfecha o un conflicto de resolución.
- Si la conexión con PostgreSQL 18 falla por incompatibilidad del driver o del protocolo: se reporta con la salida, sin cambiar de driver ni de versión mayor.
- Si hace falta un paquete, archivo o carpeta fuera de la lista autorizada.
- Si `npm audit` informa una vulnerabilidad crítica en `drizzle-orm`, `pg` o `next`: se consulta antes de cerrar.
- Antes de commit, push o cambios de estado en Notion.
