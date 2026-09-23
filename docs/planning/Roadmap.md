# Roadmap — AI WhatsApp Agent CRM

**Estado: diseñado.** Este documento no registra qué fase está en curso: eso está en [HANDOFF.md](../../HANDOFF.md), y los cierres, en [CHANGELOG.md](../../CHANGELOG.md). El plan usa tamaños relativos y dependencias, sin fechas calendario, porque todavía no se conocen la capacidad ni la disponibilidad.

## Qué es este documento

Es el diseño de fases: objetivo, alcance, dependencias, riesgos, entregables, criterios de aceptación, gates y nivel de validación de cada fase, además del camino crítico y la Definición de Terminado. Las subfases, las tareas y su estado viven en el [proyecto de Notion](https://app.notion.com/p/3d8702be6f4e81659e43c3d8bd9a6e1c) ([ADR 0006](../decisions/0006-repositorio-registra-decisiones-no-tareas.md)). Cada subfase se ejecuta con un brief `docs/decisions/brief-X.Y-*.md` ([ExecutionProtocol.md](../development/ExecutionProtocol.md)).

---

## Fase 0 — Descubrimiento, alcance y decisiones

- **Objetivo**: fijar visión, alcance, personas, requisitos, arquitectura de referencia y metodología antes de escribir código.
- **Alcance**: documentación de `docs/`, ADRs iniciales y setup operativo (Notion, hub de Obsidian, `git init`).
- **Subfases**: 0.1 documentación · 0.2 setup operativo · 0.3 cierre.
- **Dependencias**: ninguna.
- **Riesgos**: personas y reglas de negocio basadas en supuestos (unicidad de cliente, retención, stock negativo); la estructura de Notion es delicada (duplicación de plantillas).
- **Entregables**: `docs/` completo, ADRs 0001–0006, proyecto en Notion, hub `80 Projects/AI WhatsApp Agent CRM`, repositorio Git con primer commit y `CHANGELOG.md` con la entrada de cierre.
- **Criterios de aceptación**: documentos sin secciones vacías y con las preguntas abiertas explícitas; Notion refleja las fases y subfases de la semilla; `Backlog.md` retirado después de verificar la carga.
- **Gate de entrada**: autorización del usuario para planificar (dada el 2026-09-11).
- **Gate de salida**: el usuario aprueba la documentación; Notion y el hub están verificados; `git init` y el primer commit están autorizados y hechos.
- **Nivel de validación**: diseñado.

## Fase 1 — Diseño UX y validación del modelo

- **Objetivo**: convertir la especificación de pantallas en wireframes y confirmar que modelo, requisitos y pantallas son consistentes antes de escribir código.
- **Alcance**: wireframes de baja fidelidad de las 10 pantallas de [Screens.md](../product/Screens.md), matriz de trazabilidad pantalla ↔ FR ↔ tabla ↔ índice y resolución de decisiones de producto pendientes.
- **Subfases**: 1.1 wireframes · 1.2 validación cruzada · 1.3 decisiones pendientes.
- **Orden de ejecución**: 1.3 → 1.1 → 1.2. La 1.3 va primero porque seis de sus nueve decisiones cambian qué hay que dibujar en los wireframes ([brief-1.3](../decisions/brief-1.3-decisiones-de-producto-abiertas.md)). La numeración se conserva para no romper las referencias ya escritas.
- **Dependencias**: Fase 0 cerrada.
- **Riesgos**: si falta un campo o una entidad, hay que corregir `DataModel.md` antes de la Fase 3. Es barato aquí y caro después.
- **Entregables**: wireframes, matriz de trazabilidad y decisiones registradas.
- **Criterios de aceptación**: cada dato mostrado existe en el modelo; cada FR tiene pantalla o endpoint; cada índice responde a una consulta real; cada decisión pendiente está resuelta o diferida con fase límite.
- **Gate de entrada**: Fase 0 cerrada.
- **Gate de salida**: el usuario aprueba los wireframes y las decisiones.
- **Nivel de validación**: diseñado.

## Fase 2 — Fundación técnica

- **Objetivo**: repositorio con stack verificado, entorno local reproducible y CI en verde, sin lógica de negocio.
- **Alcance**: estructura de módulos, re-verificación de versiones, app mínima con TypeScript estricto, lint y formateo, PostgreSQL local con health check, y CI con guarda contra referencias prohibidas.
- **Subfases**: 2.1 estructura del repositorio · 2.2 re-verificación del stack · 2.3 bootstrap de la aplicación · 2.4 entorno local de base de datos · 2.5 pipeline de CI.
- **Orden de ejecución**: 2.2 → 2.1 → 2.3 → 2.4 → 2.5. La 2.2 va primero porque la estructura del repositorio depende del framework y del ORM aceptados ([brief-2.2](../decisions/brief-2.2-re-verificacion-del-stack.md)). La numeración se conserva para no romper las referencias ya escritas.
- **Dependencias**: Fase 1 cerrada.
- **Riesgos**: versiones desactualizadas entre la planificación y el inicio (lo mitiga la 2.2); repositorio remoto y proveedor de CI, decididos en la 1.3 ([ADR 0009](../decisions/0009-repositorio-remoto-github-y-ci.md)); el remoto tiene que existir antes de abrir la fase.
- **Entregables**: app que compila, Postgres local, CI en verde y ADR 0004 aceptado.
- **Criterios de aceptación**: lint, typecheck, test y build pasan en local y en CI; la guarda falla ante una referencia prohibida.
- **Gate de entrada**: Fase 1 cerrada y autorización para instalar dependencias.
- **Gate de salida**: CI en verde y estructura revisada.
- **Nivel de validación**: validado localmente.

## Fase 3 — Identidad, autorización y auditoría

- **Objetivo**: login, organizaciones, roles, taxonomía de errores y auditoría funcionando con datos sintéticos.
- **Alcance**: migraciones de identidad, ADR de sesión, autenticación con rate limit, autorización por organización y rol, pantalla de login, módulo de auditoría y gestión de usuarios.
- **Subfases**: 3.1 a 3.7.
- **Dependencias**: Fase 2.
- **Riesgos**: un mecanismo de sesión inadecuado obliga a rehacer trabajo (lo mitiga el ADR de la 3.2); una fuga de aislamiento detectada tarde es costosa, por eso el test negativo entre organizaciones es obligatorio en esta fase.
- **Entregables**: FR-ORG-01 a 03 y la base de FR-AUD-01.
- **Criterios de aceptación**: casos negativos probados (otra organización → `NOT_FOUND`, `viewer` → `FORBIDDEN`); la auditoría es atómica con el cambio que registra.
- **Gate de entrada**: Fase 2 cerrada.
- **Gate de salida**: suite de autenticación y autorización en verde.
- **Nivel de validación**: validado localmente; el login, validado en integración (UI ↔ servicio ↔ base).

## Fase 4 — Productos e inventario

- **Objetivo**: catálogo y ajustes de stock con trazabilidad completa.
- **Alcance**: diseño visual base, migraciones, servicio de catálogo, transacción de ajuste, concurrencia, historial y pantallas 3 a 5.
- **Subfases**: 4.0 diseño visual base · 4.1 a 4.4 (la 4.3 se divide en 4.3.1 a 4.3.3).
- **Orden de ejecución**: 4.0 → 4.1 → 4.2 → 4.3 → 4.4. La 4.0 se sumó el 2026-09-14 a pedido del usuario, que quiere ver el CRM con un diseño atractivo: paleta, tipografía, espaciado y componentes base aplicados a las pantallas 1 y 10 y al marco común. No es la identidad visual definitiva. Va primero para que las pantallas 3 a 10 nazcan con esos estilos en vez de rehacerse, y la accesibilidad verificada con axe no puede retroceder.
- **Dependencias**: Fase 3.
- **Riesgos**: la transacción de ajuste es el punto más delicado del MVP y necesita un test de concurrencia específico.
- **Entregables**: FR-PROD-01 a 09.
- **Criterios de aceptación**: ningún camino modifica `quantity_on_hand` sin su movimiento; los ajustes concurrentes no dejan saldo negativo; los movimientos son inmutables a nivel de base de datos.
- **Gate de entrada**: Fase 3 cerrada.
- **Gate de salida**: suite de inventario en verde, con los invariantes de no negatividad e inmutabilidad.
- **Nivel de validación**: validado localmente; pantallas validadas en integración.

## Fase 5 — Clientes

- **Objetivo**: gestión de clientes con búsqueda y minimización de datos.
- **Alcance**: migración, servicio y pantallas 6 y 7 (sin conversaciones).
- **Subfases**: 5.1 a 5.3.
- **Dependencias**: Fase 3. Puede ejecutarse en paralelo a la Fase 4.
- **Riesgos**: bajos. Las decisiones de enmascarado y de identificador vienen de la 1.3.
- **Entregables**: FR-CLI-01, 02, 03 y 05. FR-CLI-04 se completa en la Fase 6.
- **Criterios de aceptación**: búsqueda por nombre y teléfono; `CONFLICT` por teléfono duplicado; minimización verificada contra `NonFunctionalRequirements.md`.
- **Gate de entrada**: Fase 3 cerrada.
- **Gate de salida**: FR del alcance probados.
- **Nivel de validación**: validado localmente.

## Fase 6 — Conversaciones, mensajes e ingestión

- **Objetivo**: consulta de conversaciones y contrato de ingestión idempotente, sin conexión con tráfico real.
- **Alcance**: migraciones, seeds sintéticos, servicio de consulta y estado, pantallas 8 y 9 (y completar la 7) y contrato de ingestión v1.
- **Subfases**: 6.1 a 6.5 (la 6.5 se divide en 6.5.1 a 6.5.3).
- **Dependencias**: Fase 5.
- **Riesgos**: la tentación de conectar un emisor real, que está prohibida ([IntegrationBoundaries.md](../architecture/IntegrationBoundaries.md)). La autenticación de ingestión solo alcanza el nivel `deterministic` en el MVP.
- **Entregables**: FR-CONV-01 a 05, FR-CLI-04 y `docs/contracts/ingestion-v1.md`.
- **Criterios de aceptación**: idempotencia probada, incluido el reenvío con otro contenido; cuerpo de los mensajes escapado en la UI; ninguna credencial ni configuración apunta a sistemas reales.
- **Gate de entrada**: Fase 5 cerrada.
- **Gate de salida**: FR probados y búsqueda que confirma que no hay orígenes reales configurados.
- **Nivel de validación**: validado localmente.

## Fase 7 — Métricas y dashboard

- **Objetivo**: dashboard con las 12 métricas de [MetricsCatalog.md](../analytics/MetricsCatalog.md) calculadas con exactitud.
- **Alcance**: consultas de métricas y pantalla 2.
- **Subfases**: 7.1 a 7.4.
- **Dependencias**: 6.2; la 7.3 también depende de la 6.5.2.
- **Riesgos**: métricas que parecen correctas pero están mal definidas. Lo mitiga un test de fixture por métrica con el valor calculado a mano.
- **Entregables**: FR-MET-01 a 03.
- **Criterios de aceptación**: las 12 métricas tienen test de fixture y sus invariantes probados, incluidos los bordes de zona horaria.
- **Gate de entrada**: 6.2 cerrada.
- **Gate de salida**: las 12 métricas probadas individualmente.
- **Nivel de validación**: validado localmente.

## Fase 8 — Calidad, seguridad y observabilidad

- **Objetivo**: verificar los requisitos no funcionales contra el código real antes de staging.
- **Alcance**: CSP, CSRF y XSS; logs sin PII y procedimiento de exportación y eliminación de datos de cliente; auditoría de dependencias en CI; revisión del modelo de seguridad y del threat model; y el rendimiento con volumen sintético de las consultas de listado de **productos, inventario y clientes** —el requisito no funcional que faltaba enumerar acá y que [Risks](Risks.md) ya asignaba a esta fase (agregado en el cierre de la 8.1; los clientes se sumaron en la 8.5, D-6, porque la tarea, Risks y la matriz de trazabilidad ya los incluían y esta línea era la única que los dejaba afuera)— **más las dos listas que se componen en memoria**: la de miembros y la de clientes por última interacción, que [Overview](../architecture/Overview.md) también asignaba a esta fase sin que ninguna subfase las tomara (agregadas en la 8.4, D-6). El rate limiting se implementa en la 3.3 y la 6.5.3 y aquí se verifica.
- **Fuera de alcance, movido en la 8.4 (D-6)**: la reevaluación de APM y tracing, que `Overview` asignaba a esta fase. Pide evidencia, y sin entorno desplegado ni tráfico la respuesta saldría de la falta de datos y no de un criterio: se reevalúa en la Fase 9.
- **Subfases**: 8.1 a 8.5.
- **Dependencias**: Fases 3 a 7.
- **Riesgos**: con un solo agente, la revisión no es independiente. Se declaró como autoevaluación y el usuario aprobó el cierre. **El riesgo se materializó**: una revisión independiente posterior encontró en la 8.4 un hallazgo falso, uno no visto y dos recuentos que no cerraban ([brief-8.4](../decisions/brief-8.4-revision-de-seguridad.md) §Corrección posterior). Declararlo no alcanzó para evitarlo.
- **Entregables**: `SecurityModel.md` verificado ítem por ítem.
- **Criterios de aceptación**: sin hallazgos críticos abiertos; los no críticos quedan en `Risks.md` con su plan.
- **Gate de entrada**: Fases 3 a 7 cerradas.
- **Gate de salida**: revisión de seguridad sin bloqueantes. **Alcanzado, y ratificado el 2026-09-18 con una condición**: la escala de severidad no tenía supuesto de disponibilidad y por eso no podía graduar la fila de denegación de servicio de su propio threat model. Ampliada la escala, H-3 queda `crítico` en cualquier entorno compartido y `mayor` en el único que existe hoy, y **pasa a ser precondición bloqueante de la 9.1**.
- **Nivel de validación**: validado localmente, más revisión de seguridad declarada.

## Fase 9 — Staging y piloto controlado

- **Objetivo**: ejercitar el sistema en un entorno equivalente a producción, sin tráfico real.
- **Alcance**: infraestructura de staging con gestor de secretos, backups automáticos con restauración probada, datos sintéticos de volumen y piloto. **Más la búsqueda sin distinguir acentos** (`unaccent`), reasignada acá el 2026-09-21 por decisión del usuario: el [brief-4.4](../decisions/brief-4.4-ui-de-productos-e-inventario.md) la había asignado a la Fase 8 y ninguna de sus cinco subfases la tomó. **Más la deuda de aislamiento por organización** (H-1 y H-7 de la 8.4) y **dos deudas de herramienta del repositorio** (la frontera de `analytics` en ESLint y el nombre del paso de guardas en `ci.yml`), incorporadas al descomponer la fase el 2026-09-21: ninguna de las tres tenía subfase y las tres son de la misma clase de defecto que `unaccent`.
- **Subfases**: 9.0 a 9.4, descompuestas el 2026-09-21. La 9.0.4 se agregó el mismo día, después de cerrar la 9.0.1: la revisión independiente encontró una escritura de la misma clase que la 9.0.1 no había visto. Que la descomposición se corrija por un hallazgo posterior es lo esperado; lo que no sería aceptable es corregirla en silencio.
  - **9.0 — Deuda de código previa al despliegue** (tarea madre). Va primero porque sus tres hijas son inalcanzables hoy solo porque existe un único entorno con una sola organización real, y la 9.1 es exactamente la subfase que rompe ese supuesto.
    - **9.0.1 — Aislamiento por organización** en las siete escrituras de H-7 y en la lectura de usuarios de H-1 ([brief-9.0.1](../decisions/brief-9.0.1-aislamiento-por-organizacion.md)).
    - **9.0.2 — Búsqueda sin distinguir acentos** (`unaccent`). **Cerrada el 2026-09-21** ([brief-9.0.2](../decisions/brief-9.0.2-busqueda-sin-distinguir-acentos.md)): primera extensión de PostgreSQL del proyecto, con una envoltura `IMMUTABLE` para poder indexar y su limitación declarada. El orden de la lista de clientes quedó deliberadamente **sin** normalizar.
    - **9.0.3 — Frontera de `analytics` en ESLint**. **Cerrada el 2026-09-21** ([brief-9.0.3](../decisions/brief-9.0.3-frontera-de-analytics-en-eslint.md)), y con ella la 9.0 completa. Se descompuso con tres puntos y **al verificarlos contra el código quedó uno solo**, antes de escribir su brief:
      - **Sigue en pie**: el bloque de `analytics` en `eslint.config.mjs` no le prohíbe importar `next` ni `@/app/*`, a diferencia de `catalog`, `crm`, `conversations` e `inventory`; la tabla de `RepositoryStructure.md` tampoco lo incluye (brief-7.1, hallazgo 9). Y su permiso de importar `@/modules/*/schema` no distingue cuál, que es la vía por la que podría leer `users` directo — el agujero que la guarda de la 9.0.1 declaró en su cabecera.
      - **Se cayó**: el nombre del paso de guardas en `ci.yml` ya estaba arreglado desde `cae7061` (8.3), con la forma genérica que no vuelve a envejecer. El pendiente sobrevivió a su propia solución.
      - **Se cayó, y además era falso**: el timeout de las guardas. `vitest.config.mts` fija `testTimeout: 30000` para el proyecto `guards` desde la 2.5, así que la corrida de 44 s no pudo fallar por un techo de 5 s. La intermitencia sigue registrada, ahora sin diagnóstico inventado.
    - **9.0.4 — La escritura de `ingestion` que la 9.0.1 no cubrió**: `finishEvent` filtra solo por id sobre `ingestion_events`, que tiene `organization_id`. Es de la misma clase que H-7 y la encontró la revisión independiente de la 9.0.1, que no la corrigió por analogía porque el alcance lo decide el usuario. Decidido el 2026-09-21: entró, y **quedó cerrada el mismo día**. `revokeCredential`, de la misma clase, queda **diferida** con su motivo y su condición de reapertura en [Risks](Risks.md).
  - **9.1 — Infraestructura de staging. Cerrada el 2026-09-22** ([brief-9.1](../decisions/brief-9.1-infraestructura-de-staging.md)). Abría gate, así que la revisaron **cuatro agentes independientes** en rondas sucesivas sobre las correcciones de la anterior: 11, 11, 9 y 2 hallazgos, los 33 verificados contra el código y reales. Nivel alcanzado: **validado en staging**, no «preparado para producción». Entorno en `https://staging.vixoraai.app` sobre un droplet propio, con `next start` bajo `systemd`, nginx con TLS de Let's Encrypt y PostgreSQL 18.6 en la misma máquina. **H-3 verificado resuelto y medido por consecuencia** (AC-6), que era su precondición bloqueante. Absorbe cinco de las seis afirmaciones `no-verificable-aquí` del modelo de seguridad: HSTS, la cookie `__Host-` bajo TLS, `TRUSTED_PROXY` con un proxy real, el gestor de secretos y la conexión con el rol `crm_app`. También la reevaluación de `proxy.ts` con más rutas protegidas.
  - **9.2 — Backups y restauración. CERRADA el 2026-09-22** ([brief-9.2](../decisions/brief-9.2-backups-y-restauracion.md), [evidencia-9.2](../decisions/evidencia-9.2-backups.md), [runbook](../runbooks/restaurar-la-base.md)). `pg_dump` custom con el rol dueño, timer diario 03:15 UTC con `Persistent=true`, rotación de 7, copia fuera del droplet y **ejercicio de restauración agendado y ejecutado, con control negativo por tres vías**. La revisión independiente —no obligatoria acá, hecha igual— informó **21 hallazgos, 8 mayores, ninguno falso**, y cinco de esos mayores eran instrumentos de recuperación que corrían en verde sin hacer lo que se esperaba de ellos. No abre ni cierra gate. La **retención de `messages`** quedó decidida —se conservan indefinidamente, con reapertura en la 9.4— sin agregar ningún mecanismo de expiración. Nivel: **validado en staging** y solo el mecanismo; el tiempo de restauración a volumen real es medición de la 9.3.
  - **9.3 — Datos de volumen en staging. CERRADA el 2026-09-23** ([brief-9.3](../decisions/brief-9.3-datos-de-volumen-en-staging.md), [evidencia-9.3](../decisions/evidencia-9.3-volumen.md)). Cierra la **medición con varias organizaciones**, deuda de la 6.3 (D-4), de la 7.1 a la 7.3, de la 8.5 y de la 9.0.2, y mide el dashboard fuera de local por primera vez. Veinte organizaciones —1×10.000, 3×1.000 y 16×50—, con el `n_distinct` de `organization_id` pasando de **1 a 20-21**, que es la premisa que hace interpretable todo lo demás. **Tres de seis consultas cambian de forma de plan** entre la organización grande y una chica, y sobre la grande el recorrido secuencial ahora descarta **4.309 productos y 3.806 clientes ajenos**: la organización dominante paga por las demás, y ese costo crece con el total de la tabla. Antes de medir se corrigieron los **parámetros de costo del planificador**, que describían una máquina inexistente con dos errores en sentidos opuestos (D-2), y se **recalibró la máquina** contra la tanda de la 8.5 (D-3b): factor 0,82×–4,17×, mediana 2,29×, umbral **916 ms**. Ninguna consulta resultó patológica, **D-7 no se activó y `src/` no se tocó**. También saldó las dos deudas nominales de la 9.2 —restauración medida al volumen real, **5,08 s** con la aplicación corriendo— y las dos rutas de producto que la 9.1 dejó sin recorrer. No abre ni cierra gate. **No tuvo revisión independiente**, que el brief recomendaba sin exigirla: el cierre es autoevaluación y así queda declarado. Nivel: **validado en staging**.
  - **9.4 — Piloto con ventana de observación.** Cierra el gate de salida. Incluye la reevaluación de **APM y tracing** (8.4, D-6) y la de **protección de rama**.
  - **Condición cumplida el 2026-09-21**: `unaccent` quedó enumerado en el alcance de una subfase concreta, la 9.0.2. Se había escrito como condición y no como intención porque el defecto que lo trajo hasta acá fue exactamente ese: una obligación asignada a una fase, correctamente, que nunca llegó a una subfase y sobrevivió a un cierre entero sin que nada fallara. Nombrar la fase no alcanza cuando el trabajo se reparte y se cierra por subfases. Por el mismo motivo, la descomposición asignó **cada** obligación heredada a una subfase nominal, y no solo `unaccent`.
  - **Revisión independiente**: la 9.1 y la 9.4 la llevan por obligación, porque abren o cierran un gate ([ExecutionProtocol](../development/ExecutionProtocol.md), paso 4b). La 9.0.1 la llevó por recomendación, no por obligación, y **encontró cuatro defectos reales**, dos de ellos en instrumentos que iban a quedar versionados: un agujero en la guarda nueva y una aserción de estado que no podía fallar. Es la primera vez en el proyecto que la revisión independiente corre **dentro** del ciclo y no después de un cierre. Por ese resultado, las subfases de la 9.0 que dejen guardas o tests como instrumento también la llevan.
- **Dependencias**: Fase 8 cerrada.
- **Riesgos**: el primer despliegue siempre revela supuestos del entorno que no se probaron en local.
- **Disciplina del piloto**: se aplica *Observation Window Before Iteration*. Durante la ventana, cada observación se registra en `docs/decisions/notas-piloto-9.md` sin implementar cambios. El triage contra evidencia se hace cuando el usuario confirma el cierre. Solo un fallo crítico que el usuario decida atender rompe la ventana.
- **Entregables**: entorno de staging operable, backup restaurado e informe del piloto.
- **Criterios de aceptación**: las 10 pantallas funcionan sin errores con volumen; un backup se restauró en un entorno aislado; las notas del piloto están triageadas.
- **Gate de entrada**: Fase 8 cerrada **y H-3 resuelto antes de levantar el primer entorno compartido** (ver abajo).
- **Gate de salida**: informe del piloto sin bloqueantes.
- **Nivel de validación**: validado en staging.
- **Precondición bloqueante de la 9.1** (resolución del gate de la Fase 8, 2026-09-18): no se levanta ningún entorno compartido —staging, piloto o producción— sin **`TRUSTED_PROXY=true` contra un proxy real**, o con **el límite por IP del ingreso desactivado**. Mientras `TRUSTED_PROXY` no sea `true`, todas las peticiones comparten una sola clave de IP y **20 ingresos fallidos de cualquiera dejan sin ingreso a todos los usuarios**, de forma renovable y a costo despreciable (H-3, en [Risks](Risks.md)). Bajo la escala de severidad ampliada eso es **crítico** en cuanto exista más de un usuario, y un hallazgo crítico detiene la fase. Se verifica antes de desplegar, no después.

- **Precondición cumplida el 2026-09-22** (9.1, AC-5 y AC-6): `TRUSTED_PROXY=true` contra nginx real, con un solo salto de proxy que **reemplaza** `x-forwarded-for` en vez de agregarlo. La clave del límite almacenada es `sha256` de la IP pública real del cliente, y no la de una cabecera falsificada ni la de `"sin-proxy"`, que es la firma del defecto. Medido por consecuencia: 20 fallos desde una IP la bloquean mientras la misma cuenta ingresa desde otra en el mismo momento. **La verificación es autoevaluación** hasta que la revisión independiente de la 9.1 la confirme.

## Fase 10 — Evaluación del MVP

- **Objetivo**: decidir con criterios explícitos si continuar, iterar o detener el producto.
- **Alcance**: contrastar la Definición de Terminado con el estado real.
- **Subfases**: 10.1.
- **Dependencias**: Fase 9 cerrada.
- **Entregables**: informe de evaluación con recomendación.
- **Criterios de aceptación**: cada criterio de la Definición de Terminado tiene evidencia explícita de cumplimiento o de incumplimiento.
- **Gate de entrada**: Fase 9 cerrada.
- **Gate de salida**: decisión explícita del usuario.
- **Nivel de validación**: validado en staging. Preparado para producción solo si la decisión es continuar.

---

## Fases futuras, sin planificar en detalle

- **Migración y cutover**: proyecto separado, posterior a la Fase 10 si la decisión es continuar ([ADR 0003](../decisions/0003-migracion-legado-proyecto-separado.md)). Incluye la carga desde el sistema legado y la integración con tráfico real detrás de un modo de prueba.
- **ERP** (ventas, compras, proveedores, pagos, caja, contabilidad): proyectos propios, sobre la base ya construida de `organizations`, `clients` y `products`.

## Camino crítico

0.1 → 0.2 → 0.3 → Fase 1 → Fase 2 → Fase 3 → (Fase 4 ∥ Fase 5) → Fase 6 → Fase 7 → Fase 8 → Fase 9 → Fase 10.

Dentro de la Fase 6: 6.1 → 6.2 → 6.3 → 6.4, y en paralelo 6.5.1 → 6.5.2 → 6.5.3.

## Trabajo paralelizable

- Fases 4 y 5, una vez cerrada la Fase 3.
- En la Fase 1, los wireframes de pantallas distintas.
- En la Fase 3, la 3.6 (auditoría) junto a la 3.2–3.4.
- En la Fase 6, la ingestión (6.5) junto a la consulta y la UI (6.3–6.4).
- En la Fase 7, la 7.1 y la 7.2.
- En la Fase 8, la 8.3 junto al resto.

## Hitos demostrables

1. Login funcional con roles (fin de la Fase 3).
2. Ajuste de stock con historial visible (fin de la Fase 4).
3. Timeline de conversación navegable con datos sintéticos (fin de la Fase 6).
4. Dashboard con las 12 métricas correctas (fin de la Fase 7).
5. Recorrido completo en staging sin bloqueantes (fin de la Fase 9).

## Definición de Terminado del MVP

- Todos los FR de `FunctionalRequirements.md` implementados y probados.
- Las 12 métricas de `MetricsCatalog.md` validadas contra fixtures.
- `SecurityModel.md` verificado, sin hallazgos críticos abiertos.
- Piloto en staging sin bloqueantes, con datos sintéticos.
- Cero referencias a Airtable o al repositorio del agente de WhatsApp en código y configuración, verificado por la guarda de CI.
- `CHANGELOG.md` con la entrada de cierre de cada fase.

## Criterios para continuar, iterar o detener

- **Continuar** (hacia la migración y luego el ERP): se cumple la Definición de Terminado sin hallazgos críticos y el usuario confirma que el backoffice resuelve el dolor descrito en `Vision.md`.
- **Iterar**: el MVP funciona, pero el piloto revela datos o flujos no anticipados. Se vuelve a la Fase 1 con el alcance ajustado, sin descartar el backend ya validado.
- **Detener**: el modelo o las métricas no reflejan cómo opera el negocio y el costo de rediseñar supera el valor entregado. La decisión es solo del usuario, con la evidencia de la Fase 10.

## Decisiones que requieren aprobación del usuario

- Aprobación de la documentación de la Fase 0 y de la carga en Notion.
- Decisiones de producto de la 1.3 (enmascarado, vista previa de mensajes, alta de usuarios, identificador de cliente, zona horaria por defecto, stock negativo, retención, remoto y CI).
- Instalación de dependencias (Fase 2) y mecanismo de sesión (3.2).
- Hosting de staging (9.1).
- Paso de la Fase 10 al proyecto de migración.
