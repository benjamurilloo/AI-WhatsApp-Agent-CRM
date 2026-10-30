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

- El repositorio es privado: la documentación puede seguir nombrando contexto de negocio sin que eso sea información pública. **Caducada el 2026-10-30**: el repositorio **se hizo público** ese día, para destrabar una CI que GitHub había bloqueado por facturación, y los repositorios públicos tienen minutos de Actions ilimitados en los runners estándar. Toda la documentación del repositorio, y su historial completo desde el primer commit, son información pública desde entonces. Antes del cambio se auditaron los 383 commits del historial buscando secretos, y salió limpio. **Lo que esta consecuencia licenciaba ya no está licenciado**: lo que se escriba acá sobre el negocio, sus clientes o sus números es público, y hay que escribirlo con ese supuesto. El cambio de visibilidad no se registró como un ADR propio; esta nota es su rastro, y está contada en el §Cierre de [brief-24.4.3](brief-24.4.3-clientes-operaciones-y-actividad.md).
- La guarda anti-Airtable de la subfase 2.5 se implementa como un job de GitHub Actions que falla el build, no como un chequeo opcional.
- Los tests de integración de CI corren contra un PostgreSQL efímero levantado como *service container*, no contra ninguna base compartida. El nivel de evidencia sigue siendo `deterministic`.
- Ningún secreto real se carga en el repositorio ni en los secrets de Actions durante el MVP: no hay servicios externos conectados. La gestión de secretos se define en la subfase 9.1.
- Mientras el remoto no exista, el historial vive solo en la máquina del usuario. Eso es un riesgo abierto hasta que se ejecute el primer push.
