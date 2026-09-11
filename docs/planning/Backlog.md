# Semilla de backlog para Notion

> **Archivo temporal.** Es la semilla para cargar el proyecto "AI WhatsApp Agent CRM" en Notion. Cuando la carga esté verificada, se retira del repositorio ([ADR 0006](../decisions/0006-repositorio-registra-decisiones-no-tareas.md)). No es fuente de verdad de estado: ninguna subfase está iniciada salvo la 0.1.

## Cómo se carga en Notion

- Cada fase es un proyecto y cada subfase `X.Y` (o `X.Y.Z`) es un subproyecto de su padre, con su tarea espejo. Se crean duplicando una página ya plantillada y se verifican las relaciones de la página origen, según las notas del vault.
- Cada subfase se ejecuta con su brief `docs/decisions/brief-X.Y-*.md` (`task-brief.v1`). Los criterios de esta semilla son el punto de partida para sus `AC-n`, no el brief final.
- Tamaños: S (un resultado acotado), M (varias piezas con un único resultado), L (se subdivide antes de ejecutar).

---

## Fase 0 — Descubrimiento, alcance y decisiones

### 0.1 — Documentación de Fase 0
- **Objetivo**: documentación de producto, arquitectura, métricas, pantallas, roadmap y ADRs, reconciliada con la metodología Vixora.
- **Tamaño**: L (ejecutada el 2026-09-11 en dos pasadas) · **Tipo**: design · **Depende de**: —
- **Afecta**: `docs/`, `CLAUDE.md`, `README.md`
- **Aceptación**: todos los documentos del índice existen y no tienen secciones vacías; ADRs 0001–0006 registrados; preguntas abiertas explícitas; aprobación del usuario.
- **Pruebas**: verificación documental (enlaces internos que resuelven, términos prohibidos solo en contexto de prohibición).
- **Fuera de alcance**: código, dependencias, `git init`.

### 0.2 — Setup operativo
- **Objetivo**: dejar operativos Notion, Obsidian y Git para el proyecto.
- **Tamaño**: M · **Tipo**: documentation-closure · **Depende de**: 0.1 aprobada
- **Afecta**: Notion, vault (`80 Projects/AI WhatsApp Agent CRM.md`), `.git`, `.gitignore`
- **Aceptación**: el proyecto en Notion refleja todas las fases y subfases de esta semilla, con tareas espejo y plantilla real; el hub de Obsidian existe; `git init` y el primer commit de documentación están hechos con autorización explícita; este archivo se retira después de verificar la carga.
- **Pruebas**: relectura de Notion (padres, tareas espejo, cuatro bases inline y relaciones de la página origen intactas); `git log`.
- **Fuera de alcance**: repositorio remoto y push (decisión de 1.3).

### 0.3 — Cierre de Fase 0
- **Objetivo**: cerrar la fase con evidencia.
- **Tamaño**: S · **Tipo**: documentation-closure · **Depende de**: 0.2
- **Afecta**: `CHANGELOG.md` (se crea), Notion, hub de Obsidian
- **Aceptación**: `CHANGELOG.md` con una entrada de Fase 0 que distingue lo que certifica y lo que no; estado en Notion actualizado; Knowledge Capture ejecutado (o "sin conocimiento reutilizable nuevo").
- **Pruebas**: relectura de los tres sistemas.
- **Fuera de alcance**: iniciar la Fase 1.

## Fase 1 — Diseño UX y validación del modelo

### 1.1 — Wireframes de baja fidelidad
- **Objetivo**: wireframes de las 10 pantallas de `docs/product/Screens.md`.
- **Tamaño**: M · **Tipo**: design · **Depende de**: 0.3
- **Afecta**: `docs/product/` (wireframes y ajustes de `Screens.md`)
- **Aceptación**: cada pantalla tiene un wireframe coherente con su especificación, en escritorio y en móvil.
- **Pruebas**: revisión del usuario.
- **Fuera de alcance**: código de UI e identidad visual final.

### 1.2 — Validación cruzada
- **Objetivo**: matriz de trazabilidad pantalla ↔ FR ↔ tabla/columna ↔ índice ↔ métrica.
- **Tamaño**: S · **Tipo**: audit · **Depende de**: 1.1
- **Afecta**: `docs/architecture/DataModel.md`, `docs/product/FunctionalRequirements.md`, `docs/product/Screens.md`
- **Aceptación**: cada dato mostrado existe en el modelo; cada FR tiene pantalla o endpoint; cada índice responde a una consulta real; los huecos encontrados quedan corregidos.
- **Pruebas**: revisión de la matriz.
- **Fuera de alcance**: funcionalidades nuevas.

### 1.3 — Decisiones de producto pendientes
- **Objetivo**: resolver con el usuario las decisiones abiertas antes de escribir código.
- **Tamaño**: S · **Tipo**: design · **Depende de**: 1.2
- **Afecta**: `docs/decisions/`, documentos afectados
- **Aceptación**: cada decisión queda resuelta en un ADR o documento, o diferida explícitamente con una fase límite:
  - teléfono enmascarado en listas;
  - vista previa de mensajes;
  - alta de usuarios por pantalla o por script;
  - identificador adicional de cliente;
  - zona horaria por defecto de la organización;
  - excepciones al stock no negativo;
  - retención de mensajes (límite: antes de 9.4);
  - repositorio remoto y proveedor de CI.
- **Pruebas**: —
- **Fuera de alcance**: implementar.

## Fase 2 — Fundación técnica

### 2.1 — Estructura del repositorio
- **Objetivo**: carpetas por módulo según `architecture/Overview.md`.
- **Tamaño**: S · **Tipo**: implementation · **Depende de**: 1.3
- **Afecta**: `src/modules/*`, `.editorconfig`
- **Aceptación**: la estructura refleja los nueve módulos; no hay lógica de negocio.
- **Pruebas**: revisión estructural.
- **Fuera de alcance**: dependencias.

### 2.2 — Re-verificación del stack
- **Objetivo**: confirmar las versiones vigentes contra fuentes oficiales.
- **Tamaño**: S · **Tipo**: audit · **Depende de**: 1.3
- **Afecta**: `docs/development/EngineeringStandards.md`, ADR 0004
- **Aceptación**: versiones y fuentes con fecha de verificación; ADR 0004 pasa a aceptada o se supera con uno nuevo.
- **Pruebas**: —
- **Fuera de alcance**: instalar.

### 2.3 — Bootstrap de la aplicación
- **Objetivo**: app Next.js mínima con TypeScript estricto, lint y formateo.
- **Tamaño**: M · **Tipo**: implementation · **Depende de**: 2.1, 2.2
- **Afecta**: `package.json`, `tsconfig.json`, configuración de lint y formateo, `src/app/`
- **Aceptación**: `lint`, `typecheck` y `build` pasan; una página estática responde.
- **Pruebas**: comandos locales.
- **Fuera de alcance**: pantallas del producto. **Detención**: antes de instalar dependencias sin autorización.

### 2.4 — Entorno local de base de datos
- **Objetivo**: PostgreSQL reproducible y conexión de la app.
- **Tamaño**: S · **Tipo**: implementation · **Depende de**: 2.3
- **Afecta**: `docker-compose.yml`, `.env.example`, configuración de Drizzle, `/api/health`
- **Aceptación**: `docker compose up` levanta Postgres; `/api/health` refleja la conectividad real con la base; ningún secreto real queda versionado.
- **Pruebas**: test de integración del health check.
- **Fuera de alcance**: tablas de negocio.

### 2.5 — Pipeline de CI
- **Objetivo**: calidad automática en cada cambio.
- **Tamaño**: S · **Tipo**: implementation · **Depende de**: 2.4 y decisión de CI (1.3)
- **Afecta**: configuración de CI, script de guarda
- **Aceptación**: el pipeline corre instalación → lint → typecheck → test → build; una guarda falla ante `airtable`, `AIRTABLE_` o referencias al repositorio del agente en código o configuración.
- **Pruebas**: PR de prueba en verde; commit de prueba con término prohibido en rojo.
- **Fuera de alcance**: despliegue automático.

## Fase 3 — Identidad, autorización y auditoría

### 3.1 — Migraciones de identidad
- **Objetivo**: `organizations`, `users` y `organization_members` según `DataModel.md`.
- **Tamaño**: M · **Tipo**: implementation · **Depende de**: 2.5
- **Afecta**: módulos `organizations` y `auth` (schema y migraciones)
- **Aceptación**: las migraciones aplican en una base vacía y revierten; unicidad de email y de membresía, y enum de rol, probados.
- **Pruebas**: integración.
- **Fuera de alcance**: otras tablas.

### 3.2 — ADR del mecanismo de sesión
- **Objetivo**: elegir el almacenamiento de sesión y la librería.
- **Tamaño**: S · **Tipo**: design · **Depende de**: 3.1
- **Afecta**: `docs/decisions/0007-*.md`
- **Aceptación**: ADR aprobado por el usuario, que cubre revocación, expiración y cambio de organización activa.
- **Pruebas**: —
- **Fuera de alcance**: implementación.

### 3.3 — Autenticación
- **Objetivo**: login, sesión server-side, logout y rate limit de login.
- **Tamaño**: M · **Tipo**: implementation · **Depende de**: 3.2
- **Afecta**: módulo `auth`
- **Aceptación**: FR-ORG-03; hash argon2id; la sesión persiste entre requests; logout la invalida en el servidor; la contraseña nunca aparece en logs; el exceso de intentos devuelve `RATE_LIMITED`.
- **Pruebas**: integración.
- **Fuera de alcance**: recuperación de contraseña y auto-registro.

### 3.4 — Autorización y taxonomía de errores
- **Objetivo**: organización activa verificada, guardas por rol y errores tipados.
- **Tamaño**: M · **Tipo**: implementation · **Depende de**: 3.3
- **Afecta**: capa de aplicación transversal
- **Aceptación**: FR-ORG-01; cross-organización → `NOT_FOUND`; `viewer` en acción de `admin` → `FORBIDDEN`; ningún repositorio acepta `organization_id` del request sin verificarlo.
- **Pruebas**: integración con casos negativos.
- **Fuera de alcance**: UI de usuarios.

### 3.5 — Pantalla de inicio de sesión
- **Objetivo**: pantalla 1 de `Screens.md`.
- **Tamaño**: S · **Tipo**: implementation · **Depende de**: 3.4
- **Afecta**: UI de `auth`
- **Aceptación**: cumple la especificación, incluidos los errores sin revelar si la cuenta existe y la accesibilidad del formulario.
- **Pruebas**: e2e de login exitoso, fallido y con rate limit.
- **Fuera de alcance**: otras pantallas.

### 3.6 — Módulo de auditoría
- **Objetivo**: `audit_logs` insert-only, escrito dentro de la transacción del cambio.
- **Tamaño**: M · **Tipo**: implementation · **Depende de**: 3.1
- **Afecta**: módulo `audit`
- **Aceptación**: el rollback del cambio revierte su auditoría; `UPDATE` y `DELETE` rechazados por permisos; enums de `entity_type` y `action` según `DataModel.md`.
- **Pruebas**: integración.
- **Fuera de alcance**: UI de auditoría.

### 3.7 — Gestión de usuarios y roles
- **Objetivo**: FR-ORG-02 según la decisión de 1.3 (pantalla 10 o script).
- **Tamaño**: S/M · **Tipo**: implementation · **Depende de**: 3.4, 3.6
- **Afecta**: módulo `organizations`
- **Aceptación**: un `admin` crea usuarios y cambia roles; el último `admin` está protegido (`BUSINESS_RULE_VIOLATION`); los cambios de rol quedan auditados.
- **Pruebas**: integración; e2e si es pantalla.
- **Fuera de alcance**: invitaciones por email.

## Fase 4 — Productos e inventario

### 4.1 — Migraciones de catálogo e inventario
- **Objetivo**: `products`, `inventories` e `inventory_movements`.
- **Tamaño**: M · **Tipo**: implementation · **Depende de**: 3.6
- **Afecta**: módulos `catalog` e `inventory` (schema)
- **Aceptación**: SKU único por organización, `quantity > 0` y `quantity_on_hand >= 0` probados; `UPDATE` y `DELETE` sobre `inventory_movements` rechazados.
- **Pruebas**: integración.
- **Fuera de alcance**: servicios.

### 4.2 — Servicio de catálogo
- **Objetivo**: FR-PROD-01 a 05 con auditoría.
- **Tamaño**: M · **Tipo**: implementation · **Depende de**: 4.1, 3.4
- **Afecta**: módulo `catalog`
- **Aceptación**: CRUD, búsqueda y filtros; estado derivado correcto en los bordes (`= 0`, `= reorder_point`); `CONFLICT` por SKU duplicado; los desactivados quedan fuera de las búsquedas por defecto.
- **Pruebas**: unitarias (estado derivado) e integración.
- **Fuera de alcance**: ajustes de stock.

### 4.3 — Ajuste de stock (L, subdividida)

#### 4.3.1 — Transacción de ajuste
- **Objetivo**: FR-PROD-06, 07 y 08: movimiento, saldo y auditoría atómicos.
- **Tamaño**: M · **Tipo**: implementation · **Depende de**: 4.2
- **Afecta**: módulo `inventory`
- **Aceptación**: saldo negativo → `BUSINESS_RULE_VIOLATION` sin efectos; producto desactivado rechazado; no existe ningún camino que modifique el saldo sin movimiento.
- **Pruebas**: integración.
- **Fuera de alcance**: concurrencia.

#### 4.3.2 — Concurrencia de ajustes
- **Objetivo**: ajustes simultáneos sin actualizaciones perdidas ni saldo negativo.
- **Tamaño**: S · **Tipo**: hardening · **Depende de**: 4.3.1
- **Afecta**: módulo `inventory`
- **Aceptación**: el test de carrera con ajustes paralelos termina con un saldo igual a la suma de los movimientos aceptados.
- **Pruebas**: integración concurrente.
- **Fuera de alcance**: UI.

#### 4.3.3 — Historial de movimientos
- **Objetivo**: FR-PROD-09, paginado y con filtros.
- **Tamaño**: S · **Tipo**: implementation · **Depende de**: 4.3.1
- **Afecta**: módulo `inventory`
- **Aceptación**: orden cronológico descendente, filtros por tipo y período, aislamiento por organización.
- **Pruebas**: integración.
- **Fuera de alcance**: exportación.

### 4.4 — UI de productos e inventario
- **Objetivo**: pantallas 3, 4 y 5.
- **Tamaño**: M · **Tipo**: implementation · **Depende de**: 4.2, 4.3.3
- **Afecta**: UI de `catalog` e `inventory`
- **Aceptación**: cumplen `Screens.md`, incluidos los estados vacío y de error y la protección contra doble envío.
- **Pruebas**: e2e.
- **Fuera de alcance**: dashboard.

## Fase 5 — Clientes

### 5.1 — Migración de clientes
- **Objetivo**: `clients` con unicidad parcial de teléfono.
- **Tamaño**: S · **Tipo**: implementation · **Depende de**: 3.1
- **Afecta**: módulo `crm` (schema)
- **Aceptación**: teléfono único por organización cuando existe; se permiten varios clientes sin teléfono.
- **Pruebas**: integración.
- **Fuera de alcance**: servicio.

### 5.2 — Servicio de clientes
- **Objetivo**: FR-CLI-01, 02, 03 y 05 con auditoría.
- **Tamaño**: M · **Tipo**: implementation · **Depende de**: 5.1, 3.4, 3.6
- **Afecta**: módulo `crm`
- **Aceptación**: validación E.164; `CONFLICT` por duplicado; búsqueda por nombre y teléfono; minimización y enmascarado según 1.3.
- **Pruebas**: integración.
- **Fuera de alcance**: FR-CLI-04 (va en 6.3).

### 5.3 — UI de clientes
- **Objetivo**: pantallas 6 y 7, sin la sección de conversaciones.
- **Tamaño**: M · **Tipo**: implementation · **Depende de**: 5.2
- **Afecta**: UI de `crm`
- **Aceptación**: cumplen `Screens.md` salvo la última interacción y las conversaciones.
- **Pruebas**: e2e.
- **Fuera de alcance**: conversaciones.

## Fase 6 — Conversaciones, mensajes e ingestión

### 6.1 — Migraciones de conversaciones
- **Objetivo**: `conversations`, `messages` e `ingestion_events`.
- **Tamaño**: M · **Tipo**: implementation · **Depende de**: 5.1
- **Afecta**: módulos `conversations` e `ingestion` (schema)
- **Aceptación**: unicidades parciales por `external_ref`, enums de canal, estado y dirección, y `UNIQUE` del ledger probados.
- **Pruebas**: integración.
- **Fuera de alcance**: servicios.

### 6.2 — Seeds sintéticos de conversaciones
- **Objetivo**: seeds básico y de volumen.
- **Tamaño**: S · **Tipo**: implementation · **Depende de**: 6.1
- **Afecta**: `/seeds`
- **Aceptación**: `started_at` igual al primer `sent_at`; incluyen bordes de zona horaria, conversaciones sin cliente y conversaciones solo salientes.
- **Pruebas**: test del invariante.
- **Fuera de alcance**: datos reales.

### 6.3 — Servicio de consulta y estado
- **Objetivo**: FR-CONV-01, 02 y 03 y FR-CLI-04.
- **Tamaño**: M · **Tipo**: implementation · **Depende de**: 6.2, 5.2, 3.6
- **Afecta**: módulos `conversations` y `crm` (lectura)
- **Aceptación**: filtros y timeline; cambio de estado auditado; última interacción y conversaciones del cliente.
- **Pruebas**: integración.
- **Fuera de alcance**: ingestión.

### 6.4 — UI de conversaciones
- **Objetivo**: pantallas 8 y 9, y completar la pantalla 7.
- **Tamaño**: M · **Tipo**: implementation · **Depende de**: 6.3, 5.3
- **Afecta**: UI de `conversations` y `crm`
- **Aceptación**: cumplen `Screens.md`, con el cuerpo de los mensajes siempre escapado como texto plano.
- **Pruebas**: e2e, incluido un mensaje con HTML/script en el fixture.
- **Fuera de alcance**: dashboard.

### 6.5 — Contrato de ingestión v1 (L, subdividida)

#### 6.5.1 — Contrato y validación
- **Objetivo**: `docs/contracts/ingestion-v1.md` y validación de payload.
- **Tamaño**: S · **Tipo**: design · **Depende de**: 6.1
- **Afecta**: `docs/contracts/`, módulo `ingestion`
- **Aceptación**: esquema versionado con invariantes, nulabilidad y taxonomía de errores; los fixtures se marcan como "forma asumida, no verificada".
- **Pruebas**: unitarias de validación.
- **Fuera de alcance**: emisor real.

#### 6.5.2 — Ledger idempotente
- **Objetivo**: proyección idempotente a conversaciones y mensajes.
- **Tamaño**: M · **Tipo**: implementation · **Depende de**: 6.5.1, 6.3
- **Afecta**: módulo `ingestion`
- **Aceptación**: reserva atómica; el mismo hash devuelve el resultado original; otro hash → `CONFLICT` sin cambios; los fallos quedan como `failed` con `error_code`.
- **Pruebas**: integración, incluidos reenvíos concurrentes.
- **Fuera de alcance**: autenticación.

#### 6.5.3 — Autenticación de servicio y rate limit
- **Objetivo**: credencial por organización y límite de tasa.
- **Tamaño**: M · **Tipo**: implementation · **Depende de**: 6.5.2
- **Afecta**: módulo `ingestion`
- **Aceptación**: credencial almacenada con hash; exceso de tasa → `RATE_LIMITED`; validación declarada `deterministic`; ningún origen real configurado.
- **Pruebas**: integración.
- **Fuera de alcance**: conexión con cualquier sistema externo.

## Fase 7 — Métricas y dashboard

### 7.1 — Métricas de volumen
- **Objetivo**: métricas 1 a 6 y 10.
- **Tamaño**: M · **Tipo**: implementation · **Depende de**: 6.2
- **Afecta**: módulo `analytics`
- **Aceptación**: un test de fixture por métrica con valor calculado a mano, y sus invariantes.
- **Pruebas**: integración.
- **Fuera de alcance**: UI.

### 7.2 — Métricas de respuesta y estado
- **Objetivo**: métricas 7, 8, 9 y 11.
- **Tamaño**: M · **Tipo**: implementation · **Depende de**: 6.2
- **Afecta**: módulo `analytics`
- **Aceptación**: igual que 7.1, con empates de timestamp, conversaciones solo salientes y respuestas fuera del intervalo.
- **Pruebas**: integración.
- **Fuera de alcance**: UI.

### 7.3 — Métrica de errores de ingestión
- **Objetivo**: métrica 12.
- **Tamaño**: S · **Tipo**: implementation · **Depende de**: 6.5.2
- **Afecta**: módulo `analytics`
- **Aceptación**: conteo y tasa por `source` y `error_code`; "no disponible" sin módulo de ingestión.
- **Pruebas**: integración.
- **Fuera de alcance**: alertas.

### 7.4 — Dashboard
- **Objetivo**: pantalla 2.
- **Tamaño**: M · **Tipo**: implementation · **Depende de**: 7.1, 7.2, 7.3
- **Afecta**: UI de `analytics`
- **Aceptación**: cumple `Screens.md`; muestra "sin datos" y "no disponible" correctamente; tabla alternativa del gráfico.
- **Pruebas**: e2e.
- **Fuera de alcance**: reportes personalizables.

## Fase 8 — Calidad, seguridad y observabilidad

### 8.1 — Endurecimiento web
- **Objetivo**: CSP, CSRF en todas las mutaciones y cabeceras de seguridad.
- **Tamaño**: M · **Tipo**: hardening · **Depende de**: Fases 3–7
- **Afecta**: capa HTTP
- **Aceptación**: mutaciones sin token u origen válido rechazadas; CSP activa sin romper pantallas.
- **Pruebas**: integración y e2e.
- **Fuera de alcance**: WAF.

### 8.2 — Logs y privacidad
- **Objetivo**: logs estructurados sin PII y procedimiento de exportación y eliminación de datos de un cliente.
- **Tamaño**: S · **Tipo**: hardening · **Depende de**: Fases 3–7
- **Afecta**: logging y módulo `crm`
- **Aceptación**: un test verifica que un recorrido completo no escribe contenido de mensajes ni teléfonos en logs; procedimiento documentado y probado con datos sintéticos.
- **Pruebas**: integración.
- **Fuera de alcance**: autoservicio para el cliente.

### 8.3 — Dependencias
- **Objetivo**: auditoría automática de dependencias en CI.
- **Tamaño**: S · **Tipo**: hardening · **Depende de**: 2.5
- **Afecta**: CI
- **Aceptación**: el pipeline falla ante vulnerabilidades críticas conocidas.
- **Pruebas**: el propio pipeline.
- **Fuera de alcance**: actualización masiva de dependencias.

### 8.4 — Revisión de seguridad
- **Objetivo**: contrastar `SecurityModel.md` y el threat model con el código real.
- **Tamaño**: M · **Tipo**: audit · **Depende de**: 8.1, 8.2, 8.3
- **Afecta**: `docs/architecture/SecurityModel.md`, `docs/planning/Risks.md`
- **Aceptación**: cada control verificado con evidencia; sin hallazgos críticos abiertos; revisión declarada como autoevaluación.
- **Pruebas**: revisión de seguridad.
- **Fuera de alcance**: pentest externo.

## Fase 9 — Staging y piloto controlado

### 9.1 — Infraestructura de staging
- **Objetivo**: entorno equivalente a producción, sin tráfico real.
- **Tamaño**: M · **Tipo**: implementation · **Depende de**: 8.4
- **Afecta**: infraestructura, ADR de hosting
- **Aceptación**: secretos en un gestor; las migraciones se aplican con paso de aprobación; entorno separado de desarrollo.
- **Pruebas**: health check y smoke test.
- **Fuera de alcance**: producción.

### 9.2 — Backups y restauración
- **Objetivo**: backup automático diario y restauración probada.
- **Tamaño**: M · **Tipo**: runtime-validation · **Depende de**: 9.1
- **Afecta**: infraestructura
- **Aceptación**: un backup restaurado en un entorno aislado con los datos verificados; frecuencia de prueba definida.
- **Pruebas**: restauración real.
- **Fuera de alcance**: réplica en caliente.

### 9.3 — Datos de volumen en staging
- **Objetivo**: seed sintético de volumen cargado.
- **Tamaño**: S · **Tipo**: implementation · **Depende de**: 9.1
- **Afecta**: `/seeds`
- **Aceptación**: carga reproducible y limpieza por identidad exacta.
- **Pruebas**: recarga y limpieza verificadas.
- **Fuera de alcance**: datos reales.

### 9.4 — Piloto con ventana de observación
- **Objetivo**: recorrido completo en staging con disciplina de observación.
- **Tamaño**: M · **Tipo**: runtime-validation · **Depende de**: 9.2, 9.3
- **Afecta**: `docs/decisions/notas-piloto-9.md`, `cierre-9.4-*.md`
- **Aceptación**: las 10 pantallas se recorren sin errores con volumen; las notas se triagean contra evidencia al cierre confirmado por el usuario.
- **Pruebas**: recorrido y e2e contra staging.
- **Fuera de alcance**: implementar durante la ventana.

## Fase 10 — Evaluación del MVP

### 10.1 — Evaluación y decisión
- **Objetivo**: decidir si continuar, iterar o detener.
- **Tamaño**: M · **Tipo**: audit · **Depende de**: 9.4
- **Afecta**: `docs/decisions/cierre-10.1-*.md`, `CHANGELOG.md`
- **Aceptación**: cada criterio de la Definición de Terminado tiene evidencia de cumplimiento o de incumplimiento; decisión explícita del usuario.
- **Pruebas**: —
- **Fuera de alcance**: proyecto de migración.
