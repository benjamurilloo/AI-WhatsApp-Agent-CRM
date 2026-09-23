# Entornos

**Estado: diseñado; el desarrollo local con PostgreSQL existe desde la 2.4** ([brief-2.4](../decisions/brief-2.4-base-de-datos-local.md)).

## Entornos

| Entorno | Propósito | Datos | Acceso |
|---|---|---|---|
| Desarrollo local | Trabajo del día a día | Seeds sintéticos vía Docker Compose (Postgres local) | Solo la máquina del desarrollador |
| Test (CI) | Ejecución automatizada de la suite de pruebas | Base de datos efímera, seeds mínimos por test | Solo el pipeline de CI |
| Staging | Validación funcional end-to-end antes de cualquier decisión de producción | Seeds sintéticos "de volumen", nunca datos reales | Equipo del proyecto |
| Producción | No existe todavía en el MVP | N/A | N/A |

## Reglas

- Cada entorno tiene su propia base de datos y sus propios secretos; nada se comparte entre entornos.
- Ningún entorno no productivo recibe datos reales del negocio en esta fase del proyecto — es una consecuencia directa de que el MVP no se conecta a tráfico productivo (ver [product/Scope.md](../product/Scope.md)).
- Las migraciones se aplican de forma explícita y versionada en cada entorno; nunca de forma automática e implícita en staging o producción sin un paso de aprobación.
- Variables de entorno documentadas en `.env.example`, con valores de ejemplo solo locales. El `.env` real nunca se versiona.

## Docker Compose (desarrollo local)

`docker-compose.yml` define un único servicio de PostgreSQL:

- **imagen**: `postgres:18.6-trixie`;
- **volumen** con nombre, montado en `/var/lib/postgresql`;
- **puerto**: publicado solo en `127.0.0.1:5432`;
- **healthcheck** con `pg_isready`.

No se orquestan otros servicios (caché, colas) salvo una necesidad concreta futura documentada.

Primera vez:

1. Copiar `.env.example` a `.env`.
2. Correr `docker compose up -d --wait`.

Uso diario:

| Acción | Comando |
|---|---|
| Levantar | `docker compose up -d --wait` |
| Detener sin perder datos | `docker compose stop` o `docker compose down` |
| Borrar los datos locales (irreversible) | `docker compose down -v` |

Next.js, Vitest y Drizzle Kit leen `DATABASE_URL` de `.env`. En CI las variables llegan del entorno.

`TRUSTED_PROXY` ([brief-3.3](../decisions/brief-3.3-autenticacion.md), D-4) indica si la aplicación corre detrás de un proxy propio que agrega la IP del cliente al final de `x-forwarded-for`. En desarrollo local va en `false` (o ausente): sin proxy, el límite de intentos por IP usa una única clave para todas las requests. Solo se pone en `true` en un entorno donde ese proxy exista.

`INGESTION_ENABLED` e `INGESTION_ALLOWED_CREDENTIALS` ([brief-6.5.3](../decisions/brief-6.5.3-autenticacion-de-servicio-y-rate-limit.md), D-4) controlan el endpoint de ingestión. Por defecto está apagado y responde `404`. Para probarlo en local:

1. crear una credencial sintética con `npm run ingestion:credential -- create --org <organization_id> --source <source>`, que imprime su id y el token una sola vez;
2. poner `INGESTION_ENABLED=true` y el id en `INGESTION_ALLOWED_CREDENTIALS`, y reiniciar `npm run dev`;
3. revocarla al terminar con `npm run ingestion:credential -- revoke --id <credential_id>`.

Nunca se configura una credencial de un emisor real. Los end-to-end encienden el modo de prueba en `playwright.config.ts`, con una credencial sintética que inserta `ingestion.spec.ts`.

- `/api/health` responde 200 `{"status":"ok"}` o 503 `{"status":"unavailable"}`, sin detalles.
- `npm run test` corre los tests de integración y **requiere la base levantada**.

## Migraciones

Se generan y se aplican siempre de forma explícita, nunca al arrancar la aplicación ([brief-3.1](../decisions/brief-3.1-migraciones-de-identidad.md)):

| Acción | Comando |
|---|---|
| Generar una migración después de cambiar un `schema.ts` | `npm run db:generate` |
| Aplicar las migraciones pendientes a la base de desarrollo | `npm run db:migrate` |

`db:migrate` actúa solo sobre la base de `DATABASE_URL`. Una migración generada se revisa como SQL antes de aplicarla y se versiona en `drizzle/`.

Los roles, privilegios y triggers, que Drizzle no expresa en `schema.ts`, van en migraciones a medida: `npx drizzle-kit generate --custom --name <nombre>` crea el archivo vacío y su entrada en el journal.

## Rol de aplicación `crm_app`

Desde la 3.6 ([ADR 0013](../decisions/0013-rol-de-aplicacion-y-tablas-de-solo-insercion.md)):

- La migración `0003` lo crea solo si no existe. Los roles son del servidor, así que `crm_dev` y `crm_dev_test` lo comparten.
- Es `NOLOGIN`. La aplicación, las migraciones y los tests se siguen conectando con el usuario de `DATABASE_URL`, que en el contenedor y en CI es superusuario.
- Los tests prueban sus permisos con `SET LOCAL ROLE crm_app` dentro de una transacción.
- Crear el rol exige `CREATEROLE` al usuario de migraciones. En un servicio gestionado se verifica en las Fases 8 y 9, junto con el rol con login con el que se conectará la aplicación.

## Base de test

Desde la 3.1 los tests de integración usan una base separada, `<nombre de DATABASE_URL>_test`, en el mismo servidor (`crm_dev_test` en local, `crm_ci_test` en CI):

- `tests/integration/global-setup.ts` la borra, la recrea y le aplica las migraciones con el migrador de `drizzle-orm` en cada ejecución. Necesita un usuario con permiso para crear bases, como el del contenedor.
- El proyecto de integración de Vitest recibe esa URL como `DATABASE_URL`, así que la suite no escribe en la base de desarrollo.
- Antes de cada test que escribe datos, `resetDatabase` vacía las tablas de `public`, y se niega a correr contra una base sin sufijo `_test`.
- Los archivos de integración corren en serie.

## Seed básico

Desde la 3.5 ([brief-3.5](../decisions/brief-3.5-pantalla-de-inicio-de-sesion.md), D-7):

| Acción | Comando |
|---|---|
| Sembrar la base de `DATABASE_URL` con datos sintéticos | `npm run db:seed` |

- Crea una organización, `admin@example.com` (`admin`), `lectura@example.com` (`viewer`) y `nuevo@example.com` (`viewer`, con la contraseña pendiente de cambio). Todos usan la contraseña de `SEED_USER_PASSWORD` en `.env`.
- Es idempotente: cada ejecución vuelve a dejar los mismos datos, incluidas las contraseñas y el cambio pendiente.
- Se niega a correr si el nombre de la base no termina en `_dev`, `_test` o `_e2e`.
- Requiere las migraciones aplicadas (`npm run db:migrate`).

## Seeds de conversaciones y de volumen

Desde la 6.2 ([brief-6.2](../decisions/brief-6.2-seeds-sinteticos-de-conversaciones.md)):

| Acción | Comando |
|---|---|
| Sembrar conversaciones de ejemplo | `npm run db:seed` (después del seed básico, en el mismo comando) |
| Sembrar el volumen (una organización) | `npm run db:seed:volume`, o `npm run db:seed:volume -- 2000` para otro tamaño |
| Sembrar la distribución de veinte organizaciones (9.3) | `npm run db:seed:volume:distribucion` |

- **Conversaciones de ejemplo**, en la organización del seed básico:
  - 6 clientes (uno sin teléfono, uno inactivo), 10 conversaciones y 26 mensajes;
  - incluyen conversaciones sin cliente, los tres estados, bordes de zona horaria y cuerpos con marcado para probar el escape;
  - los end-to-end no las usan (D-1).
- **Fechas fijadas en la primera corrida** (D-2): las fechas se calculan relativas al día de esa corrida, salvo una conversación del 19/10/2008. `messages` es de solo inserción, así que las corridas siguientes no mueven mensajes ni fechas: solo reponen el estado de las conversaciones y los datos de los clientes. Para tener fechas recientes otra vez hay que recrear la base de desarrollo.
- **Volumen** (D-3):
  - "Organización de volumen", con `volumen@example.com` (`admin`, contraseña de `SEED_USER_PASSWORD`);
  - 10.000 clientes y 10.000 conversaciones con entre 1 y 12 mensajes (65.260 en total), repartidas en los 180 días anteriores;
  - es determinista: la fila *i* es la misma con cualquier tamaño, y una corrida posterior no toca las filas existentes;
  - en la máquina local tarda unos 5 s;
  - no corre en CI;
  - no incluye productos ni inventario (D-4). La 8.5 lo extendió a productos, inventario y miembros.
- **Distribución de varias organizaciones** (9.3, D-1), con `npm run db:seed:volume:distribucion`:
  - veinte organizaciones: una de 10.000 clientes, tres de 1.000 y dieciséis de 50;
  - existe porque hasta la 9.3 todos los planes de consulta del proyecto se midieron con **una sola** organización dueña de casi todas las filas, y con esa distribución `organization_id = X` no filtra nada: el planificador elige recorridos completos, correctamente, y ese no es el plan que elegirá con veinte organizaciones;
  - la organización **ordinal 0 es la histórica y sus filas no cambian**, para que la calibración de la 9.3 pueda compararse contra los números de la 8.5;
  - siembra además `ingestion_events` sintéticos (9.3, D-5), que el seed de una sola organización no toca.
- Los seeds se niegan a correr si el nombre de la base no termina en `_dev`, `_test`, `_e2e` o `_staging`. El último lo agregó la 9.1: el entorno de staging necesita usuarios sintéticos y llegan por un seed versionado, nunca promovidos desde desarrollo.

## Base de end-to-end

Desde la 3.5 ([brief-3.5](../decisions/brief-3.5-pantalla-de-inicio-de-sesion.md), D-8) los tests de Playwright usan `<nombre de DATABASE_URL>_e2e` (`crm_dev_e2e` en local, `crm_ci_e2e` en CI), separada de la de integración para que `npm run test` y `npm run test:e2e` no se vacíen los datos entre sí:

| Acción | Comando |
|---|---|
| Descargar Chromium de Playwright, una vez por máquina | `npx playwright install chromium` |
| Correr los tests end-to-end | `npm run build` y después `npm run test:e2e` |

- `tests/e2e/global-setup.ts` borra la base, la recrea, la migra y la siembra en cada ejecución. Cada test repone el seed y borra sesiones e intentos de ingreso.
- Playwright levanta `next start` en el puerto 3100 con `DATABASE_URL` apuntando a esa base. Necesita un build previo.
- `next start` corre en modo producción: la cookie es `__Host-crm_session` con `Secure`, que Chromium acepta sobre `http://localhost`.
