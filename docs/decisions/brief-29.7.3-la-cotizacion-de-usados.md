---
schema: task-brief.v1
task_id: "29.7.3"
task_type: implementation
generated_at: 2026-10-21
---

# Brief 29.7.3 — La cotización de usados

- **Contrato**: `task-brief.v1`
- **Tipo de tarea**: `implementation`. Migración, código, pruebas y despliegue.
- **Nivel de evidencia objetivo**: `deterministic` (tests contra PostgreSQL) y `producer-consumer` (pantallas ↔ servicio ↔ base, con end-to-end).
- **Estado**: **aprobado** por el usuario el 2026-10-21, con las recomendaciones: U-1 a U-5 en su opción recomendada (a).
- **Fuentes**: [ADR 0024](0024-rubros-y-capacidades.md), puntos 7, 9, 13, 14 y 16, y sus notas de la 29.7 y la 29.7.2; [brief-29.7](brief-29.7-la-recepcion-de-usados.md) (U-1, la división); [brief-29.6](brief-29.6-las-reparaciones-de-equipos-de-clientes.md) (la lista de reparaciones); [DataModel](../architecture/DataModel.md).

## Objetivo

Que un `admin` obtenga **la cotización orientativa de un usado** a partir de su producto (modelo y variante), su batería y su checklist, con la regla del ADR 0024, punto 9:

```
valor orientativo = precio de referencia del usado
                    − Σ costo estimado de cada reparación que necesita
                    − margen del equipo
```

El resultado es **un rango redondeado y no se guarda**. Y que la organización configure lo que la regla usa: los márgenes por modelo, los valores sueltos de la capacidad y el tipo de reparación de cada punto del checklist.

La función queda lista para que el agente la use en la 29.8. **Ningún contrato del agente cambia en esta subfase.**

## Hallazgos (verificados contra el código en `c15da41`, 2026-10-21)

- **H-1. Ningún precio está atado a un grado.** El grado vive solo en la unidad (`stock_units.grade_id`) y en el usado (`trade_ins.grade_id`). El precio es del producto (`product_prices`, el último vigente, `getCurrentPrices` de `catalog`), y cada combinación de modelo, condición, capacidad y color es un producto distinto. El ADR dice que el precio de referencia es «el del producto usado de ese modelo y variante, **con el grado de referencia del perfil**», pero no hay un precio por grado del que leerlo. Lleva a U-1.
- **H-2. El tipo de reparación de la batería no se identifica.** `repair_types` tiene nombre, orden, activo e `is_example`, sin clave ni marca. «Cambio de batería» existe solo como texto en el perfil (`profiles/iphone.ts:35`), y un `admin` lo puede renombrar. Lleva a U-2.
- **H-3. El checklist no tiene tipo de reparación.** `trade_in_checklist_items` no tiene la columna (brief-29.7: «el tipo de reparación de un punto lo suma la 29.7.3»). En el perfil, tres puntos coinciden por nombre con un tipo («Cámara trasera», «Cámara frontal», «Face ID»), y «Táctil» corresponde a «Cambio de pantalla». Los otros seis no tienen reparación.
- **H-4. Los precios de reparación son por modelo y no tienen ejemplos**: el perfil trae los tipos sin precios, porque los modelos son de cada negocio (brief-29.6). Por la misma razón, **el perfil no puede traer márgenes por modelo**, aunque el ADR dice que salen «de la copia del perfil (R-4)». Lleva a U-3.
- **H-5. El perfil se copia solo al activar la capacidad** (`scripts/activar-capacidad.ts:126-129`), y «iPhone Demo» ya tiene `trade_ins`: no recibiría los valores sueltos ni el tipo de reparación de su checklist. Es el mismo caso que el medio «Permuta» de la 29.7.2 (H-7). Lleva a U-4.
- **H-6. `tradeins` no puede importar `service` hoy.** La guarda `tradeins-dependencies.test.ts` lo marca como violación, con un caso de prueba que lo afirma. El ADR 0024, punto 16, sí lo permite, «solo para leer los costos de reparación de la cotización». Del otro lado, la regla 2 de `service-dependencies.test.ts` y el Overview (fila de `service`) dicen «solo `cash` depende de `service`»; la fila de `tradeins` del Overview ya anticipa que «la 29.7.3 suma `service`». Las dos guardas y las dos filas se actualizan según el ADR, sin decisión nueva. Las funciones de `service` que leen precios exigen `repairs` (`requireRepairs`).
- **H-7. No existe una tabla de valores sueltos por capacidad.** El precedente más cercano es `exchange_rate_settings` (`fx`): una fila por organización, con columnas tipadas y su trigger.
- **H-8. Datos en producción** (consulta de solo lectura, 2026-10-21): «iPhone Demo» tiene 2 productos usados con modelo y precio, 6 precios de reparación y 10 puntos de checklist. «Demostración Vixora» y «Vixora» no tienen ninguno.

## Decisiones del usuario

**Decididas el 2026-10-21, las cinco con la opción recomendada (a).** Las opciones, como se presentaron:

- **U-1, el precio de referencia** (H-1).
  - **(a) Recomendada. El precio vigente del producto usado elegido**, sin grado. El grado de referencia no se crea. La pantalla dice de qué producto y de qué fecha es el precio. Una nota fechada en el ADR 0024, punto 9, registra que el grado sale de la fórmula. **Por qué**: el negocio ya fija un precio por producto usado, y un precio por grado sería un diseño nuevo que nadie pidió.
  - (b) Un descuento por grado en los valores sueltos: el precio del producto vale para el grado de referencia, y cada otro grado descuenta un monto. Suma una tabla y una pregunta para el negocio, que todavía no dio sus valores (R-4).
- **U-2, la reparación de la batería** (H-2).
  - **(a) Recomendada. Una columna en los valores sueltos, `battery_repair_type_id`**, que el perfil llena con «Cambio de batería» por nombre al copiarse, y que un `admin` cambia. **Por qué**: no depende de que nadie renombre el tipo.
  - (b) Buscar el tipo por su nombre en cada cotización. Se rompe en silencio si el `admin` lo renombra.
- **U-3, los márgenes sin ejemplos** (H-4).
  - **(a) Recomendada. Un margen por modelo, como dice el ADR, sin ejemplos**: un `admin` lo carga por modelo. **Un modelo sin margen no tiene cotización**, y la pantalla lo dice. **Por qué**: es lo diseñado. Es el mismo criterio que los precios de reparación de la 29.6, y una nota fechada en el ADR lo registra.
  - (b) Un margen por defecto en los valores sueltos, con un ejemplo, que cada modelo puede reemplazar. Cotiza desde el primer día, pero con un valor que nadie fijó.
- **U-4, la organización que ya tiene `trade_ins`** (H-5).
  - **(a) Recomendada. Lo completa `org:capability`**, al activar `trade_ins` y al volver a correrlo con la capacidad ya activa, igual que el medio «Permuta» (29.7.2, U-4):
    - crea la fila de valores sueltos si falta, con los valores de ejemplo;
    - pone el tipo de reparación del perfil en los puntos del checklist que todavía no tienen uno, buscándolos por nombre.

    Las dos cosas se auditan con el `admin` como autor, y no pisan nada que un `admin` ya haya cambiado. El usuario lo corre en «iPhone Demo» después del despliegue.
  - (b) Que lo escriba la migración `0062`, sin autor en la auditoría.
- **U-5, dónde aparece la cotización.**
  - **(a) Recomendada. Una pantalla propia, «Cotizar»**, en Usados, solo para un `admin`:
    - un formulario `GET` con el producto usado, la batería y el checklist;
    - el resultado: el rango, la marca de orientativa y el desglose (precio, cada reparación con su costo, el margen), o el motivo por el que no hay cotización;
    - no escribe nada y no se audita; funciona sin JavaScript.

    **Por qué**: es lo más chico que deja probar la regla antes de dársela al agente en la 29.8.
  - (b) Además, que la recepción de un usado proponga el valor reconocido a partir de la cotización. Cambia el formulario de la 29.7 y mezcla un cálculo orientativo con un compromiso (ADR 0024, punto 9).

## Decisiones

### D-1 — Los valores sueltos: `trade_in_settings` (ADR 0024, punto 13; H-7)

- **Una fila por organización** con `trade_ins`, de `tradeins`, con columnas tipadas y su `CHECK`:
  - **el umbral de batería**, un entero de 1 a 100 (ejemplo: 80);
  - **el porcentaje del rango**, de 0 a 50, con dos decimales (ejemplo: 10);
  - **el paso del redondeo**, un monto mayor que cero con su moneda (ejemplo: 10 USD);
  - **el tipo de reparación de la batería**, nulo o un `repair_types` de la organización (U-2 (a));
  - **`is_example`**, verdadero hasta que un `admin` cambia algo.
- **La edita un `admin`**, con auditoría `update` (entidad `trade_in_settings`), en una pantalla de configuración de Usados. **No se borra.**
- **El perfil** suma los valores de ejemplo y el nombre del tipo de reparación de la batería. Se copian según U-4.

### D-2 — Los márgenes: `trade_in_margins` (ADR 0024, puntos 9 y 13)

- **Una fila por organización y modelo**, de `tradeins`, con el monto (mayor o igual que cero) y su moneda. Clave foránea compuesta a `product_models`, y un único por modelo.
- **La carga y la cambia un `admin`**, auditado (entidad `trade_in_margin`, `create` y `update`), en la misma pantalla de configuración, con un modelo por vez, como la lista de reparaciones. **No se borra**: un margen en cero es un margen.
- **Sin ejemplos** (U-3 (a)).

### D-3 — El tipo de reparación de un punto (ADR 0024, punto 9; H-3)

- **`trade_in_checklist_items.repair_type_id`**, nulo o un `repair_types` de la organización, con clave foránea compuesta. La pantalla del checklist suma el campo, con auditoría. Una organización sin `repairs` no ve el campo, y la columna queda nula.
- **El perfil** suma a cada punto el nombre de su tipo: «Cámara trasera», «Cámara frontal» y «Face ID», con el tipo del mismo nombre, y «Táctil» con «Cambio de pantalla». Se aplica según U-4.
- **Un punto que falla sin tipo de reparación no descuenta nada.** El ADR lo dice así, y la pantalla del checklist lo explica.

### D-4 — La regla: `quoteTradeIn` (ADR 0024, punto 9)

Una función de `tradeins`, sin escritura. **La entrada**: el producto usado, la salud de la batería y, por cada punto activo del checklist, si pasó o no.

- **Rechazos de la entrada**, con su nombre: un producto que no es usado o no se lleva por unidad, o que no tiene modelo (`product_not_quotable`); un punto que no es de la organización o falta (`checklist_incomplete`); una batería fuera de 0 a 100.
- **Un punto obligatorio que falla** da «no se recibe» (`mandatory_failed`, con el nombre), como la recepción.
- **El cálculo**, con montos exactos en centavos, nunca `number`:
  - el precio de referencia, según U-1;
  - más cada punto que falla y tiene tipo, el costo estimado de ese tipo para el modelo (`repair_prices.cost`);
  - más la batería por debajo del umbral, el costo del tipo de la batería;
  - un tipo que aparece dos veces se cuenta una vez;
  - menos el margen del modelo.
- **No hay cotización**, con el motivo, si falta un dato: sin precio vigente (`no_reference_price`), sin margen (`no_margin`), una reparación necesaria sin costo, nombrándola (`no_repair_cost`), sin tipo de batería con la batería bajo el umbral (`no_battery_repair_type`). Tampoco si los montos no están todos en la misma moneda (`currency_mismatch`, R-12), contando también la del paso del redondeo, ni si el valor da cero o menos (`not_positive`).
- **El rango**: el valor y el valor menos el porcentaje, **los dos redondeados hacia abajo al múltiplo del paso** (R-21). Si el piso queda en cero, el rango es «hasta» el techo.
- **No se guarda** (ADR 0024, punto 9).
- **Los costos los lee de `service`** con una función nueva de solo lectura, por modelo y tipos. **`tradeins` suma `service` a sus dependencias** (ADR 0024, punto 16; H-6), solo para eso. Sin `repairs`, no hay costos, y una reparación necesaria da `no_repair_cost`.

### D-5 — Las pantallas (U-5)

- **«Cotizar»** en el submenú de Usados, solo para un `admin`, según U-5 (a). Si algún valor que usó la cotización es de ejemplo, lo marca.
- **«Configuración»** en el mismo submenú, solo para un `admin`: los valores sueltos y los márgenes por modelo, con la marca de ejemplo.
- **El checklist** suma el tipo de reparación de cada punto (D-3).
- **Un `viewer` no ve** ninguna de las tres: el desglose deja ver costos y márgenes (ADR 0024, punto 14).

### D-6 — La migración `0062`

- `trade_in_settings` y `trade_in_margins`, con sus claves compuestas, sus `CHECK` y `SELECT`, `INSERT` y `UPDATE` para `crm_app`, sin `DELETE`.
- `trade_in_checklist_items.repair_type_id`, con su clave foránea compuesta a `repair_types`.
- `audit_entity_type` suma `trade_in_settings` y `trade_in_margin`, sin usarlos en la misma migración.
- **Sin datos** (U-4 (a)). Corre sola sobre una base en la `0061` confirmada.

### D-7 — Roles, datos personales y el agente

- **Solo un `admin`** cotiza y configura. Un `viewer` no ve márgenes, costos ni cotizaciones.
- **El agente no ve nada** de esta subfase. La cotización para el agente, con su contrato y la regla de «no cotiza con un valor de ejemplo en una organización con tráfico real», es de la 29.8.
- **No hay datos personales**: la cotización no lleva cliente, y nada se guarda.

### D-8 — Pruebas

- **Unitarias**: la regla, con cada término; el redondeo hacia abajo en los dos extremos; el piso en cero; un tipo repetido contado una vez; cada motivo de «no hay cotización»; montos con centavos.
- **Integración**:
  - `quoteTradeIn` contra la base, con los precios de `catalog` y los costos de `service`;
  - cada rechazo y cada motivo por su nombre;
  - los valores sueltos y los márgenes: la escritura, la auditoría y los `CHECK`;
  - el tipo de reparación de un punto, de otra organización rechazado;
  - `org:capability` crea los valores sueltos y completa los tipos al activar y al volver a correr, sin pisar lo cambiado;
  - sin `trade_ins`, nada cambia; sin `repairs`, la cotización que necesita una reparación da `no_repair_cost`;
  - el `viewer`;
  - la migración `0062` sola sobre una base en la `0061` confirmada.
- **Las guardas**: `tradeins` importa `service`, y nada más nuevo; `service` sigue sin importar `tradeins`. Las acciones nuevas entran en la guarda de superficie.
- **End-to-end**: cotizar con una reparación y la batería baja; un motivo de «no hay cotización»; cargar un margen y un valor suelto; el tipo de reparación de un punto; el `viewer` sin acceso; 375 px; sin JavaScript; axe.
- **Las suites existentes** pasan sin cambios de conducta.

### D-9 — Revisión, despliegue y cierre

- **Revisión independiente** antes del despliegue (`CLAUDE.md`).
- **Despliegue** con el servicio detenido durante el build y el heap de 1.536 MB.
- **En «iPhone Demo»**: el usuario corre `org:capability --profile iphone` (U-4 (a)), carga el margen de un modelo y cotiza.
- **Recorrido del usuario.**
- **Cierre**:
  - DataModel, FR nuevos y Overview, con la arista `tradeins → service`;
  - la nota fechada del ADR 0024, puntos 9 y 13, con U-1 a U-5;
  - runbook de alta, CHANGELOG, HANDOFF, Roadmap, Notion y Knowledge Capture.

## Alcance incluido

Todo lo de D-1 a D-9.

## Alcance excluido

- **El contrato del agente** y la cotización por el agente: la 29.8.
- **Guardar una cotización**, o usarla para proponer el valor de una recepción (U-5 (b)).
- **Un precio por grado** (U-1 (b)) y un margen por defecto (U-3 (b)).
- **Convertir monedas** en la cotización: con monedas distintas no hay cotización (R-12).
- **Cambiar la recepción, la permuta o la compra** de la 29.7 y la 29.7.2.
- **La garantía y los turnos** (29.9 y 29.10).

## Invariantes

- La cotización **no escribe nada**: ni filas, ni auditoría, ni contadores.
- **Ningún monto pasa por `number`**: centavos en `bigint` o texto, como el resto de `src/shared/money`.
- **`tradeins` importa `service` solo para leer costos.** `service` no importa `tradeins`. Ningún módulo del núcleo importa `tradeins`, salvo `cash`.
- **Sin `trade_ins`, nada cambia**: las páginas responden 404 y las acciones, `NOT_FOUND`.
- Un `viewer` y el agente no ven costos, márgenes ni cotizaciones.
- Lo que un `admin` ya cambió, `org:capability` no lo pisa.

## Criterios de aceptación

- **AC-1**: con un producto usado con precio, margen y costos en la misma moneda, `quoteTradeIn` da el rango de la regla, redondeado hacia abajo en los dos extremos, y el desglose.
- **AC-2**: cada punto que falla con tipo suma el costo de ese tipo para el modelo, y la batería bajo el umbral suma el tipo de la batería; un tipo repetido cuenta una vez; un punto sin tipo no descuenta.
- **AC-3**: cada motivo de «no hay cotización» de D-4 y cada rechazo de la entrada tienen su nombre, y nombran lo que falta.
- **AC-4**: la cotización no escribe nada, probado contra la base (filas y auditoría antes y después).
- **AC-5**: un `admin` edita los valores sueltos y los márgenes, con auditoría y sus `CHECK`; nada se borra; la marca de ejemplo se apaga al cambiar un valor.
- **AC-6**: el tipo de reparación de un punto se fija y se cambia con auditoría; uno de otra organización se rechaza.
- **AC-7**: `org:capability` crea los valores sueltos y completa los tipos del checklist al activar y al volver a correr con `trade_ins` activa, una sola vez, auditado y sin pisar lo cambiado (U-4).
- **AC-8**: un `viewer` no ve «Cotizar», «Configuración» ni el tipo de reparación; el agente no ve nada nuevo.
- **AC-9**: las guardas permiten `tradeins → service` y nada más nuevo; `service` no importa `tradeins`.
- **AC-10**: sin `trade_ins` nada cambia; las suites existentes pasan sin cambios de conducta, salvo los de forma que declare la implementación.
- **AC-11**: la `0062` corre sola sobre una base en la `0061` confirmada con datos, probado.
- **AC-12**: guardas, unitarias, integración y end-to-end pasan en CI, con axe sin violaciones.
- **AC-13**: la revisión independiente se hizo antes del despliegue, con cada hallazgo verificado.
- **AC-14**: desplegada, los valores sueltos y los tipos completados en «iPhone Demo», un margen cargado y una cotización recorrida por el usuario; «Demostración Vixora» y «Vixora» intactas.

## Pruebas y evidencia requerida

Las de D-8, más la CI en verde sobre el SHA desplegado y los recuentos por organización después del recorrido.

## Condiciones de detención

Pedir autorización explícita, en su turno, **antes de**:
- el commit, el push y el despliegue;
- migrar una base real;
- correr `org:capability` en producción, si no lo corre el usuario.

**Detenerse y consultar** si:
- `tradeins` necesita de `service` algo más que leer costos, o `service` necesita importar `tradeins`;
- la cotización necesita guardar algo o convertir monedas;
- el precio de referencia necesita algo más que el precio vigente del producto (U-1);
- un módulo del núcleo necesita cambiar fuera de lo que lee la cotización;
- una suite existente cambia de conducta.

## Implementación

### Desviaciones y decisiones de implementación

Registradas al implementar, el 2026-10-21, para la revisión independiente. *Corregido por la revisión (B-1)*: la frase siguiente decía que ninguna toca una condición de detención, pero `listRepairTypes` sí la tocaba («algo más que leer costos»), y se debió consultar; el usuario la aceptó después. `tradeins` toma de `service` solo `getRepairCostsForQuote` y `listRepairTypes`, y de su esquema `repairTypes`; `service` no importa `tradeins`; la cotización no guarda ni convierte, y el precio de referencia es solo el precio vigente del producto.

1. **Sin `checklist_incomplete`.** D-4 lo nombraba como rechazo de la entrada. La cotización recibe el checklist como la recepción (`createTradeIn`): los puntos que pasaron, por id. Un punto activo que no viene no pasó, y un id que no es de la organización se ignora. No hay un estado «sin responder» que rechazar.
2. **Un motivo más, `no_settings`**: una organización con `trade_ins` y sin la fila de valores, porque la activó sin el perfil o antes de volver a correr el script. La pantalla manda a Configuración, y **guardar los valores crea la fila** si falta (`create`), con el `admin` como autor.
3. **La entrada es el producto, no el modelo.** El producto usado ya es una variante (modelo, capacidad y color), y el modelo sale de él. El formulario ofrece solo los usados por unidad con modelo. Un producto sin modelo, nuevo o por cantidad es `product_not_quotable`.
4. **Sin `repairs`, una reparación necesaria se nombra por sus puntos**: `getRepairCostsForQuote` no devuelve tipos sin la capacidad, así que el motivo `no_repair_cost` lleva los nombres de los puntos que la piden.
5. ~~**La copia del perfil completa un punto sin reparación aunque un `admin` se la haya sacado**: el script no distingue un punto que nunca tuvo una de uno que la perdió. No pisa un punto con otra reparación, ni los valores sueltos que ya existen. Lo prueba `variants.test.ts`, y lo dice el runbook.~~ *Corregida por la revisión independiente (B-2)*: contradecía U-4. La copia vincula los puntos solo en la corrida que crea los valores.
6. **El `update` de un punto que hace la copia del perfil no lleva `origen: "perfil"`**: la auditoría exige los mismos campos en `before` y `after`. El `create` de los valores sí lo lleva. Lo encontró la integración.
7. **«De ejemplo» en la cotización refleja solo los valores sueltos** (`trade_in_settings.is_example`). Los tipos de reparación y los puntos del perfil tienen su propia marca en sus pantallas.
8. **El rango**: si el techo redondeado da cero, es `not_positive`; si el piso da cero, la pantalla dice «Hasta» el techo.
9. **La guarda de `tradeins` es más estricta que el brief**: además de permitir `service`, fija los dos nombres que se importan, con `import` nombrado, y el único del esquema. La de `service` suma `tradeins` a quienes lo importan. La de `capability-reads` suma `applyQuoteTemplate` (solo `tradeins`) y `repairTypeIdsByName` (solo `service`): las nombra solo el script, que resuelve los tipos por nombre y le pasa los ids a `tradeins`.
10. **Cambios de forma en suites existentes**, declarados por AC-10:
    - en integración, `audit.test.ts` (las tablas sin borrado) e `identity-schema.test.ts` suman las dos tablas;
    - `variants.test.ts` suma lo que el script imprime y escribe con el perfil;
    - las guardas `tradeins-dependencies`, `service-dependencies`, `capability-reads` y `exposed-surface`, como dice el punto 9 y las tres acciones nuevas;
    - **en end-to-end, cuatro specs suman tablas a su `TRUNCATE`**: `repairs.spec.ts` y `repairs-own-units.spec.ts` vacían `repair_types`, que ahora referencian `trade_in_settings` y `trade_in_checklist_items`; `trade-ins.spec.ts` y `trade-in-payments.spec.ts` suman las dos tablas nuevas. Sin eso, PostgreSQL rechaza el `TRUNCATE` aunque las tablas estén vacías.

### Revisión independiente

El 2026-10-21, el agente `independent-reviewer`, de solo lectura, que no participó del trabajo, revisó los cambios sin commit sobre `c15da41` contra este brief, el ADR 0024 y las reglas vigentes. Fijó la escala de severidad antes de mirar. Encontró **2 bloqueantes, 2 no bloqueantes y 8 observaciones**. Cada hallazgo se verificó contra el código antes de aceptarlo, y los cuatro que pedían una decisión los decidió el usuario.

- **B-1, bloqueante, aceptado.** `tradeins` usa también `listRepairTypes` de `service` (`checklist.ts` y `quote.ts`). D-4 y el ADR 0024, punto 16, decían «solo para leer los costos», y la condición de detención pedía consultar. Se declaró como desviación en lugar de consultarlo. **El usuario la aceptó**, y queda en una nota fechada del ADR 0024. Se corrigieron el DataModel, el Overview y `tradeins/index.ts` (NB-1).
- **B-2, bloqueante, corregido.** `org:capability` le devolvía la reparación a un punto al que un `admin` se la había sacado, y eso contradecía U-4 y AC-7. **El usuario eligió vincular los puntos solo en la corrida que crea los valores** (`applyQuoteTemplate`). `variants.test.ts` ahora prueba que «Face ID» queda sin reparación en la tercera corrida. También se corrigieron el runbook, el comentario del script y la desviación 5.
- **NB-1, corregido**, con B-1.
- **NB-2, corregido.** El DataModel decía que el orden de los motivos estaba en D-4, que es solo una lista. Ahora el DataModel fija el orden del código.
- **O-1, corregido.** Sin `repairs`, una reparación pedida solo por la batería se llama «Batería» y no queda sin nombre.
- **O-2, aceptado por el usuario.** Guardar la configuración, aunque sea sin cambios, apaga «De ejemplo»: guardar es confirmar los valores. D-1 y AC-5 decían «al cambiar un valor».
- **O-3, aceptado por el usuario.** Queda sin `checklist_incomplete` (desviación 1). Se vuelve a mirar con el contrato del agente, en la 29.8.
- **O-4, corregido.** En el desglose, cada par `dt`/`dd` va en su `div`.
- **O-5, corregido.** «Ir a la configuración» aparece solo para los motivos que se arreglan ahí: los valores sueltos, el margen, la moneda y el valor no positivo.
- **O-6, corregido.** El comentario de los perfiles ahora dice que volver a correr el script completa lo que falta.
- **O-7, aceptado sin cambio.** Sin JavaScript se recorren la cotización y la configuración desbordada. Los formularios con `useActionState` siguen el patrón de las subfases anteriores.
- **O-8.** La deduplicación de un tipo repetido vive en `quoteTradeIn` y la cubre la integración, no la unitaria. `.claude/settings.json` no entra en el commit.
