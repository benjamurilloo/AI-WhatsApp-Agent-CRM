---
schema: task-brief.v1
task_id: "29.7"
task_type: implementation
generated_at: 2026-10-20
---

# Brief 29.7 — La recepción de usados

- **Contrato**: `task-brief.v1`
- **Tipo de tarea**: `implementation`. Migración, módulo nuevo, código, pruebas y despliegue.
- **Nivel de evidencia objetivo**: `deterministic` (tests contra PostgreSQL) y `producer-consumer` (pantallas ↔ servicio ↔ base, con end-to-end).
- **Estado**: **aprobado** por el usuario el 2026-10-21, con las decisiones U-1 a U-5 que tomó el 2026-10-20, todas con la opción recomendada (abajo); **cerrado** el 2026-10-21, desplegado (`43ce6fb`) y recorrido (§Cierre).
- **Fuentes**: [ADR 0024](0024-rubros-y-capacidades.md), puntos 2, 3, 6, 8, 13, 14, 16 y 17, y sus notas de la 29.5 a la 29.6.2; [ADR 0025](0025-tipo-de-cambio.md), punto 5; [ADR 0007](0007-identificador-de-cliente-solo-telefono.md), nota del 2026-10-18; [ADR 0022](0022-cobros-y-caja.md), nota del 2026-10-18; [ADR 0015](0015-vaciado-de-una-sola-direccion-en-tablas-de-solo-insercion.md); [brief-29.6.2](brief-29.6.2-las-reparaciones-de-unidades-propias.md); [DataModel](../architecture/DataModel.md); [runbook de datos de un cliente](../runbooks/datos-de-un-cliente.md).

## Objetivo

Que un negocio con `trade_ins` y `serialized_units` **reciba un iPhone usado de un cliente**: revisa el equipo con su checklist, le reconoce un valor, y el equipo **entra a su stock como una unidad en revisión**, con ese valor como costo, lista para repararla, corregirla, liberarla a la venta o darla de baja con lo que ya hizo la 29.6.2. El comprobante `PU-` queda emitido contra el cliente, y se anula mientras la unidad siga en el local sin usarse.

## Contexto

El ADR 0024 diseñó en el punto 8 la recepción de usados, la permuta y la compra de usados, y en el punto 9 la cotización. La tabla del punto 17 las pone juntas en la 29.7. **El usuario la dividió en tres el 2026-10-20** (U-1):

| Subfase | Crea |
|---|---|
| **29.7 — La recepción de usados** (este brief) | la capacidad `trade_ins`, el módulo `tradeins`, el checklist de la copia del perfil, el comprobante `PU-` con su resultado, la unidad que nace en revisión, la anulación `APU-`, y el DNI y el Instagram del cliente |
| **29.7.2 — La permuta y la compra de usados** | el medio «Permuta» en los cobros, `trade_in_payments` con la regla del ADR 0025, sus anulaciones, y las comprobaciones de la anulación del usado contra cobros y pagos |
| **29.7.3 — La cotización de un usado** | `trade_in_margins`, los valores sueltos del perfil, el tipo de reparación de cada punto del checklist y la función de la cotización, con su pantalla |

El destino del valor (`sale_credit` o `purchase`) **se elige y se guarda en esta subfase**, porque es un dato del comprobante, que es de solo inserción. Lo que hace cada destino con la plata llega en la 29.7.2: **hasta entonces, el CRM registra el usado, pero la permuta o el pago al cliente se hacen fuera del sistema**.

## Hallazgos (verificados contra el código en `63544f6`, 2026-10-20)

- **H-1. El IMEI es único entre las unidades que no están dadas de baja** (`stock_units_organization_serial_lower_unique`, `WHERE status <> 'written_off'`). Una unidad vendida conserva su IMEI. Un equipo que el local vendió y vuelve como usado choca con el índice. La nota de la 29.5 en el ADR 0024 dejó la decisión para este brief. Lleva a U-2.
- **H-2. Tres lecturas por IMEI suponen el índice de hoy**, todas en `inventory`:
  - `findCurrentUnitsBySerials` (`unit-repository.ts:145`), que usan el pedido y la venta para elegir unidades, devuelve todas las que no están dadas de baja, y `resolveLineUnits` arma un mapa por IMEI (`service.ts:1383`). Con una vendida y otra en el local del mismo IMEI, el mapa se queda con cualquiera de las dos;
  - `findTakenSerials` (`unit-repository.ts:207`), que usan el alta manual y la recepción para el aviso de IMEI repetido;
  - `restoreSaleStock` (`service.ts:1259`), la anulación de una venta sin pedido, devuelve sus unidades de `sold` a `available`. Si el IMEI volvió como usado, chocaría con el índice nuevo.
- **H-3. Una unidad nace `available`**: el trigger de `stock_units` rechaza cualquier otro estado en el `INSERT` (`0059`, l.47). El usado nace `in_review` (ADR 0024, punto 6).
- **H-4. El origen de la unidad** es `stock_unit_origin` (`goods_receipt`, `manual`) y una clave plana `origin_id` sin clave foránea (`inventory/schema.ts:177-180`; ADR 0024, R-16). `trade_in` entra con esta subfase (DataModel, l.571).
- **H-5. Contradicción dentro del ADR 0024 sobre quién da de baja la unidad de un usado anulado**:
  - el **punto 8** dice que `cash` orquesta la anulación y «llama a `tradeins` para escribir la anulación y a `inventory` para dar de baja la unidad», lo que suma la arista `cash → inventory`;
  - el **punto 6** da `writeOffTradeInUnit` con llamador **`tradeins`**, y el **punto 16** y el Overview (l.165) suman a `cash` solo la dependencia de `tradeins`.

  Hoy `cash` no importa `inventory`. Lleva a U-3.
- **H-6. El cliente no tiene DNI ni Instagram.** `clients` tiene el email y los campos de la 17.1 (`crm/schema.ts:60-75`). El ADR 0007 tiene la nota del DNI como dato opcional, nunca identificador (U-5 del ADR 0024). El vaciado escribe en null cada columna de la ficha, una por una (`scripts/client-data-delete.ts:266-283`): las nuevas hay que sumarlas. La auditoría del cliente ya la vacía `eraseAuditEntries`.
- **H-7. El molde del comprobante con anulación** es el pago a proveedor (`cash/supplier-payments.ts`): numerado, de solo inserción, con su anulación numerada aparte, motivo de una lista y el bloqueo `cash:` de la organización (`lockCash`, l.368 y l.578).
- **H-8. La copia del perfil** la hace `scripts/activar-capacidad.ts` con el perfil versionado (`organizations/profiles/iphone.ts`, versión 3). Cada capacidad copia sus tablas con una función de su módulo, en la misma transacción (los tipos de reparación, con `applyRepairTypeTemplate` de `service`).
- **H-9. El cliente se bloquea en modo compartido** para crear un comprobante contra él (`lockClientForOrder`, `crm/service.ts:1208`), y el vaciado lo bloquea en modo exclusivo.

## Decisiones del usuario

**Decididas el 2026-10-20**, las dos con la opción recomendada:

- **U-1, la división**: en tres, como la tabla de §Contexto.
- **U-2, el IMEI de un equipo que el local vendió y vuelve**: **se crea una unidad nueva con el mismo IMEI**. El IMEI pasa a ser único entre las unidades que están en el local, sin contar las vendidas ni las dadas de baja. **Anular la venta original se rechaza si ese IMEI ya volvió.** Se descartaron rechazar la recepción y reutilizar la unidad vendida.

**Decididas también el 2026-10-20**, las tres con la opción recomendada (a). Las opciones, como se presentaron:

- **U-3, quién da de baja la unidad de un usado anulado** (H-5). **Elegida (a)**, la recomendada: `cash` llama a `tradeins` (`voidTradeIn`), y `tradeins` llama a `inventory` (`writeOffTradeInUnit`), como dicen el punto 6, el punto 16 y el Overview. `cash` no suma `inventory`. Es una nota al punto 8. (b) Como dice el punto 8: `cash` llama a las dos, y suma la arista `cash → inventory`, con nota al punto 16 y al Overview.
- **U-4, dónde vive la anulación del usado en esta subfase.** **Elegida (a)**, la recomendada: **ya en `cash`**, bajo su bloqueo, aunque en la 29.7 solo compruebe el estado de la unidad. La 29.7.2 le suma las comprobaciones de cobros y pagos sin moverla. (b) En `tradeins` en esta subfase, y se mueve a `cash` en la 29.7.2: es más simple ahora y obliga a mover el punto de entrada, su acción y su guarda después.
- **U-5, el DNI en el comprobante imprimible.** **Elegida (a)**, la recomendada: el comprobante impreso por un `admin` muestra el nombre, el teléfono y **el DNI del cliente, leídos de su ficha al imprimir**, sin copiarlos al comprobante (ADR 0024, punto 14, y alternativa descartada «el DNI en el comprobante del usado»). Si la ficha se vació, el comprobante muestra el nombre minimizado. (b) Sin el DNI.

## Decisiones

### D-1 — La capacidad y el módulo (ADR 0024, puntos 2, 3 y 16)

- **`capability` suma `trade_ins`.** Exige `serialized_units`: el script la rechaza en una organización sin ella. El perfil de iPhone pasa a la **versión 4**, con `trade_ins` y el checklist (D-3).
- **El módulo nuevo `tradeins`** depende de `catalog`, `inventory`, `crm`, `numbering`, `organizations` y `audit`. **No depende de `service` en esta subfase**: la dependencia la suma la 29.7.3, para la cotización. Entra en la lista de módulos de dominio de `eslint.config.mjs` y en el Overview.
- **`cash` suma la dependencia de `tradeins`** (U-4), y nada más (U-3).
- **Ningún módulo del núcleo importa `tradeins`, salvo `cash`.** No hay ciclos. La guarda nueva `tradeins-dependencies` lo fija, como `service-dependencies`.
- **Sin la capacidad**, ninguna pantalla, acción, menú ni dato cambia, y cada ruta de `tradeins` responde 404.

### D-2 — Las unidades (ADR 0024, punto 6)

- **`stock_unit_origin` suma `trade_in`.** El trigger de `stock_units` admite **nacer `in_review` solo con origen `trade_in`**, y `available` con cualquier otro, como hoy, comparando como texto.
- **El índice único del IMEI pasa a `status NOT IN ('written_off', 'sold')`** (U-2). Las tres lecturas de H-2 cambian:
  - el aviso de IMEI repetido (`findTakenSerials`) no cuenta las vendidas;
  - **la elección de unidades** de un pedido o una venta prefiere la unidad que está en el local. Una vendida solo responde cuando no hay otra con ese IMEI, y sigue diciendo «ya no está disponible», como hoy;
  - **la anulación de una venta sin pedido se rechaza** con `unit_serial_back`, nombrando el IMEI, si alguna de sus unidades tiene el IMEI en otra unidad del local. El índice es la última defensa, y su violación se traduce a la misma regla.
- **`inventory_movement_type` suma `unit_written_off`**: la baja de la unidad de un usado anulado que ya estaba liberada.
- **Dos funciones nuevas de `inventory`**, que reciben la transacción del llamador y se auditan como `stock_unit`. `unit-writes` fija cada una y su único llamador:

  | Función | Unidad | Saldo y movimiento | Llamador |
  |---|---|---|---|
  | `registerTradeInUnit` | **se crea `in_review`**, con el IMEI, el grado, la batería y el valor reconocido como costo; origen `trade_in` y su comprobante | ninguno: fuera del saldo | `tradeins` (emitir el `PU`) |
  | `writeOffTradeInUnit` | `in_review` → `written_off`, sin movimiento; `available` → `written_off`, −1, `unit_written_off` | según el estado | `tradeins` (la anulación, U-3) |

- **Lo demás de la 29.6.2 sirve sin cambios** para la unidad de un usado: mandarla a reparar, corregirla, liberarla y darla de baja desde la ficha de unidades.

### D-3 — El checklist (ADR 0024, puntos 8 y 13)

- **`trade_in_checklist_items`** (de `tradeins`), por organización: el nombre (1 a 80 caracteres, único sin distinguir mayúsculas), si es **obligatorio para aceptar el equipo**, el orden, activo o no, y la marca `is_example`.
- **La copia del perfil** (versión 4) trae los puntos de R-5, con el ejemplo marcado: cámara trasera, cámara frontal, micrófono, True Tone, táctil, parlantes, Face ID, sin piezas desconocidas, **toma señal (obligatorio)** e **iCloud desvinculado (obligatorio)**. La batería no es un punto: es una columna de la recepción (D-4). Los daños estéticos se expresan en el grado.
- **Un `admin` lo ajusta** en «Usados → Checklist»: agrega, renombra, marca obligatorio, ordena y desactiva. Un punto con recepciones no se borra: se desactiva. Cada cambio se audita.
- **El tipo de reparación de un punto** lo suma la 29.7.3, con la cotización.

### D-4 — La recepción del usado: el comprobante `PU` (ADR 0024, punto 8)

- **`trade_ins`** (de `tradeins`), **de solo inserción**, numerado `PU-000123` (`document_kind` suma `trade_in`), **contra un cliente activo**. Lleva:
  - el **producto de destino**: un producto activo, **condición `used` y llevado por unidad**;
  - **la unidad** que crea, con clave foránea compuesta a `stock_units` (`RESTRICT`);
  - el **IMEI**, la **salud de la batería** (obligatoria, de 0 a 100) y el **grado propuesto** (obligatorio, de los grados activos);
  - **el valor reconocido**, positivo, con su moneda (cualquiera con decimales conocidos, como el costo de una unidad);
  - **el destino**: `sale_credit` (la permuta) o `purchase` (la compra), que se elige al emitirlo y no cambia;
  - quién lo emitió y cuándo.
- **Sin texto libre**: no lleva observaciones. Un texto libre en un comprobante de solo inserción puede tener datos personales y obligaría a vaciarlo (ADR 0015). Lo que no cubre el checklist va en el grado y la batería.
- **El resultado del checklist**, en **`trade_in_checklist_results`**, de solo inserción: una fila por punto activo al emitir, con **una copia del nombre y de si era obligatorio** (el punto se puede renombrar después) y si pasó.
- **Un punto obligatorio que no pasa rechaza la recepción** (`mandatory_check_failed`, nombrando el punto). El equipo no se acepta.
- **Al emitirse**, en la misma transacción, **crea la unidad `in_review`** con `registerTradeInUnit` (D-2): el costo es el valor reconocido, y el producto, el de destino.
- **El orden de bloqueo**: el cliente en modo compartido (H-9), el producto `FOR SHARE`, el aviso de IMEI repetido, el contador del `PU`, la unidad y el comprobante con su resultado. El índice único del IMEI es la última defensa entre dos recepciones del mismo equipo, o una recepción y un alta.
- **Rechazos con nombre**: cliente inactivo o inexistente, producto que no es usado o no se lleva por unidad, IMEI repetido en el local, grado inactivo, batería fuera de rango, valor no positivo o con más decimales que su moneda, punto obligatorio que no pasó.
- **Se audita** como `create` de `trade_in`, sin datos del cliente: el número, el producto, la unidad, el IMEI, el valor y el destino.

### D-5 — La anulación: el comprobante `APU` (ADR 0024, punto 8; U-3 y U-4)

- **`trade_in_voids`** (de `tradeins`), de solo inserción, numerado `APU-000012` (`document_kind` suma `trade_in_void`), **a lo sumo una por recepción** (`UNIQUE`). Lleva el motivo, de una lista cerrada: «Error de carga», «El cliente se arrepintió» u «Otro motivo».
- **La orquesta `cash`** (`voidTradeIn`, U-4), bajo `lockCash` de la organización. Llama a `tradeins`, que escribe la anulación y llama a `writeOffTradeInUnit` (U-3).
- **Se anula solo si la unidad sigue `in_review` o `available`**. Una unidad en reparación, reservada, vendida o dada de baja la rechaza con `unit_not_in_shop`, nombrando su estado. **La 29.7.2 suma** que ningún cobro con «Permuta» ni pago de compra vigente la use.
- **El orden de bloqueo**: `cash:` de la organización, la recepción `FOR UPDATE`, el producto, la unidad, su saldo si estaba `available`, y el contador del `APU`.
- **Se audita** como `void` de `trade_in`.

### D-6 — El cliente: DNI e Instagram (ADR 0024, punto 14; ADR 0007, nota)

- **`clients.document_number`**: 7 u 8 dígitos, sin puntos, **opcional y sin unicidad**. Nunca identifica al cliente: no se busca por él en esta subfase.
- **`clients.instagram`**: el usuario sin `@`, de 1 a 30 caracteres (letras, números, punto y guion bajo), opcional.
- Se cargan en el alta y la edición de la ficha, con su auditoría.
- **Un `viewer` no los recibe** (como el email, la calle y el código postal desde la 17.1), **ni el agente**: ningún contrato de lectura ni de ingestión los expone.
- **El vaciado los escribe en null**, la exportación los incluye, y el runbook de datos de un cliente suma `trade_ins` y `trade_in_voids` a la exportación. **El vaciado no toca `trade_ins`**, que no tiene datos personales (D-4): queda contra la ficha vaciada, como una venta.

### D-7 — Las pantallas

- **«Usados»** en el menú, con la capacidad, para los dos roles:
  - **la lista** de recepciones: número, fecha, cliente, producto, IMEI, destino, estado (vigente o anulada) y, para un `admin`, el valor. Filtros por estado y destino, y búsqueda por número o IMEI;
  - **«Recibir un usado»** (`admin`): el cliente, el producto usado, el IMEI, la batería, el grado, el checklist con un casillero por punto (los obligatorios marcados), el valor con su moneda y el destino. **Sin productos usados llevados por unidad**, la pantalla explica qué falta y no muestra el formulario;
  - **el detalle** y **su comprobante imprimible**, con el cliente (U-5), el equipo, el checklist, el valor y el destino, y la leyenda «Documento no válido como factura»;
  - **«Anular»** (`admin`), con la confirmación y el motivo, y el comprobante `APU` imprimible;
  - **«Checklist»** (`admin`), la configuración de D-3.
- **La ficha de unidades** dice el origen «Usado recibido», con un enlace a su `PU`. El historial de movimientos nombra `unit_written_off` («Baja por anulación de un usado») con su signo y su filtro.
- **La ficha del cliente** muestra el DNI y el Instagram a un `admin`, y sus recepciones de usados.
- **La anulación de una venta** muestra el rechazo `unit_serial_back` con el IMEI.
- Todo se ve con y sin JavaScript, en claro y oscuro, a 1280 y 375 px, con axe sin violaciones.

### D-8 — Roles

- **Un `admin`** configura el checklist, recibe usados, los anula y carga el DNI y el Instagram.
- **Un `viewer`** ve la lista y el detalle de las recepciones, con el checklist, **sin el valor reconocido** (ADR 0024, punto 14), sin el DNI ni el Instagram, y sin acciones. El costo de la unidad ya no lo ve (FR-PROD-21).

### D-9 — La migración `0060`

Aditiva:
- `capability` suma `trade_ins`; `document_kind`, `trade_in` y `trade_in_void`; `stock_unit_origin`, `trade_in`; `inventory_movement_type`, `unit_written_off`; `audit_entity_type`, `trade_in` y `trade_in_checklist_item`;
- `clients` suma `document_number` e `instagram`, con sus `CHECK`;
- las tablas `trade_in_checklist_items`, `trade_ins`, `trade_in_checklist_results` y `trade_in_voids`, con sus privilegios de `crm_app` (sin `UPDATE` ni `DELETE` en las de solo inserción) y sus triggers;
- el índice único del IMEI se recrea con el predicado de U-2;
- `stock_units_guard_change` se reemplaza (D-2).

**Ninguna sentencia nombra como enum un valor que agrega la misma migración**: los `CHECK` y los triggers comparan como texto. Un test migra hasta la 0059 con unidades en todos los estados, y aplica la 0060 sola.

### D-10 — Pruebas

- **Integración**:
  - la recepción: la unidad `in_review` con su costo, su grado, su batería y su origen; el resultado del checklist con las copias; la auditoría; **el saldo no cambia**;
  - cada rechazo de D-4 por su nombre, y un punto obligatorio que no pasó;
  - **el IMEI de una unidad vendida vuelve como usado** (U-2): la recepción pasa; la anulación de la venta original se rechaza con `unit_serial_back`; un pedido que pide ese IMEI elige la unidad del local;
  - la unidad del usado sigue el camino de la 29.6.2: se repara, se corrige, se libera y se vende;
  - la anulación desde `in_review` (sin movimiento) y desde `available` (−1, `unit_written_off`); rechazada en reparación, reservada, vendida y dada de baja; una segunda anulación rechazada;
  - **dos recepciones del mismo IMEI a la vez**, y **la anulación de un usado contra mandar a reparar su unidad**, cada una con una tercera conexión que retiene la fila;
  - los triggers de solo inserción de las cuatro tablas y el nacimiento de la unidad, cada rechazo por su mensaje;
  - el DNI y el Instagram: validación, el `viewer`, el vaciado, la exportación y los contratos del agente sin ellos;
  - el `viewer`, sin el valor;
  - el invariante del saldo después de cada escritura de `tradeins` y de la anulación;
  - sin `trade_ins`, nada cambia; `trade_ins` sin `serialized_units`, rechazada por el script;
  - la activación con el perfil copia el checklist.
- **Unitarias**: la validación de la recepción y del DNI y el Instagram.
- **End-to-end**: recibir un usado con su checklist, verlo en las unidades en revisión, liberarlo y venderlo; un punto obligatorio que no pasa; la anulación; el `viewer`; 375 px; sin JavaScript.
- **Las suites existentes** pasan sin cambios de conducta.

### D-11 — Revisión, despliegue y cierre

- **Revisión independiente** antes del despliegue (`CLAUDE.md`).
- **Despliegue** con el servicio detenido durante el build y el heap de 1.536 MB.
- **La activación** de `trade_ins` en «iPhone Demo» la corre el usuario con `org:capability --profile iphone`, como la de `repairs`. «iPhone Demo» necesita **un producto usado llevado por unidad** para el recorrido: se crea desde la pantalla.
- **Recorrido del usuario.**
- **Cierre**: DataModel, FR nuevos de los usados y FR-CLI-05, las notas fechadas del ADR 0024 (puntos 6, 8 y 14, con U-1 a U-5), Overview, runbook de datos de un cliente, CHANGELOG, HANDOFF, Roadmap, Notion (la 29.7 renombrada, y la 29.7.2 y la 29.7.3 en «Esperando») y Knowledge Capture.

## Alcance incluido

Todo lo de D-1 a D-11.

## Alcance excluido

- **La permuta como medio de cobro, `trade_in_payments` y las comprobaciones de la anulación contra cobros y pagos**: la 29.7.2.
- **La cotización**, los márgenes, los valores sueltos del perfil y el tipo de reparación de cada punto: la 29.7.3.
- **Lo que lee el agente**: la 29.8. Ningún contrato cambia.
- **Buscar un cliente por DNI**: el DNI no identifica (ADR 0007).
- **Convertir monedas**: el valor reconocido va en su moneda y es el costo de la unidad, sin conversión.
- **Recibir un usado sin cliente**, o de un proveedor (ADR 0023, punto 2).
- **Un producto `quantity` usado**: solo unidades.
- **Avisos**: el CRM no envía mensajes.

## Invariantes

- Sin `trade_ins`, ninguna pantalla, acción ni dato cambia.
- **El saldo de un producto `unit` es igual a sus unidades `available` y `reserved`** después de cada escritura; una unidad nacida de un usado entra al saldo solo al liberarse.
- **El saldo nunca cambia sin su movimiento.**
- **Dos unidades en el local nunca comparten IMEI**; una vendida y una en el local, sí (U-2).
- Una recepción tiene exactamente una unidad, y a lo sumo una anulación.
- Ningún punto obligatorio falló en una recepción vigente.
- `trade_ins`, sus resultados y sus anulaciones nunca cambian ni se borran.
- **Ningún módulo del núcleo importa `tradeins`, salvo `cash`**, y `tradeins` no importa `cash` ni `service`. No hay ciclos.
- Un `viewer` y el agente nunca reciben el valor reconocido, el DNI ni el Instagram.

## Criterios de aceptación

- **AC-1**: un `admin` recibe un usado contra un cliente activo y un producto usado llevado por unidad, con su checklist, su batería, su grado, su valor y su destino; queda el `PU` y una unidad `in_review` con ese costo, **sin cambiar el saldo**.
- **AC-2**: un punto obligatorio que no pasa rechaza la recepción nombrando el punto, y cada otro rechazo de D-4 tiene su nombre.
- **AC-3**: el resultado del checklist guarda una copia del nombre y de si era obligatorio, y no cambia si el punto se renombra.
- **AC-4**: un IMEI de una unidad vendida se recibe como usado; la anulación de la venta original se rechaza con `unit_serial_back`; un pedido que pide ese IMEI elige la unidad del local (U-2).
- **AC-5**: la unidad del usado se manda a reparar, se corrige, se libera y se vende con los caminos de la 29.6.2 y la 29.5.2.
- **AC-6**: la anulación da de baja la unidad `in_review` sin movimiento y la `available` con `unit_written_off`, y se rechaza en cualquier otro estado y una segunda vez.
- **AC-7**: dos recepciones del mismo IMEI a la vez dejan una, y una anulación contra mandar a reparar su unidad deja un solo ganador, cada caso probado con una tercera conexión.
- **AC-8**: los triggers rechazan cambiar o borrar una recepción, su resultado y su anulación, y que una unidad nazca `in_review` sin origen `trade_in`, cada uno con su mensaje.
- **AC-9**: el invariante del saldo se cumple después de cada escritura de `tradeins` y de la anulación.
- **AC-10**: el checklist se configura con su auditoría, y la activación con el perfil lo copia con la marca de ejemplo.
- **AC-11**: el DNI y el Instagram se validan, se auditan, no llegan a un `viewer` ni al agente, se vacían con el cliente y se exportan, con el runbook actualizado.
- **AC-12**: un `viewer` ve las recepciones sin el valor, el DNI ni el Instagram, y sin acciones.
- **AC-13**: sin `trade_ins` nada cambia; `trade_ins` sin `serialized_units` se rechaza; las suites existentes pasan sin cambios de conducta, salvo los de forma que declare la implementación.
- **AC-14**: guardas (incluida `tradeins-dependencies`), unitarias, integración y end-to-end pasan en CI, con axe sin violaciones.
- **AC-15**: la revisión independiente se hizo antes del despliegue, con cada hallazgo verificado.
- **AC-16**: desplegada, `trade_ins` activada en «iPhone Demo» y recorrida por el usuario; «Demostración Vixora» y «Vixora» intactas.

## Pruebas y evidencia requerida

Las de D-10, más la CI en verde sobre el SHA desplegado y los recuentos por organización después del recorrido.

## Condiciones de detención

Pedir autorización explícita, en su turno, **antes de**:
- el commit, el push y el despliegue;
- migrar una base real;
- activar `trade_ins` en producción, si no lo corre el usuario.

**Detenerse y consultar** si:
- algún módulo del núcleo, salvo `cash`, necesita importar `tradeins`, o aparece un ciclo;
- cambiar el índice del IMEI invalida unidades existentes, o cambia la conducta de una suite existente fuera de H-2;
- el DNI o el Instagram tienen que llegar al agente o a un `viewer` para algo;
- la recepción necesita convertir monedas;
- la anulación necesita la arista `cash → inventory` (U-3 (b) no elegida).

## Implementación

### Desviaciones y decisiones de implementación

Registradas al implementar, el 2026-10-21, para la revisión independiente. Ninguna toca una condición de detención. Solo `cash` importa `tradeins`, y no hay ciclos. `cash` no importa `inventory`. El índice nuevo del IMEI vale para las unidades existentes (`migration-0060.test.ts`, con unidades en todos los estados). Ningún contrato del agente cambia.

1. **La anulación no toma la recepción `FOR UPDATE`.** D-5 lo pedía, pero `FOR UPDATE` exige el privilegio `UPDATE`, que `crm_app` no tiene sobre `trade_ins`, una tabla de solo inserción. Dos anulaciones del mismo usado las serializa `lockCash` de la organización, y el `UNIQUE` de `trade_in_voids` es la última defensa: su violación se traduce a `already_voided`. El orden queda así: `cash:` de la organización, la recepción leída sin bloqueo, el producto y la unidad (en `writeOffTradeInUnit`), su saldo si estaba `available`, y el contador del `APU`.
2. **La recepción también toma el checklist `FOR SHARE`**, después del cliente: un ajuste del checklist y una recepción no se cruzan. D-4 no lo nombraba.
3. **El contador del `PU` se toma dentro de `registerTradeInUnit`**, mediante un callback (`beforeInsert`), después del producto y del aviso de IMEI repetido, como pide D-4. Así `inventory` no conoce la numeración de `tradeins`.
4. **El checklist tiene un máximo de 40 puntos** (`checklist_full`), igual al tope de las líneas del resultado. D-3 no fijaba un máximo.
5. **`lockProductShared` y `lockProductForStockChange` de `catalog` devuelven también la condición del producto**, para el rechazo `not_used_unit_product`.
6. **La 0060 depende de que la 0057 esté confirmada.** El índice nuevo del IMEI nombra `'sold'`, un valor que agregó la 0057. Drizzle aplica las migraciones pendientes en una sola transacción. Por eso una base que esté en la 0056 o antes no puede saltar hasta la 0060 de una vez: PostgreSQL responde «unsafe use of new value». Esto no afecta a producción, que está en la 0059, ni a una base nueva, porque el tipo nace en la misma transacción que sus valores. `migration-0057.test.ts` aplica ahora la 0057 desde una copia que llega solo hasta la 0057, que es lo que su título ya decía («la 0057, sola»).
7. **Cambios de forma en suites existentes**, declarados por AC-13:
   - los datos de contacto y la auditoría del cliente suman `documentNumber` e `instagram` (`crm.test.ts`, `orders.test.ts` y `crm/service.test.ts`);
   - los `CHECK` de `clients` suman dos;
   - la lista de tablas y la de privilegios suman las cuatro tablas nuevas;
   - el vaciado suma las dos columnas a `EXTRA_FIELDS`;
   - el recuento de tipos de movimiento pasa de 9 a 10;
   - las 28 specs end-to-end que vacían tablas suman las tres tablas nuevas que referencian a `clients`, `products` y `stock_units`: un `TRUNCATE` de una tabla referenciada falla aunque la tabla que la referencia esté vacía;
   - el caso 9 de `clients.spec.ts` (dos sesiones y cuatro rutas, con sus cuerpos crudos) quedó al borde del límite de 30 s: pasó en 29,9 s y falló en la corrida siguiente. Lleva `test.slow()`, como los otros casos largos del repo. La ficha consulta ahora la capacidad `trade_ins`. No tengo una medición de antes del cambio.

   Ninguno de estos cambios altera una conducta.
8. **El comprobante imprimible no lleva líneas de firma ni declaración**, que D-7 no pedía.

### Lo que corrigió la revisión independiente

La revisión del 2026-10-21 dio R1, sin bloqueantes, con un hallazgo medio y cuatro bajos. Los cinco se verificaron contra el código y eran ciertos:

- **M-1, el DNI y el Instagram en todas las organizaciones.** El formulario y la ficha los mostraban aunque la organización no tuviera `trade_ins`, y eso choca con D-1 y con el primer invariante. **Decidido por el usuario: solo con la capacidad.** Sin ella, el formulario no muestra los campos y la ficha no los lista. Los valores viajan ocultos en el formulario, para que una edición no los borre. Las columnas, la exportación y el vaciado no cambian. El servicio de `crm` no consulta la capacidad: la acepta un `admin` de su propia organización, como cualquier otro campo.
- **B-1, el filtro «Baja por anulación de un usado»** se ofrecía en todas las organizaciones. Ahora aparece solo con `trade_ins`. Los dos filtros de la 29.6.2 se dejan como están, porque son de otra subfase.
- **B-2, el índice del IMEI cambia la conducta también sin `trade_ins`**, en toda organización con `serialized_units`. Lo decidió U-2 para todas las organizaciones: una unidad con el IMEI de una vendida ya se puede dar de alta, y en ese caso la anulación de la venta original se rechaza. Queda como excepción declarada al primer invariante.
- **B-3, la última defensa de `voidSale`** nombra todos los IMEI de la venta, no solo el que volvió. Solo ocurre en la carrera contra una recepción simultánea; el camino normal nombra el correcto. Se acepta.
- **B-4, el vaciado y los usados.** El ADR 0024, punto 14, decía que las tablas nuevas también se vacían. El brief (D-6) decía que el vaciado no toca `trade_ins`. **Decidido por el usuario: como el brief**, porque el IMEI es el del equipo que ahora es del negocio. Lo registra una nota fechada en el ADR. Un test nuevo prueba que un cliente con usados no se borra, que el informe nombra los usados retenidos y que el vaciado deja los usados intactos y borra el DNI y el Instagram.
- **Estado documental:** las líneas del DataModel que todavía ubicaban `trade_in_payments` y `trade_in_margins` en la 29.7 se corrigieron con una nota fechada (U-1).

## Cierre

*Del 2026-10-21, después del despliegue y el recorrido del usuario.*

### Criterios

| Criterio | Estado | Evidencia |
|---|---|---|
| AC-1 | cumple | `receiveTradeIn` de `tradeins` con `registerTradeInUnit` de `inventory`; `trade-ins.test.ts`, la recepción con la unidad `in_review`, su costo, su origen y el saldo sin cambios; el end-to-end de la recepción |
| AC-2 | cumple | los rechazos de D-4 por su nombre en `trade-ins.test.ts`, y el punto obligatorio que no pasó, nombrado; el end-to-end del punto obligatorio |
| AC-3 | cumple | `trade_in_checklist_results` con `item_name` y `was_mandatory`; la prueba que renombra el punto después de la recepción |
| AC-4 | cumple | el índice `stock_units_organization_serial_lower_unique` sin las vendidas (`0060`); la anulación de la venta original rechazada con `unit_serial_back`, y el pedido que elige la unidad del local (U-2) |
| AC-5 | cumple | la unidad del usado mandada a reparar, corregida, liberada y vendida con los caminos de la 29.6.2 y la 29.5.2, en integración y en el end-to-end |
| AC-6 | cumple | `voidTradeIn` en `cash` con `writeOffTradeInUnit`: sin movimiento desde `in_review`, `unit_written_off` desde `available`, y los rechazos en los demás estados y en la segunda anulación |
| AC-7 | cumple | dos recepciones del mismo IMEI y la anulación contra mandar a reparar, cada una con una tercera conexión que retiene la fila |
| AC-8 | cumple | los triggers de solo inserción de las cuatro tablas y el nacimiento `in_review` solo con origen `trade_in`, cada rechazo por su mensaje |
| AC-9 | cumple, con la convención del proyecto | `expectStockInvariant` después de cada test de `trade-ins.test.ts` |
| AC-10 | cumple | la pantalla del checklist con su auditoría; `org:capability --profile iphone` copia los diez puntos con la marca de ejemplo, en integración y en producción |
| AC-11 | cumple | el DNI y el Instagram validados y auditados, fuera del `viewer` y de los contratos del agente, exportados y vaciados, con el runbook de datos de un cliente; desde la revisión, solo con la capacidad (M-1) y con la prueba del vaciado (B-4) |
| AC-12 | cumple | el `viewer` en integración y en el end-to-end, sin el valor, el DNI ni el Instagram, y sin acciones |
| AC-13 | cumple, con una excepción declarada | sin `trade_ins` nada cambia, salvo el índice del IMEI, que U-2 decidió para toda organización con `serialized_units` (B-2); `trade_ins` sin `serialized_units` rechazada por el script; los cambios de forma de las suites existentes, en la desviación 7 |
| AC-14 | cumple | CI run 39620872230 en `success` sobre `43ce6fbe12164cd201871aeb1dad1f2a752e3b9e`: guardas 840, unitarias 1058, integración 1700 y end-to-end 282, con axe |
| AC-15 | cumple | revisión independiente del 2026-10-21, antes del despliegue (§«Lo que corrigió la revisión independiente») |
| AC-16 | cumple | desplegada (`43ce6fb`, 61 migraciones, la `0060` verificada en la base); el usuario activó `trade_ins` en «iPhone Demo» y recorrió el flujo: «todo perfecto». Recuentos después: «iPhone Demo» con las capacidades `variants`, `serialized_units`, `repairs` y `trade_ins`, 10 puntos de checklist, 1 recepción, 1 anulación y 1 cliente con DNI o Instagram; «Demostración Vixora» y «Vixora» sin capacidades, puntos, recepciones ni clientes con esos datos |

**Nivel alcanzado**: validado en integración (`producer-consumer`), desplegado y recorrido en producción sobre una organización demo. No hay negocio real.

### Lo que queda

- **La permuta y la compra de usados** (la 29.7.2) y **la cotización** (la 29.7.3), en Notion, en «Esperando». Hasta la 29.7.2, el valor reconocido se paga o se descuenta fuera del sistema.
- **Las correcciones de la revisión no tuvieron una segunda revisión independiente**: son autoevaluación, verificadas por sus pruebas y la CI.
- **El lint local** también revisa `.claude/skills/`, que Git ignora y la CI no ve: con una skill de terceros instalada ahí, `npm run lint` falla en la máquina local sin que el código del CRM tenga errores.

### El despliegue

Sin incidentes: la `0060` se aplicó antes de detener el servicio, y el build, con el heap de 1.536 MB, terminó a la primera. Producción estaba en la `0059`, así que la `0060` corrió sola (desviación 6). Después, el servicio activo, `/login` en 200 desde afuera, y `/usados` y `/clientes` redirigiendo al login sin sesión. Para volver atrás, `0967593`.
