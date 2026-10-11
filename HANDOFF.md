---
schema: project-state.v1
project: ai-whatsapp-agent-crm
generated_at: 2026-10-11
git_ref: main — el último ref con corrida leída en verde es **`ef75da3`** (run 38172319305, `success`, leída por `headSha` el 2026-10-11), la implementación de la 19.2; antes, `47572d1` (run 38154844883). Después viene el commit del cierre de la 19.2, solo de documentación: **al retomar, leer su corrida por `headSha`**. **Producción corre `ef75da3`** (19.2), con 37 migraciones (`0000` a `0036`); para volver atrás, `0c2f322`. `confirmado`
active_phase: **Fase 19 — Pedidos, abierta el 2026-10-11** por decisión del usuario, con la Fase 13 abierta (ADR 0016, punto 3). La 19.1 y la 19.2 están cerradas; la 19.3 y la 19.4 esperan. **La Fase 13 — Producción sigue abierta**, con la 13.5.2-b esperando un negocio real y su prioridad intacta: si aparece, la Fase 19 se pausa. `confirmado`
active_task: **Ninguna subfase en curso.** Siguiente: el brief de la **19.3 — Reserva y ciclo** (§3, paso 0). `confirmado`
confidence: confirmado
---

# Handoff

Este archivo es el traspaso entre sesiones. Cada fase se trabaja en una sesión propia y termina escribiendo acá su estado verificado, para que la sesión siguiente no reconstruya el contexto leyendo el historial.

**Se sobrescribe en cada handoff.** No es un registro histórico: eso es `CHANGELOG.md`, los briefs de `docs/decisions/` y Git. Acá vive únicamente el presente. *Limpiado el 2026-10-10*: hasta `969320b` este archivo acumulaba el estado previo de cada cierre (176 KB). La versión completa sigue en Git: `git show 969320b:HANDOFF.md`, que conserva la tabla de evidencia por subfase, la lista de convenciones de las Fases 4 a 12 y los pendientes viejos con su historia.

**Cómo leerlo.** Cada afirmación lleva su procedencia: `confirmado` (verificado contra la fuente en la pasada que escribió este archivo), `historico` (viene de un documento anterior, no re-verificado), `inferido` o `pendiente`. Un campo `historico` se re-verifica antes de tratarlo como vigente. Ninguna autorización sigue viva por aparecer acá.

---

## 1. Identificación

- **Proyecto**: AI WhatsApp Agent CRM. Independiente del agente de WhatsApp en código, infraestructura y base de datos, y sin dependencia de Airtable. **El agente es un consumidor del CRM** ([ADR 0014](docs/decisions/0014-el-agente-de-whatsapp-como-consumidor-del-crm.md)): lo llama por contratos versionados; el CRM nunca lo llama a él. `confirmado`
- **Fases cerradas**: 0 a 12 y 15 a 18. **La Fase 19 — Pedidos está abierta** (19.1 y 19.2 cerradas). **La Fase 13 — Producción sigue abierta** (13.1 a 13.4 cerradas; la 13.5 en curso, con la 13.5.2-a cerrada y la 13.5.2-b esperando un negocio real). La Fase 14 (migración por CSV) está planificada sin abrir. `confirmado`
- **Notion**: proyecto raíz `3d8702be6f4e81659e43c3d8bd9a6e1c`. Data sources: Proyectos `9bf702be-6f4e-82b8-b26e-078fcbbc5e8e`, Tareas `d2a702be-6f4e-83f2-a416-872448834823`. `confirmado`
  - **Fase 19**: el proyecto `3f6702be6f4e81bfbe75cb861acd5b97` y su tarea espejo `3f6702be6f4e8143bea0cda288c09028`; la 19.1 `3f6702be6f4e816ea547f449df0e1ab2` y la 19.2 `3f6702be6f4e813390b6f25fcb2cef76` en **«Completado»** desde el 2026-10-11; la 19.3 `3f6702be6f4e811bacafc4d413b55023` y la 19.4 `3f6702be6f4e81da9df4d463d518b18b` en «Esperando».
  - **Fase 18**: el proyecto `3f5702be6f4e81238f55fce0fa7f729b`, su tarea espejo `3f5702be6f4e81718218f304746b2cbe`, la 18.1 `3f5702be6f4e81b2ae25f1a279d8793c` y la 18.2 `3f5702be6f4e811f8820db49471f1c3a`, en **«Completado»** desde el 2026-10-10 (releídos ese día).
  - **Fase 13**: el proyecto `3ea702be6f4e81dbbb2fed42d19b2af0` en «En progreso»; la 13.5 `3ea702be6f4e81239869d3d392118975` en «En proceso» (`historico`: releída el 2026-10-01).
  - **Tareas sueltas en el proyecto raíz, en «Esperando»** (las dos primeras releídas el 2026-10-10): el simulacro de restauración con imágenes del 2026-11-01 `3f4702be6f4e81518fd7f1b1c975a9a6`; la candidata «Ruta de lectura de la imagen de producto para el agente» `3f5702be6f4e81a3b480ece139cfe4ad`; el CI de Chromium contra el límite de 15 minutos `3f2702be6f4e8104b521cf12b377fe34`; y verificar que la correlación del agente ya no lleve el `wamid` `3f3702be6f4e8152a380f87497a40bf3`.
  - **Tareas en el proyecto de la Fase 13, en «Esperando»** (`historico`): la nota de `contrib` del README de staging, el timeout de `module-boundary`, la regla de finales LF para `deploy/**`, paginar el stock de productos en la consulta (`3eb702be6f4e816f9005e87d52da4388`) y la rotación de `/var/log/syslog` (`3ec702be6f4e8159b468ccd47c55efaa`).
- **Convención de Notion** ([CLAUDE.md](CLAUDE.md) §Convenciones de Notion): un proyecto de fase se crea con la plantilla «Nuevo Proyecto» (`template_id`); toda subfase pendiente va en «Esperando», la que está en curso en «En proceso» y la cerrada en «Completado»; después de crear o cambiar, se relee. **El MCP de Notion tiene un cupo de consultas (`query_data_sources`)**: se agotó el 2026-10-10; para verificar, `fetch` página por página. `confirmado`

## 2. Último punto aprobado

- **19.2 — El pedido**, cerrada el 2026-10-11 ([brief-19.2](docs/decisions/brief-19.2-el-pedido.md) §Cierre). Migración `0036` (`document_counters`, `orders`, `order_lines`), módulos `orders` y `numbering`, alta, lista, detalle y cancelación de un pendiente, los pedidos en los datos de un cliente (con pedidos se vacía, y el vaciado desactiva). Revisión independiente: 3 medios y 4 bajos, verificados y corregidos o decididos. Desplegada en producción (`ef75da3`) y recorrida por el usuario, que creó y canceló `P-000001` en **Demostración Vixora**: «Vixora» no tiene clientes ni productos. Nivel: validado localmente y en CI, validado en integración para las pantallas, desplegado y recorrido. `confirmado`
- **19.1 — ADR del pedido**, cerrada el 2026-10-11 ([brief-19.1](docs/decisions/brief-19.1-adr-del-pedido.md) §Cierre); el [ADR 0020](docs/decisions/0020-el-pedido.md), precisado en la 19.2 en su punto 6 (el cliente se bloquea primero). `confirmado`
- **Orden de la fase**, aprobado el 2026-10-11: 19.1 ADR → 19.2 el pedido → 19.3 reserva y ciclo → 19.4 el pedido del agente, solo si el agente lo usaría. `confirmado`
- **Decisiones del usuario que siguen**: el aviso al agente sobre la semántica del precio queda para más adelante; sin seed de costos (2026-10-10) ni de pedidos (2026-10-11). `confirmado`

## 3. Próximo paso

0. **Preparar el brief de la 19.3 — Reserva y ciclo** y pedir su aprobación antes de tocar código; pasar la tarea a «En proceso» con esa aprobación. Leer antes [DataModel](docs/architecture/DataModel.md) (§`inventories`, en vigor desde la 19.3; §`orders`) y el [ADR 0020](docs/decisions/0020-el-pedido.md), puntos 4 a 7. Lo que la 19.3 crea, según el ADR:
   - lo reservado como columna de `inventories`, con su `CHECK`; un ajuste negativo no deja el saldo por debajo de lo reservado;
   - confirmar (reserva), cancelar un confirmado (libera) y entregar (descuenta con un movimiento `order_delivery`), con el orden de bloqueo del punto 6: cabecera, productos por id, saldos en el mismo orden;
   - lo disponible en las pantallas; `read-v1` no cambia;
   - el trigger de `orders` ya admite esas transiciones y fechas (0036); `updateOrderStatus` hoy solo acepta `cancelled`;
   - toca `inventory`, que la 19.2 no tocó: **revisión independiente recomendada**; la migración en una base real, solo con autorización.

   Las demás candidatas siguen esperando su decisión: la Fase 14 (migración por CSV) y la ruta de la imagen para el agente. `pendiente`
1. **El 2026-11-01**: leer el simulacro de restauración programado, el primero con `product_images` en el backup: `success`, la consulta de hashes de imágenes en 0 y su aviso de vida. Cierra la parte de restauración de AC-8 de la 17.5 (tarea `3f4702be6f4e81518fd7f1b1c975a9a6`). `pendiente`
2. **Después del 2026-10-30**: comprobar que la primera entrada del journal de producción tenga como mucho 31 días (13.4). `pendiente`
3. **Antes de la 13.5.2-b**: contar en el journal, sin imprimir valores, las líneas con `"correlation_id":"wamid` posteriores a la corrección del agente; tienen que ser 0. Desde su subfase 3.46 el agente manda `<ejecución>:r<ronda>:i<pedido>`, y la ventana 17.4.3 lo mostró así (`12292:r1:i1`). Tarea `3f3702be6f4e8152a380f87497a40bf3`. `pendiente`
4. **La 13.5.2-b**, cuando el usuario confirme un negocio real: su alta ([runbook](docs/runbooks/alta-de-un-negocio.md)), el paso 6 de nuevo y **la revocación de las credenciales `agente-demo` antes de encender al cliente** (un solo negocio encendido a la vez). Abre también la bandeja de salida del ADR 0017. **Y responde dos preguntas del ADR 0019**: la condición del negocio frente al IVA (si es responsable inscripto, el margen pasa a montos netos, punto 5) y si lo alcanza la exhibición del precio sin impuestos de la Ley 27.743, con una fuente leída (punto 4). `pendiente`

## 4. Estado de producción y de los entornos

- **Producción**: `https://crm.vixoraai.app`, alias `ssh crm-production`. Corre `ef75da3` (19.2, desplegada el 2026-10-11; la anterior, `0c2f322`) como `crm` en `127.0.0.1:3000`, detrás de nginx; código en `/srv/crm-production`, secretos en `/etc/crm-production/` (`0600` de `root`). El registro de despliegues está en `/var/lib/crm-production/despliegues`, y la configuración de nginx anterior a la 17.5, en `/var/lib/crm-production/nginx-crm-production.antes-17.5`. `confirmado`
- **Organizaciones**: la del operador, «Vixora», sin clientes ni productos, y la de demostración, «Demostración Vixora», donde trabaja el usuario (2 clientes, 5 productos con precio y, desde la 19.2, el pedido cancelado `P-000001`). **La ingestión y la lectura están encendidas solo para las tres credenciales `agente-demo`** (ingest, read, context) desde el 2026-10-03; la copia previa de `app.env` está en `/etc/crm-production/app.env.antes-13-5-2a`. El agente lee y escribe en producción solo en la demostración, con el teléfono del usuario como único remitente. `confirmado`
- **Trabajos programados con aviso de vida en Healthchecks.io** (las URLs viven solo en `/etc/crm-production/heartbeat.env`): el backup cifrado diario (03:15 UTC) con su copia externa y, encadenado, el aviso de tamaño de la base `crm-db-size` (umbral 1 GB; la base ocupaba 9 MB el 2026-10-09); y el simulacro de restauración mensual (día 1, 04:30 UTC). La alerta de cada uno se provocó y llegó. `confirmado`
- **Staging**: `https://staging.vixoraai.app`, alias `ssh crm-staging`, corre `6705457` con 26 migraciones, la ingestión y la lectura apagadas. Muy atrás de producción; no se usó desde la Fase 13. `historico`
- **Cómo se despliega**: [deploy/production/README.md](deploy/production/README.md) §Desplegar (CI del SHA exacto en `success`, anotar el SHA anterior, código, dependencias, migraciones, build, reinicio y HEAD igual al SHA). Cada despliegue lo autoriza el usuario en su turno. `confirmado`
- **Diferencias conocidas entre el servidor y el repositorio**: `crm-backup.sh` difiere solo en comentarios en los dos servidores (desde `f278d0a`); reinstalarlo necesita autorización. `historico`

## 5. Contratos y documentos vigentes

| Qué | Dónde |
|---|---|
| Metodología, prohibiciones y vocabulario de validación | [CLAUDE.md](CLAUDE.md), [development/ExecutionProtocol.md](docs/development/ExecutionProtocol.md) |
| Brief de tarea (`task-brief.v1`) y cápsula de estado (`project-state.v1`) | [development/ExecutionProtocol.md](docs/development/ExecutionProtocol.md), este archivo |
| Modelo de datos y métricas | [architecture/DataModel.md](docs/architecture/DataModel.md), [analytics/MetricsCatalog.md](docs/analytics/MetricsCatalog.md) |
| Seguridad y superficie expuesta | [architecture/SecurityModel.md](docs/architecture/SecurityModel.md), `tests/guards/exposed-surface.test.ts` |
| Contratos con el agente | [contracts/read-v1.md](docs/contracts/read-v1.md) (productos, información, historial, etiquetas, estado de la conversación, stock y horario; todas las rutas nuevas desde la 16.2 validadas en integración en producción), [contracts/ingestion-v2.md](docs/contracts/ingestion-v2.md) (v1 congelada desde la 12.3), [architecture/IntegrationBoundaries.md](docs/architecture/IntegrationBoundaries.md) |
| Decisiones | [docs/decisions/](docs/decisions/README.md): ADRs 0001 a 0020 (el 0020, el pedido, aceptado el 2026-10-11, con sus tablas desde la 19.2 y lo reservado pendiente de la 19.3; el 0019, bases de los comprobantes, aceptado el 2026-10-10 sin tablas; el 0017, responder desde el CRM, aceptado con la implementación pospuesta; el 0018, imágenes de producto, con su enmienda a JPEG) y un brief por subfase |
| Plan | [planning/Roadmap.md](docs/planning/Roadmap.md), [planning/Risks.md](docs/planning/Risks.md) |
| Requisitos y pantallas | [product/FunctionalRequirements.md](docs/product/FunctionalRequirements.md), [product/Screens.md](docs/product/Screens.md), [architecture/TraceabilityMatrix.md](docs/architecture/TraceabilityMatrix.md) (§3 atrasada) |
| Estándares, stack y entornos | [development/EngineeringStandards.md](docs/development/EngineeringStandards.md), [development/Environments.md](docs/development/Environments.md) |
| Runbooks | [docs/runbooks/](docs/runbooks/): restaurar la base, responder a una alerta, datos de un cliente, alta de un negocio, observar el primer negocio |

**Las convenciones de código** viven en los briefs que las decidieron y en EngineeringStandards; la lista acumulada de las Fases 4 a 12 está en `git show 969320b:HANDOFF.md`, §6. Tres que el ERP sigue usando, aplicadas por la 18.2 a `product_costs`: dinero en `numeric(14, 2)` como `bigint` en centésimos con `src/shared/money/`, nunca `number`; tablas de historial de solo inserción con trigger, privilegios de `crm_app` sin `UPDATE` ni `DELETE` y una guarda de escrituras (como `price-writes`); y clave foránea compuesta `(organization_id, entity_id)` hacia un `UNIQUE(organization_id, id)` del dueño. **Desde la 18.2, un dato puede ser solo de `admin`**: el servicio exige el rol antes de consultar, la página muestra el acceso denegado, la barra del producto lee la sesión, y `read-v1` lleva un test con mutación que fija que el agente no lo ve. Una tabla nueva referida por `products` va en el `TRUNCATE` de las cuatro specs end-to-end que vacían productos; desde la 19.2, `orders` y `order_lines` encabezan el `TRUNCATE` de las once specs que vacían `clients` o `products`. **Desde la 19.2**, una tabla con estado lleva un trigger con la lista de columnas que pueden cambiar y sus transiciones (`orders_guard_change`), y los valores de la auditoría son planos (las líneas van con claves `line_N_*`). Los recorridos con teclado de cuatro specs tienen tope de 16 tabulaciones: un ítem nuevo en la navegación suma una parada. `confirmado`

## 6. Evidencia

- **Nivel del producto**: cada pantalla está **validada en integración** (end-to-end sobre `next start` con axe en claro y oscuro, teclado y móvil); el agente consume la lectura v1 y la ingestión v2 **validadas en integración en producción**, en la organización de demostración. **Nada certifica «preparado para producción»**: ese gate es de la Fase 13, con la 13.5.2-b pendiente. `confirmado`
- **Batería al cierre de la 19.2** (`ef75da3`): 676 unitarios, 542 guardas, 955 de integración y el end-to-end en dos tandas en local; CI 38172319305 `success` en 11 min 58 s. **Intermitencias del end-to-end local sin causa**: una tanda dio 40 fallos y pasó entera al repetirla; `clients.spec` caso 9 y `product-images.spec` caso 1 fallaron una vez y pasaron solos; una tanda tardó 1,1 h contra unos 7 min. `confirmado`
- **El detalle de cada afirmación** está en el CHANGELOG (qué certifica y qué no cada cierre) y en el brief y la evidencia de cada subfase. `confirmado`

## 7. Limitaciones y cuidados operativos

- **Secretos**: ninguno pasa por la conversación ni por el repositorio, y ninguna IP ni su hash se versionan. Al listar archivos de secretos, solo recuentos y listas explícitas, nunca un filtro `KEY=VALUE`. La clave privada de `age` del backup vive solo en la máquina del usuario. `confirmado`
- **Antes de cada commit, la batería entera de la CI**: `npm run format:check`, `npm run lint`, `npm run typecheck`, unitarios, guardas, integración y, si cambió la UI, el end-to-end. **Los archivos nuevos van al índice antes de la batería final** (`git add -N`): las guardas que listan con `git ls-files` no ven los demás, y en la 17.5 una pasó en local y falló en la CI. Los archivos se agregan por nombre; con corchetes en la ruta, `git --literal-pathspecs add`. **`.claude/settings.json` está sin seguimiento y nunca entra en un commit.** `confirmado`
- **Al cerrar una subfase que un consumidor espera, el aviso al consumidor es un paso del cierre**, con su archivo en el Escritorio del usuario. En la 17.4 no salió y la ventana quedó colgada un día. `confirmado`
- **CI**: dura entre 10 y 13 minutos (10 min 25 s en `0c2f322`) contra un límite de 15 por job (Chromium lento; tarea en Notion). Sin protección de rama: ninguna subfase se cierra sin leer la corrida de su commit por `headSha`. `confirmado`
- **Máquina local**: 7,7 GB de memoria; el end-to-end corre en dos tandas (`npm run build` y después `npx playwright test --shard=1/2` y `--shard=2/2`). Docker Desktop no arranca solo: abrirlo antes de `docker compose up -d --wait`. **No hay Python**: los scripts van en Node o PowerShell. `confirmado`
- **PowerShell 5.1**: el mensaje de commit va en un archivo del scratchpad con `git commit -F <archivo>`; `-F -` con un here-string falla. Desde Git Bash, `git commit -F -` con un heredoc funciona (18.2). `gh run list --commit` necesita el SHA completo. **La batería se corre desde Git Bash**: el `bash` de PowerShell es el de WSL y no hereda las variables de entorno. `confirmado`
- **Intermitencias conocidas sin causa**: el end-to-end local de la 19.2 (§6); `module-boundary` por timeout en frío (tarea en Notion); una falla de integración de la 15.2 («D-6: las sugerencias…») y una de guardas de la 12.1.1, no reproducidas. `confirmado`
- **Finales de línea**: un checkout nuevo deja los scripts de `deploy/` en CRLF y la guarda del backup falla; falta una regla de `.gitattributes` (tarea en Notion). `historico`
- **Heredados sin subfase**: `TraceabilityMatrix.md` §3 atrasada; el paso 7 de la verificación de `deploy/production/README.md` pide recuentos en cero y producción tiene datos desde la 13.5; el límite de 65.535 parámetros de `listProductStock` (Risks, tarea en Notion); los 4 avisos moderados de `npm audit` vía `drizzle-kit`, aceptados en la 8.3 hasta Drizzle Kit 1.0; la revisión del stack con Node 26 en LTS (2026-10-28). `historico`
- **La regla `Bash(ssh crm-production:*)`** de la configuración local deja pasar cualquier comando al servidor; el usuario la agregó el 2026-10-10 para el despliegue de la 18.2 y decide si la conserva. **Solo coincide si el comando empieza con `ssh`**: con un `cd … &&` delante, el clasificador del modo automático lo vuelve a rechazar. Una regla de permiso no es una autorización. `pendiente`

## 8. Cambios ajenos del usuario detectados

Ninguno: `.claude/settings.json` es el único archivo sin seguimiento y nunca entró en un commit. `confirmado`

## 9. Autorizaciones vigentes

**Ninguna.** Las de la 19.2 (el brief, las ampliaciones, el commit y el push de la implementación y del cierre, el despliegue, Notion) quedan consumidas al ejecutarse. Aprobar el brief de la 19.3, pasar tareas de Notion de estado, instalar dependencias, ejecutar migraciones, tocar staging o producción, avisar al agente y cualquier operación Git futura necesitan autorización explícita en el turno. `confirmado`
