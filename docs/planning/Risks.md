# Riesgos

**Estado: diseñado. Ningún riesgo aquí ha sido validado o descartado con evidencia real todavía.**

| Riesgo | Impacto | Probabilidad | Mitigación | Requiere decisión humana |
|---|---|---|---|---|
| Las **personas** de `Personas.md` siguen siendo supuestos declarados, no confirmados contra el uso real | Los flujos priorizados pueden no coincidir con cómo se opera de verdad | Media | Aceptadas como supuesto explícito en la subfase 1.3 (D-9 bis) y contrastadas contra el uso real en el piloto de la Fase 9. Las dos reglas de negocio que tocaban el modelo (unicidad de cliente y quién ajusta stock) sí quedaron confirmadas el 2026-09-11 | Ya decidido; se revisa en Fase 9 |
| No existe política de retención de mensajes definida | Bloquea decisión de diseño de `messages` a largo plazo, aunque no bloquea el MVP | Media | Diferida a la Fase 9 en la subfase 1.3 (D-7). En el MVP se conservan indefinidamente y no hay columna de expiración; agregarla es una migración aditiva | Sí, en Fase 9 |
| ~~El repositorio no tiene remoto: los commits existen solo en el disco del usuario~~ | — | — | **Cerrado el 2026-09-12**: remoto creado en GitHub privado con autorización del usuario ([ADR 0009](../decisions/0009-repositorio-remoto-github-y-ci.md)). La CI con GitHub Actions se configura en la Fase 2 | No |
| Las versiones del stack pueden quedar desactualizadas entre esta planificación y el inicio real de la Fase 2 | Retrabajo menor de configuración | Media | La subfase 2.2 re-verifica las versiones oficiales antes de instalar nada | No (proceso ya definido) |
| ~~Ambigüedad sobre si "no cantidades negativas de stock" tiene excepciones de negocio reales~~ | — | — | **Cerrado el 2026-09-11** en la subfase 1.3: no hay excepciones ([ADR 0008](../decisions/0008-stock-nunca-negativo.md)) | No |
| Tentación de conectar el contrato de ingestión a tráfico real "para probarlo de verdad" durante la Fase 6 | Rompería el principio de independencia y el criterio de aceptación del MVP | Baja (mitigado por reglas explícitas en `CLAUDE.md` e `IntegrationBoundaries.md`) | Guarda automatizada desde la 2.5: `tests/guards/forbidden-references.test.ts`, en local y en CI, falla si aparecen referencias a Airtable o al repositorio del agente de WhatsApp fuera de `.md`. Tiene casos versionados que demuestran la detección | No |
| La CI no bloquea pushes ni merges: el plan gratuito de GitHub no ofrece protección de rama en repositorios privados | Un commit en rojo puede quedar en `main` sin que nada lo impida | Media (un solo desarrollador trabajando sobre `main`) | Aceptado en la 2.5 (D-3). Ninguna subfase se cierra sin verificar con `gh run view` que la CI de su commit está en verde | Sí: revisar si se suma otra persona o antes de producción (Fase 9) |
| ~~El mecanismo de sesión elegido en la Fase 3 resulta insuficiente para multi-organización (p. ej. no permite cambiar de organización activa sin recargar)~~ | — | — | **Cerrado el 2026-09-12** en la subfase 1.2: en el MVP un usuario pertenece a una sola organización y no hay organización activa que cambiar ([ADR 0010](../decisions/0010-un-usuario-una-organizacion-en-el-mvp.md)) | No |
| El negocio necesita un segundo canal (no solo WhatsApp) antes de lo previsto | Presión para adelantar trabajo de "multi-canal" no planificado | Baja | El modelo ya es extensible (`channel` como enum); no requiere rediseño, solo agregar valor de enum y UI cuando se decida | Sí, cuándo priorizarlo |
| El proyecto se llama "AI WhatsApp Agent CRM" (decisión del usuario, 2026-09-11), muy parecido a "AI WhatsApp Agent", cuya base de Airtable además se llama "CRM Agente WhatsApp" | Confusión de identidad entre sistemas en Notion, Obsidian y conversaciones con IAs | Media | Usar siempre el nombre completo "AI WhatsApp Agent CRM", sin abreviarlo como "el agente" ni "el CRM" cuando pueda confundirse; README, CLAUDE.md y el hub de Obsidian explicitan la independencia | No (nombre decidido) |
| Un solo agente de IA planifica, implementa y revisa, sin revisión independiente | Errores de criterio que una segunda mirada detectaría pasan a la entrega | Media | Declarar las revisiones como autoevaluación; el usuario aprueba briefs y cierres; los invariantes críticos se prueban intentando violarlos | No |
| El MVP no tiene emisor real de ingestión, así que la autenticación y los fixtures del contrato solo se validan con requests sintéticos | Un mecanismo que pasa con `curl` puede rechazar el 100 % del tráfico real (hay un antecedente documentado en el vault) | Media, en el proyecto de integración | Declarar esa validación como `deterministic` y exigir tráfico real del emisor como gate de integración | No |

## Preguntas abiertas registradas en otros documentos (índice)

Toda entrada de este índice lleva fase límite. "Se ve más adelante" no es una entrada válida.

| Pregunta abierta | Documento | Fase límite |
|---|---|---|
| Política de retención de `messages` | [architecture/DataModel.md](../architecture/DataModel.md) | Fase 9 |
| Pantalla para editar la zona horaria de la organización | [product/Screens.md](../product/Screens.md) | Diferida sin fecha; no bloquea el MVP porque el valor por defecto ya está fijado |
| Versiones exactas del stack y aceptación del [ADR 0004](../decisions/0004-stack-tecnologico-propuesto.md) | [development/EngineeringStandards.md](../development/EngineeringStandards.md) | Subfase 2.2 |
| Gestión de secretos | [architecture/SecurityModel.md](../architecture/SecurityModel.md) | Subfase 9.1 |
| Frecuencia y prueba de restauración de backups | [architecture/Overview.md](../architecture/Overview.md) | Subfase 9.2 |
| Validación de las personas contra el uso real | [product/Personas.md](../product/Personas.md) | Fase 9 |
| Cuándo priorizar un segundo canal además de WhatsApp | esta tabla de riesgos | Después del MVP (Fase 10) |
| Búsqueda por prefijo o por contenido en productos y clientes, y el índice que requiere (H-3) | [architecture/TraceabilityMatrix.md](../architecture/TraceabilityMatrix.md) | Fase 4 (productos) y Fase 5 (clientes) |
| Test de que la respuesta a un `viewer` no contiene el teléfono completo (H-5, FR-CLI-06) | [architecture/TraceabilityMatrix.md](../architecture/TraceabilityMatrix.md) | Fase 5 |

### Cerradas en la subfase 1.3 (2026-09-11)

- Identificador único adicional de cliente → no hay: solo `(organization_id, phone_e164)` ([ADR 0007](../decisions/0007-identificador-de-cliente-solo-telefono.md)).
- Teléfono en la lista de clientes → completo para `admin`, enmascarado en el servidor para `viewer` (FR-CLI-06).
- Vista previa de mensajes en la lista de conversaciones → no se muestra (FR-CONV-01).
- Alta de usuarios por pantalla o por script → pantalla de usuarios y roles en el MVP (FR-ORG-02).
- Zona horaria por defecto → `America/Argentina/Buenos_Aires`.
- Excepciones al stock negativo → no hay ([ADR 0008](../decisions/0008-stock-nunca-negativo.md)).
- Repositorio remoto y proveedor de CI → GitHub privado con GitHub Actions ([ADR 0009](../decisions/0009-repositorio-remoto-github-y-ci.md)).
- Quién puede ajustar stock → solo `admin`, como ya asumía FR-PROD-06.

### Cerradas en la subfase 3.2 (2026-09-13)

- Mecanismo de sesión → sesiones server-side propias en una tabla `sessions` de PostgreSQL, sin librería, con expiración deslizante de 7 días y tope de 30 ([ADR 0012](../decisions/0012-mecanismo-de-sesion.md)).

### Cerradas en la subfase 1.2 (2026-09-12)

- Organizaciones por usuario → una sola en el MVP ([ADR 0010](../decisions/0010-un-usuario-una-organizacion-en-el-mvp.md)).
- Brechas B-1 a B-11 de los wireframes y hallazgos H-1, H-2 y H-4 → resueltos ([brief-1.2](../decisions/brief-1.2-validacion-cruzada-del-modelo.md), [TraceabilityMatrix.md](../architecture/TraceabilityMatrix.md)).
