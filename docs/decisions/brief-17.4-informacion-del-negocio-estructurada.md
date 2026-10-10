---
schema: task-brief.v1
task_id: "17.4"
task_type: implementation
generated_at: 2026-10-09
---

# Brief 17.4 — Información del negocio estructurada

- **Contrato**: `task-brief.v1`
- **Tipo de tarea**: `implementation`
- **Nivel de evidencia objetivo**: `deterministic` para el esquema, el servicio y la ruta, contra PostgreSQL real; `producer-consumer` para las pantallas (end-to-end sobre `next start`) y para la ruta, con el agente en producción si lo confirma; `isolated-runtime` para el despliegue, recorrido por el usuario.
- **Nivel de validación alcanzable**: **validado localmente y en CI**, **validado en integración** para las pantallas, y **desplegado en producción** con la revisión del usuario. Validado en integración con el agente solo si conecta la ruta en una ventana (D-9). No es «preparado para producción».
- **Orden**: cuarta subfase de la Fase 17 ([Roadmap](../planning/Roadmap.md) §Fase 17), después de la 17.3, cerrada el 2026-10-08. El Roadmap la marca como **la candidata de menor prioridad, que cambia `read-v1` y entra solo con su decisión**: el usuario decidió hacerla el 2026-10-08.
- **No abre ni cierra gate.** Cambia un contrato con el agente: la revisión independiente se recomienda (D-11).
- **Estado de este documento**: **aprobado el 2026-10-09** por el usuario, con las recomendaciones de D-1 a D-11; **cerrado el 2026-10-09** (§Cierre). La tarea 17.4 está en «Completado» en Notion desde ese día.

## Objetivo

Que la parte de la información del negocio que el agente necesita **calcular**, y no solo repetir, deje de ser texto libre. El Roadmap la nombra así:

> **Información del negocio estructurada** (horarios, zonas y costos de envío, métodos de entrega, el mapa del boceto): hoy una entrada es texto libre y el agente la lee así por el contrato de lectura. Estructurarla cambia ese contrato.

## Lo que se verificó antes de escribir este brief

Releído o medido el 2026-10-09:

- **Hoy** la información del negocio es `knowledge_entries` (11.2): título, categoría, contenido de hasta 4000 caracteres y vigencia, todo texto. La regla de DataModel lo dice: «aceptamos transferencia» es una entrada, no una tabla de medios de pago. El agente la lee por `GET /api/read/v1/knowledge` ([read-v1](../contracts/read-v1.md)), vigente hoy en la zona de la organización.
- **En producción** hay tres entradas, todas de la organización de demostración, en `America/Argentina/Buenos_Aires`: «Horarios de atención» (79 caracteres), «Envíos y retiro» (154) y «Medios de pago» (116). No hay un negocio real atendido (13.5.2-b).
- **Cómo crece el contrato** (`read-v1` §Versionado, decidido otra vez en la 16.6): una ruta nueva es compatible dentro de v1; un campo nuevo en una respuesta no lo es, y exige v2.
- **Los bocetos** de la información dibujan tres pestañas, «Horarios», «Zonas y costos» y «Condiciones», que hoy no tienen contenido propio ([brief-15.4](brief-15.4-detalles-y-formularios.md), H-2).
- **El ERP**: los pedidos son de la Fase 19, las ventas de la 20 y los medios de pago y cobros de la 21 ([ADR 0016](0016-el-crm-se-amplia-hacia-un-erp-por-fases.md)). La regla 14 de DataModel prohíbe hoy cualquier modelo de ventas o pagos.
- **Lo que se observó del agente**: en la 12.5, un turno no leyó la información del negocio aunque la pregunta incluía el horario ([brief-12.5](brief-12.5-turno-completo-en-staging.md)). El agente nunca pidió datos estructurados.

### Hallazgos

- **H-1. De los cuatro temas del Roadmap, solo el horario necesita un cálculo que el texto no da bien.** «¿Están abiertos ahora?» o «¿abren el sábado?» exigen cruzar el día y la hora **en la zona del negocio** con el horario. Un modelo de lenguaje que lee «lunes a viernes de 9 a 18» lo hace mal con facilidad (qué día es hoy allá, feriados, horario cortado). El CRM ya calcula la vigencia con el reloj de PostgreSQL y la zona de la organización, y puede hacer lo mismo con el horario.
- **H-2. Las zonas y costos de envío son una tarifa, y una tarifa es parte del pedido.** Cotizar un envío por zona (y después por peso, que la 17.2 ya guarda) es lo que hace un pedido de la Fase 19. Estructurarlo ahora sin pedidos es diseñar una pieza del ERP sin el negocio delante, algo que el ADR 0016 y `CLAUDE.md` piden evitar.
- **H-3. Los medios de pago y de entrega como lista** no cambian lo que el agente responde: una lista de «transferencia, efectivo» se lee igual de bien como texto. Los medios de pago estructurados son de la Fase 21.
- **H-4. El mapa** es la ubicación del negocio: una dirección y, si acaso, un enlace. El agente ya la responde desde el texto.

## Decisiones

Cada una lleva una recomendación. El usuario aprueba, cambia o rechaza.

### D-1 — Qué se estructura

- **(a) Recomendada: solo el horario de atención** (H-1). Envíos, zonas y costos, medios de pago y de entrega, y el mapa siguen como entradas de texto (H-2 a H-4); el Roadmap los deja para los pedidos (Fase 19) y los cobros (Fase 21).
- (b) El horario y las zonas y costos de envío, con una tarifa fija por zona.
- (c) Los cuatro temas.
- (d) Nada: la 17.4 cierra decidiendo que el texto alcanza hasta que un negocio real muestre lo contrario.

### D-2 — Cómo es el horario

- **(a) Recomendada: un horario semanal y excepciones por fecha.**
  - **Semanal**: por cada día de la semana, cero, uno o dos tramos (`09:00–13:00` y `16:00–20:00`, el horario cortado). Un día sin tramos está cerrado. Un tramo no cruza la medianoche, y en la 17.4 no se admite un negocio que abre de noche (un tramo que termina después de las 24:00); queda declarado.
  - **Excepciones**: una fecha con «cerrado» o con sus propios tramos, y un motivo opcional («Feriado», «Inventario»). Cubre feriados y días especiales sin un calendario de feriados nacional, que el CRM no tiene.
  - Las horas son **de la zona de la organización** (`organizations.timezone`), como la vigencia de la 11.2.
- (b) Solo el semanal, y los feriados como entrada de texto.
- (c) Un calendario de feriados de Argentina cargado por el CRM. Fuera de alcance: cambia cada año por decreto y no aplica a otro país.

### D-3 — Dónde vive

- **(a) Recomendada: dos tablas nuevas del módulo `knowledge`**, el horario semanal (`business_hours`: organización, día de la semana, tramo, apertura y cierre) y las excepciones (`business_hour_exceptions`: organización, fecha, cerrado o tramos, motivo). `CHECK` de que la apertura sea anterior al cierre, de a lo sumo dos tramos por día y de que los tramos no se pisen; la última no se expresa con un `CHECK` de fila, y el servicio la valida en una transacción con el horario completo del día.
- (b) Un `jsonb` en `organizations` o en una entrada de información: más simple de guardar, pero los `CHECK` y el aislamiento dejan de vivir en la base.

### D-4 — Cómo se edita

**Recomendación**: una sección **«Horario de atención»** en la pantalla de información del negocio (el lugar de la pestaña «Horarios» del boceto, D-3 de la 15.4), con los siete días y sus tramos, y debajo la lista de excepciones próximas, con alta y baja. Lo edita un `admin`; un `viewer` lo ve. **Se guarda el horario de la semana entero de una vez**, en una transacción, y la auditoría registra el antes y el después. Cada excepción se audita al crearla o quitarla. Las excepciones pasadas no se muestran, pero no se borran.

### D-5 — Las entradas de texto que ya existen

**Recomendación**: no se migran ni se tocan. «Horarios de atención», en producción, queda como está; el formulario del horario avisa si hay una entrada vigente en la categoría «Horarios», para que el negocio la desactive o la deje como complemento (por ejemplo, «los feriados largos atendemos solo por WhatsApp»). El CRM no adivina un horario a partir de un texto.

### D-6 — Qué lee el agente

- **(a) Recomendada: una ruta nueva de `read-v1`, `GET /api/read/v1/business-hours`**, con la credencial de alcance `read`. Compatible dentro de v1: nada de lo que el agente ya lee cambia. Devuelve:
  - **`open_now`**: si el negocio está abierto **ahora**, calculado por PostgreSQL en la zona de la organización, con las excepciones aplicadas;
  - **`now_local`**: la fecha, la hora y el día de la semana del negocio, para que el agente no los calcule;
  - **`next_change`**: cuándo abre o cierra la próxima vez, dentro de los próximos 7 días, o `null`;
  - **`weekly`**: el horario semanal;
  - **`exceptions`**: las excepciones de los próximos 30 días;
  - **`configured`**: `false` si la organización no cargó un horario, para que el agente use el texto.
- (b) Una v2 de `knowledge` con el horario adentro. Exige que el agente migre una ruta que hoy funciona.
- (c) Que el agente siga leyendo solo el texto.

### D-7 — Qué no sabe el horario

**Recomendación**: el contrato lo dice. No sabe de feriados que el negocio no cargó, no admite tramos que cruzan la medianoche, y «abierto» es el horario de atención declarado, no si alguien contesta. El agente decide qué decir; el CRM no redacta la respuesta.

### D-8 — Etapas

**Recomendación**, como la 16.6:
- **17.4.1**: el esquema, el servicio, la pantalla y la ruta, con su revisión independiente, y el commit con autorización;
- **17.4.2**: el despliegue, con su migración, y el recorrido del usuario;
- **17.4.3**: si el agente conecta la ruta, una ventana en producción con la organización de demostración, como la 16.6.3, conciliada del lado del CRM en solo lectura.

### D-9 — Coordinación con el agente

**Recomendación**: con tu autorización, **antes de implementar la ruta** le paso un pedido con la forma de D-6 y estas preguntas: si la usaría y cuándo (cada turno o solo si el cliente pregunta por el horario); si `open_now`, `now_local` y `next_change` le alcanzan o necesita otra cosa; si 30 días de excepciones y 7 de próximo cambio están bien. El esquema y la pantalla no dependen de la respuesta; la forma de la ruta sí, y se ajusta antes del código. Si el agente no la usaría, la ruta no se implementa y la 17.4 queda en el CRM.

### D-10 — Las demás pestañas del boceto

**Recomendación**: «Zonas y costos» y «Condiciones» no se dibujan. Quedan en el Roadmap como candidatas de las Fases 19 y 21, con el motivo de H-2 y H-3.

### D-11 — Revisión independiente

**Recomendación**: sí, antes del commit de la 17.4.1, con un agente de solo lectura contra este brief, `read-v1`, DataModel y SecurityModel. La subfase agrega una ruta al contrato con el agente y una regla de cálculo con zona horaria.

## Alcance incluido

1. **Migración** con las dos tablas de D-3, sus `CHECK`, sus índices y los privilegios de `crm_app`.
2. **Módulo `knowledge`**: el esquema, el repositorio y el servicio del horario y las excepciones, con el cálculo de `open_now` y `next_change` en SQL.
3. **Pantalla**: la sección de D-4 en la información del negocio, con su end-to-end.
4. **Ruta** de D-6, si el agente la confirma (D-9), con su validador estricto, su fixture de forma asumida y su caso en `read-api.test.ts`.
5. **Documentación**: DataModel, FunctionalRequirements (FR-INFO-04 y siguientes), Screens, SecurityModel (la ruta nueva en la superficie), TraceabilityMatrix, `read-v1.md` y el Roadmap (D-10).

## Alcance excluido

- **Zonas, costos y tarifas de envío**, medios de pago o de entrega como listas y el mapa (D-1, D-10).
- **Un calendario de feriados nacional** (D-2).
- **Tramos que cruzan la medianoche** (D-2).
- **Cambiar `knowledge_entries`** o la ruta `knowledge` que ya existe (D-5, D-6).
- **Cambios en el agente**: los hace él, en su repositorio.
- **Horarios por sucursal o por depósito**: el CRM tiene un solo local por organización.

## Archivos autorizados

- `drizzle/0033_*.sql`, su snapshot y `_journal.json`;
- `src/modules/knowledge/` (esquema, repositorio, servicio, índice y sus tests);
- la pantalla de información del negocio, `src/app/(autenticado)/informacion/`, y sus componentes;
- `src/app/api/read/v1/` (la ruta nueva, su validador y su test de contrato) y `tests/fixtures/read/v1/` (el fixture nuevo);
- `tests/integration/` (los casos del horario y de la ruta), `tests/e2e/` (el recorrido) y `tests/guards/exposed-surface.test.ts` (la ruta nueva);
- la documentación del punto 5 y este brief.

## Fuentes de verdad

- DataModel (`knowledge_entries`, la vigencia en la zona de la organización), `read-v1` (§Versionado), SecurityModel (superficie expuesta).
- Los briefs 11.2, 11.3, 15.4 (H-2 y D-3) y 16.6 (la ruta nueva).
- El Roadmap §Fase 17 y el ADR 0016.

## Invariantes

1. **Ninguna respuesta que el agente ya lee cambia.** La ruta es nueva.
2. **La hora la calcula PostgreSQL en la zona de la organización**, nunca el reloj de la aplicación ni el del agente.
3. **Ningún modelo de ventas, pagos ni tarifas** (regla 14).
4. **Aislamiento por organización**: la ruta y la pantalla solo ven el horario de la organización de la credencial o de la sesión.
5. **La base rechaza un tramo con la apertura después del cierre.**

## Criterios de aceptación

**17.4.1**

- **AC-1**: la `0033` crea las tablas de D-3 con sus `CHECK`, índices y privilegios, sin tocar otras tablas.
- **AC-2**: un `admin` guarda un horario semanal con días cerrados, un tramo y dos tramos; un tramo invertido, tres tramos en un día o dos tramos que se pisan dan `VALIDATION_ERROR` en su campo; un `viewer` recibe `FORBIDDEN` al escribir.
- **AC-3**: las excepciones (cerrado y con tramos propios) se crean y se quitan, y reemplazan el horario semanal de su fecha.
- **AC-4**: `open_now` y `next_change` son correctos contra casos calculados a mano: antes de abrir, dentro de un tramo, en el corte del horario cortado, justo en la apertura y justo en el cierre, un día cerrado, una excepción de cierre y una de horario especial, y la **misma hora UTC en dos zonas** distintas con resultados distintos. La mutación que calcula con la zona del servidor los hace fallar.
- **AC-5**: cada cambio queda en la auditoría, y el historial lo nombra en castellano.
- **AC-6**: si el agente confirma la ruta, `read-api.test.ts` prueba la forma de D-6, `configured: false` sin horario, el aislamiento entre organizaciones y el validador estricto; el fixture está en `tests/fixtures/read/v1/` y la guarda de la superficie expuesta cuenta la ruta.
- **AC-7**: la pantalla cumple D-4; su end-to-end pasa con axe sin violaciones en claro y en oscuro, con el teclado y a 375 px, y un `viewer` ve el horario sin los controles.
- **AC-8**: los tests de contrato del agente pasan sin cambios en lo que ya existía, y la guarda de módulos sigue en verde.
- **AC-9**: la batería completa de la CI pasa en local y en la CI del commit, leída por `headSha`.
- **AC-10**: la documentación del punto 5 está actualizada.
- **AC-11**: la revisión independiente se hace antes del commit, y cada hallazgo se verifica y se resuelve o se eleva.

**17.4.2 y 17.4.3**

- **AC-12**: con autorización, la `0033` se aplica en producción: `/login` responde `200`, los recuentos de las tablas existentes son iguales antes y después y las dos tablas nuevas existen, vacías.
- **AC-13**: el usuario carga un horario en producción, lo ve en la pantalla y aprueba.
- **AC-14**: si el agente conecta la ruta, una ventana con la organización de demostración concilia sus lecturas del lado del CRM, en solo lectura.

## Pruebas y evidencia requerida

- `deterministic`: los tests de integración del horario y de la ruta, contra PostgreSQL 18 real, con mutaciones: la zona del servidor en lugar de la de la organización (AC-4), sin el `CHECK` del tramo invertido (invariante 5), la ruta sin el filtro de organización (invariante 4).
- `producer-consumer`: el end-to-end de la pantalla sobre `next start` y, si el agente conecta, la ventana de AC-14.
- `isolated-runtime`: la 17.4.2 en producción, con los comandos y las salidas registrados acá, sin secretos ni IP.

## Condiciones de detención

Se detiene y se consulta al usuario si:

- hace falta tocar un archivo fuera de §Archivos autorizados;
- la ruta exige cambiar una respuesta que el agente ya lee;
- la respuesta del agente contradice la forma de D-6 de un modo que cambia el esquema;
- `drizzle-kit generate` produce cambios en otras tablas.

Y siempre **antes de**: pasar la 17.4 a «En proceso» en Notion, mandar el pedido al agente, el commit y el push de la 17.4.1, cada paso sobre producción y el cierre.

## Implementación de la 17.4.1, en curso desde el 2026-10-09

### Archivos fuera de lo previsto

- **`src/modules/audit/schema.ts`**, fuera de §Archivos autorizados, **autorizado por el usuario** el 2026-10-09: el valor `business_hours` del enum de entidades auditadas, para AC-5. La `0033` lo agrega.
- Los permisos de `crm_app` van al final de la `0033`, no en una migración aparte como en la 11.2, para no salir de `drizzle/0033_*`.

### Precisiones, para la aprobación del usuario

- **P-1 (D-3)**: `business_hours` tiene **una fila por día de la semana con los dos tramos como columnas**, no una fila por tramo. Así la base exige con `CHECK` que el segundo tramo vaya después del primero sin tocarlo, y guardar la semana es un `INSERT … ON CONFLICT DO UPDATE` de siete filas: `crm_app` no necesita `DELETE`.
- **P-2 (D-3)**: un día especial se agrega y se quita, no se edita: `crm_app` tiene `SELECT`, `INSERT` y `DELETE` sobre `business_hour_exceptions`, sin `UPDATE`, como `client_tag_assignments`. Quitarlo borra la fila; la auditoría guarda la fecha, los tramos y el motivo.
- **P-3 (D-2)**: las horas van de 00:00 a 23:59. Un campo de hora nativo no admite 24:00, así que un negocio que cierra a la medianoche carga 23:59. El pedido al agente ya lo dice.
- **P-4 (D-4)**: «Horario de atención» es una pantalla propia, `/informacion/horario` (pantalla 12b), con un enlace en la pantalla 11, no una sección dentro de la lista: la lista se pagina y se filtra, y el horario no.
- **P-5 (D-4)**: un día especial lleva una fecha de hoy en adelante, en el día de la organización; uno pasado no se muestra ni se borra.
- **P-6 (AC-5)**: todo cambio del horario se audita como `update` de la entidad `business_hours`, con el id de la organización: la semana, con solo los días que cambiaron (`day1` a `day7`, como «09:00-13:00,16:00-20:00», vacío si cerrado, nulo si no estaba cargado), y cada día especial agregado o quitado (`exception`, `exceptionHours`, `exceptionReason`). La auditoría admite solo valores simples.

### Lo hecho hasta acá

- `drizzle/0033_business_hours.sql`: las dos tablas, sus `CHECK`, sus índices únicos, el valor del enum y los permisos. `drizzle-kit generate` no produce otros cambios.
- `knowledge`: `hours-repository.ts` (la semana, los días especiales, el lock por organización y el cálculo de `open_now` y del próximo cambio en una consulta) y `hours-service.ts` (validación, autorización, auditoría y la lectura de servicio para la ruta).
- La pantalla 12b, sus acciones y su enlace desde la pantalla 11.
- Tests: `hours-service.test.ts` y `horario/messages.test.ts` (unitarios), `business-hours.test.ts` (17 de integración) y `business-hours.spec.ts` (5 end-to-end), en verde. La guarda de la superficie expuesta declara las tres Server Actions.
- Mutaciones, en rojo y revertidas: M1, el cálculo con la zona del servidor (fallan los tres casos de AC-4 con hora); M2, sin el `CHECK` del tramo invertido (fallan AC-1 y la invariante 5); M3, el semanal sin el filtro de organización (fallan las dos zonas y la lectura de servicio).
- Documentación: FunctionalRequirements (FR-INFO-04 a 06 y FR-AUD-01), Screens (12b), DataModel, SecurityModel (70 puntos de entrada; 71 con la ruta, abajo) y TraceabilityMatrix.

### La respuesta del agente (D-9)

Llegó el 2026-10-09 (`Respuesta-17.4-Agente-al-CRM.md`, en el Escritorio del usuario). **La usaría**, como una herramienta sin parámetros que pide solo cuando el cliente pregunta por el horario, no en cada turno. Acepta los plazos (7 días para `next_change`, 30 para `exceptions`) y prefiere `configured: false` con `200` a un `404`, que en v1 ya significa otra cosa. Si la lectura falla o el horario no está cargado, vuelve al texto de la base de conocimiento y no afirma nada. Sigue leyendo el texto como complemento y, si los dos se contradicen en un horario, gana la ruta. La validación sería en producción, con la organización de demostración: un tramo cortado, un día cerrado y un día especial en los próximos días (17.4.3).

Pide dos cosas. Ninguna cambia el esquema. **El usuario aprobó R-1 y R-2, y P-1 a P-6, el 2026-10-09.**

- **R-1, un campo `days`**: hoy y los 6 días siguientes, cada uno con `date`, `weekday`, `slots` y `reason`, **con el día especial ya aplicado**, para que el modelo no cruce `weekly` con `exceptions`. **Propuesta: sumarlo a D-6.** Sale del mismo cálculo de PostgreSQL que `open_now`, que ya resuelve el horario efectivo de cada día. La ruta todavía no se publicó, así que no es un cambio de v1. Con `configured: false`, `days` es `[]`, igual que `weekly`.
- **R-2, el cierre a las 23:59**: el agente pregunta si es literal o significa «hasta la medianoche». **Propuesta: literal.** El cierre no es inclusivo, así que el último minuto queda cerrado y el agente dice «abierto hasta las 23:59», lo que según su respuesta le alcanza. Un caso especial que convierta 23:59 en 24:00 haría que el contrato diga algo distinto de lo que se cargó.

Su pedido de que el texto no repita los horarios ya lo cubre el aviso de D-5 en la pantalla 12b.

### La ruta (D-6 con R-1)

- `src/app/api/read/v1/business-hours/` (`handler.ts` y `route.ts`), alcance `read`, sin parámetros, con la ruta fija en el log. El validador estricto y el mapeo, en `contract.ts`.
- `days` sale de la misma consulta de PostgreSQL que `open_now` y `next_change` (`computeStatus`), y los días especiales se cuentan desde la fecha local de esa consulta: los cinco campos usan el mismo instante, también a la medianoche.
- **Precisión P-7, sobre `configured: false`**: `timezone` y `now_local` vienen igual; `open_now` es `false`, `next_change` es `null` y `weekly`, `days` y `exceptions` vienen vacíos, **aunque haya un día especial cargado**. El pedido decía «los demás campos vienen vacíos o en `null`»; `open_now` es booleano y queda en `false`. El validador exige esa forma. **Confirmada por el usuario el 2026-10-09.**
- Tests: seis casos en `read-api.test.ts` (AC-6), tres en `contract.test.ts`, dos fixtures de forma asumida (`business-hours-open.json` y `business-hours-not-configured.json`), la ruta en `read-api.spec.ts` y en la guarda de la superficie expuesta.
- Mutaciones, en rojo y revertidas: M4, el semanal sin el filtro de organización en el cálculo (invariante 4); M5, `days` sin el día especial; M6, los días especiales contados desde otro día que `open_now`; M7, `open_now` del cálculo sin horario cargado. M7 sobrevivió a la primera versión del test, que no tenía nada que pudiera dar «abierto» sin semanal; el caso suma un día especial abierto hoy.
- Documentación: `read-v1.md`, FR-API-10, SecurityModel (71 puntos de entrada, 11 Route Handlers) y TraceabilityMatrix.

### Revisión independiente (D-11)

Hecha el 2026-10-09 por un agente que no participó del trabajo, con acceso de solo lectura, contra este brief, `read-v1`, DataModel, SecurityModel y las reglas del proyecto. Leyó el código y no ejecutó nada. **Siete hallazgos: ninguno crítico ni alto, dos medios y cinco bajos.** Ninguno es un error del cálculo: el revisor recalculó a mano los casos de AC-4 y revisó la medianoche, la semana cerrada, el horario sin cargar, el día especial sin semanal y el horario de verano (las horas son las del reloj del local). Cada hallazgo se verificó contra el código antes de aceptarlo:

- **H-1 (medio), aceptado**: ningún test fallaba sin el filtro de organización de los días especiales, ni en el cálculo ni en la lista. Los tests de Tokio y de la lectura de servicio ahora cargan un día especial de otra organización en la misma fecha, y las mutaciones **M8** (el cálculo) y **M9** (la lista) quedan en rojo y revertidas.
- **H-2 (medio), aceptado**: el Roadmap no recogía D-1 ni D-10 (AC-10). Actualizado.
- **H-3 (bajo), aceptado**: se podía quitar un día especial pasado, contra P-5, si la pantalla quedaba abierta después de la medianoche. Ahora da `NOT_FOUND`, con su test, en rojo sin la comprobación.
- **H-4 (bajo), aceptado**: SecurityModel decía 46 puntos que no son páginas; son 50.
- **H-5 (bajo), aceptado**: DataModel (el módulo de los esquemas, los privilegios y el diagrama) y la fila FR-AUD-01 de TraceabilityMatrix no nombraban lo nuevo. Corregidos.
- **H-6 (bajo), aceptado**: la ruta leía el semanal, el cálculo y los días especiales en tres consultas, con instantáneas distintas. Ahora las tres van en una transacción `REPEATABLE READ` de solo lectura. **Sin test de concurrencia**: verificado por lectura y con la suite verde.
- **H-7 (observación), aceptado**: el end-to-end y este brief no estaban marcados para Git; `.claude/settings.json` no entra al commit.

**La batería completa** de la integración, corrida antes de la revisión, también encontró que `audit.test.ts` (los privilegios de cada tabla) e `identity-schema.test.ts` (la lista exacta de tablas) no conocían las dos tablas nuevas. Se suman, con los privilegios de P-1 y P-2.

### Batería completa

En local, el 2026-10-09, después de resolver la revisión: formato, lint y typecheck limpios; 634 unitarios, 485 de guardas y 860 de integración (51 archivos) en verde; el build de producción; y los end-to-end en dos tandas, 71 y 77, en verde. En la primera corrida de la integración, un test de `analytics-distributions.test.ts` quedó esperando 24 minutos y falló; solo pasó, y la corrida completa siguiente también. No se repitió y no toca código de la 17.4.

### Commit y CI

- Commit `2e983ac`, con push a `main` el 2026-10-09, autorizados por el usuario ese día.
- **CI, run 37931370268, leída por `headSha` `2e983ac` (AC-9)**: el primer intento lo canceló el límite de 15 minutos del job durante los end-to-end, con todos los pasos anteriores en verde: instalar Chromium tardó 218 s, contra 26 s en la corrida anterior. El segundo intento, sin cambios, pasó entero (`success`): integración en 104 s, Chromium en 21 s y end-to-end en 326 s.
- **Riesgo anotado, sin cambio**: una corrida normal dura unos 13 minutos, con poco margen bajo los 15 del job. Subir el límite toca `.github/workflows/ci.yml`, fuera de la lista de este brief.

## Despliegue de la 17.4.2, 2026-10-09

- **Despliegue de `2e983ac`**, autorizado por el usuario y corrido por el asistente. Pasos 1 a 3 de [deploy/production/README.md](../../deploy/production/README.md) §Desplegar: la CI del SHA en `success` (corrida 37931370268, intento 2); anotado `a7838f1` en el registro de despliegues; dependencias (13:07:36 UTC), migraciones (13:07:59, «Migraciones aplicadas»), build (13:08:00), reinicio y HEAD igual al SHA pedido (13:09:35).
- **AC-12**, recuentos de `crm_production` en una transacción de solo lectura (`sudo -u postgres psql`), todas las tablas de `public` en orden alfabético:

  ```
  2026-10-09T13:07:25Z 33 migraciones
  audit_logs=46 client_tag_assignments=2 client_tags=5 clients=2 conversation_notes=1 conversations=3 ingestion_credentials=7 ingestion_events=133 ingestion_rate_windows=3 inventories=4 inventory_movements=4 knowledge_entries=3 login_attempts=0 messages=76 organization_members=2 organizations=2 product_prices=6 products=5 sessions=3 users=2
  2026-10-09T13:09:57Z 34 migraciones
  audit_logs=46 business_hour_exceptions=0 business_hours=0 client_tag_assignments=2 client_tags=5 clients=2 conversation_notes=1 conversations=3 ingestion_credentials=7 ingestion_events=133 ingestion_rate_windows=3 inventories=4 inventory_movements=4 knowledge_entries=3 login_attempts=0 messages=76 organization_members=2 organizations=2 product_prices=6 products=5 sessions=3 users=2
  ```

  Las 20 tablas existentes, iguales. Las dos nuevas existen y están vacías: cada una con 9 columnas, 2 índices, 7 `CHECK` y 1 clave foránea. `crm_app` tiene `SELECT, INSERT, UPDATE` sobre `business_hours` y `SELECT, INSERT, DELETE` sobre `business_hour_exceptions` (D-3). El servicio, `active` con `NRestarts=0`; el único aviso del journal es el de systemd al reiniciar («Failed to kill control group … ignoring»), no de la aplicación. `/login`, `200`; `/informacion/horario` sin sesión, `307` a `/login`; `GET /api/read/v1/business-hours` sin token, `401`, encendida como las demás rutas de lectura. Para volver atrás, `a7838f1`: la migración solo crea dos tablas nuevas, que el código anterior no usa.

- **AC-13**: el usuario recorrió en producción la pantalla de horario, la dio por correcta y aprobó el cierre el 2026-10-09.

## Cierre de la subfase 17.4, 2026-10-09

- **AC-1 a AC-13 cumplidos.** AC-9 en local (§Batería completa) y en la CI de `2e983ac`; AC-11 con la revisión independiente de la 17.4.1; AC-12 y AC-13 en producción.
- **AC-14 no aplica todavía**: depende de que el agente conecte la ruta, y no la conectó. Queda como la tarea «17.4.3 — Ventana del horario con el agente», `3f4702be6f4e817fa69df06e8e76979d`, en «Esperando» en Notion, con autorización en su turno.
- **Revisión**: independiente para la 17.4.1 (D-11), con sus 7 hallazgos aceptados y resueltos; el despliegue y este cierre son autoevaluación declarada.
- **Decisiones del usuario**: el brief con D-1 a D-11; `src/modules/audit/schema.ts` fuera de la lista; P-1 a P-6, R-1, R-2 y P-7; el commit y el push de `2e983ac`; el despliegue; el cierre.
- **Nivel**: validado localmente y en CI, **validado en integración** para la pantalla (end-to-end sobre `next start`) y desplegado en producción, recorrido por el usuario (`isolated-runtime`). La ruta está validada localmente, con fixtures de forma asumida: **no está validada en integración con el agente**, que todavía no la llama. No es «preparado para producción».
- **No certifica**: que el agente lea la ruta ni cómo responde con ella; la ruta bajo escrituras concurrentes (H-6, verificada por lectura, sin test); un negocio que cierra después de la medianoche (carga 23:59, R-2); las zonas y costos de envío y las condiciones, que quedan para las Fases 19 y 21 (D-10).
- **Riesgo heredado**: la CI dura unos 13 minutos contra un límite de 15 por job; el primer intento de `2e983ac` se cortó por la instalación de Chromium. Ya había una tarea en el proyecto raíz, `3f2702be6f4e8104b521cf12b377fe34`.
- **Pendiente heredado**: `TraceabilityMatrix.md` §3 atrasada; el paso 7 de la verificación de `deploy/production/README.md` pide recuentos en cero y producción tiene datos desde la 13.5.

## Ventana 17.4.3 con el agente, 2026-10-10

- **Cómo se destrabó**: la confirmación de R-1 y R-2 y el aviso de la ruta publicada no se le habían mandado al agente después del cierre del 2026-10-09; el agente esperaba «el contrato publicado» para abrir su subfase. Salió el 2026-10-09 (`Confirmacion-17.4-CRM-al-Agente.md`, en el Escritorio del usuario). El agente publicó su herramienta el 2026-10-10 (su subfase 3.47; `Aviso-3.47-Ventana-17.4.md`) después de una sonda que el CRM ve en su log: 12:48:24 UTC, `OK`, `agente-demo`, correlación `agent-probe-3.47`.
- **Preparación, en solo lectura**: el horario de «Demostración Vixora» coincide con el guion del agente (lunes a viernes 09:00–13:00 y 16:00–20:00, sábado 10:00–16:00, domingo cerrado, el lunes 12 cerrado por el Día de la Raza); la entrada de texto «Horarios de atención» está desactivada, así que el texto ya no repite los horarios.
- **La ventana, autorizada por el usuario**: el usuario mandó tres preguntas desde su teléfono al número de prueba de Meta, el sábado 10 entre las 13:35 y las 13:38 UTC. El CRM leyó su log y los mensajes de la demostración, sin escribir nada:

  | Paso | Lectura | Correlación | Lo que contestó el agente | Campo |
  | --- | --- | --- | --- | --- |
  | 1, «¿están abiertos?» | 13:36:08, `OK`, 27 ms | `12292:r1:i1` | «sí, estamos abiertos y cerramos a las 16:00» (eran las 10:36 en el negocio) | `open_now`, `next_change` |
  | 2, «¿abren el lunes?» | 13:36:55, `OK`, 18 ms | `12325:r1:i1` | «el lunes no abrimos por el Día de la Raza» | `days` |
  | 3, «¿cuál es el horario de atención?» | 13:37:52, `OK`, 18 ms | `12358:r1:i1` | «de lunes a viernes de 9 a 13 y de 16 a 20, los sábados de 10 a 16 y los domingos estamos cerrados» | `weekly` |

  Una lectura de la ruta por pregunta, todas en la primera ronda, como anunció el agente; ningún `429` ni otro código en la ventana. Las tres respuestas coinciden con lo que la ruta devolvía en ese momento.

- **AC-14 cumplido.** La ruta queda **validada en integración en producción** (`producer-consumer`) con el agente, en la organización de demostración y con un solo remitente, el usuario.
- **No certifica**: un turno que el router mande a ventas, que no lee el horario (límite declarado por el agente); el comportamiento con la lectura fallida en producción (el agente lo probó en su piloto).
- **Conciliación del agente** (`Conciliacion-3.47-Ventana-17.4.md`, 2026-10-10): sus tres `X-Request-Id` (`6c7bb629-…`, `288f4d89-…`, `7922fe1f-…`) están en el log del CRM con la misma hora, la ruta fija, `OK` y la misma correlación; 0 `RATE_LIMITED` entre las 13:30 y las 13:40 UTC. **Conciliación 3 de 3.** Lo que leyó el agente (`open_now: true` y cierre a las 16:00; el lunes 12 sin tramos por el Día de la Raza; `weekly`) es lo que contestó. Su subagente `info_agent` 1.2.0 pidió la herramienta en la primera llamada y no consultó la base de conocimiento.
- **Fixture `captured`: no se agrega.** n8n guarda el cuerpo ya parseado, y el cuerpo crudo de la sonda quedó del lado del agente; los fixtures de la ruta siguen con forma asumida (`read-v1.md`).

## Cierre de la 17.4.3 y de la Fase 17, 2026-10-10

- **La 17.4.3 cerrada** con AC-14 cumplido, por decisión del usuario del 2026-10-10. Autoevaluación declarada: la ventana no abre ni cierra un gate propio; la revisión independiente de la 17.4 fue la de la 17.4.1.
- **La ruta de la imagen para el agente** (ADR 0018, punto 7) **queda fuera de la Fase 17**, por decisión del usuario del mismo día: candidata en el Roadmap, con su contrato a diseñar con el agente.
