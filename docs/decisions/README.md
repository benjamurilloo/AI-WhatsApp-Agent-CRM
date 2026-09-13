# Decisiones

Esta carpeta responde "¿por qué el sistema quedó así?". Sigue la convención de los proyectos Vixora.

## Convención de archivos

- `NNNN-titulo.md`: un ADR corto por decisión que costaría revertir. Se escribe al tomar la decisión y no se reescribe: si cambia, se crea un ADR nuevo que la supera y se enlaza.
- `brief-X.Y-titulo.md`: brief de una tarea o subfase con frontmatter `schema: task-brief.v1` y criterios `AC-n` (ver [development/ExecutionProtocol.md](../development/ExecutionProtocol.md)).
- `cierre-X.Y-titulo.md`: evidencia por criterio y veredicto de cierre, cuando el detalle no entra en `CHANGELOG.md`.
- `notas-piloto-X.Y.md`: observaciones de un período de validación, registradas sin implementar hasta que el usuario confirme el cierre.

## Índice

| ADR | Título | Estado |
|---|---|---|
| [0001](0001-base-de-datos-propia-sin-airtable.md) | Base de datos propia, sin dependencia de Airtable | aceptada |
| [0002](0002-monolito-modular.md) | Monolito modular, no microservicios | aceptada |
| [0003](0003-migracion-legado-proyecto-separado.md) | Migración del legado como proyecto futuro separado | aceptada |
| [0004](0004-stack-tecnologico-propuesto.md) | Stack tecnológico | aceptada |
| [0005](0005-metricas-desde-datos-transaccionales.md) | Métricas desde datos transaccionales | aceptada |
| [0006](0006-repositorio-registra-decisiones-no-tareas.md) | El repositorio registra decisiones, no tareas | aceptada |
| [0007](0007-identificador-de-cliente-solo-telefono.md) | El teléfono E.164 es el único identificador de negocio del cliente | aceptada |
| [0008](0008-stock-nunca-negativo.md) | El stock nunca puede quedar negativo, sin excepciones | aceptada |
| [0009](0009-repositorio-remoto-github-y-ci.md) | Repositorio remoto en GitHub privado y CI con GitHub Actions | aceptada |
| [0010](0010-un-usuario-una-organizacion-en-el-mvp.md) | En el MVP un usuario pertenece a una sola organización | aceptada |
| [0011](0011-lint-con-eslint-10-sin-eslint-config-next.md) | Lint con ESLint 10, sin `eslint-config-next` (supera al 0004 en el lint) | aceptada |

## Briefs

| Brief | Subfase | Estado |
|---|---|---|
| [brief-1.3](brief-1.3-decisiones-de-producto-abiertas.md) | 1.3 — Decisiones de producto pendientes | resuelto el 2026-09-11, cerrado el 2026-09-12 |
| [brief-1.1](brief-1.1-wireframes-baja-fidelidad.md) | 1.1 — Wireframes de baja fidelidad | aprobado y cerrado el 2026-09-12 |
| [brief-1.2](brief-1.2-validacion-cruzada-del-modelo.md) | 1.2 — Validación cruzada del modelo | aprobado y cerrado el 2026-09-12 |
| [brief-2.2](brief-2.2-re-verificacion-del-stack.md) | 2.2 — Re-verificación del stack | aprobado y cerrado el 2026-09-12 |
| [brief-2.1](brief-2.1-estructura-del-repositorio.md) | 2.1 — Estructura del repositorio | aprobado y cerrado el 2026-09-12 |
| [brief-2.3](brief-2.3-bootstrap-de-la-aplicacion.md) | 2.3 — Bootstrap de la aplicación | aprobado y cerrado el 2026-09-12 |
| [brief-2.4](brief-2.4-base-de-datos-local.md) | 2.4 — Base de datos local | aprobado y cerrado el 2026-09-13 |
| [brief-2.5](brief-2.5-pipeline-de-ci.md) | 2.5 — Pipeline de CI | aprobado y cerrado el 2026-09-13 |
| [brief-3.1](brief-3.1-migraciones-de-identidad.md) | 3.1 — Migraciones de identidad | aprobado y cerrado el 2026-09-13 |

## Plantilla

```markdown
# NNNN — Título

- Estado: propuesta | aceptada | superada por NNNN
- Fecha: YYYY-MM-DD

## Contexto

## Decisión

## Alternativas descartadas

## Consecuencias
```
