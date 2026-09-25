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
  - **9.2 — Backups y restauración. CERRADA el 2026-09-22** ([brief-9.2](../decisions/brief-9.2-backups-y-restauracion.md), [evidencia-9.2](../decisions/evidencia-9.2-backups.md), [runbook](../runbooks/restaurar-la-base.md)). `pg_dump` custom con el rol dueño, timer diario 03:15 UTC con `Persistent=true`, rotación de 7, copia fuera del droplet y **ejercicio de restauración agendado y ejecutado, con control negativo por tres vías**. La revisión independiente —no obligatoria acá, hecha igual— informó **21 hallazgos, 8 mayores, ninguno falso**, y cinco de esos mayores eran instrumentos de recuperación que corrían en verde sin hacer lo que se esperaba de ellos. No abre ni cierra gate. La **retención de `messages`** quedó decidida —se conservan indefinidamente, con reapertura en la 9.4, que pasó a la Fase 10 al disolverse la 9.4— sin agregar ningún mecanismo de expiración. Nivel: **validado en staging** y solo el mecanismo; el tiempo de restauración a volumen real es medición de la 9.3.
  - **9.3 — Datos de volumen en staging. CERRADA el 2026-09-23** ([brief-9.3](../decisions/brief-9.3-datos-de-volumen-en-staging.md), [evidencia-9.3](../decisions/evidencia-9.3-volumen.md)). Cierra la **medición con varias organizaciones**, deuda de la 6.3 (D-4), de la 7.1 a la 7.3, de la 8.5 y de la 9.0.2, y mide el dashboard fuera de local por primera vez. Veinte organizaciones —1×10.000, 3×1.000 y 16×50—, con el `n_distinct` de `organization_id` pasando de **1 a 20-21**, que es la premisa que hace interpretable todo lo demás. **Tres de seis consultas cambian de forma de plan** entre la organización grande y una chica, y sobre la grande el recorrido secuencial ahora descarta **4.309 productos y 3.806 clientes ajenos**: la organización dominante paga por las demás, y ese costo crece con el total de la tabla. Antes de medir se corrigieron los **parámetros de costo del planificador**, que describían una máquina inexistente con dos errores en sentidos opuestos (D-2), y se **recalibró la máquina** contra la tanda de la 8.5 (D-3b): factor 0,82×–4,17×, mediana 2,29×, umbral **916 ms**. Ninguna consulta resultó patológica, **D-7 no se activó y `src/` no se tocó**. También saldó las dos deudas nominales de la 9.2 —restauración medida al volumen real, **5,08 s** con la aplicación corriendo— y las dos rutas de producto que la 9.1 dejó sin recorrer. No abre ni cierra gate. **No tuvo revisión independiente**, que el brief recomendaba sin exigirla: el cierre es autoevaluación y así queda declarado. Nivel: **validado en staging**.
    - *Corregido el 2026-09-23 por la revisión independiente de la 9.3, hecha en la 10.1* ([evaluación 10.1](../decisions/evaluacion-10.1-mvp.md) §6). El texto de arriba no se borra; lo que dice mal: los «4.309 productos ajenos» son **3.800 ajenos y 509 inactivos de la propia organización** (los 3.806 clientes sí son ajenos); el dashboard medido son **diez llamadas, sin la métrica 12**, y su resultado no se comprobaba; la paginación profunda medida es la **página 100**, no la última; y de las consultas del alcance solo **seis** tienen plan capturado, sin salida cruda ni tiempo. La calibración (umbral 916 ms) y la restauración de 5,08 s se recalcularon y cierran. **La 9.3 no cumple la condición de cierre que ella misma se fijó**; el usuario decidió registrarlo sin reabrir el cierre. Lo que quedó sin medir va a la Fase 13 (O-2 y O-39).
  - ~~**9.4 — Piloto con ventana de observación.** Cierra el gate de salida. Incluye la reevaluación de **APM y tracing** (8.4, D-6) y la de **protección de rama**.~~ **Disuelta el 2026-09-23, por decisión del usuario**, sin abrirse. Lo que contenía se separó en dos, porque se movía en direcciones opuestas:
    - **El piloto sintético perdió valor**: iba a pilotear las pantallas 3 a 5, que la integración con el agente va a cambiar, y no podía pilotear la de información del negocio, que no existe. **Se reasigna, no se pospone**: ver la condición de abajo.
    - **Las tres reevaluaciones ganaron valor** y pasan a la **Fase 10**: APM y tracing, protección de rama, y la reapertura de la retención de `messages`. Las tres se contestan mejor ahora que con tráfico sintético, porque el insumo cambió: el agente de WhatsApp va a depender del CRM de forma sincrónica y con datos de clientes reales.
  - **Condición, escrita como tal y no como intención**: **el roadmap que produzca la Fase 10 enumera el piloto como subfase propia de la primera fase de integración**, después de que existan el catálogo comercial y la información del negocio, y antes de que el primer cliente cargue sus datos. Se escribe como condición por el mismo motivo que la de `unaccent` de abajo: «volver al piloto después» es exactamente la forma en que una obligación nombra una fase, nunca llega a una subfase y sobrevive a un cierre sin que nada falle. Ahí el piloto deja de ser sintético y coincide con un trabajo que tiene que ocurrir igual: cargar el catálogo, los precios y los datos del primer negocio real.
  - *Precisión del 2026-09-23, decidida por el usuario* (revisión independiente de la Fase 10, M-1): la frase anterior —el piloto «coincide» con cargar los datos del primer negocio real— **deja de regir**. Staging no recibe datos reales del negocio ([Environments](../development/Environments.md)), así que el piloto de la 11.4 se hace con datos sintéticos con la forma de los del negocio, y la carga real ocurre en la **13.5**.
  - **Condición cumplida el 2026-09-23** (10.3, AC-14): el piloto es la **subfase 11.4** de la [Fase 11](#fase-11--lo-que-el-agente-necesita-leer), después del catálogo comercial (11.1), la información del negocio (11.2) y la API de lectura (11.3), y antes de que el primer cliente cargue sus datos, que no ocurre antes de la Fase 13.
  - **Condición cumplida el 2026-09-21**: `unaccent` quedó enumerado en el alcance de una subfase concreta, la 9.0.2. Se había escrito como condición y no como intención porque el defecto que lo trajo hasta acá fue exactamente ese: una obligación asignada a una fase, correctamente, que nunca llegó a una subfase y sobrevivió a un cierre entero sin que nada fallara. Nombrar la fase no alcanza cuando el trabajo se reparte y se cierra por subfases. Por el mismo motivo, la descomposición asignó **cada** obligación heredada a una subfase nominal, y no solo `unaccent`.
  - **Revisión independiente**: la 9.1 y la 9.4 la llevaban por obligación, porque abren o cierran un gate. **La 9.1 la tuvo, cuatro veces. La 9.4 se disolvió sin abrirse, así que el gate de salida de la fase se cerró por enmienda del usuario y no por una revisión**: no hubo entrega que revisar, y eso queda dicho acá en vez de dejar que la línea siga afirmando una obligación que nadie cumplió ([ExecutionProtocol](../development/ExecutionProtocol.md), paso 4b). La 9.0.1 la llevó por recomendación, no por obligación, y **encontró cuatro defectos reales**, dos de ellos en instrumentos que iban a quedar versionados: un agujero en la guarda nueva y una aserción de estado que no podía fallar. Es la primera vez en el proyecto que la revisión independiente corre **dentro** del ciclo y no después de un cierre. Por ese resultado, las subfases de la 9.0 que dejen guardas o tests como instrumento también la llevan.
- **Dependencias**: Fase 8 cerrada.
- **Riesgos**: el primer despliegue siempre revela supuestos del entorno que no se probaron en local.
- **Disciplina del piloto**: se aplica *Observation Window Before Iteration*. Durante la ventana, cada observación se registra en `docs/decisions/notas-piloto-9.md` sin implementar cambios. El triage contra evidencia se hace cuando el usuario confirma el cierre. Solo un fallo crítico que el usuario decida atender rompe la ventana.
- **Entregables**: entorno de staging operable, backup restaurado e informe del piloto.
- **Criterios de aceptación**: las 10 pantallas funcionan sin errores con volumen; un backup se restauró en un entorno aislado; las notas del piloto están triageadas.
- **Gate de entrada**: Fase 8 cerrada **y H-3 resuelto antes de levantar el primer entorno compartido** (ver abajo).
- **Gate de salida**: ~~informe del piloto sin bloqueantes~~. **Enmendado por el usuario el 2026-09-23** y cerrado ese día sin piloto. Es la **primera vez en el proyecto que un gate no se cumple como está escrito**, y por eso queda como decisión con fecha y no como omisión. De los tres criterios de aceptación de la fase, **dos se cumplieron** —las 10 pantallas sin errores con volumen (9.3, AC-10) y un backup restaurado en un entorno aislado (9.2, remedido al volumen en la 9.3)— y **el tercero, las notas del piloto triageadas, no**: el piloto se reasignó con la condición escrita arriba. **Consecuencia que no se tapa**: la Definición de Terminado del MVP incluye «piloto en staging sin bloqueantes, con datos sintéticos», así que la Fase 10 tiene que registrarlo como **incumplido por decisión**, que es exactamente lo que su propio criterio de aceptación le pide —evidencia de cumplimiento *o de incumplimiento*—. *Precisión del 2026-09-23* (evaluación 10.1, §6, R-7 y R-18): el primero de los dos criterios cumplidos se sostiene en un recorrido cuya comprobación de contenido coincide con el menú en 6 de 9 pantallas. Lo probado es que las diez cargan sin error de consola, excepción ni petición fallida, no que muestren su contenido. El cierre no se reabre, por decisión del usuario; el criterio vale menos de lo que se dijo.
- **Nivel de validación**: validado en staging. **Alcanzado** en lo que se ejercitó; el piloto, que era lo que lo iba a extender al uso real, no ocurrió.
- **Fase 9 CERRADA el 2026-09-23**, con cuatro subfases cerradas —9.0 (con sus cuatro hijas), 9.1, 9.2 y 9.3— y la 9.4 disuelta.
- **Precondición bloqueante de la 9.1** (resolución del gate de la Fase 8, 2026-09-18): no se levanta ningún entorno compartido —staging, piloto o producción— sin **`TRUSTED_PROXY=true` contra un proxy real**, o con **el límite por IP del ingreso desactivado**. Mientras `TRUSTED_PROXY` no sea `true`, todas las peticiones comparten una sola clave de IP y **20 ingresos fallidos de cualquiera dejan sin ingreso a todos los usuarios**, de forma renovable y a costo despreciable (H-3, en [Risks](Risks.md)). Bajo la escala de severidad ampliada eso es **crítico** en cuanto exista más de un usuario, y un hallazgo crítico detiene la fase. Se verifica antes de desplegar, no después.

- **Precondición cumplida el 2026-09-22** (9.1, AC-5 y AC-6): `TRUSTED_PROXY=true` contra nginx real, con un solo salto de proxy que **reemplaza** `x-forwarded-for` en vez de agregarlo. La clave del límite almacenada es `sha256` de la IP pública real del cliente, y no la de una cabecera falsificada ni la de `"sin-proxy"`, que es la firma del defecto. Medido por consecuencia: 20 fallos desde una IP la bloquean mientras la misma cuenta ingresa desde otra en el mismo momento. **La verificación es autoevaluación** hasta que la revisión independiente de la 9.1 la confirme.

## Fase 10 — Evaluación del MVP

- **Objetivo**: decidir con criterios explícitos si continuar, iterar o detener el producto.
- **Alcance**: contrastar la Definición de Terminado con el estado real. **Más las tres reevaluaciones que heredó de la 9.4** al disolverse el 2026-09-23 —APM y tracing (8.4, D-6), protección de rama, y la reapertura de la retención de `messages` (9.2, D-2)—. Y la decisión que el usuario anticipó al cerrar la Fase 9: **conectar al agente de WhatsApp como consumidor del CRM**, dentro de este repositorio y como fases nuevas, lo que obliga a enmendar explícitamente `Scope.md`, `FR-CONV-05`, `IntegrationBoundaries.md` y el ADR 0003. El análisis de brechas que lo motiva es un documento del usuario del 2026-09-17, que en la fecha de este cierre tenía cuatro de sus doce brechas ya resueltas por trabajo posterior. **No se ejecuta nada de esto al cerrar la Fase 9**: queda enumerado para que el brief de la Fase 10 lo tome.
- **Subfases**: ~~10.1. *(A redescomponer en el brief de la Fase 10: el alcance creció con lo de arriba.)*~~ Redescompuesta el 2026-09-23 en un solo [brief](../decisions/brief-10-evaluacion-del-mvp.md) con tres subfases:
  - **10.1 — Evaluación contra la Definición de Terminado. Cerrada el 2026-09-23** ([evaluación 10.1](../decisions/evaluacion-10.1-mvp.md)): cinco de seis criterios cumplidos y el piloto **incumplido por decisión**; las tres reevaluaciones resueltas o asignadas; 42 obligaciones inventariadas con destino; revisión independiente de la 9.3.
  - **10.2 — Enmiendas de alcance para la integración. Cerrada el 2026-09-23**: [ADR 0014](../decisions/0014-el-agente-de-whatsapp-como-consumidor-del-crm.md), que reemplaza parcialmente al 0003, y las enmiendas fechadas de alcance, visión, `FR-CONV-05`, límites de integración, README y la frase de independencia de `CLAUDE.md`.
  - **10.3 — Roadmap de integración y decisión**: las Fases 11 a 14 de abajo y la decisión del usuario. Cierra el gate, con revisión independiente obligatoria que cubre las tres subfases.
- **Dependencias**: Fase 9 cerrada.
- **Entregables**: informe de evaluación con recomendación.
- **Criterios de aceptación**: cada criterio de la Definición de Terminado tiene evidencia explícita de cumplimiento o de incumplimiento.
- **Gate de entrada**: Fase 9 cerrada.
- **Gate de salida**: decisión explícita del usuario. **Tomada el 2026-09-23: continuar ampliando el alcance**, hacia las Fases 11 a 14 ([evaluación 10.1](../decisions/evaluacion-10.1-mvp.md) §7). Con un criterio de la Definición de Terminado incumplido por decisión —el piloto, que pasa a la 11.4— y FR-MET-03 probado solo de forma indirecta.
- **Nivel de validación**: validado en staging. ~~Preparado para producción solo si la decisión es continuar.~~ *Enmendado el 2026-09-23*: la Fase 10 no produce evidencia nueva. «Preparado para producción» es el objetivo de la Fase 13, no de esta.

---

## Fases de integración con el agente de WhatsApp

**Estado: diseñado.** Agregadas el 2026-09-23 en la 10.3, por el [ADR 0014](../decisions/0014-el-agente-de-whatsapp-como-consumidor-del-crm.md). El orden lo acordó el usuario el 2026-09-23 con un criterio de riesgo: una lectura fallida degrada una respuesta del agente; una escritura de mensaje fallida pierde la conversación. Por eso primero lo que el agente **lee**, después el contexto del turno, después producción y al final la migración.

Reglas comunes a las cuatro fases:

- **Ninguna prohibición de `CLAUDE.md` se relaja.** El CRM no habla con Airtable, no importa ni referencia código del agente y no crea módulos de ERP. La dependencia es unidireccional: el agente llama al CRM, el CRM nunca llama al agente.
- **El corte del agente ocurre en su propio repositorio**, con sus propios briefs: primero las tools de catálogo y conocimiento, que solo leen, y después el contexto del turno. Nada de estas fases toca ese repositorio ni su instancia de n8n.
- **Las subfases de abajo son la partición propuesta**, con cada obligación heredada ya asignada. Su brief puede dividirlas, pero **no puede soltar una obligación** sin decir a qué otra subfase va (nota del vault *An Obligation Assigned to Two Phases Is Assigned to None*).
- **Convención desde el primer brief** (evaluación 10.1, §2): todo requisito nuevo lleva su identificador en el caso de test que lo prueba.
- **Los rótulos provisionales** con que la [evaluación 10.1](../decisions/evaluacion-10.1-mvp.md) asignó destinos se traducen así: I-Lectura = **Fase 11**, I-Turno = **Fase 12**, I-Producción = **Fase 13**, I-Migración = **Fase 14**. Los números O-*n* y R-*n* de abajo remiten a esa evaluación.

## Fase 11 — Lo que el agente necesita leer

- **Objetivo**: que el agente pueda leer del CRM el catálogo comercial y la información del negocio por una API de servicio de solo lectura, y pilotear el backoffice antes de que un cliente real cargue sus datos.
- **Alcance**: precio con historial y moneda, marca, categoría, condición y búsqueda por palabras sueltas; un módulo nuevo de información del negocio; el primer contrato de lectura; el piloto. **Fuera**: toda escritura del agente (Fase 12), datos reales (Fase 13), cualquier dato traído del sistema legado (Fase 14).
- **Brechas que cierra**: B-8 (catálogo comercial), B-9 (información del negocio) y la parte de lectura de B-2 (API de servicio).
- **Subfases**:
  - **11.0 — Instrumentos y herramienta antes de construir encima.** El piloto reutiliza `scripts/recorrer-pantallas.ts`, y usarlo sin corregir repetiría el defecto que la revisión de la 9.3 encontró. Toma: los instrumentos que pasan en verde sin medir lo que dicen, incluido el comentario de `deploy/staging/crm-backup.sh:76` (O-40); `drizzle-kit migrate` que sale con código 1 sin error (O-8), porque esta fase es la primera que despliega migraciones nuevas a staging; subir los artefactos de Playwright cuando el paso falla (O-21); y registrar, sin decidirlo de antemano, que `cancel-in-progress` en `main` deja commits intermedios sin resultado (R-2).
  - **11.1 — Catálogo comercial.** Precio en una tabla de solo inserción, con moneda y el vigente derivado, el patrón de `inventory_movements` (brief-10, D-5); marca, categoría y condición; búsqueda por palabras sueltas sobre nombre, categoría y marca. Cambia las pantallas 3 a 5 y suma una de precios. Si autoriza `globals.css`, suma el token de advertencia de «bajo stock» (O-17). El esquema se diseña en su brief, desde el modelo del CRM y no desde las tablas de Airtable.
  - **11.2 — Información del negocio.** Módulo nuevo con tabla, servicio, pantalla de edición para `admin`, auditoría y vigencia. Puede ir en paralelo a la 11.1.
  - **11.3 — API de servicio de lectura.** Contrato de lectura versionado en `docs/contracts/`, con validador ejecutable, fixtures declarados como forma asumida, credencial de servicio por organización y límite de tasa. Toma: `logEvent` en cada ruta, con `request_id`, `source`, ruta, resultado y duración (R-1, pieza 1); un identificador de correlación del emisor, registrado (R-1, pieza 2); comprobar que `proxy.ts` sigue aplicando las cabeceras a las rutas nuevas (O-22); comprobar que la revocación de credenciales no queda expuesta por HTTP (O-33); y **nombrar al emisor sin que la guarda de referencias prohibidas dispare**, sin tocar la guarda para hacer pasar un nombre (brief-10, C-6). **Pregunta asignada**: ¿el límite de 120 pedidos por minuto alcanza para el tráfico del agente? (brechas, pregunta 5).
  - **11.4 — Piloto.** Subfase propia, por condición escrita en la Fase 9. Con datos sintéticos con la forma de los del primer negocio, nunca sus datos reales (decisión del usuario del 2026-09-23). Con la disciplina de *Observation Window Before Iteration*. Toma: la validación de las personas contra el uso real, cuya fase límite venció en la 9 (O-36), y decidir qué recorrido end-to-end hace falta contra staging (O-10). Termina **antes** de que el primer cliente cargue sus datos. Cierra el gate: lleva revisión independiente.
- **Dependencias**: Fase 10 cerrada con la decisión del usuario. 11.0 antes que todas; 11.3 depende de 11.1 y 11.2; 11.4, de las tres.
- **Riesgos**: diseñar el contrato de lectura espejando las tablas de Airtable, que es lo que el ADR 0014 prohíbe; que el piloto use el instrumento sin corregir (lo mitiga la 11.0); que el contrato se declare validado en integración sin que el agente lo haya consumido.
- **Entregables**: migraciones y pantallas del catálogo comercial y de la información del negocio; el contrato de lectura v1 en `docs/contracts/` con su validador y fixtures; las notas del piloto triageadas.
- **Criterios de aceptación**: cada requisito nuevo con su identificador en el caso de test que lo prueba; el precio con historial y moneda sin ningún camino que lo sobrescriba; ninguna ruta de servicio sin `logEvent`; la guarda de referencias prohibidas en verde sin haberla modificado.
- **Gate de entrada**: Fase 10 cerrada.
- **Gate de salida**: piloto sin bloqueantes y contrato de lectura publicado con su validador en verde. Si el agente ya lo consume en staging, detrás del modo de prueba, el contrato llega a **validado en integración**; si no, queda en validado localmente y en CI, y se dice.
- **Nivel de validación**: validado en staging, sin datos reales.
- **Fase 11 CERRADA el 2026-09-25**, con sus cinco subfases cerradas (11.0 a 11.4) y el cierre confirmado por el usuario ([CHANGELOG](../../CHANGELOG.md)).
  - **Gate de salida, cumplido como está escrito**:
    - el piloto terminó **sin bloqueantes** ([notas-piloto-11.4](../decisions/notas-piloto-11.4.md), §Triage: 0 bloqueantes, 1 mayor aceptado con destino en la 12.1);
    - el contrato de lectura está publicado ([read-v1](../contracts/read-v1.md)), con su validador en verde en CI.
  - **Nivel alcanzado**:
    - el backoffice, **validado en staging** con datos sintéticos;
    - el contrato, **validado localmente y en CI, más una corrida en staging**, y **no** validado en integración, porque el agente todavía no lo consume. Es la rama «si no» de este gate, y se dice ([brief-11.4](../decisions/brief-11.4-piloto-en-staging.md), H-1).
  - **Lo que hereda la Fase 12 del piloto**:
    - E-1, corregir el procedimiento de despliegue de `deploy/staging/README.md`, en la **12.1**;
    - N-1, si el agente necesita la cantidad en stock, como pregunta de la **12.5**.

## Fase 12 — El contexto del turno

- **Objetivo**: que el agente resuelva en el CRM todo lo que hoy hace contra Airtable en cada turno —cliente, conversación, mensaje, historial y derivación—, en staging y detrás del modo de prueba.
- **Alcance**: operaciones de servicio que escriben, con un actor de servicio en la auditoría; el contrato de ingestión v2; lecturas del contexto. **Fuera**: tráfico real de clientes (Fase 13).
- ~~**Decisión pendiente, registrada como tal**~~ **Resuelta en la 12.1** ([brief-12.1](../decisions/brief-12.1-actor-de-servicio-y-cliente-por-telefono.md), D-1, 2026-09-25): las escrituras que no son mensajes entran como **eventos nuevos del contrato de ingestión v1**, sin tercera superficie y sin enmendar el ADR 0014, que lleva notas fechadas. El texto original se conserva (revisión independiente de la Fase 10, M-5): el [ADR 0014](../decisions/0014-el-agente-de-whatsapp-como-consumidor-del-crm.md) y [IntegrationBoundaries](../architecture/IntegrationBoundaries.md) describen **dos superficies**: lectura por la API de servicio y escritura por el contrato de ingestión. «Buscar o crear por teléfono» (12.1) y el cambio de estado por servicio (12.2) son escrituras que no son mensajes. El brief de la 12.1 decide, antes de diseñar, si entran como eventos nuevos del contrato de ingestión o como una **tercera superficie**. Si es la tercera, necesita un ADR que enmiende el 0014; no se agrega por conveniencia de la tarea.
- **Brechas que cierra**: B-3 (cliente por teléfono), B-4 (conversación vigente), B-5 (derivación), B-6 (mensajes con tipo y autor), B-7 (historial). Y decide B-10 (memorias).
- **Subfases**:
  - **12.1 — Actor de servicio y cliente por teléfono.** Actor de servicio para la auditoría; «buscar o crear por teléfono», idempotente; el origen del cliente; qué pasa con un cliente inactivo que escribe. **Su brief decide si las pruebas contra staging usan teléfonos o mensajes reales**, aunque sean de quienes prueban: si los usan, son datos personales no sintéticos y **la reapertura de la retención se adelanta a esta subfase** (R-3).
  - **12.2 — Conversación vigente y derivación.** «Conversación vigente del cliente o una nueva», quién genera `external_ref`, y el cambio de estado por servicio, auditado. **Preguntas asignadas**: ¿qué equivale a `Escalada a humano`, `pending` o un estado nuevo? (pregunta 1), y ¿cuándo vence una sesión de conversación? (pregunta 2).
  - **Avance al 2026-09-25**:
    - **12.1 cerrada**: el actor de servicio y `client.resolved`, validados localmente y en CI ([CHANGELOG](../../CHANGELOG.md));
    - **12.2 cerrada**: `conversation.resolved` y `conversation.escalated`, validados localmente y en CI ([brief-12.2](../decisions/brief-12.2-conversacion-vigente-y-derivacion.md)). **Pregunta 1**: `pending`, con el significado «espera a una persona». **Pregunta 2**: vigente mientras su tramo quede a 24 horas o menos del mensaje, a cada lado; una `closed` nunca lo es. `external_ref` lo genera el emisor, y el CRM decide si se usa.
  - **12.3 — Contrato de ingestión v2.** Tipo original y autor del mensaje, y el manejo de `CONFLICT` y de fallas del lado del emisor. Toma: validar la autenticación y los fixtures con requests reales del emisor, en staging y detrás del modo de prueba (O-35), que es el gate que [IntegrationBoundaries](../architecture/IntegrationBoundaries.md) ya le fijaba a la integración; y medir por primera vez la métrica 12 con datos de ingestión de un emisor real (O-34).
  - **12.4 — Historial y memorias.** Lectura de servicio de los últimos N mensajes, en orden cronológico y con dirección. **Pregunta asignada**: ¿las memorias viven en el CRM o en el agente, y quién las genera? (pregunta 3, B-10). Se decide en esta subfase; si la respuesta es el CRM, su construcción entra como subfase nueva de esta fase, con su brief.
  - **12.5 — Turno completo en staging.** Recorrido del agente contra el CRM, detrás del modo de prueba, con todas las operaciones de la fase. Cierra el gate: lleva revisión independiente.
- **Dependencias**: Fase 11 cerrada. 12.2 depende de 12.1; 12.3 y 12.4, de 12.2; 12.5, de todas.
- **Riesgos**: que la regla de vencimiento de sesión se copie del agente en vez de modelarse en el CRM; que una escritura fallida pierda un mensaje; entrar datos personales reales en staging sin haberlo decidido.
- **Entregables**: el actor de servicio; las operaciones de cliente, conversación y derivación; el contrato de ingestión v2; la lectura del historial; la decisión sobre memorias.
- **Criterios de aceptación**: toda escritura de servicio auditada con el actor de servicio; idempotencia probada en cada operación nueva, incluido el reenvío; ninguna pérdida de mensaje ante `CONFLICT`, timeout o falla del emisor; el historial trae los últimos N, no los primeros.
- **Gate de entrada**: Fase 11 cerrada.
- **Gate de salida**: el agente completa turnos contra el CRM en staging, detrás del modo de prueba, sin pérdida de mensajes (12.5).
- **Nivel de validación**: validado en integración (productor ↔ contrato ↔ consumidor), en staging.

## Fase 13 — Producción

- **Objetivo**: llevar el CRM al nivel **preparado para producción** y recibir el primer tráfico real.
- **Alcance**: el entorno productivo y todo lo que la evaluación 10.1 dejó como condición antes de datos reales. **Fuera**: la carga de datos del sistema legado (Fase 14).
- **Brechas que cierra**: B-11 (producción).
- **Subfases**:
  - **13.1 — Entorno productivo.** Hosting, base, TLS y secretos. **Antes del primer despliegue, el usuario decide la protección de rama** entre seguir sin ella con la disciplina actual o pagar un plan que la ofrezca, con el precio verificado ese día (R-2). Toma: H-3 como **precondición bloqueante** del entorno (O-29); `CREATEROLE` y la migración `0003` (O-7 y O-27); la gestión de secretos, que en staging se decidió para staging (O-38); la versión de runtime (O-31); la renovación del certificado vista funcionar (O-4); la cookie verificada sobre el `Set-Cookie` crudo (O-6); el dueño de la base en el runbook de restauración (O-3). Si el despliegue no puede seguir el paso manual de comparación con lo desplegado, reabre O-9.
  - **13.2 — Mediciones previas a exponer datos reales.** El plan genérico de las sentencias preparadas, leyendo antes cómo las prepara el driver (O-2), y lo que la 9.3 dio por medido sin medirlo: planes con salida cruda y tiempo para todo su alcance, el peor caso de la paginación profunda, el dashboard completo con la métrica 12 y la ventana del manifiesto de la 9.2 (O-39). *Agregado el 2026-09-25 por la 12.3 ([brief-12.3](../decisions/brief-12.3-contrato-de-ingestion-v2.md)):* el plan de la consulta de la conversación vigente de la 12.2, con volumen (AC-15 de la 12.3, trasladado por decisión del usuario: staging tenía solo el seed del piloto, 51 conversaciones), y **R-8 de la 12.2**, el modo de bloqueo del cliente (`FOR NO KEY UPDATE`) y la candidata que un `admin` cierra en ese momento (D-10: el tráfico sintético de un solo emisor no produce esa concurrencia).
  - **13.3 — Disponibilidad y observabilidad.** Medición externa de disponibilidad y latencia, con alerta (R-1, pieza 3), y la reevaluación de una herramienta de APM o tracing con tráfico real (R-1). **Pregunta asignada**: ¿qué disponibilidad se le exige al CRM, si el agente depende de él en cada mensaje? (pregunta 6).
  - **13.4 — Datos reales.** La retención de `messages` (R-3) y el borrado real de los datos de un cliente frente a `audit_logs` de solo inserción (O-11), decididos juntos porque los dos chocan con el [ADR 0013](../decisions/0013-rol-de-aplicacion-y-tablas-de-solo-insercion.md). Antes del primer mensaje real.
  - **13.5 — Primer cliente.** Carga de sus datos por la UI del CRM y primer tráfico real **de ese solo negocio**, detrás del modo de prueba: la allowlist admite su credencial y ninguna otra. Empieza solo con la decisión explícita del usuario al abrirla. Lo que venga del sistema legado espera a la Fase 14. Cierra el gate: lleva revisión independiente.
- **Dependencias**: Fase 12 cerrada. 13.4 antes de 13.5; 13.1 antes que todas.
- **Riesgos**: el primer despliegue productivo revela supuestos que staging no tenía; H-3 reaparece en cualquier entorno sin `TRUSTED_PROXY=true`.
- **Entregables**: entorno productivo operable con su runbook, backup y restauración probados ahí; medición externa de disponibilidad con alerta; las decisiones de retención y de borrado real registradas.
- **Criterios de aceptación**: todas las obligaciones asignadas a la 13.1–13.4 cerradas con evidencia o aceptadas por el usuario; H-3 verificado en el entorno productivo antes de exponerlo; ningún número de la 9.3 citado sin la corrección de la 10.1.
- **Gate de entrada**: Fase 12 cerrada. *(La decisión de protección de rama es condición del primer despliegue, dentro de la 13.1, no de la entrada a la fase.)*
- **Gate de salida**: preparado para producción —seguridad, observabilidad, backups probados, rollback y limitaciones aceptadas— y decisión explícita del usuario de **sacar el tráfico real del modo de prueba**, más allá del primer negocio.
- **Nivel de validación**: preparado para producción.

## Fase 14 — Migración por CSV

- **Objetivo**: traer al CRM los datos del sistema legado que valga la pena conservar.
- **Alcance**: los datos entran por **CSV exportado**; el CRM nunca llama a la API de Airtable, tampoco para migrar. El mapeo se diseña desde el modelo del CRM. **Fuera**: el logging del agente y su purga, que son telemetría del agente y no datos de negocio.
- **Brechas que cierra**: B-12.
- **Subfases**:
  - **14.1 — Qué se migra y cómo se mapea.** Inventario de los CSV, mapeo de identificadores, limpieza de registros inválidos. **Pregunta asignada**: ¿qué se migra y qué se descarta? (pregunta 4).
  - **14.2 — Mecanismo de carga.** El contrato de ingestión como backfill o una importación propia, que el [ADR 0014](../decisions/0014-el-agente-de-whatsapp-como-consumidor-del-crm.md) deja abierto a esta fase.
  - **14.3 — Carga y verificación.** Con ensayo previo sobre una copia aislada del entorno productivo —staging no recibe datos reales del negocio ([Environments](../development/Environments.md))— y conciliación de recuentos. Cierra el gate: lleva revisión independiente.
- **Dependencias**: Fase 13 cerrada.
- **Riesgos**: reproducir en el CRM las fallas del legado —historial congelado, memorias vacías, teléfonos inválidos—; acoplar el esquema al formato de los CSV.
- **Choque latente con una prohibición, registrado antes de llegar** (revisión independiente de la Fase 10, M-6): `CLAUDE.md` prohíbe «adaptadores, mappers ni tipos que representen bases o tablas de Airtable», y la guarda de referencias prohibidas dispara con cualquier mención de Airtable fuera de la documentación. Un importador de CSV exportados de Airtable describe, por fuerza, la forma de esas tablas. **El brief de la 14.1 resuelve esto antes de diseñar**: o la conversión de los CSV al formato del CRM ocurre fuera del repositorio y el CRM solo recibe su propio formato, o hace falta una excepción acotada, que es relajar una prohibición y por lo tanto **se detiene y se eleva al usuario**, con ADR. No se resuelve tocando la guarda.
- **Entregables**: el mapeo documentado, el mecanismo de carga y el informe de conciliación.
- **Criterios de aceptación**: recuentos conciliados por entidad entre los CSV y el CRM; registros descartados listados con su motivo; ninguna llamada a la API de Airtable ni variable de entorno `AIRTABLE_*`.
- **Gate de entrada**: Fase 13 cerrada.
- **Gate de salida**: datos migrados conciliados y decisión del usuario.
- **Nivel de validación**: preparado para producción.

---

## Fases futuras, sin planificar en detalle

- ~~**Migración y cutover**: proyecto separado, posterior a la Fase 10 si la decisión es continuar ([ADR 0003](../decisions/0003-migracion-legado-proyecto-separado.md)). Incluye la carga desde el sistema legado y la integración con tráfico real detrás de un modo de prueba.~~ *Enmendado el 2026-09-23 ([ADR 0014](../decisions/0014-el-agente-de-whatsapp-como-consumidor-del-crm.md))*: la integración con tráfico real y la migración dejaron de ser un proyecto separado. Son las **Fases 11 a 14** de arriba.
- **ERP** (ventas, compras, proveedores, pagos, caja, contabilidad): proyectos propios, sobre la base ya construida de `organizations`, `clients` y `products`. *Precisión del 2026-09-23*: **no empieza antes de que la integración esté en producción** (Fase 13), por decisión del usuario. Sin fases ni tablas hasta entonces.

## Camino crítico

0.1 → 0.2 → 0.3 → Fase 1 → Fase 2 → Fase 3 → (Fase 4 ∥ Fase 5) → Fase 6 → Fase 7 → Fase 8 → Fase 9 → Fase 10 → Fase 11 → Fase 12 → Fase 13 → Fase 14. *(Extendido el 2026-09-23: terminaba en la Fase 10.)*

Dentro de la Fase 6: 6.1 → 6.2 → 6.3 → 6.4, y en paralelo 6.5.1 → 6.5.2 → 6.5.3.

Dentro de la Fase 11: 11.0 → (11.1 ∥ 11.2) → 11.3 → 11.4.

## Trabajo paralelizable

- Fases 4 y 5, una vez cerrada la Fase 3.
- En la Fase 1, los wireframes de pantallas distintas.
- En la Fase 3, la 3.6 (auditoría) junto a la 3.2–3.4.
- En la Fase 6, la ingestión (6.5) junto a la consulta y la UI (6.3–6.4).
- En la Fase 7, la 7.1 y la 7.2.
- En la Fase 8, la 8.3 junto al resto.
- En la Fase 11, la 11.1 (catálogo) y la 11.2 (información del negocio).

## Hitos demostrables

1. Login funcional con roles (fin de la Fase 3).
2. Ajuste de stock con historial visible (fin de la Fase 4).
3. Timeline de conversación navegable con datos sintéticos (fin de la Fase 6).
4. Dashboard con las 12 métricas correctas (fin de la Fase 7).
5. Recorrido completo en staging sin bloqueantes (fin de la Fase 9).
6. El agente lee catálogo e información del negocio del CRM, en staging (fin de la Fase 11).
7. Un turno completo del agente contra el CRM, en staging y detrás del modo de prueba (fin de la Fase 12).
8. Primer cliente atendido en producción (fin de la Fase 13).

## Definición de Terminado del MVP

- Todos los FR de `FunctionalRequirements.md` implementados y probados.
- Las 12 métricas de `MetricsCatalog.md` validadas contra fixtures.
- `SecurityModel.md` verificado, sin hallazgos críticos abiertos.
- Piloto en staging sin bloqueantes, con datos sintéticos.
- Cero referencias a Airtable o al repositorio del agente de WhatsApp en código y configuración, verificado por la guarda de CI.
- `CHANGELOG.md` con la entrada de cierre de cada fase.

## Criterios para continuar, iterar o detener

- **Continuar** ~~(hacia la migración y luego el ERP)~~: se cumple la Definición de Terminado sin hallazgos críticos y el usuario confirma que el backoffice resuelve el dolor descrito en `Vision.md`.
- **Iterar**: el MVP funciona, pero el piloto revela datos o flujos no anticipados. Se vuelve a la Fase 1 con el alcance ajustado, sin descartar el backend ya validado.
- **Detener**: el modelo o las métricas no reflejan cómo opera el negocio y el costo de rediseñar supera el valor entregado. La decisión es solo del usuario, con la evidencia de la Fase 10.
- **Continuar ampliando el alcance** *(agregada el 2026-09-23 en la 10.3)*: el usuario confirma que el backoffice resuelve el dolor, y el uso previsto reveló datos y flujos que el MVP no tenía. Se sigue sobre el backend validado, **sin volver a la Fase 1**, y el alcance nuevo entra por fases propias, con ADR, brief y gate. Es la mezcla de «continuar» e «iterar» que ninguna de las tres opciones describía.

*Enmienda del 2026-09-23 (brief-10, C-2)*: la opción «continuar» **no se puede cumplir como está escrita** cuando un criterio de la Definición de Terminado queda incumplido por decisión, como el piloto en la Fase 10. En ese caso la salida no se deriva de los criterios: es una **decisión del usuario, registrada con fecha y con la lista de criterios incumplidos a la vista**. Y «continuar» ya no va «hacia la migración y luego el ERP»: va hacia las Fases 11 a 14, y el ERP después de producción.

## Decisiones que requieren aprobación del usuario

- Aprobación de la documentación de la Fase 0 y de la carga en Notion.
- Decisiones de producto de la 1.3 (enmascarado, vista previa de mensajes, alta de usuarios, identificador de cliente, zona horaria por defecto, stock negativo, retención, remoto y CI).
- Instalación de dependencias (Fase 2) y mecanismo de sesión (3.2).
- Hosting de staging (9.1).
- ~~Paso de la Fase 10 al proyecto de migración.~~ *Enmendado el 2026-09-23*: la salida de la Fase 10 entre continuar, continuar ampliando el alcance, iterar o detener.
- Protección de rama, antes del primer despliegue a producción (13.1, R-2).
- Hosting productivo (13.1) y apertura del tráfico real (gate de salida de la Fase 13).
- Qué se migra del sistema legado (14.1).
- Inicio del ERP, no antes de que la integración esté en producción.
