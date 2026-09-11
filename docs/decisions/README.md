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
| [0004](0004-stack-tecnologico-propuesto.md) | Stack tecnológico | propuesta |
| [0005](0005-metricas-desde-datos-transaccionales.md) | Métricas desde datos transaccionales | propuesta |
| [0006](0006-repositorio-registra-decisiones-no-tareas.md) | El repositorio registra decisiones, no tareas | aceptada |

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
