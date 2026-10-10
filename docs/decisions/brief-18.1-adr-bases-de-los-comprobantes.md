---
schema: task-brief.v1
task_id: "18.1"
task_type: design
generated_at: 2026-10-10
---

# Brief 18.1 — ADR de las bases de los comprobantes

- **Contrato**: `task-brief.v1`
- **Tipo de tarea**: `design`. El resultado es un ADR y las enmiendas que ordene. No hay código, migraciones, dependencias ni cambios en la forma de ningún contrato.
- **Nivel de evidencia objetivo**: ninguno de ejecución. Lo que se afirme sobre normas fiscales (ARCA, IVA) se declara con su fuente y su nivel: «documentado por ARCA», «práctica habitual, sin fuente» o «pendiente». **El ADR no da asesoramiento fiscal**: fija cómo guarda los datos el CRM, y lo que dependa de la situación del negocio real queda abierto.
- **Nivel de validación alcanzable**: diseñado.
- **Orden**: primera subfase de la Fase 18, abierta el 2026-10-10 por decisión del usuario con la Fase 13 abierta ([ADR 0016](0016-el-crm-se-amplia-hacia-un-erp-por-fases.md), punto 3). Va antes de la 18.2 (costo y margen) porque la base del margen depende de cómo se trata el IVA (D-5).
- **No abre ni cierra un gate.** Fija las bases de las Fases 19 a 22; la revisión independiente se recomienda (D-9).
- **Estado de este documento**: **aprobado el 2026-10-10** por el usuario, con las recomendaciones de D-1 a D-10. La tarea 18.1 (`3f5702be6f4e81b2ae25f1a279d8793c`) está en «En proceso» en Notion desde ese día, con su autorización.

## Objetivo

Decidir, con un ADR, **cómo numera, en qué moneda expresa y cómo trata los impuestos** un comprobante del CRM, y **sobre qué base se calcula el margen** de un producto. El ADR **no crea tablas**: fija el diseño que van a usar las fases que emitan el primer comprobante.

## Lo que se verificó antes de escribir este brief

Releído el 2026-10-10:

- **El perímetro del Roadmap y la regla de las tablas vacías no son compatibles.** El Roadmap le asigna a la Fase 18 «la numeración de comprobantes por organización» y «la moneda y los impuestos (IVA) como datos de los comprobantes». El primer comprobante aparece en la Fase 19 (pedido) o en la 20 (venta). Una tabla de numeración o de alícuotas creada ahora no tendría quién la escriba ni quién la lea: eso lo prohíben `CLAUDE.md` («No crear tablas vacías ni módulos especulativos») y el ADR 0016, punto 2. **Decisión del usuario del 2026-10-10**: en la Fase 18 entran como decisiones del ADR, y las tablas, con el primer comprobante que las use.
- **El dinero ya tiene su forma**: `numeric(14, 2)` leído como `bigint` en centésimos con `src/shared/money/` (`Money`, `parseMoneyInput`, `formatMoney`), con la moneda ISO 4217 **por fila** y validada contra `Intl`, sin monedas de tres decimales ([DataModel](../architecture/DataModel.md) §`product_prices`).
- **El precio no dice si incluye impuestos.** `product_prices` es «el precio de venta» y DataModel dice que no tiene «impuestos ni costo» (regla 14); FR-PROD-12 tampoco lo aclara.
- **El agente lee ese precio y se lo dice a los clientes**: `price.amount` y `price.currency` en [read-v1](../contracts/read-v1.md) §Productos.
- **Un producto puede tener el precio en una moneda y, mañana, el costo en otra**: la moneda va por fila y cambiarla es fijar un precio nuevo. No hay tipos de cambio en el CRM.
- **`organizations`** tiene `name` y `timezone`; no tiene moneda ni condición fiscal.
- **La numeración que no deja huecos no sale de una secuencia de PostgreSQL**: un `nextval` no se devuelve si la transacción se revierte (documentado por PostgreSQL, §Sequence Manipulation Functions). El CRM ya usa el patrón de una fila bloqueada `FOR UPDATE` dentro de la transacción (`inventories`, brief-4.3.1).

### Hallazgos

- **H-1. Lo que diga el ADR sobre el IVA del precio fija qué significa un campo que el agente ya lee.** Si `product_prices.amount` es el precio final al consumidor, lo que el agente dice hoy es correcto. Si fuera un precio neto, el agente estaría cotizando sin IVA. La forma de `read-v1` no cambia en ningún caso, pero la semántica del campo sí: tiene que quedar escrita.
- **H-2. Con la misma alícuota en el precio y en el costo, el margen porcentual no cambia por incluir el IVA en los dos.** Precio 121 y costo 60,50 con IVA del 21 %: el margen es del 50 % sobre los montos con IVA y del 50 % sobre los netos (100 y 50). El que cambia es el **monto**: 60,50 con IVA frente a 50 neto. Esto vale solo cuando las dos alícuotas son iguales.
- **H-3. La condición frente al IVA depende del negocio real**, que no existe todavía (13.5.2-b). Un monotributista no discrimina el IVA y el que paga en sus compras es costo; un responsable inscripto lo discrimina y lo recupera (práctica habitual, sin fuente citada en este brief). El ADR no puede elegir por el negocio. Puede decidir dónde se guarda la condición y qué cambia según cuál sea.

## Decisiones

Cada una trae una recomendación. El usuario la aprueba, la cambia o la rechaza.

### D-1 — Qué decide el ADR y qué no

**Recomendada**:
- **Entran**: la numeración, la moneda de un comprobante, el tratamiento del IVA, que el comprobante es interno y no fiscal, la base del margen y qué se crea en cada fase.
- **No entran**: el diseño del pedido y de la venta (Fases 19 y 20), la factura electrónica de ARCA (un ADR propio, como dice el ADR 0016, punto 6), los tipos de cambio y las listas de precios (sin fase).

### D-2 — La numeración

- **(a) Recomendada**:
  - correlativa y **sin huecos**, por organización y por tipo de comprobante;
  - con un contador por `(organization_id, tipo)` en una fila bloqueada `FOR UPDATE`, dentro de la misma transacción que emite el comprobante. Si la transacción se revierte, el número no se consume;
  - el número se asigna al **emitir** y nunca se reutiliza. Un comprobante anulado conserva su número y se anula con otro ([ADR 0016](0016-el-crm-se-amplia-hacia-un-erp-por-fases.md), punto 4);
  - **se muestra con un prefijo por tipo**: por ejemplo, `P-000123` para un pedido. Los prefijos los fija la fase que crea cada tipo;
  - un solo punto de emisión por organización. Los puntos de venta llegan con ARCA, si llega.
- (b) Una secuencia de PostgreSQL por organización y tipo. Es más simple, pero deja huecos ante una reversión, y un hueco en la numeración se lee como un comprobante borrado.
- (c) Sin numeración propia: el `id` UUID como identificador. No se le puede dictar a un cliente por WhatsApp.

### D-3 — La moneda de un comprobante

**Recomendada**:
- **un comprobante tiene una sola moneda**, y cada línea la copia del precio vigente de su producto al emitirse;
- **una línea cuyo precio vigente está en otra moneda se rechaza**, con un mensaje que lo diga. Un producto sin precio también se rechaza;
- **no hay tipos de cambio**: entran sin fase, cuando el uso los pida (ADR 0016, punto 1);
- la moneda del comprobante no se guarda en `organizations`. No hace falta una moneda por defecto mientras la tomen las líneas.

### D-4 — El IVA

- **(a) Recomendada**:
  - **el precio de `product_prices` es el precio final al consumidor**, con los impuestos incluidos si corresponden. Es lo que el agente cotiza hoy (H-1), y se escribe en DataModel, en FR-PROD-12 y en `read-v1` como precisión, sin cambiar la forma;
  - **el comprobante guarda lo que valía al emitirse**: por línea, el precio unitario final, la cantidad y el total, y, si el negocio discrimina el IVA, la alícuota, el neto y el IVA. **Nunca se recalcula** a partir del producto;
  - **el redondeo es por línea, a centésimos, con el medio hacia afuera del cero**, y el total es la suma de las líneas;
  - **la condición de la organización frente al IVA** (responsable inscripto, monotributo o exento) **y la alícuota de cada producto** son datos que se crean **con la primera fase que los use**: la 20, si sus comprobantes discriminan el IVA, o la 18.2, si D-5 elige (b).
- (b) Precios netos, con el IVA sumado en el comprobante. Cambiaría la semántica de lo que el agente cotiza hoy, que ya se lee como final: exigiría coordinarlo con el agente y una versión nueva del contrato.

### D-5 — La base del margen (la usa la 18.2)

- **(a) Recomendada: sobre los montos tal como se cargan, con el costo en la misma base que el precio.**
  - El costo es lo que el negocio paga por la unidad, con los impuestos que no recupera.
  - El margen es el precio vigente menos el costo vigente, y su porcentaje se calcula **sobre el precio**.
  - **Si las monedas difieren, no hay margen**, y la pantalla lo dice.
  - **Límite que se escribe**: para un responsable inscripto con el precio y el costo en la misma alícuota, el porcentaje es exacto pero el monto incluye el IVA (H-2). Se revisa cuando la 13.5.2-b dé la condición del negocio real.
- (b) **Sobre montos netos**: exige la condición frente al IVA y la alícuota de cada producto en la 18.2, para un negocio que todavía no existe.
- (c) **El recargo sobre el costo**, en lugar del margen sobre el precio. Es otro número, `(precio − costo) / costo`; puede mostrarse junto al margen si el usuario lo prefiere.

### D-6 — Interno, no fiscal

**Recomendada**: repetir el punto 6 del ADR 0016 con lo que se haga concreto:
- todo comprobante del CRM lleva la leyenda «Documento no válido como factura»;
- su numeración es independiente de cualquier numeración de ARCA;
- el CRM no calcula percepciones, retenciones ni otros impuestos además del IVA.

### D-7 — Qué se crea y cuándo

**Recomendada**: una tabla de lo que el ADR decide y la fase en la que se crea, con la condición de que la crea **solo la fase que la usa**:
- el contador de numeración, con el primer tipo numerado (Fase 19 si el pedido lleva número, o Fase 20);
- la condición frente al IVA y la alícuota por producto, según D-4 y D-5;
- `product_costs`, en la 18.2.

### D-8 — Qué cambia en otros documentos cuando el ADR se acepta

**Recomendada**:
- **el Roadmap** §Fases 18 a 22: el perímetro de la Fase 18, con la decisión del 2026-10-10;
- **DataModel**: la regla 14 y §«Explícitamente fuera de este modelo», con una nota de diseño y sin tablas, y la semántica del precio (D-4) en §`product_prices`;
- **FunctionalRequirements**: FR-PROD-12, la precisión del precio final;
- **read-v1**: §Productos, la misma precisión, **sin cambio de versión** porque la forma no cambia. Si el usuario prefiere avisarle al agente, el aviso va en un archivo en el Escritorio, con autorización.

### D-9 — Revisión independiente

**Recomendada: sí**, antes de pedir la aceptación. La hace un agente de solo lectura contra este brief, los ADR 0013, 0014 y 0016, DataModel, `read-v1` y `src/shared/money/`. El ADR fija bases que van a usar cuatro fases.

### D-10 — Cuándo cierra

**Recomendada**: cuando el ADR esté aceptado o rechazado y las enmiendas de D-8 estén escritas.

## Alcance incluido

- `docs/decisions/0019-bases-de-los-comprobantes.md`, nuevo;
- este brief;
- con el ADR aceptado, las enmiendas de D-8: `docs/planning/Roadmap.md`, `docs/architecture/DataModel.md`, `docs/product/FunctionalRequirements.md` y `docs/contracts/read-v1.md`, este último solo con la precisión del precio;
- en el cierre: `CHANGELOG.md`, `HANDOFF.md` y `docs/decisions/README.md`.

## Alcance excluido

- **Código, migraciones, tablas, dependencias y cambios en la forma de un contrato.** El costo es de la 18.2; el resto, de las fases que lo usen.
- El diseño del pedido, de la venta, de la caja y de las compras.
- La factura electrónica de ARCA, los puntos de venta, las percepciones y las retenciones.
- Los tipos de cambio, las listas de precios y los descuentos.
- Cambios en el agente o en su repositorio.

## Fuentes de verdad

- Los ADR 0013 (solo inserción), 0014 (el agente como consumidor) y 0016 (el ERP por fases).
- DataModel §`product_prices` y §`inventories`, y `src/shared/money/`.
- `read-v1` §Productos y §Versionado.
- Roadmap §Fases 18 a 22 y Scope §Después de la integración: el ERP.

## Invariantes

1. **Ninguna tabla nueva** en esta subfase.
2. **La forma de `read-v1` no cambia**, y el CRM no llama al agente (ADR 0014).
3. **El dinero no pasa nunca por un `number`** y todo comprobante es de solo inserción (ADR 0016, punto 4).
4. **Ninguna afirmación fiscal se presenta como verificada** sin su fuente.

## Criterios de aceptación

- **AC-1**: el ADR 0019 responde D-2 a D-7, cada una con la decisión, las alternativas descartadas con su motivo y las consecuencias.
- **AC-2**: el ADR dice qué tabla crea cada fase y en cuál, y no crea ninguna en la 18.1.
- **AC-3**: el ADR fija la semántica del precio frente al IVA y dice por qué la forma de `read-v1` no cambia.
- **AC-4**: el ADR fija la base del margen que va a usar la 18.2, con su límite escrito y la condición para revisarlo.
- **AC-5**: cada afirmación fiscal lleva su fuente y su nivel, o se declara «pendiente».
- **AC-6**: hay una revisión independiente antes de pedir la aceptación, con cada hallazgo verificado.
- **AC-7**: con el ADR aceptado, las enmiendas de D-8 están escritas, fechadas y conservan el texto anterior, y no contradicen al ADR.
- **AC-8**: el usuario acepta o rechaza el ADR.

## Pruebas y evidencia requerida

No hay ejecución. La evidencia es documental: el ADR, las fuentes citadas, la revisión independiente con sus hallazgos verificados y los diffs de las enmiendas.

## Condiciones de detención

Detenerse y avisar si:

- el ADR necesita crear una tabla, cambiar la forma de un contrato o enmendar el ADR 0014, el 0016 o una prohibición de `CLAUDE.md`;
- hace falta tocar un archivo fuera de la lista;
- una afirmación fiscal en la que se apoya una decisión no tiene fuente y cambia la recomendación.

Pedir autorización explícita, en su turno, **antes de**: pasar la tarea 18.1 a «En proceso» en Notion, mandarle un aviso al agente, cada commit y push, y el cierre.

## Resultados

### El ADR propuesto

`docs/decisions/0019-bases-de-los-comprobantes.md`, escrito el 2026-10-10 como **propuesto**. Nivel: diseñado. Las fuentes fiscales se buscaron ese día. La página de ARCA sobre la RG 5614/2024 (novedad del 01/04/2025) se leyó; la exhibición del precio sin impuestos (Ley 27.743, art. 99) quedó **pendiente**, porque solo apareció en fuentes secundarias.

### Revisión independiente (D-9, AC-6)

La hizo el 2026-10-10 un agente que no participó del trabajo, con acceso de solo lectura. Fijó la escala antes de mirar. Veredicto: **R1**, con 9 hallazgos (2 bloqueantes, 3 medios, 2 bajos y 2 notas). No pudo abrir las URL de ARCA. Cada hallazgo se verificó contra los archivos citados, y los nueve se confirmaron y se resolvieron en el ADR.

- **R-1, bloqueante**: la definición del costo («con los impuestos que no recupera», en la misma base que el precio final) contradecía el límite escrito. Para un responsable inscripto, el costo neto contra el precio final daba un margen del 58,7 % en lugar del 50 %. **El error venía de este brief, D-5 (a).** Corrección: el costo se carga **con el IVA incluido, se recupere o no**, en la misma base que el precio. El límite escrito ahora corresponde a ese caso.
- **R-2, bloqueante**: «redondeo a centésimos» no sirve para las monedas sin decimales que el CRM ya acepta (`currencyDecimals`, CLP en `read-v1`). **El error venía de este brief, D-4 (a).** Corrección: el redondeo es a los decimales de la moneda del comprobante.
- **R-3, medio**: «la misma semántica de siempre» contradecía el contexto, según el cual el precio no decía nada. Corrección: el ADR fija la semántica por primera vez y explica por qué no es un cambio de v2 según §Versionado. Además, lo que hace el agente con el precio queda declarado como no verificado.
- **R-4, medio**: había dos afirmaciones fiscales sin nivel. Se sumaron a la tabla de fuentes: una como práctica habitual sin fuente y otra como pendiente.
- **R-5, medio**: no estaba dicho cómo nace la fila del contador. Ahora lo dice: `INSERT … ON CONFLICT DO NOTHING` y después el bloqueo, como `inventories`.
- **R-6, bajo**: faltaba la alternativa (c) de D-5. Queda para el brief de la 18.2.
- **R-7, bajo**: la moneda del comprobante es la de su primera línea.
- **R-8, nota**: si un pedido numerado es un comprobante emitido, con sus estados, queda como pregunta de la Fase 19.
- **R-9, nota**: el signo de los montos de una anulación queda para la fase que la cree.

**Las correcciones de R-1 y R-2 cambian el texto de dos recomendaciones aprobadas (D-4 y D-5)**, y se someten a la decisión del usuario junto con la aceptación del ADR (AC-8).

### Aceptación y enmiendas (AC-7, AC-8)

- **El usuario aceptó el ADR 0019 el 2026-10-10, con las correcciones de R-1 y R-2.**
- **El aviso al agente** sobre la semántica del precio (D-8) **queda para más adelante**, por decisión del usuario ese mismo día.
- **Enmiendas de D-8**, escritas el 2026-10-10, fechadas y sin borrar el texto anterior:
  - Roadmap §Fases 18 a 22: el perímetro de la Fase 18 tachado, el nuevo y las dos subfases;
  - DataModel: la regla 14, §`product_prices` y una nota en §«Explícitamente fuera de este modelo»;
  - FR-PROD-12;
  - `read-v1` §Productos: el campo `price`, sin cambio de versión.

El revisor también señaló que `HANDOFF.md` dice «Ninguna fase abierta», lo cual es falso desde la apertura del 2026-10-10. Según este brief, se actualiza en el cierre.

## Cierre

**Cerrada el 2026-10-10**, con la autorización del usuario de ese día, que cubrió el cierre, el commit, el push, Notion y el Knowledge Capture. AC-1 a AC-8 cumplidos:

- el ADR 0019 está aceptado y no crea ninguna tabla;
- la revisión independiente fue R1, con todos sus hallazgos verificados y resueltos;
- las enmiendas de D-8 están escritas.

La CI del commit de cierre se lee por `headSha`. Nivel: diseñado. La siguiente es la 18.2, con su brief.
