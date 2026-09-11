# Riesgos

**Estado: diseñado. Ningún riesgo aquí ha sido validado o descartado con evidencia real todavía.**

| Riesgo | Impacto | Probabilidad | Mitigación | Requiere decisión humana |
|---|---|---|---|---|
| Las personas y reglas de negocio (unicidad de cliente, quién puede ajustar stock) son supuestos, no confirmados por el dueño del negocio | Rediseño de FR/modelo tras Fase 1 | Media | Validar `Personas.md` y FR con el usuario antes de Fase 2 | Sí |
| No existe política de retención de mensajes definida | Bloquea decisión de diseño de `messages` a largo plazo, aunque no bloquea el MVP | Media | Definir antes de Fase 9 (conexión a staging con volumen), no antes del MVP | Sí |
| Las versiones del stack pueden quedar desactualizadas entre esta planificación y el inicio real de la Fase 2 | Retrabajo menor de configuración | Media | La subfase 2.2 re-verifica las versiones oficiales antes de instalar nada | No (proceso ya definido) |
| Ambigüedad sobre si "no cantidades negativas de stock" tiene excepciones de negocio reales (p. ej. ventas a crédito con stock pendiente) | Cambiaría un `CHECK constraint` central del modelo | Baja-Media | Confirmar explícitamente en la subfase 1.3 | Sí |
| Tentación de conectar el contrato de ingestión a tráfico real "para probarlo de verdad" durante la Fase 6 | Rompería el principio de independencia y el criterio de aceptación del MVP | Baja (mitigado por reglas explícitas en `CLAUDE.md` e `IntegrationBoundaries.md`) | Guarda automatizada en CI (subfase 2.5) que falla si aparecen referencias a Airtable o al agente de WhatsApp | No |
| El mecanismo de sesión elegido en la Fase 3 resulta insuficiente para multi-organización (p. ej. no permite cambiar de organización activa sin recargar) | Retrabajo de autenticación en fase tardía | Baja | ADR de sesión en la subfase 3.2 y test de integración de sesión entre requests en la 3.3 | No |
| El negocio necesita un segundo canal (no solo WhatsApp) antes de lo previsto | Presión para adelantar trabajo de "multi-canal" no planificado | Baja | El modelo ya es extensible (`channel` como enum); no requiere rediseño, solo agregar valor de enum y UI cuando se decida | Sí, cuándo priorizarlo |
| El proyecto se llama "AI WhatsApp Agent CRM" (decisión del usuario, 2026-09-11), muy parecido a "AI WhatsApp Agent", cuya base de Airtable además se llama "CRM Agente WhatsApp" | Confusión de identidad entre sistemas en Notion, Obsidian y conversaciones con IAs | Media | Usar siempre el nombre completo "AI WhatsApp Agent CRM", sin abreviarlo como "el agente" ni "el CRM" cuando pueda confundirse; README, CLAUDE.md y el hub de Obsidian explicitan la independencia | No (nombre decidido) |
| `planning/Backlog.md` es una semilla temporal que duplica lo que se cargará en Notion | Divergencia si se sigue editando después de la carga | Media hasta completar la carga | Cargar la semilla en Notion y retirar el archivo ([ADR 0006](../decisions/0006-repositorio-registra-decisiones-no-tareas.md)) | No (decidido) |
| Un solo agente de IA planifica, implementa y revisa, sin revisión independiente | Errores de criterio que una segunda mirada detectaría pasan a la entrega | Media | Declarar las revisiones como autoevaluación; el usuario aprueba briefs y cierres; los invariantes críticos se prueban intentando violarlos | No |
| El MVP no tiene emisor real de ingestión, así que la autenticación y los fixtures del contrato solo se validan con requests sintéticos | Un mecanismo que pasa con `curl` puede rechazar el 100 % del tráfico real (hay un antecedente documentado en el vault) | Media, en el proyecto de integración | Declarar esa validación como `deterministic` y exigir tráfico real del emisor como gate de integración | No |

## Preguntas abiertas registradas en otros documentos (índice)

- Identificador único adicional de cliente — [architecture/DataModel.md](../architecture/DataModel.md).
- Teléfono enmascarado en la lista de clientes y ausencia de vista previa de mensajes en la lista de conversaciones — [product/Screens.md](../product/Screens.md).
- Alta de usuarios por pantalla o por script de administración — [product/Screens.md](../product/Screens.md).
