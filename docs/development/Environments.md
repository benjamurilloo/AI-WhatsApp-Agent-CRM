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

- `/api/health` responde 200 `{"status":"ok"}` o 503 `{"status":"unavailable"}`, sin detalles.
- `npm run test` corre los tests de integración y **requiere la base levantada**.

**Base de test**: en la 2.4 los tests usan la misma base local, porque solo hacen lecturas. La base de test separada, con aislamiento entre tests, se decide en la 3.1, junto con el primer test que escribe datos.
