---
schema: project-state.v1
project: ai-whatsapp-agent-crm
generated_at: 2026-09-13
git_ref: main — f800e68 en origin/main, más el cierre de la subfase 2.4 (commit y push autorizados por el usuario al escribir este archivo)
active_phase: Fase 2 — Fundación técnica (en curso)
active_task: 2.5 — Pipeline de CI (sin brief)
confidence: confirmado
---

# Handoff

Este archivo es el traspaso entre sesiones. Cada fase se trabaja en una sesión propia y termina escribiendo acá su estado verificado, para que la sesión siguiente no reconstruya el contexto leyendo el historial.

**Se sobrescribe en cada handoff.** No es un registro histórico: eso es `CHANGELOG.md`. Acá vive únicamente el presente.

**Cómo leerlo.** Cada afirmación lleva su procedencia: `confirmado` (verificado contra la fuente en la pasada que escribió este archivo), `historico` (viene de un documento anterior, no re-verificado), `inferido` (deducido de señales indirectas) o `pendiente` (no se pudo verificar). Un campo `historico` o `inferido` se re-verifica antes de tratarlo como vigente. Ninguna autorización sigue viva por aparecer acá.

---

## 1. Identificación

- **Proyecto**: AI WhatsApp Agent CRM. Independiente del agente de WhatsApp: no comparte código, infraestructura ni base de datos, y no depende de Airtable. `confirmado`
- **Fase activa**: Fase 2 — Fundación técnica, en curso desde el 2026-09-12. En Notion figura "En progreso". `confirmado`
- **Orden de la Fase 2**: 2.2 → 2.1 → 2.3 → 2.4 (cerradas) → **2.5** ([Roadmap](docs/planning/Roadmap.md)). La 2.5 es la última subfase; su cierre cierra la Fase 2. `confirmado`

## 2. Último punto aprobado

- **Subfase 2.4 cerrada el 2026-09-13** con confirmación del usuario: entrada en [CHANGELOG.md](CHANGELOG.md) y [brief-2.4](docs/decisions/brief-2.4-base-de-datos-local.md) cerrado. `confirmado`
- Subfases 2.2, 2.1 y 2.3 cerradas el 2026-09-12. `confirmado`

## 3. Próximo paso

1. Preparar el brief de la **2.5 — Pipeline de CI**. Según [RepositoryStructure.md](docs/architecture/RepositoryStructure.md), [ADR 0009](docs/decisions/0009-repositorio-remoto-github-y-ci.md) y [EngineeringStandards.md](docs/development/EngineeringStandards.md), crea `.github/workflows/` con este pipeline, con Node 24: `npm ci` → lint → typecheck → tests unitarios e integración → build. `confirmado`
2. La 2.5 también debe incluir:
   - una **guarda que falle el build** si aparecen referencias a Airtable o al repositorio del agente de WhatsApp ([Risks.md](docs/planning/Risks.md));
   - un **caso versionado que demuestre que la regla de frontera de ESLint falla** ante una importación prohibida. `confirmado`
3. Los tests de integración necesitan PostgreSQL 18 en CI, probablemente como service container con la misma imagen `postgres:18.6-trixie`. Las variables se inyectan por entorno: `vitest.config.mts` solo lee `.env` si existe. `inferido`
4. Gates probables:
   - hacer push de workflows, que se ejecutan en GitHub (efecto externo);
   - posiblemente, configurar protección de rama en el remoto. Requiere autorización explícita. `inferido`

## 4. Contratos vigentes

| Contrato | Versión | Ruta |
|---|---|---|
| Brief de tarea | `task-brief.v1` | [development/ExecutionProtocol.md](docs/development/ExecutionProtocol.md) |
| Cápsula de estado | `project-state.v1` | este archivo |
| Stack | ADR 0004 aceptado y ADR 0011 para el lint; driver `pg` e imagen `postgres:18.6-trixie` desde la 2.4 | [development/EngineeringStandards.md](docs/development/EngineeringStandards.md) |
| Estructura del repositorio | diseñado; lo de la 2.3 y la 2.4, implementado | [architecture/RepositoryStructure.md](docs/architecture/RepositoryStructure.md) |
| Entorno local | Docker Compose con PostgreSQL 18; `/api/health` | [development/Environments.md](docs/development/Environments.md) |
| Modelo de datos | sin versionar, diseñado, validado contra pantallas en la 1.2 | [architecture/DataModel.md](docs/architecture/DataModel.md) |
| Matriz de trazabilidad | diseñado | [architecture/TraceabilityMatrix.md](docs/architecture/TraceabilityMatrix.md) |
| Catálogo de métricas | 12 métricas, diseñado | [analytics/MetricsCatalog.md](docs/analytics/MetricsCatalog.md) |
| Wireframes | 10 pantallas, diseñado | [product/wireframes/](docs/product/wireframes/README.md) |
| Contrato de ingestión | diseñado, no implementado | [architecture/IntegrationBoundaries.md](docs/architecture/IntegrationBoundaries.md) |
| Vocabulario de validación | obligatorio | [CLAUDE.md](CLAUDE.md) |

## 5. Evidencia

Nivel del proyecto:

- **validado localmente**: la conexión a PostgreSQL y el health check;
- **implementado**: el esqueleto de la aplicación;
- **diseñado**: todo lo demás. No hay tablas, módulos de dominio ni CI.

| Afirmación | Nivel | Evidencia |
|---|---|---|
| Drizzle 0.45 y `pg` 8.23 conectan con PostgreSQL 18.6, y el health check informa disponible o no disponible sin detalles | validado localmente (`deterministic`) | 5 tests de integración en `tests/integration/db-connectivity.test.ts`, en verde el 2026-09-13 `confirmado` |
| Una conexión inactiva cortada por la base no tira el proceso | validado localmente | Test de `pg_terminate_backend`, que falló antes del arreglo y pasa después; runtime con `next dev` sin `uncaughtException` `confirmado` |
| `/api/health` responde 200, 503 y otra vez 200 sin reiniciar la app | runtime local | Ejecución del 2026-09-13 registrada en el CHANGELOG `confirmado` |
| `npm ci`, typecheck, lint, format y build pasan, con la base detenida | ejecución local | 2026-09-13 `confirmado` |
| La regla de frontera de ESLint detecta importaciones prohibidas | implementado (prueba temporal de la 2.3, no versionada) | El caso versionado llega en la 2.5 `confirmado` |
| Los enlaces internos resuelven | documental | 0 rotos el 2026-09-13 `confirmado` |

## 6. Decisiones

### Vigentes

- ADRs 0001 a 0011 aceptados. `confirmado`
- Resoluciones de los briefs 1.3, 1.1, 1.2, 2.2, 2.1, 2.3 y 2.4 en [docs/decisions/](docs/decisions/README.md). `confirmado`

### Pendientes

- **Base de test separada y aislamiento entre tests**: se decide en la 3.1, con el primer test que escribe datos. `confirmado`
- **Solución de estilos** (CSS Modules, Tailwind u otra): se decide antes de la primera pantalla de la Fase 3. `confirmado`
- **Lint de accesibilidad**: `eslint-plugin-jsx-a11y` no soporta ESLint 10. Se revisa antes de la Fase 3. `confirmado`
- **Avisos de `npm audit`**: 4 moderados de `esbuild`, que llegan a través de `drizzle-kit`. Se tratan en la Fase 8. `confirmado`
- **Revisiones previstas del stack**:
  - Node 26, al entrar a LTS (2026-10-28);
  - TypeScript 7.1, cuando `typescript-eslint` lo soporte;
  - Drizzle 1.0, si sale estable antes de la 3.1. `confirmado`
- Taxonomía de errores y log con `request_id`: la Fase 3. Mientras tanto, `src/shared/db/` usa `console.error` con solo el código del error. `confirmado`
- **Asignaciones a fases posteriores**:
  - H-3, búsqueda por prefijo o contenido → Fases 4 y 5;
  - H-5, test de enmascarado para `viewer` → Fase 5;
  - retención de mensajes → Fase 9;
  - sesión → 3.2;
  - secretos → 9.1;
  - backups → 9.2.
  - El índice está en [Risks.md](docs/planning/Risks.md). `confirmado`

## 7. Limitaciones y bloqueos

- **Repositorio remoto**: [benjamurilloo/AI-WhatsApp-Agent-CRM](https://github.com/benjamurilloo/AI-WhatsApp-Agent-CRM), privado. Sin CI hasta la 2.5 ([ADR 0009](docs/decisions/0009-repositorio-remoto-github-y-ci.md)). `confirmado`
- **`npm run test` requiere la base levantada**: `docker compose up -d --wait`. El `.env` local del usuario existe y está ignorado por Git. `confirmado`
- **Un solo agente planifica, implementa y revisa.** Toda revisión es autoevaluación. `confirmado`
- **PowerShell 5.1 corta los mensajes de commit con comillas dobles**: escribir el mensaje en un archivo y usar `git commit -F`. `confirmado`
- **Un hook de seguridad bloquea comandos PowerShell con `Remove-Item` o `taskkill /T /F`** porque interpreta sus argumentos como rutas del sistema. Para detener un servidor de desarrollo: `Stop-Process` sobre el `OwningProcess` del puerto. `confirmado`
- **Resúmenes web no confiables para versiones**: el registro npm (`npm view`) es la fuente primaria. `confirmado`
- **`next build` avisa de un `package-lock.json` en `C:\Users\benja`**, fuera del repositorio. Se ignora. `confirmado`
- **`agentRules: false` en `next.config.ts`**: no quitarlo, o `next dev` vuelve a escribir en `CLAUDE.md`. `confirmado`

## 8. Rutas necesarias para continuar

- [CLAUDE.md](CLAUDE.md), este archivo, [CHANGELOG.md](CHANGELOG.md).
- [decisions/0009-repositorio-remoto-github-y-ci.md](docs/decisions/0009-repositorio-remoto-github-y-ci.md) y [planning/Risks.md](docs/planning/Risks.md): la guarda de CI.
- [architecture/RepositoryStructure.md](docs/architecture/RepositoryStructure.md): la regla de frontera y lo que crea la 2.5.
- [development/EngineeringStandards.md](docs/development/EngineeringStandards.md): la sección CI.
- [development/Environments.md](docs/development/Environments.md) y [development/TestingStrategy.md](docs/development/TestingStrategy.md).
- [planning/Roadmap.md](docs/planning/Roadmap.md): criterios de salida de la Fase 2.

## 9. Cambios ajenos del usuario detectados

Ninguno. `confirmado`

## 10. Autorizaciones vigentes

**Ninguna.** El commit y el push del cierre de la 2.4 quedan consumidos. Instalar dependencias, crear workflows que corren en GitHub, cambiar la configuración del remoto y cualquier operación Git futura necesitan autorización explícita.

## 11. Aspectos pendientes de confirmar

- Qué incluye exactamente la guarda anti-referencias de la 2.5 (patrones y archivos excluidos): se define en el brief.
