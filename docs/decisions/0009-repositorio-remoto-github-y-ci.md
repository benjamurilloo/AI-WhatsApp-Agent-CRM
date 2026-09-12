# 0009 — Repositorio remoto en GitHub privado y CI con GitHub Actions

- Estado: aceptada (resuelta por el usuario en la subfase 1.3, 2026-09-11). El remoto todavía no existe.
- Fecha: 2026-09-11

## Contexto

Al cerrar la Fase 0, el repositorio tenía tres commits que existían únicamente en el disco del usuario, sin remoto y sin integración continua. La Fase 2 tiene como criterio de aceptación que lint, typecheck, test y build pasen en CI, y la subfase 2.5 exige una guarda automatizada que falle si aparece una referencia a Airtable o al repositorio del agente de WhatsApp. Ninguna de las dos cosas es posible sin un remoto.

## Decisión

- El repositorio remoto será un repositorio **privado en GitHub**.
- La integración continua será **GitHub Actions**, definida como workflows versionados dentro de este repositorio.
- La creación del remoto y el primer `push` ocurren **antes de abrir la Fase 2**, no durante, y requieren una autorización explícita del usuario en el turno en que se ejecuten. Esta decisión no constituye esa autorización.

## Alternativas descartadas

- **Otro proveedor (GitLab, Bitbucket)**: descartado sin objeción técnica. GitHub Actions no requiere infraestructura adicional y el pipeline del MVP (lint, typecheck, test contra un servicio PostgreSQL, build) es un caso estándar en cualquiera de los tres.
- **Seguir sin remoto**: descartado. Deja el trabajo expuesto a una única falla de disco y hace inalcanzable el gate de salida de la Fase 2.

## Consecuencias

- El repositorio es privado: la documentación puede seguir nombrando contexto de negocio sin que eso sea información pública.
- La guarda anti-Airtable de la subfase 2.5 se implementa como un job de GitHub Actions que falla el build, no como un chequeo opcional.
- Los tests de integración de CI corren contra un PostgreSQL efímero levantado como *service container*, no contra ninguna base compartida. El nivel de evidencia sigue siendo `deterministic`.
- Ningún secreto real se carga en el repositorio ni en los secrets de Actions durante el MVP: no hay servicios externos conectados. La gestión de secretos se define en la subfase 9.1.
- Mientras el remoto no exista, el historial vive solo en la máquina del usuario. Eso es un riesgo abierto hasta que se ejecute el primer push.
