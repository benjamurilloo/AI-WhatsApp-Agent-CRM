# Protocolo de Ejecución con Claude Code

**Estado: en uso.** Rige cada subfase; cada aplicación queda registrada en su brief y en `CHANGELOG.md`.

Aplica al proyecto la metodología Vixora del vault de Obsidian. Claude Code es el único agente de IA: recupera contexto, planifica, implementa, verifica, revisa y cierra. El usuario aprueba el alcance y los cierres, y autoriza Git, despliegues y efectos externos.

## Ciclo por subfase

| Paso | Qué se hace | Skill de apoyo | Resultado | Quién autoriza |
|---|---|---|---|---|
| 1. Retomar | Reconstruir el estado desde el vault, Notion y el repo | `resuming-phased-projects`, solo si no hay contexto vigente | Cápsula `project-state.v1` | — |
| 2. Planificar | Preparar el brief de la subfase | `planning-and-briefing-phases` | `docs/decisions/brief-X.Y-titulo.md` | El usuario aprueba el brief |
| 3. Implementar | Solo lo que autoriza el brief | — | Código, pruebas y documentación | El brief aprobado |
| 4. Revisar | Contrastar la entrega con cada `AC-n` | `reviewing-scoped-deliveries` | Veredicto `aprobado` o `R{n}`, con `self_assessment: true` | — |
| 5. Cerrar | Reconciliar evidencia y documentación | `closing-and-reconciling-phases` | Entrada en `CHANGELOG.md`, `cierre-X.Y-*.md` si hace falta, Notion actualizado y Knowledge Capture | El usuario confirma el cierre. Git requiere autorización explícita |

Las skills se usan cuando aportan, no se encadenan las cuatro por obligación. Ninguna autoriza por sí sola commit, push, merge, deploy ni cambios en Notion.

## Reglas

1. Una subfase por turno o por rama.
2. Sin brief aprobado no se toca código.
3. Los archivos autorizados son una lista cerrada. Tocar algo fuera de ella es un hallazgo bloqueante en la revisión.
4. Lo que el brief marca como decisión pendiente no se inventa: se detiene el trabajo y se pregunta.
5. La documentación que el brief indica se actualiza en el mismo turno.
6. La revisión del propio trabajo se declara `self_assessment: true` y nunca se presenta como independiente.
7. Cada afirmación de validación indica su nivel exacto (tabla en [CLAUDE.md](../../CLAUDE.md)).
8. Si una subfase resulta tener más de una responsabilidad independiente, se detiene y se propone dividirla antes de seguir.

## Plantilla de brief (`task-brief.v1`)

```markdown
---
schema: task-brief.v1
task_id: X.Y
task_type: audit | design | implementation | hardening | deterministic-testing | runtime-validation | integration | documentation-closure
generated_at: YYYY-MM-DD
---

# Brief: X.Y — Título

## Objetivo
Una sola subfase, con un resultado verificable.

## Alcance incluido

## Alcance excluido

## Archivos o componentes autorizados
Lista cerrada.

## Fuentes de verdad
Por ejemplo: docs/architecture/DataModel.md, ADR que aplique.

## Dependencias

## Decisiones pendientes
Lo que no está decidido: el implementador se detiene y pregunta.

## Invariantes
Por ejemplo: sin referencias a Airtable; inventory_movements insert-only; todo acceso filtrado por organization_id.

## Criterios de aceptación
- **AC-1**: ...

## Pruebas y evidencia requerida
Nivel: deterministic | isolated-runtime | producer-consumer | controlled-real-effect | authenticated-end-to-end | production-readiness.
Comandos, según existan en el repo: lint, typecheck, suite específica de tests, build.

## Condiciones de detención
- Antes de commit, push, merge o deploy.
- Antes de ejecutar migraciones contra una base que no sea la local o la de test.
- Antes de instalar dependencias no previstas en el brief.
- Antes de cambiar el estado en Notion si el usuario no confirmó el cierre.
```

Nunca se omiten el objetivo, el alcance incluido y excluido, los criterios de aceptación ni las condiciones de detención. El resto se adapta al tamaño y al riesgo, sin bloques "N/A" repetidos.

## Prompt para iniciar una subfase

```text
Revisá Obsidian y aplicá nuestra metodología antes de continuar.
Proyecto: AI WhatsApp Agent CRM. Subfase: X.Y — <título> (ver Notion).
Si no existe docs/decisions/brief-X.Y-*.md, preparalo y esperá mi aprobación antes de implementar.
Si existe y está aprobado, implementá solo su alcance, verificá cada AC-n con el nivel de evidencia indicado y reportá:
1. contraste por AC-n con evidencia concreta (rutas, salidas de comandos);
2. archivos tocados frente a los autorizados;
3. nivel de validación alcanzado y lo que explícitamente no se certifica;
4. documentación actualizada.
No hagas commit, push, deploy ni cambios en Notion sin mi autorización en este turno.
```

## Cierre de fase o subfase

1. Verificar con `gh run view` que la CI del commit de la subfase está en verde. El repositorio no tiene protección de rama, así que nada más lo garantiza.
2. Agregar una entrada en `CHANGELOG.md` con **Certifica** y **No certifica**. Nunca se infiere un nivel de validación superior al alcanzado.
3. Agregar la línea de cierre en el brief y marcarlo "aprobado y cerrado" en [decisions/README.md](../decisions/README.md).
4. Reescribir `HANDOFF.md` con el estado verificado y el próximo paso.
5. Actualizar Notion con el estado real.
6. Aplicar el *Knowledge Capture Protocol* en cada cierre de subfase, no solo al cerrar la fase: crear o actualizar una nota solo si hay conocimiento reutilizable, e informar qué notas cambiaron (o "sin conocimiento reutilizable nuevo").
7. Actualizar `knowledge_snapshot` y el estado en el hub `80 Projects/AI WhatsApp Agent CRM`.
8. Hacer el commit del cierre, con autorización, y verificar su CI.

La versión genérica de este ciclo, para otros proyectos, está en el playbook del vault `40 Playbooks/Adopting the Vixora Method in a New Project.md`.
