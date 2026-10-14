---
schema: task-brief.v1
task_id: "21.2"
task_type: implementation
generated_at: 2026-10-13
---

# Brief 21.2 — Los medios de pago y la caja

- **Contrato**: `task-brief.v1`
- **Tipo de tarea**: `implementation`
- **Nivel de evidencia objetivo**:
  - `deterministic` para el esquema, el servicio, la serialización, las guardas y la frontera del módulo, contra PostgreSQL real;
  - `producer-consumer` para las pantallas (end-to-end sobre `next start`) y para los contratos del agente, que no cambian;
  - `isolated-runtime` para el despliegue, si se autoriza (D-12).
- **Nivel de validación alcanzable**: **validado localmente y en CI**, **validado en integración** para las pantallas y, con D-12, **desplegado en producción** con el recorrido del usuario. No es «preparado para producción».
- **Orden**: segunda subfase de la Fase 21 — Caja y cobros ([Roadmap](../planning/Roadmap.md) §Fase 21), después de la 21.1, cerrada el 2026-10-13. Implementa la fila «21.2» del punto 15 del [ADR 0022](0022-cobros-y-caja.md). La caja va antes que los cobros porque un cobro en efectivo la exige.
- **No abre ni cierra gate.** Crea el primer módulo de dinero, seis tablas, de las cuales cinco son de solo inserción, una cadena de sesiones que la base defiende con un trigger, y el bloqueo de cobros que van a usar todas las subfases siguientes. Por eso se recomienda la revisión independiente (D-11).
- **Estado de este documento**: **aprobado por el usuario el 2026-10-13**, con todas las recomendaciones, de D-1 a D-12. La tarea 21.2 (`3f8702be6f4e8144a3d5f83a9f3844ca`) sigue en «Esperando» hasta que el usuario autorice pasarla a «En proceso».

## Objetivo

Que un `admin` pueda:

- armar la **lista de medios de pago** de su organización, con la lista inicial por botón;
- **abrir la caja** de efectivo con lo que hay contado en cada moneda;
- registrar **aportes y retiros** con un motivo de una lista cerrada;
- **cerrarla con su arqueo**: lo contado contra lo esperado en cada moneda, en una página imprimible.

Las sesiones forman una sola cadena por organización y solo la última puede estar abierta. La base lo impide de otro modo. Un `viewer` ve todo sin escribir nada. Todavía no hay cobros: lo esperado es el inicial más los aportes y menos los retiros, y la 21.3 le suma los cobros en efectivo.

## Lo que se verificó antes de escribir este brief

Releído o verificado en el código el 2026-10-13, sobre `main` (`3ec5aca`, el cierre de la 21.1; CI 38471406826 `success`, leída por el SHA completo).

**Ya está fijado** por el ADR 0022, puntos 4, 8, 10, 11, 12, 13 y 15:

- **el módulo `cash`**, dueño de los medios de pago, las sesiones, sus cierres y los movimientos;
  - en esta subfase depende solo de `numbering`, `organizations`, `audit` y `auth` (este último solo en `schema.ts`). `sales`, `orders` y `crm` llegan con la 21.3 y la 21.4;
  - se suma a la lista de módulos de dominio de `eslint.config.mjs`;
- **los medios de pago**:
  - una lista por organización, con borrado lógico y nombre único, que edita solo un `admin`;
  - «es efectivo» se fija al crearlo y no se edita;
  - nace con un botón cuando la lista está vacía: efectivo, transferencia, tarjeta de débito y tarjeta de crédito, **sin Mercado Pago**;
  - un medio inactivo no se elige y los registros viejos lo conservan;
  - **`read-v1` no cambia**;
- **una caja por organización, la del efectivo, que funciona por sesiones**:
  - la apertura y el cierre son registros de solo inserción;
  - la cadena de sesiones lleva una clave compuesta hacia la anterior, `UNIQUE` sobre la anterior, un **índice único parcial** de la primera sesión por organización y un **trigger** que rechaza abrir si la anterior no tiene cierre;
  - hay a lo sumo un cierre por sesión;
  - un trigger rechaza cualquier escritura en una sesión cerrada;
- **la caja va por moneda**:
  - el inicial, lo contado y lo esperado van en una fila por moneda;
  - lo esperado de una moneda nunca se suma con el de otra;
  - el cierre exige contar cada moneda que tuvo inicial o movimientos;
- **esperado = inicial + cobros en efectivo − devoluciones en efectivo + aportes − retiros.** En esta subfase son el inicial, los aportes y los retiros. **Ninguna salida deja lo esperado por debajo de cero.** La diferencia es contado − esperado y no se guarda;
- **los movimientos manuales** son aportes y retiros en la sesión abierta, con monto positivo, moneda y un motivo de una lista cerrada, sin texto libre y sin número. **Un gasto no es un movimiento de caja**;
- **el bloqueo de cobros** es `pg_advisory_xact_lock(hashtextextended('cash:' || organization_id, 0))`. Va primero en la apertura, en el cierre y en cada movimiento, en `READ COMMITTED`, y toda lectura que decide va después de él. El contador va al final;
- **la numeración**: `cash_session` en `document_kind`, con el prefijo `C` (`C-000045`), y `cash_session` en `audit_entity_type`;
- **el arqueo de una sesión cerrada es imprimible**;
- **los roles y el agente**: solo un `admin` opera; un `viewer` ve las sesiones y su arqueo; el agente no lee ni escribe nada de esto, y ningún contrato cambia;
- **por decisión**:
  - el test de cobertura de privilegios suma cada tabla y cada una tiene su guarda de escrituras;
  - un test por camino retiene el bloqueo de cobros desde otra conexión y mide que la escritura lo espera;
  - hay tests de la cadena de sesiones (dos primeras, dos abiertas y una escritura en una cerrada, todas rechazadas por la base), de lo esperado por moneda y de que ninguna salida lo deja negativo;
  - `read-v1` tiene un test de forma que confirma que no cambia.

**Lo que dejó abierto el ADR para este brief**:

- las filas por moneda de la apertura y del cierre (punto 11; D-1);
- los motivos de los movimientos manuales («Lo que este ADR no decide»; D-2).

El resto de las decisiones de abajo resuelven cómo se implementa lo fijado.

**Lo que hay en el código y se reutiliza**:

- **`numbering`**:
  - `nextDocumentNumber(tx, org, kind)` y `formatDocumentNumber`, con `PREFIXES` (`P`, `V`, `A`);
  - `numbering.test.ts` fija los formatos;
  - `counter-writes` no cambia, porque `cash` toma el número por la interfaz.
- **`audit`**:
  - `recordAudit(tx, entry)`;
  - **lección de la 20.4**: fuera de `create`, el `diff` lleva las mismas claves en `before` y en `after` (`audit/service.ts`).
- **El bloqueo por organización** ya existe dos veces con el mismo patrón: `lockTagCatalog` en `crm/repository.ts` y el del horario en `knowledge/hours-repository.ts`.
- **La lista inicial por botón** es la de las etiquetas sugeridas: `SUGGESTED_TAGS` y su creación con el catálogo vacío, bajo el bloqueo del catálogo, en `crm/service.ts`.
- **`src/shared/money`**:
  - `currencyDecimals`, `acceptedCurrencies`, `parseMoneyInput`, `moneyToDatabase` y `formatMoney`;
  - **`parseMoneyInput` rechaza el cero** (`reason: "zero"`), y el inicial y lo contado pueden ser cero (H-2).
- **Las guardas de escritura** `sale-writes` y `order-writes` son el molde de `cash-writes`. `module-boundary` tiene casos por módulo de dominio, y `exposed-surface` declara cada acción.
- **Las pantallas de la Fase 20** son el molde:
  - la lista con los filtros en la URL;
  - el detalle que es su propio comprobante, con `print:hidden`;
  - la confirmación en la misma página con `?confirmar=…`;
  - la historia con `_audit/actor`.
- **Los íconos** de `src/app/_components/icons.tsx`: `receipt` ya es de Ventas y `creditCard` es de tarjeta. No hay uno de billete.
- **Producción** corre `b95c9f4`, con 42 migraciones (`0000` a `0041`). La de esta subfase es la `0042`.

**Contraste con las reglas vigentes** (paso 5 de la skill, con `grep` sobre DataModel, Overview, RepositoryStructure, los ADR 0013, 0019 y 0022, las guardas y los tests que enumeran enums y tablas):

- **H-1. Dos tablas que el ADR no nombra.** El punto 11 nombra `cash_sessions`, `cash_session_closings` y `cash_movements`, y DataModel (nota del 2026-10-13, al final de §Ventas) dice que la 21.2 crea esas tres más `payment_methods`. **El mismo punto 11 deja a este brief «las filas por moneda de la apertura y del cierre»**, y una sesión no puede ser una fila por moneda: lleva un número. D-1 recomienda dos tablas hijas. No contradice el ADR, porque ninguna tabla nombrada cambia lo que guarda, pero suma nombres. **Se eleva al usuario en D-1**, y la nota de DataModel se precisa con fecha.
- **H-2. El cero.** `parseMoneyInput` rechaza un monto cero, porque nació para los precios. El efectivo inicial y lo contado pueden ser cero; un aporte o un retiro no. El ADR 0022, punto 2, dice que `src/shared/money/` no cambia (lo dice del cobro, y se mantiene acá). D-3 recomienda que `cash` reconozca el cero antes de llamar al parser.
- **H-3. La función de solo inserción es de `sales`.** La 0039 creó `sales_reject_change()`, y la 0041 la reutilizó para `sale_voids`. Si `cash` la usara, dependería de `sales` en la base, y en esta subfase no depende. `cash` crea la suya, `cash_reject_change()`.
- **H-4. Lo que defienden los triggers y lo que defiende el bloqueo.** En `READ COMMITTED`, los dos triggers que leen otra fila no ven un cierre sin confirmar: el de la sesión cerrada y el de la cadena, que exige el cierre de la anterior. **Contra dos escrituras simultáneas defiende el bloqueo de cobros**, que toman todos los caminos del servicio. **Contra una escritura posterior a un cierre ya confirmado defiende el trigger**, para cualquier rol. Las dos primeras sesiones y las dos siguientes de una misma sesión las rechazan además los índices únicos, que sí ven lo no confirmado. Se dice en un comentario de la migración.
- **H-5. Los medios de pago bajo el bloqueo de cobros.** El punto 4 del ADR enumera las escrituras **de dinero** que lo toman, y el alta y la desactivación de un medio no son de dinero. D-6 recomienda que lo tomen igual:
  - la lista inicial cuenta y escribe sin que otra transacción se cruce, como las etiquetas sugeridas;
  - desde la 21.3, el cobro comprueba que el medio esté activo con ese mismo bloqueo tomado, y así una desactivación no se cuela entre la comprobación y el `INSERT`, que solo toma `FOR KEY SHARE` sobre el medio.

  Es una adición que no contradice el ADR.
- **H-6. Un `entity_type` que el ADR no nombra.** El punto 15 da a la 21.2 «los tipos `cash_session` de `document_kind` y del `entity_type`». **Editar los medios de pago también es un cambio de configuración que se audita**, como las etiquetas (`client_tag`) y la información del negocio (`knowledge_entry`). D-9 recomienda sumar `payment_method`. Es otra adición que no contradice el ADR.
- **H-7. La acción del cierre.** `audit_action` no tiene una que diga «cerrar». `status_change` supone una columna de estado, y la sesión no la tiene, porque abierta o cerrada se deriva del cierre. D-9 recomienda una acción nueva, `close`, con el `diff` de la lección de la 20.4: las mismas claves en `before`, nulas.
- **H-8. Los tests que enumeran tablas y valores** suman lo nuevo:
  - `audit.test.ts`: `INSERT_ONLY_TABLES`, con las cinco tablas de solo inserción, y `NO_DELETE_TABLES`, con `payment_methods`;
  - `numbering.test.ts`: el formato `C-000045`;
  - los que fijan los valores de `document_kind` y de `audit_entity_type`.

  **Ningún test usa `cash`, `close`, `payment_method`, `cash_session` ni `C-0` como valor desconocido**: buscado con `grep` en `src/` y `tests/`, por la lección de la 20.3 (vault: «A Test That Uses a Value as Unknown Breaks When That Value Becomes Real»).
- **H-9. Los end-to-end no cambian su `TRUNCATE`.** Las tablas nuevas apuntan solo a `organizations`, a `users` y entre sí, y ningún end-to-end vacía `organizations` ni `users`: buscado con `grep`. Es lo contrario de la 20.4, H-9. La limpieza de integración (`reset-database.ts`) ya vacía todas las tablas de `public`.
- **H-10. Sin datos de un cliente.** Las sesiones, sus cierres, los movimientos y los medios de pago no son de ningún cliente (ADR 0022, punto 14). La exportación, el vaciado y el runbook de datos de un cliente no cambian.
- **H-11. Los documentos que enumeran módulos** suman `cash`:
  - Overview: la fila nueva, la lista de módulos de dominio de §Reglas de dependencia y la fila de `audit` («Lo usan…»), como pide el ADR 0022, §Consecuencias;
  - RepositoryStructure: la tabla de módulos (l. 96) y la de reglas de importación (l. 141).
- **No apareció ninguna contradicción** que obligue a cambiar el ADR 0022.

## Alcance incluido

1. **Esquema** (migración `0042`, generada con `drizzle-kit generate` y completada a mano):
   - `cash_session` en `document_kind`; `cash_session` y `payment_method` en `audit_entity_type`; `close` en `audit_action` (valores aditivos);
   - los enums `cash_movement_kind` y `cash_movement_reason` (D-2);
   - **`payment_methods`** (D-6);
   - **`cash_sessions`**, **`cash_session_opening_amounts`**, **`cash_session_closings`**, **`cash_session_closing_amounts`** y **`cash_movements`** (D-1), con:
     - `SELECT` e `INSERT` para `crm_app`;
     - `cash_reject_change()` en las cinco (H-3);
     - el trigger de la cadena;
     - el trigger de la sesión cerrada (D-1).
2. **`numbering`**: el tipo `cash_session` con el prefijo `C`.
3. **`cash`**, módulo nuevo:
   - `lockCash(tx, organizationId)` en el repositorio;
   - los medios de pago: listar, crear la lista inicial, crear, renombrar, desactivar y reactivar (D-6);
   - la caja: la sesión abierta con lo esperado por moneda, la apertura (D-3), los aportes y retiros (D-5), el cierre (D-4), la lista de sesiones y el detalle con su arqueo y su historia;
   - las respuestas de D-8.
4. **Pantallas** (D-10): «Caja» en la navegación, con sus pantallas y la de los medios de pago.
5. **Guardas**:
   - `cash-writes`, nueva: las seis tablas y sus únicas escrituras;
   - `module-boundary`: los casos de `cash` como módulo de dominio;
   - `exposed-surface`: las acciones nuevas;
   - `eslint.config.mjs`: `cash` en la lista de módulos de dominio.
6. **Documentación**:
   - DataModel: las seis tablas, `document_counters`, `audit_logs`, las reglas 8 y 10, la regla 14 implementada y la nota de H-1;
   - Overview y RepositoryStructure (H-11);
   - FunctionalRequirements, con una sección nueva «Caja» (`FR-CAJ`);
   - Screens, con las pantallas nuevas;
   - TraceabilityMatrix;
   - SecurityModel, con los recuentos;
   - EngineeringStandards: la guarda nueva.

## Alcance excluido

- **Cobros, señas, anulaciones de cobros, devoluciones y la cuenta corriente** (21.3 a 21.6). En esta subfase, un medio de pago no se usa todavía en ningún registro.
- **Un trigger que recalcule lo esperado** (D-4).
- **Un gasto, un pago a proveedor o un motivo de texto libre** en un movimiento (ADR 0022, punto 8).
- **Varias cajas o una caja de banco o de billetera**, y la conciliación (punto 8).
- **Que el agente lea los medios de pago**: `read-v1`, `read-v2` e `ingestion-v2` no cambian (punto 10).
- **Métricas de caja** y la caja en el dashboard.
- **Anular o corregir una sesión, un cierre o un movimiento.** Un error de carga se compensa con el movimiento contrario y el motivo «Corrección de caja» (D-2), y una diferencia en un cierre queda como historia.
- **La guarda de dependencias entre módulos** (brief-19.4, R-2), que sigue como tarea aparte.

## Archivos autorizados

Crear o modificar solo estos. Tocar cualquier otro es una condición de detención.

- `drizzle/0042_*.sql` y `drizzle/meta/*`
- `src/modules/cash/` (nuevo), con sus tests unitarios
- `src/modules/numbering/`: `schema.ts` y `service.ts`, **solo** el tipo `cash_session` y su prefijo
- `src/modules/audit/schema.ts`, **solo** `cash_session`, `payment_method` y `close`
- `src/app/(autenticado)/caja/` (nuevo)
- `src/app/(autenticado)/layout.tsx`, **solo** el enlace «Caja»
- `src/app/_components/icons.tsx`, **solo** el ícono nuevo (D-10)
- `eslint.config.mjs`, **solo** `cash` en la lista de módulos de dominio
- `tests/integration/`: `cash.test.ts` y `cash-schema.test.ts` (nuevos), y `numbering.test.ts`; `audit.test.ts` y los que fijan los valores de `document_kind` y de `audit_entity_type`, **solo** las tablas y los valores nuevos (H-8)
- `tests/guards/`: `cash-writes.test.ts` (nuevo); `module-boundary.test.ts` y `exposed-surface.test.ts`, **solo** lo de `cash`
- `tests/e2e/cash.spec.ts` (nuevo)
- en `docs/architecture/`: `DataModel.md`, `Overview.md`, `RepositoryStructure.md`, `TraceabilityMatrix.md` y `SecurityModel.md`
- `docs/product/FunctionalRequirements.md` y `Screens.md`
- `docs/development/EngineeringStandards.md`
- al cerrar la subfase: este brief, `docs/planning/Roadmap.md`, `docs/decisions/README.md`, `CHANGELOG.md` y `HANDOFF.md`

**No se tocan**:

- los módulos `sales`, `orders`, `crm`, `catalog`, `inventory`, `knowledge`, `conversations` e `ingestion`;
- `src/shared/`;
- `scripts/`, los seeds y los contratos del agente.

## Fuentes de verdad

- **El código y las migraciones**:
  - `numbering`, `audit` (`recordAudit` y su regla del `diff`) y `src/shared/money`;
  - `lockTagCatalog` y `SUGGESTED_TAGS` de `crm`, como molde;
  - las `0039` y `0041`, como molde de solo inserción y de trigger de alta;
  - las guardas `sale-writes`, `module-boundary` y `exposed-surface`.
- **Las decisiones**:
  - el [ADR 0022](0022-cobros-y-caja.md), puntos 4, 8, 10, 11, 12, 13 y 15;
  - el [ADR 0019](0019-bases-de-los-comprobantes.md), puntos 2 y 3;
  - el [ADR 0013](0013-rol-de-aplicacion-y-tablas-de-solo-insercion.md);
  - el [brief-20.4](brief-20.4-la-anulacion.md), como molde.
- **Los contratos**: [read-v1](../contracts/read-v1.md), [read-v2](../contracts/read-v2.md) e [ingestion-v2](../contracts/ingestion-v2.md), que no cambian.

## Decisiones pendientes

Cada una con su recomendación. El usuario aprueba o cambia.

**D-1. Las tablas de la caja.** **Recomendada**: la sesión y su cierre son cabeceras, y las filas por moneda van en dos tablas hijas, como `sales` y `sale_lines` (H-1).

- **`cash_sessions`**:
  - columnas: `id`, `organization_id`, `number`, `previous_session_id` (nulable), `opened_by`, `opened_at`;
  - `UNIQUE (organization_id, number)` y `UNIQUE (organization_id, id)`, que es el destino de las claves compuestas;
  - `UNIQUE (previous_session_id)`;
  - el índice parcial `cash_sessions_first_unique (organization_id) WHERE previous_session_id IS NULL`;
  - la clave compuesta `(organization_id, previous_session_id)` hacia la propia tabla;
  - el trigger de alta `cash_sessions_chain`, que rechaza con `P0001` una sesión cuya anterior no tenga cierre.
- **`cash_session_opening_amounts`**:
  - columnas: `organization_id`, `session_id`, `currency`, `amount`;
  - clave primaria `(session_id, currency)` y clave compuesta hacia la sesión;
  - `CHECK` de la moneda (`^[A-Z]{3}$`) y de `amount >= 0`.
- **`cash_session_closings`**:
  - columnas: `organization_id`, `session_id`, `closed_by`, `closed_at`;
  - `UNIQUE (session_id)` y clave compuesta hacia la sesión.
- **`cash_session_closing_amounts`**:
  - columnas: `organization_id`, `session_id`, `currency`, `counted`, `expected`;
  - clave primaria `(session_id, currency)`;
  - `CHECK` de la moneda, de `counted >= 0` y de `expected >= 0`.
- **`cash_movements`**:
  - columnas: `id`, `organization_id`, `session_id`, `kind`, `currency`, `amount`, `reason`, `created_by`, `created_at`;
  - `CHECK` de `amount > 0`, de la moneda y de que el motivo corresponda al tipo (D-2).

Todas llevan clave compuesta `(organization_id, session_id)` hacia la sesión, con `ON DELETE RESTRICT`, y los autores apuntan a `users`.

**El trigger de la sesión cerrada**, `cash_reject_closed_session()`, va `BEFORE INSERT` en `cash_session_opening_amounts`, `cash_session_closing_amounts` y `cash_movements`. Desde la 21.3 lo van a usar también los cobros y las devoluciones.

**El cierre se escribe en este orden, en una transacción**: primero sus filas por moneda y al final la cabecera. Así el trigger de la sesión cerrada impide que se sume una fila después.

Que el inicial se escriba solo al abrir lo aseguran el servicio y la guarda, no la base.

**Alternativa**: guardar las filas por moneda en `cash_session_closings` con `UNIQUE (session_id, currency)`. Contradice el punto 8 («a lo sumo un cierre por sesión»), y la segunda moneda chocaría con el trigger de la sesión cerrada.

**D-2. Los motivos de los movimientos.** **Recomendada**: un solo enum `cash_movement_reason` y un `CHECK` que exige que el motivo corresponda al tipo. Los valores van en inglés y el texto, en las pantallas:

- **aporte** (`contribution`):
  - `change_fund`: «Cambio para la caja»;
  - `owner_contribution`: «Aporte del dueño»;
  - `correction`: «Corrección de caja»;
  - `other`: «Otro».
- **retiro** (`withdrawal`):
  - `bank_deposit`: «Depósito en el banco»;
  - `owner_withdrawal`: «Retiro del dueño»;
  - `correction`: «Corrección de caja»;
  - `other`: «Otro».

**No va «Gasto» ni «Pago a proveedor»**: un gasto no es un movimiento de caja (ADR 0022, punto 8). «Corrección de caja» es la vía del límite declarado del ADR (§Riesgos), un cobro en efectivo cargado en el destino equivocado con su sesión ya cerrada, y la de un movimiento mal cargado (§Alcance excluido). Un valor nuevo se agrega después con un `ALTER TYPE` aditivo.

**D-3. La apertura.** **Recomendada**:

- Solo `admin`.
- Bajo el bloqueo de cobros, en este orden:
  1. lee la última sesión de la organización;
  2. si no tiene cierre, rechaza con `already_open`, con el número de la sesión abierta para enlazarla;
  3. toma el contador de `cash_session`;
  4. inserta la sesión, encadenada a la última, o como primera si no hay ninguna;
  5. inserta su inicial por moneda;
  6. audita.
- **Al menos una moneda**, sin repetir. Cada una tiene que ser de `acceptedCurrencies()`, y su monto, **cero o positivo** en los decimales de la moneda.
- **El cero** lo reconoce `cash` antes de llamar a `parseMoneyInput`: `0`, `0,00` o `0.00` según los decimales. Así `src/shared/money` no cambia (H-2).
- **El formulario propone lo contado en el último cierre**, por moneda y editable. Sin un cierre anterior, propone una fila vacía, sin moneda elegida: el ADR 0019 no le da a la organización una moneda por defecto.
- Un `23505` de `cash_sessions_previous_unique` o de `cash_sessions_first_unique` se traduce a `already_open`, **por el nombre de la restricción**. El del número no se traduce.

**D-4. El cierre.** **Recomendado**:

- Solo `admin`.
- **Bajo el bloqueo de cobros**:
  1. lee la sesión abierta; si no hay, rechaza con `no_open_session`;
  2. calcula lo esperado por moneda con una función pura del módulo, `computeExpected`. Hoy suma el inicial y los aportes y resta los retiros; la 21.3 y la 21.5 le suman sus términos;
  3. exige lo contado de **cada moneda con inicial o movimientos**: si falta una, `VALIDATION_ERROR` con las que faltan;
  4. admite además una moneda sin movimientos que apareció al contar, con lo esperado en cero;
  5. escribe las filas por moneda y la cabecera (D-1) y audita.
- **Lo contado puede ser cero.**
- **El formulario muestra lo esperado de cada moneda.** No es un arqueo a ciegas: en un negocio chico cuenta el mismo `admin` que opera la caja, y la diferencia queda guardada igual. Después de cerrar, la página vuelve al detalle de la sesión, con su arqueo.
- **Lo esperado lo guarda el servicio**, sin un trigger que lo recalcule. Esa fórmula suma términos en cada subfase (los cobros, las devoluciones y sus anulaciones), y un trigger que la repitiera sería una segunda implementación que cambia cada vez. La fijan los tests de AC-3.
- **Un `23505` de `cash_session_closings_session_unique`** se traduce a `already_closed`.

**D-5. Los aportes y los retiros.** **Recomendados**:

- Solo `admin`, bajo el bloqueo de cobros.
- Exigen la sesión abierta: si no hay, rechazan con `no_open_session`.
- El monto es positivo, y la moneda, una de `acceptedCurrencies()`.
- **Un aporte en una moneda sin inicial** está permitido: su inicial cuenta como cero.
- **Un retiro que dejaría lo esperado de su moneda por debajo de cero** se rechaza con `insufficient_cash`, informando lo esperado de esa moneda.
- **Sin auditoría aparte**: el movimiento lleva su autor y su fecha y es de solo inserción, como un movimiento de stock. La sesión los muestra.

**D-6. Los medios de pago.** **Recomendados**:

- **La tabla `payment_methods`**:
  - columnas: `id`, `organization_id`, `name`, `is_cash`, `active`, `created_at`, `updated_at`;
  - `UNIQUE (organization_id, id)`;
  - un índice único `(organization_id, lower(name))`;
  - `CHECK` del largo del nombre;
  - `SELECT`, `INSERT` y `UPDATE` para `crm_app`, sin `DELETE` (regla 8);
  - un trigger `BEFORE UPDATE` que rechaza cambiar `is_cash` y `organization_id`, porque el ADR fija que «es efectivo» no se edita.
- **El nombre**: de 1 a 40 caracteres, sin espacios al borde y **único sin distinguir mayúsculas**, contando también los inactivos. Un medio desactivado se reactiva, no se crea de nuevo.
- **Las operaciones**, solo de `admin` y **bajo el bloqueo de cobros** (H-5):
  - crear, eligiendo si es efectivo;
  - renombrar;
  - desactivar y reactivar;
  - **«Crear la lista inicial»**, solo con la lista vacía (ni activos ni inactivos), que crea «Efectivo» (efectivo), «Transferencia», «Tarjeta de débito» y «Tarjeta de crédito».
- **Hasta 20 activos** por organización, como el límite de las etiquetas, pero más chico: es una lista corta.
- **Puede haber más de un medio en efectivo.** Todos van a la misma caja: es la caja del efectivo, no la de un medio.

**D-7. El bloqueo y el orden.** **Recomendado**:

- `lockCash(tx, organizationId)` en el repositorio de `cash`, con la clave `cash:{organizationId}`, el mismo patrón de `lockTagCatalog`.
- **Cada escritura sigue este orden**:
  1. el bloqueo;
  2. las lecturas que deciden: la sesión abierta, lo esperado y los medios existentes;
  3. el contador, solo en la apertura;
  4. los `INSERT` o el `UPDATE`;
  5. la auditoría.
- **Las claves foráneas del autor** toman `FOR KEY SHARE` sobre `users` al insertar, como en todas las tablas con autor (brief-20.4, H-6). No hace falta un bloqueo nuevo, y lo dice un comentario.
- **Los pasos del ADR que no aplican en esta subfase** son el pedido `FOR UPDATE` y el cliente en modo compartido. No hay ni pedido ni cliente: los suman la 21.3 y la 21.4.

**D-8. Las respuestas.** **Recomendadas**:

- **`FORBIDDEN`** a un `viewer` en cualquier escritura.
- **`VALIDATION_ERROR`**:
  - un id que no es uuid;
  - una moneda fuera de la lista o repetida;
  - un monto inválido, o cero donde no va;
  - un motivo que no corresponde al tipo;
  - un nombre vacío o largo;
  - una moneda sin contar en el cierre.
- **`NOT_FOUND`**: una sesión o un medio que no existen en la organización.
- **`BUSINESS_RULE_VIOLATION`**, con su razón:
  - `already_open`, con el número de la sesión abierta;
  - `no_open_session`;
  - `already_closed`;
  - `insufficient_cash`, con lo esperado;
  - `duplicate_name`;
  - `limit_reached`;
  - `list_not_empty`, para la lista inicial con medios ya creados.
- **Al escribir**: el id y el número de la sesión, o el id del medio o del movimiento.

**Ningún rechazo escribe, numera ni audita.**

**D-9. La auditoría.** **Recomendada**:

- **Sesión** (`entity_type` `cash_session`):
  - **la apertura**: `create`, con `{ number, opening: { ARS: "10000.00", … } }`;
  - **el cierre**: la acción nueva **`close`**, con `{ before: { counted: null, expected: null }, after: { counted: {…}, expected: {…} } }` (H-7).
  - La historia de la sesión lo muestra como «Apertura» y «Cierre».
- **Medio de pago** (`entity_type` `payment_method`, H-6):
  - `create`, `update` (el nombre), `deactivate` y `reactivate`;
  - la lista inicial audita cada medio que crea.
- **Los movimientos** no se auditan aparte (D-5).

Nada de esto lleva datos de una persona: solo montos, monedas, nombres de medios y el autor por su id.

**D-10. Las pantallas.** **Recomendadas**:

- **En la navegación**, «Caja» entre «Ventas» y «Conversaciones», para los dos roles. Lleva un ícono nuevo de billete (`banknote`, del mismo juego de íconos), porque `receipt` ya es de Ventas.
- **`/caja`**, el estado de la caja:
  - **abierta**: muestra
    - su número, quién la abrió y desde cuándo;
    - por moneda, el inicial, los aportes, los retiros y lo esperado;
    - sus movimientos, con tipo, motivo, moneda, monto, autor y hora.

    Para `admin`, ofrece «Registrar aporte», «Registrar retiro» y «Cerrar caja»;
  - **cerrada**: dice «La caja está cerrada» y enlaza la última sesión. Para `admin`, ofrece «Abrir caja».
- **`/caja/abrir`**: el inicial por moneda, en filas que se suman y se quitan, propuesto como dice D-3. Funciona sin JavaScript, como el formulario de la venta.
- **`/caja/movimiento?tipo=aporte|retiro`**: moneda, monto y motivo, con el grupo de opciones del tipo.
- **`/caja/cerrar`**:
  - lo contado de cada moneda que lo exige, con lo esperado al lado;
  - una fila para sumar otra moneda;
  - una confirmación que muestra la diferencia antes de cerrar.
- **`/caja/sesiones`**: la lista paginada de sesiones, de la más nueva a la más vieja, con:
  - el número, la apertura y el cierre;
  - quién abrió y quién cerró;
  - la diferencia por moneda;
  - la búsqueda por número (`C-000045` o `45`).
- **`/caja/sesiones/[sessionId]`**: el detalle, que en una sesión cerrada **es su arqueo imprimible**, con:
  - el nombre de la organización y «Arqueo de caja C-000045»;
  - la apertura y el cierre, con su autor;
  - por moneda, el inicial, los aportes, los retiros, lo esperado, lo contado y la diferencia;
  - los movimientos;
  - la leyenda «Documento no válido como factura».

  La historia de la sesión queda debajo, con `print:hidden`.
- **`/caja/medios-de-pago`**:
  - la lista con su estado y la marca «Efectivo»;
  - para `admin`: el alta, el renombre, desactivar, reactivar y «Crear la lista inicial» con la lista vacía.

  Un `viewer` ve la lista sin acciones.

**D-11. La revisión independiente.** **Recomendada**: un agente de solo lectura, antes del commit, contra este brief, el ADR 0022 y las reglas vigentes. Es el primer módulo de dinero, con seis tablas, tres triggers y el bloqueo que van a usar las subfases siguientes.

**D-12. El despliegue a producción y el recorrido.** **Recomendado**: sí, con autorización aparte en su turno:

- **cuándo**: después de la revisión independiente y con la CI del SHA exacto en `success`;
- **cómo**: según [deploy/production/README.md](../../deploy/production/README.md) §Desplegar, con la migración `0042`.

**Volver a `b95c9f4` es limpio**: ese código no conoce las tablas nuevas, que quedan sin usar, y ninguna pantalla existente cambia. El recorrido, en Demostración Vixora:

1. crear la lista inicial de medios;
2. abrir la caja con un inicial en pesos;
3. registrar un aporte y un retiro, e intentar un retiro mayor que lo esperado;
4. cerrar con una diferencia;
5. imprimir el arqueo;
6. abrir la sesión siguiente, con lo contado propuesto.

## Invariantes

- Las sesiones, sus filas por moneda, sus cierres y los movimientos nunca cambian ni se borran: la base lo impide para cualquier rol.
- Las sesiones de una organización forman una sola cadena, y solo la última puede estar abierta: a lo sumo una sesión abierta por organización.
- Una sesión cerrada no recibe ninguna escritura.
- Lo esperado de una moneda nunca baja de cero ni se suma con el de otra; el cierre guarda lo contado y lo esperado de cada moneda con inicial o movimientos.
- «Es efectivo» no cambia después de crear un medio; ningún medio se borra.
- Toda escritura de `cash` toma primero el bloqueo de cobros de su organización.
- Ningún rechazo escribe, numera ni audita.
- La serie `C` sigue sin huecos ni repetidos, por organización.
- `cash` no depende de `sales`, `orders` ni `crm` en esta subfase, y ningún módulo depende de `cash`.
- Ningún registro de la caja guarda texto libre ni datos de una persona.
- `read-v1`, `read-v2` e `ingestion-v2` no cambian.

## Criterios de aceptación

- **AC-1 (esquema)**: la migración `0042` suma los valores de enum, los dos enums nuevos y las seis tablas. En `cash-schema.test.ts`, con el rol dueño:
  - **privilegios**: `crm_app` tiene `SELECT` e `INSERT` en las cinco tablas de solo inserción, y `SELECT`, `INSERT` y `UPDATE` sin `DELETE` en `payment_methods`;
  - **solo inserción**: `cash_reject_change()` rechaza `UPDATE` y `DELETE` con `P0001`;
  - **la cadena de sesiones**: dos primeras sesiones de una organización chocan con el índice parcial; dos sesiones con la misma anterior, con `UNIQUE`; y una sesión cuya anterior está abierta la rechaza el trigger;
  - **la sesión cerrada**: una fila de inicial, de cierre o un movimiento en una sesión cerrada los rechaza el trigger;
  - **los montos**: el `CHECK` del motivo que no corresponde al tipo y los de montos, monedas y número;
  - **la clave compuesta**: rechaza otra organización;
  - **los medios de pago**: el trigger rechaza cambiar `is_cash`, y el índice, un nombre repetido con otras mayúsculas.
- **AC-2 (medios de pago)**: el servicio crea la lista inicial con la lista vacía y la rechaza con `list_not_empty`; crea, renombra, desactiva y reactiva con su auditoría; rechaza `duplicate_name` (también contra un inactivo) y `limit_reached`; y un `viewer` recibe `FORBIDDEN`.
- **AC-3 (apertura, movimientos y cierre)**:
  - la apertura numera `C-000001` y encadena las siguientes;
  - el inicial acepta cero;
  - lo esperado suma y resta por moneda, sin mezclar monedas;
  - un aporte en una moneda nueva cuenta con inicial cero;
  - un retiro que dejaría lo esperado negativo responde `insufficient_cash` sin escribir;
  - el cierre guarda lo contado y lo esperado de cada moneda, exige las que faltan y acepta una moneda nueva con lo esperado en cero;
  - la siguiente apertura propone lo contado;
  - la auditoría es la de D-9.
- **AC-4 (rechazos)**: cada respuesta de D-8, sin escribir, numerar ni auditar; un `viewer` recibe `FORBIDDEN` en cada escritura.
- **AC-5 (serialización)**:
  - **el bloqueo**: un test por camino (apertura, cierre, aporte, retiro y las escrituras de los medios) retiene el bloqueo de cobros desde otra conexión y mide que la escritura lo espera;
  - **dos aperturas simultáneas** terminan en una sesión y un `already_open`;
  - **un movimiento y un cierre simultáneos** terminan con el movimiento dentro del arqueo o rechazado con `no_open_session`, nunca en una sesión cerrada;
  - **dos retiros simultáneos** que juntos dejarían lo esperado negativo terminan en uno escrito y un `insufficient_cash`;
  - **los rescates** de `23505` por nombre de restricción.

  Cada escenario lleva su mutación.
- **AC-6 (lecturas)**: los dos roles ven el estado de la caja, la lista de sesiones con la búsqueda por número, el detalle con el arqueo y su historia, y la lista de medios.
- **AC-7 (pantallas)**: un end-to-end sobre `next start`:
  - `admin`, con teclado y sin JavaScript donde el formulario lo permite: crea la lista inicial, abre la caja, registra un aporte y un retiro, ve el rechazo de un retiro mayor que lo esperado, cierra con una diferencia e imprime el arqueo;
  - un `viewer` no ve ninguna acción;
  - axe sin violaciones en claro y en oscuro.
- **AC-8 (guardas)**: `cash-writes` pasa con el código y falla con cada uno de sus casos; `module-boundary` cubre `cash` como módulo de dominio; `exposed-surface` declara las acciones nuevas.
- **AC-9 (fronteras)**:
  - `cash` no importa `sales`, `orders` ni `crm`, y ningún módulo importa `cash`;
  - ningún módulo existente está en el diff, salvo `numbering` y `audit` en lo autorizado;
  - tampoco `src/shared/`.
- **AC-10 (contratos)**: `read-api`, `read-api-v2` e `ingestion-v2` pasan sin cambios.
- **AC-11**: la batería de la CI completa pasa en local (formato, lint, typecheck, build, unitarios, guardas, integración y end-to-end) y en la CI del SHA del cierre.
- **AC-12**: la documentación del punto 6 del alcance queda actualizada, sin reescribir ninguna decisión anterior.
- **AC-13** (si D-12): producción corre el SHA del cierre con la `0042`. En Demostración Vixora, el recorrido de D-12 se concilia contra la base:
  - los medios;
  - las sesiones encadenadas;
  - las filas por moneda;
  - lo esperado igual al inicial más los aportes y menos los retiros;
  - el contador `cash_session`;
  - la auditoría.

## Pruebas y evidencia requerida

- `deterministic`: AC-1 a AC-6 y AC-8 a AC-10, contra PostgreSQL real de desarrollo y de la CI.
- `producer-consumer`: AC-7 (UI ↔ servicio ↔ base) y AC-10.
- `isolated-runtime`: AC-13, si se despliega.
- **Las mutaciones** de AC-5 y de las guardas se corren y se revierten una por una, y su resultado va a §Resultados. Como mínimo:
  - sin el bloqueo en cada camino;
  - la comprobación de lo esperado antes del bloqueo;
  - sin el rescate de cada restricción;
  - el trigger de la cadena sin la comprobación del cierre;
  - el trigger de la sesión cerrada desactivado.
- La batería se corre **desde Git Bash**, y los archivos nuevos van al índice con `git add -N` antes de la batería final.

## Condiciones de detención

Parar e informar antes de seguir si:

- hace falta tocar un archivo fuera de la lista autorizada, en especial otro módulo, `src/shared/` o los contratos del agente;
- el diseño exigiría cambiar el texto del ADR 0022, del 0019 o del 0013;
- `cash` tendría que importar `sales`, `orders` o `crm`, o un módulo existente importar `cash`;
- lo esperado pudiera quedar negativo, mezclar monedas o cambiar después del cierre;
- una organización pudiera quedar con dos sesiones abiertas o con una escritura en una sesión cerrada;
- un medio pudiera cambiar de «es efectivo» o borrarse;
- `read-v1`, `read-v2` o `ingestion-v2` tendrían que cambiar;
- aparece una vía por la que un `viewer` escribe, o un texto libre o un dato personal entra a una tabla de la caja;
- un test que pasaba deja de pasar y la causa no es de esta subfase.

Y siempre **antes** de cada una de estas acciones, que necesita autorización explícita en su turno:

- el commit y el push;
- pasar tareas de estado en Notion;
- ejecutar migraciones contra una base que no sea la local o la de la CI;
- desplegar.

## Resultados — 2026-10-13 (autoevaluación)

Implementado el 2026-10-13. **Esta sección es autoevaluación**: la escribió quien implementó. La revisión independiente de D-11 va aparte, abajo.

### Lo que la implementación encontró que el brief no decía

**Desvíos que necesitan tu aprobación:**

- **`no_open_session` no existe** (desvío de D-5, D-8 y AC-5; revisión independiente, R-1).
  - El aporte, el retiro y el cierre llevan el id de la sesión que mostraba la pantalla. Una sesión que no está abierta está cerrada (`already_closed`) o no existe (`NOT_FOUND`).
  - Así un movimiento cargado en una sesión que se cerró mientras tanto no cae en la siguiente sin que nadie lo vea, que es lo que el ADR 0022 cuida en el punto 8.
- **La auditoría usa claves planas** (desvío de D-9; R-4).
  - El `diff` va con `opening_ARS`, y con `counted_ARS` y `expected_ARS`, en vez de objetos anidados por moneda, porque `recordAudit` solo admite valores planos (`audit/service.ts`).
  - El contenido es el de D-9: el número, y los montos por moneda.
- **La confirmación del cierre lleva su propia lectura, `previewCashClosing`** (D-10 no la nombraba).
  - Solo lee, la exige `admin`, y usa la misma `planClosing` que el cierre, así que no hay una segunda implementación.
  - **Desde R-5**, la confirmación envía lo esperado que mostró. Si con el bloqueo tomado lo esperado ya cambió, porque otro `admin` registró un movimiento en el medio, el cierre no se guarda (`expected_changed`), y la pantalla vuelve a mostrar la diferencia con un aviso.
- **`tests/integration/identity-schema.test.ts`, fuera de la lista autorizada.**
  - Enumera todas las tablas de la base, y la primera corrida de la batería falló sin las seis nuevas. H-8 no lo vio.
  - Se sumaron solo las seis tablas, como hizo la 20.4 con `sale_voids`.

**Precisiones que no cambian una decisión:**

- **Nombres y límites.**
  - La escritura de la sesión se llama `insertCashSession`, porque `auth` ya tiene un `insertSession`, el de las sesiones de ingreso.
  - Los medios de pago se listan por nombre: los cuatro de la lista inicial comparten la hora de alta.
  - Una sesión admite hasta 10 monedas.
  - Un aporte que llevaría lo esperado por encima de lo que cabe en `numeric(14, 2)` se rechaza como monto inválido (`limit`).
- **Lo propuesto en la apertura va con los decimales de la moneda** (R-2): «7400» en pesos chilenos. Con «7400.00», la apertura rechazaba lo mismo que proponía.
- **La historia de una sesión la ven los dos roles**, como pide AC-6. La de una venta es solo de `admin`.
- **H-9, precisado**: los end-to-end no hacen `TRUNCATE` de `organizations` ni de `users`, pero sí borran las organizaciones y los usuarios que no son de la semilla. Las filas de la caja de `cash.spec.ts` son solo de la organización y del `admin` de la semilla, así que ningún borrado choca.
- **El end-to-end de la caja va en cuatro casos**, para que ninguno se acerque al límite de 30 s por caso (lección de la 20.4): la apertura y los movimientos; el cierre y el arqueo, con la sesión como fixture SQL; el `viewer`; y uno sin JavaScript (R-3).
- **El arqueo tiene su propio botón de imprimir** (R-11), en lugar de importarlo de la carpeta de ventas.

### Criterios

| Criterio | Estado | Evidencia |
|---|---|---|
| AC-1 | cumplido | `cash-schema.test.ts`, 22 casos: los valores de enum; privilegios; solo inserción para cualquier rol; la cadena (dos primeras, dos siguientes, anterior abierta, otra organización con el trigger y con la clave compuesta); la sesión cerrada; los `CHECK`; las claves compuestas; el nombre del medio y su trigger |
| AC-2 | cumplido | `cash.test.ts`: la lista inicial y su rechazo, el alta, el renombre, la desactivación y la reactivación con su auditoría, `duplicate_name` también contra un inactivo, `limit_reached` y el `viewer` |
| AC-3 | cumplido, con el desvío de D-9 | `cash.test.ts`: la apertura con cero, lo esperado por moneda, el aporte en otra moneda, `insufficient_cash`, el cierre con una moneda nueva, las monedas que faltan, la vista previa, la cadena con lo propuesto, la auditoría; y R-2 y R-5 |
| AC-4 | cumplido, con el desvío de R-1 | `cash.test.ts`: cada rechazo sin escribir, numerar ni auditar; el `viewer` en cada escritura |
| AC-5 | cumplido | `cash.test.ts`: el bloqueo retenido en cada camino; otra organización no espera; dos aperturas, movimiento y cierre en los dos órdenes, y dos retiros, todos en cola determinista (R-6); los rescates de `cash_sessions_first_unique`, `cash_sessions_previous_unique`, `cash_session_closings_session_unique` y `cash_session_closing_amounts_pkey`. Con sus mutaciones (abajo) |
| AC-6 | cumplido | `cash.test.ts`: la lista de sesiones con la diferencia y la búsqueda, el detalle, otra organización y la historia para los dos roles |
| AC-7 | cumplido | `cash.spec.ts`, cuatro casos sobre `next start`: la lista inicial, la apertura con el teclado, el aporte, el retiro rechazado y el bueno; el cierre en dos pasos confirmado con el teclado, el arqueo impreso y lo propuesto; el `viewer` sin acciones; y la apertura y el cierre sin JavaScript, con «Corregir lo contado». axe en claro y en oscuro |
| AC-8 | cumplido | `cash-writes` (26 casos), `module-boundary` (6 casos de `cash`) y `exposed-surface` (8 acciones), con sus mutaciones |
| AC-9 | cumplido | `cash` importa solo `audit`, `numbering`, `organizations` y, en `schema.ts`, `auth` y `organizations`; nadie importa `cash`. De los módulos existentes, solo `numbering` y `audit/schema.ts`, en lo autorizado; `src/shared/` no está en el diff |
| AC-10 | cumplido en local | `read-api`, `read-api-v2` e `ingestion-v2` en la batería; `docs/contracts/` no está en el diff |
| AC-11 | cumplido en local | la batería completa, abajo; la de CI, al hacer push |
| AC-12 | cumplido | DataModel, Overview, RepositoryStructure, FunctionalRequirements (FR-CAJ-01 a 08), Screens (§21 a §27), TraceabilityMatrix, SecurityModel (110 puntos de entrada) y EngineeringStandards |
| AC-13 | pendiente | el despliegue, si se autoriza (D-12) |

### Mutaciones

Cada una se agregó al código real, se corrió y se revirtió con un script.

- **M1 a M7**: sin el bloqueo en cada una de las siete escrituras: apertura, aporte o retiro, cierre, lista inicial, alta, renombre, y desactivación o reactivación. Las detecta el caso del bloqueo retenido y, según el camino, los de la cola: fallan de 1 a 4 casos.
- **M8**: lo esperado de un retiro leído antes del bloqueo. Lo detectan los dos retiros en cola.
- **M9 y M10**: sin el rescate de la apertura (fallan 2) y sin el del cierre (1).
- **M11**: el trigger de la cadena sin la comprobación del cierre (fallan 2 del esquema).
- **M12**: el trigger de la sesión cerrada apagado (falla 1).
  - **La primera corrida dio un falso «detectada»**: el reemplazo de JavaScript interpretó `$$` como `$`, y la migración mutada no compilaba.
  - Se repitió con un reemplazo literal y la detectó un caso. Desde entonces el script reemplaza con una función.
- **M13**: un retiro que deja lo esperado negativo (fallan 2).
- **M14**: el cierre sin exigir las monedas que faltan (2).
- **M15 y M16**, en la guarda: el inicial escrito también desde el cierre (1) y un `update` de una sesión en el repositorio (2).
- **M17**: sin el rescate por la clave primaria de las filas del cierre (1).
- **M18**: el cierre sin comparar lo esperado confirmado (1).

M1 a M10, M13, M14, M17 y M18 se volvieron a correr después de las correcciones de la revisión, contra los tests deterministas, y siguen detectadas.

**Batería local**: formato, lint, typecheck y build sin errores; unitarios 736/736; guardas 640/640; integración 1142/1143 y end-to-end 114/178 en la corrida completa, después de las correcciones de la revisión.

- **Integración**: el caso que falló, `organization-bootstrap` («todos los seeds rechazan la base productiva»), se pasó del límite de 30 s porque lanza los seeds como procesos y la máquina estaba cargada. Corrido solo: 6/6.
- **End-to-end**: las 64 fallas son el servidor de prueba caído a mitad de la corrida (63 con `ERR_CONNECTION_REFUSED` en el puerto 3100, y una aserción de URL en el mismo tramo), en los archivos que corren después de la caja. Coincidió con una re-corrida de integración lanzada en paralelo. Los seis archivos afectados, otra vez: 67/67. Los cuatro casos de la caja pasaron en la corrida completa.
- En la primera batería, antes de la revisión, fallaron tres end-to-end ajenos bajo carga (`conversations:174`, `products:131`, `users:500`), que pasaron solos.

## Revisión independiente — 2026-10-13

Un agente que no participó del trabajo, de solo lectura, contra este brief, el ADR 0022 y las reglas vigentes. Informó 11 hallazgos: 3 medios y 8 bajos, ninguno bloqueante. Cada uno se verificó contra el código antes de aceptarlo.

- **R-1 (medio)**: `no_open_session` no se producía nunca, contra D-5, D-8 y AC-5, sin registro.
  - **Verificado**: solo aparecía en el tipo.
  - **Corregido**: se quitó del tipo y del texto. El desvío queda arriba, para tu aprobación.
- **R-2 (medio)**: la apertura rechazaba lo que proponía en una moneda sin decimales («7400.00» en CLP).
  - **Verificado** con `parseMoneyInput`.
  - **Corregido**: lo propuesto va con los decimales de la moneda, con un caso nuevo de CLP.
- **R-3 (medio)**: ningún end-to-end probaba el funcionamiento sin JavaScript que afirman Screens y AC-7.
  - **Corregido**: un caso con `javaScriptEnabled: false` abre la caja y la cierra en dos pasos, con «Corregir lo contado».
- **R-4 (bajo)**: la forma plana del `diff` no se registró. **Registrado** arriba.
- **R-5 (bajo)**: entre la confirmación y el cierre podía cambiar lo esperado sin aviso.
  - **Corregido**: la confirmación envía lo esperado que mostró, y el cierre responde `expected_changed` sin escribir. Se suman un caso y la mutación M18.
- **R-6 (bajo)**: tres escenarios simultáneos dependían del azar, y las mutaciones no estaban registradas.
  - **Corregido**: las aperturas, el movimiento con el cierre (ahora en los dos órdenes) y los retiros van en una cola determinista. Se suma un rescate determinista de `cash_sessions_first_unique`.
  - Las mutaciones quedan arriba.
- **R-7 (bajo)**: el rescate de `already_closed` no cubría el choque más probable, en la clave primaria de las filas por moneda.
  - **Corregido**: también traduce `cash_session_closing_amounts_pkey`, con un caso nuevo y la mutación M17.
- **R-8 (bajo)**: `?tipo=constructor` llegaba al formulario como un tipo. **Corregido** con `Object.hasOwn`.
- **R-9 (bajo)**: el recuento de `module-boundary` en EngineeringStandards decía 35. **Corregido**: 41.
- **R-10 (bajo)**: lo esperado no estaba asociado al campo de lo contado, y los radios del motivo no llevaban `aria-invalid`. **Corregido**.
- **R-11 (bajo)**: el arqueo importaba el botón de imprimir de la carpeta de ventas. **Corregido** con uno propio de la caja.

La revisión confirmó además:

- el orden del bloqueo en las siete escrituras, y que ninguna consulta lo precede;
- la cadena de sesiones en la base, y lo que los triggers no ven, declarado;
- que el cierre escribe las filas antes que la cabecera;
- lo esperado por moneda, sin mezclar ni quedar negativo;
- los rescates leídos por el nombre de la restricción;
- la autorización y los recuentos de SecurityModel (36 + 58 + 16 = 110);
- que la auditoría no lleva datos de una persona;
- lo que ve y no ve la guarda;
- las fronteras entre módulos;
- que los archivos están en la lista autorizada, salvo `identity-schema.test.ts`, registrado arriba.
