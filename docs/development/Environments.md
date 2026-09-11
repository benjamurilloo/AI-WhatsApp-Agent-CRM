# Entornos

**Estado: diseñado.**

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
- Variables de entorno documentadas en `.env.example` (a crear en Fase 2), sin valores reales.

## Docker Compose (diseño)

Un `docker-compose.yml` de desarrollo con un único servicio de PostgreSQL, volumen persistente local, y variables de conexión consumidas por la app vía `.env`. No se orquestan otros servicios (cache, colas) salvo necesidad concreta futura documentada.
