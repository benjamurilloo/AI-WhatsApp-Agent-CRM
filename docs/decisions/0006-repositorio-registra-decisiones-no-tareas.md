# 0006 — El repositorio registra decisiones, no tareas

- Estado: aceptada (decisión del usuario, 2026-09-11)
- Fecha: 2026-09-11

## Contexto

La instrucción inicial pidió `docs/planning/Backlog.md` y `docs/planning/Roadmap.md` dentro del repositorio. La metodología Vixora tiene validado, en otros proyectos, el patrón *Repository Records Decisions, Not Task Lists*: dos listas de tareas mantenidas a mano (repo y Notion) divergen casi de inmediato.

## Decisión

- **Notion** lleva fases, subfases, tareas y su estado. Lo mantiene Claude Code.
- **El repositorio** registra decisiones y cierres: ADRs (`NNNN-*.md`), briefs (`brief-X.Y-*.md`), cierres (`cierre-X.Y-*.md`) y `CHANGELOG.md`. Cada cierre de fase o subfase agrega una entrada con lo que certifica y lo que explícitamente no.
- **`docs/planning/Roadmap.md`** se conserva como diseño de fases: objetivos, gates, camino crítico y Definición de Terminado. No lleva tareas ni estado.
- **`docs/planning/Backlog.md`** es una semilla temporal para cargar Notion. Se retira del repositorio cuando la carga esté verificada.

## Alternativas descartadas

- Mantener `Backlog.md` como fuente de tareas en paralelo a Notion: produce divergencia.
- Usar solo el repositorio, sin Notion: el usuario ya gestiona sus proyectos en Notion.

## Consecuencias

- "¿Qué falta hacer?" se responde en Notion. "¿Por qué quedó así y qué se certificó?" se responde en el repositorio.
- El cierre de cualquier fase o subfase no está completo sin su entrada en `CHANGELOG.md`.
- Hasta cargar Notion, la semilla solo se edita para corregirla. Después de la carga, no se edita más.
