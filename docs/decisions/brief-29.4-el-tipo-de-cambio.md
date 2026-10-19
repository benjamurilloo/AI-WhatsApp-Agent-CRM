---
schema: task-brief.v1
task_id: "29.4"
task_type: implementation
generated_at: 2026-10-18
---

# Brief 29.4 — El tipo de cambio

- **Contrato**: `task-brief.v1`
- **Tipo de tarea**: `implementation`. Migración, código, pruebas y despliegue.
- **Nivel de evidencia objetivo**: `deterministic` (tests contra PostgreSQL) y `producer-consumer` (pantallas ↔ servicio ↔ base, con end-to-end).
- **Nivel de validación alcanzable**: validado localmente y en CI, validado en integración, y desplegado y recorrido por el usuario en la organización demo «iPhone Demo».
- **Orden**: tercera subfase de construcción de la Fase 29, según el [ADR 0025](0025-tipo-de-cambio.md), punto 13, que divide el tipo de cambio en 29.4, 29.4.2 y 29.4.3. En Notion, la tarea `3fd702be6f4e81848227fe4d2fa7b0c1` está en «En proceso» desde el 2026-10-18.
- **No abre ni cierra un gate.**
- **Estado de este documento**: **aprobado el 2026-10-18** por el usuario, con las recomendaciones de D-1 a D-14.

## Decisión del usuario que abre la construcción

La misma de la 29.2: **el 2026-10-18 el usuario decidió construir la Fase 29 sin el negocio confirmado**, sobre la organización demo «iPhone Demo» ([brief-29.2](brief-29.2-capacidades-y-variantes.md), §Decisión del usuario). Ese día pidió seguir con la 29.4.

## Objetivo

Que una organización con moneda principal **cobre en pesos lo que vende en dólares, sin que la cuenta del cliente ni la caja mientan**:

- la moneda principal de la organización, fijada por quien opera el CRM;
- la cotización cargada a mano por un `admin`, con su historial;
- una sola función de conversión, sin `number`;
- el cobro de una venta, la seña de un pedido y el cobro a cuenta recibidos en la otra moneda, con su anulación: **la cuenta usa lo aplicado y la caja cuenta lo recibido**;
- los totales de referencia de la caja y de las cuentas de clientes.

**La lectura automática de DolarAPI no entra**: es la 29.4.2. Hasta entonces, la cotización es manual.

## Lo que se verificó antes de escribir este brief

Releído el 2026-10-18 contra `main` (`64c7988`). Dos relevamientos de solo lectura del código citaron cada punto, y los centrales se volvieron a leer.

- **`organizations`** tiene solo `id`, `name`, `timezone` y fechas (`organizations/schema.ts:13-26`): **no hay moneda**. No hay una función que devuelva la organización entera; cada dato tiene su lectura (`getOrganizationTimezone`, `service.ts:347`). `crm_app` ya tiene `UPDATE` sobre `organizations` (`0003:15`).
- **El dinero**: `Money` es `bigint` en centésimos, `MAX_AMOUNT = 99_999_999_999_999n`, y `src/shared/money/` rechaza los negativos (`index.ts:7, 12, 17, 112`). El redondeo con el medio hacia afuera del cero es privado de `src/shared/lines/line-total.ts:12-22`, y la copia exportada vive en `catalog/margin.ts:39`, que `src/shared` no puede importar. **`fast-check` no está instalado**: no hay tests de propiedades en el proyecto.
- **`receipts`** (`0043`, `0044`, `0046`; `cash/schema.ts:305-393`): `currency` y `amount` son la moneda y el monto del destino; `target` es `sale`, `order` o `account`; `receipts_amount_positive`; el trigger `receipts_check_cash_session` exige sesión para un medio en efectivo. Es de solo inserción.
- **La anulación vive en `receipt_voids`** (`0045:15-31`), y **su trigger compara, no copia** (`0045:128-161`): rechaza la fila si `currency` o `amount` difieren del cobro. El servicio escribe los valores (`service.ts:2373-2383`).
- **Los tres cobros**:
  - `createSaleReceipt` (`service.ts:1983-2047`): moneda de la venta (2013, 2037); tope por lo que falta (2016-2018);
  - `createOrderReceipt` (2075-2156): moneda del pedido (2113, 2146); tope por el total menos las señas (2117-2128);
  - `createAccountReceipt` (3969-4014): **la moneda la elige la persona entre todas las aceptadas** (3868-3869), y **no tiene tope**: lo que excede la deuda queda a favor (3889-3891).
  - Los tres son de `admin` (1987, 2079, 3973), leen el monto **en la moneda del destino** con `readPayment` (1860-1895) y controlan el máximo de la caja con `exceedsCashLimit` (1912-1929), también **en la moneda del destino**.
- **La caja**: `computeCashTotals` (`totals.ts:58-124`) recibe pares de moneda y monto, y **un solo armador**, `readTotalsInput` (`service.ts:447-506`), la alimenta para sus tres usos (la caja, la vista previa del cierre y el detalle de una sesión). Además leen `currency` y `amount` de los cobros para la caja: `findSessionReceiptVoids` (`repository.ts:1048-1062`), `findLateVoids` (1094-1142) y las tablas de la sesión (`caja/session-tables.tsx`).
- **La imputación**: `imputeAccount` (`imputation.ts:90`) trabaja una moneda por pasada (122) y lanza `InconsistentAccount` si un cobro de una venta está en otra moneda (110-119). La ficha del cliente, su estado de cuenta y la lista de deudores pasan por ella (`service.ts:1633-1640, 3534, 3745, 4116-4227`).
- **Los formularios con moneda**: el precio y el costo de un producto, la orden de compra y la recepción ofrecen todas las monedas con la primera opción vacía; el cobro a cuenta propone la de la venta con saldo más vieja; la apertura de caja, la del último cierre (`productos/[productId]/precios/page.tsx:48-64`, `compras/ordenes/nueva/purchase-order-form.tsx:100`, `cash/service.ts:4029-4070, 1283-1307`).
- **No hay pantalla de configuración de la organización.** Lo de un `admin` vive en cada sección: los medios de pago en `/caja/medios-de-pago`, el horario en `/informacion/horario`.
- **La auditoría**: `audit_entity_type` es un enum de PostgreSQL (`audit/schema.ts:20-59`); un tipo nuevo es un `ALTER TYPE … ADD VALUE` en la migración. El alta de un cobro audita moneda y monto (`service.ts:1933-1961`); la anulación, no.
- **Las guardas**: `cash-writes.test.ts` fija quién inserta cobros y anulaciones; `exposed-surface.test.ts` declara cada Server Action; `deployment-hostnames.test.ts` rechaza hosts externos en `src/`; `purchasing-dependencies.test.ts` es la única guarda de dependencias de un módulo, y `module-boundary.test.ts` prueba ESLint por módulo.
- **«Permuta» y USDT no existen** en el código. La permuta es de la 29.7.
- **La próxima migración** es la `0053`.

### Hallazgos

- **H-1. La anulación necesita las columnas nuevas.** `receipt_voids` no las tiene, y su trigger solo compara moneda y monto. Sin sumarlas, una anulación no sabe cuántos pesos devuelve la caja.
- **H-2. La caja lee el monto en más lugares que `computeCashTotals`**: `findSessionReceiptVoids`, `findLateVoids`, las tablas de la sesión y el control del máximo (`exceedsCashLimit`). El ADR nombra solo dos controles. Cada uno tiene que leer lo recibido.
- **H-3. El monto se lee en la moneda del destino.** `readPayment` lo interpreta con los decimales del destino, y tiene que interpretarlo con los de la moneda recibida.
- **H-4. El cobro a cuenta ofrece todas las monedas, sin tope.** La regla del ADR (punto 5, R-M2: la moneda aplicada es la principal, o la otra si hay saldo en ella) es nueva para el servicio y para la pantalla.
- **H-5. «iPhone Demo» ya tiene precios en USD.** El ADR dice que **cambiar** la moneda principal con datos no se permite. Fijarla **por primera vez** en una organización con datos no la cambia, pero el texto no lo distingue (D-2).
- **H-6. No hay una pantalla donde viva la cotización** (D-4).
- **H-7. Sin `fast-check`**, los tests de propiedades del ADR (punto 3) necesitan una dependencia nueva o un generador propio (D-5).
- **H-8. `src/shared/money/` no puede reusar el redondeo de `catalog`**, y el de `line-total.ts` es privado (D-5).
- **H-9. La fuente `dolarapi_blue` no tiene lector hasta la 29.4.2.** Si la 29.4 la ofrece, el `admin` la elige y nada pasa (D-3).

## Decisiones

Cada una trae una recomendación. El usuario la aprueba, la cambia o la rechaza.

### D-1 — Qué entra y qué no

**Recomendada**:

- **Entran**:
  - el módulo `fx`, con su guarda de dependencias;
  - `organizations.main_currency` y su lectura;
  - `exchange_rate_settings` y `exchange_rates`, solo con lo manual (D-3);
  - la pantalla de la cotización: la vigente, la carga manual y el historial;
  - la conversión en `src/shared/money/`, con sus pruebas de propiedades;
  - el cobro de una venta, la seña y el cobro a cuenta recibidos en la otra moneda, con la cotización vigente o una negociada, y su anulación;
  - la caja contando lo recibido, y los totales de referencia de la caja, el cierre, el historial, la ficha del cliente, su estado de cuenta y la lista de deudores;
  - la moneda principal propuesta primero en los formularios;
  - el script de la moneda principal.
- **No entran**:
  - la lectura automática, el lector, su rol, su credencial, el ajuste y `last_confirmed_at` (29.4.2);
  - las devoluciones, los pagos a proveedores, sus anulaciones y el total de referencia de las cuentas de proveedores (29.4.3);
  - la permuta (29.7) y su regla de moneda;
  - cambios en `read-v1`, `read-v2` o el agente (29.8);
  - convertir precios o líneas de un comprobante.

### D-2 — La moneda principal (H-5)

- **(a) Recomendada**:
  - **`organizations.main_currency`**, `text` opcional con `CHECK (^[A-Z]{3}$)`; el servicio exige que sea de `acceptedCurrencies()`;
  - **`getMainCurrency(organizationId)`** en `organizations/index.ts`, como la zona horaria;
  - **el script `npm run org:currency`** fija la moneda principal y crea la configuración de la cotización (la otra moneda y la fuente `manual`) **en una transacción**, con un `admin` de la organización como autor auditado, como `org:capability`;
  - **fijarla por primera vez se permite aunque la organización tenga datos**: no cambia ningún monto guardado, solo suma propuestas y totales de referencia. **Cambiar una moneda principal ya fijada se rechaza**, como dice el ADR, y no hay comando para quitarla. Se registra como nota fechada en el ADR 0025, punto 2, al cerrar;
  - en esta subfase, la **otra moneda** es una sola y distinta de la principal, y el par tiene que cumplir `rate >= 1` (ADR, punto 3): para «iPhone Demo», **USD** y **ARS**.
- (b) Exigir una organización sin datos, como dice el texto literal. «iPhone Demo» no podría tener moneda principal sin borrar su catálogo, y los precios son de solo inserción.

### D-3 — La cotización, solo manual (H-9)

- **(a) Recomendada**: crear **solo lo que la 29.4 usa**, y que la 29.4.2 sume lo automático con una migración aditiva:
  - **`exchange_rate_settings`**: organización (única), `quote_currency` y `source`, con el enum `exchange_rate_source` que nace solo con `manual`;
  - **`exchange_rates`**, de solo inserción: organización, `base_currency`, `quote_currency`, `rate numeric(18, 6)` con `CHECK (rate >= 1)`, `source`, `recorded_by` y `recorded_at`. La vigente es la última del par;
  - la 29.4.2 agrega al enum `dolarapi_blue`, y las columnas `adjustment`, `last_confirmed_at`, `source_rate` y `source_observed_at`, con sus `CHECK`.
  
  Así no queda una fuente que se puede elegir y no hace nada, ni columnas sin uso (CLAUDE.md: nada «por si acaso»).
- (b) Crear ahora todo el diseño del ADR, con `dolarapi_blue` deshabilitada en la pantalla. Ahorra una migración y deja columnas que nadie escribe.

### D-4 — La pantalla de la cotización (H-6)

- **(a) Recomendada**: **`/caja/cotizacion`**, una pestaña más de la caja, visible solo si la organización tiene moneda principal:
  - **la vigente**: «1 USD = ARS 1.565,00», su fuente, quién la cargó y cuándo, y el **aviso de antigüedad** si tiene más de 24 horas sin contar sábados ni domingos (ADR, punto 4);
  - **la carga manual**, de `admin`: el valor, con seis decimales a lo sumo, y una confirmación si se mueve más de un 10 % contra la vigente (no bloquea: es la carga manual la que corrige);
  - **el historial**: las cotizaciones del par, de la más nueva a la más vieja, paginado;
  - un `viewer` ve la vigente y el historial, sin el formulario.
  
  Sin moneda principal, la ruta da 404, como una capacidad ausente.
- (b) Una sección nueva de «Configuración». No existe, y armarla es un cambio del marco que no pide esta subfase.

### D-5 — La conversión (H-7, H-8)

- **(a) Recomendada**:
  - **en `src/shared/money/`**: el tipo de la cotización (`bigint` en millonésimos, leído y escrito como texto, sin `number`) y **`convertMoney(amount, from, to, rate)`**, que multiplica o divide según la dirección, redondea a los decimales del destino con el medio hacia afuera del cero, y **rechaza el cero y lo que pase de `MAX_AMOUNT`**;
  - **el redondeo se mueve a `src/shared/money/`** y `line-total.ts` lo importa de ahí, sin cambiar su conducta (sus tests siguen igual);
  - **sin dependencia nueva**: las propiedades del ADR (el redondeo nunca se aleja más de media unidad, y la vuelta exacta con `rate >= 1`) se prueban con un generador pseudoaleatorio propio con semilla fija, sobre miles de casos, más los bordes escritos a mano.
- (b) Instalar `fast-check`. Es la herramienta habitual, pero suma una dependencia que necesita autorización y solo sirve a esta función.

### D-6 — El cobro en la otra moneda (H-1 a H-4)

- **(a) Recomendada**, sobre el ADR 0025, punto 5:
  - **columnas nuevas, opcionales**, en `receipts` **y en `receipt_voids`**: `tendered_currency`, `tendered_amount numeric(14, 2)`, `exchange_rate numeric(18, 6)` y `exchange_rate_id` (clave compuesta contra `exchange_rates`), con los `CHECK` del ADR (las tres juntas o ninguna, el id solo con ellas, la moneda distinta de `currency`, el monto positivo y la cotización `>= 1`);
  - **el trigger de la anulación compara también las columnas nuevas** (H-1), y el servicio las copia del cobro;
  - **el formulario de los tres cobros**, con moneda principal y una cotización vigente, suma **«Moneda que entra»** (la del destino o la otra). Con la otra, muestra lo que falta en las dos («faltan USD 100,00 = ARS 156.500,00»), propone ese monto y permite escribir una **cotización acordada** para ese cobro, que no pasa a ser la vigente;
  - **el servicio** lee el monto con los decimales de la moneda que entra (H-3), calcula lo aplicado **una sola vez** con `convertMoney`, y mide el tope con lo aplicado, con la tolerancia de un centavo después de redondear (ADR, punto 5, R-M4);
  - **sin cotización vigente**, el cobro en la otra moneda se rechaza con un mensaje que lleva a cargarla. **Sin moneda principal, nada cambia**;
  - **el cobro a cuenta** (H-4): con moneda principal, la moneda aplicada es la principal, y la otra solo si el cliente tiene un saldo pendiente o a favor en ella. La moneda que entra es cualquiera de las dos. Sin moneda principal, sigue como hoy;
  - **la auditoría del alta** suma `tendered_currency`, `tendered_amount` y `exchange_rate` cuando existen;
  - **la ficha del cobro, la lista de cobros y la de la caja** muestran las dos: «USD 100,00 (entraron ARS 156.500,00 a 1.565)».
- (b) Sumar las columnas solo en `receipts` y que la anulación las lea del cobro con un join. El trigger de la anulación dejaría de proteger lo que la caja devuelve.

### D-7 — La caja (H-2)

- **(a) Recomendada**:
  - **`readTotalsInput`, `findSessionReceiptVoids` y `findLateVoids` pasan lo recibido** cuando existe, y si no, lo aplicado, como hoy. `computeCashTotals` no cambia;
  - **`exceedsCashLimit` y el control de la anulación** miden en la moneda que entra o sale de la caja;
  - **la caja, el cierre y el detalle de una sesión** suman un **total de referencia** en la moneda principal, con la cotización vigente, su valor y su fecha, marcado «de referencia». No se guarda. El arqueo sigue por moneda;
  - las monedas que no son la principal ni la otra **no se convierten**: se muestran aparte («sin convertir»).
- (b) Convertir el efectivo a la principal al cobrar. Lo contado nunca coincidiría con lo esperado (ADR, alternativas).

### D-8 — Las cuentas de clientes

- **(a) Recomendada**: la deuda queda en la moneda del destino, y **la ficha del cliente, su estado de cuenta y la lista de deudores** suman un **total de referencia** en la principal, con la misma regla que la caja para las monedas sin convertir. `imputeAccount` no cambia.
- (b) Solo en la lista de deudores. La ficha es donde el `admin` cobra, y ahí es donde más sirve.

### D-9 — La moneda propuesta en los formularios

- **(a) Recomendada**: con moneda principal, **el precio, el costo, la orden de compra, el cobro a cuenta y la apertura de caja la proponen** cuando hoy proponen vacío; lo que hoy se propone por otro motivo (el precio vigente, la venta con saldo, el último cierre) se mantiene. Las páginas la leen con `getMainCurrency`; **`catalog` y `purchasing` no dependen de `fx`**.
- (b) No tocar los formularios de `catalog` y `purchasing`. El ADR los nombra (punto 2).

### D-10 — El módulo `fx` y las guardas

- **(a) Recomendada**:
  - **`src/modules/fx/`**: esquema, repositorio, servicio e `index.ts`, en la lista de módulos de dominio de `eslint.config.mjs`, con sus casos en `module-boundary.test.ts`;
  - **`fx-dependencies.test.ts`**, nueva: `fx` importa solo `organizations`, `audit` y `src/shared`; entre los módulos, **solo `cash` importa `fx`**; `catalog` y `purchasing` no;
  - las tablas nuevas en el inventario de `audit.test.ts` (`exchange_rates` de solo inserción, `exchange_rate_settings` sin borrado), en `identity-schema.test.ts` y en un test de esquema de `fx`;
  - `cash-writes.test.ts` sigue fijando quién inserta cobros y anulaciones; `exposed-surface.test.ts` suma las acciones de la cotización;
  - **la auditoría**: tipos nuevos `organization` (la moneda principal), `exchange_rate_setting` y `exchange_rate`.
- (b) Sin guarda de dependencias propia. El ADR la pide (punto 13, R-M8).

### D-11 — Roles

**Recomendada**: lo del ADR 0025, punto 11. Un `admin` carga la cotización, ve el historial y cobra en la otra moneda, con la vigente o una acordada. Un `viewer` ve la cotización, el historial y los totales de referencia, y **no cobra** (ADR 0022, punto 12).

### D-12 — La demo

- **(a) Recomendada**: en producción, con la autorización del usuario, `org:currency` sobre «iPhone Demo» con **USD** y **ARS**. **La primera cotización la carga el usuario** desde la pantalla, como cualquier `admin`. «Demostración Vixora» no se toca, y se comprueba con recuentos que no tiene moneda principal ni cotizaciones.
- (b) Que el script cargue también una primera cotización. Sería una cotización sin un usuario que la haya visto.

### D-13 — Pruebas

**Recomendadas**:

- **Unitarias**: `convertMoney` y el tipo de la cotización (bordes, cero, máximo, las dos direcciones y las propiedades con el generador propio); el aviso de antigüedad sin sábados ni domingos.
- **Integración contra PostgreSQL**:
  - el esquema: tablas, `CHECK`, triggers de solo inserción, claves compuestas y `GRANT` a `crm_app`;
  - los `CHECK` de las columnas nuevas de `receipts` y `receipt_voids`, y el trigger de la anulación con ellas;
  - los tres cobros en la otra moneda: lo aplicado, el tope, la tolerancia de un centavo, la cotización acordada y el rechazo sin cotización;
  - la regla de la moneda del cobro a cuenta;
  - la anulación: la caja devuelve lo recibido y la cuenta, lo aplicado;
  - la caja: lo esperado por moneda con cobros en las dos, y el máximo medido en la moneda que entra;
  - **sin moneda principal, cada cobro y cada pantalla se comportan como hoy**;
  - el script: fija la moneda, se niega a cambiarla, y audita;
  - el aislamiento: una organización no ve ni usa la cotización de otra.
- **Guardas**: las de D-10, y las de siempre.
- **End-to-end**: cargar una cotización; cobrar una venta en USD con pesos, viendo la equivalencia; anularlo y ver la caja; el cobro a cuenta; el total de referencia en la caja y en la ficha; un `viewer` sin formulario; una organización sin moneda principal sin cambios y con 404 en la cotización; axe en claro y oscuro, y a 375 px.

### D-14 — Revisión independiente y cierre

**Recomendada**:

- **Revisión independiente**: sí, antes del despliegue. Toca el dinero, la caja y las cuentas, que usan todas las organizaciones. La hace un agente de solo lectura contra este brief, el ADR 0025, el ADR 0022 y el código.
- **Despliegue**, con la autorización del usuario: la migración `0053`, el código, y en producción `org:currency` sobre «iPhone Demo».
- **Recorrido del usuario** en «iPhone Demo», y control de que «Demostración Vixora» no cambió.
- **Cierre**: DataModel con las tablas (y la nota de diseño del ADR 0025 actualizada), FunctionalRequirements, el Overview con `fx`, el runbook de alta de un negocio con `org:currency`, la nota fechada en el ADR 0025 (D-2 y D-3), el CHANGELOG, el HANDOFF y Notion.

## Alcance incluido

- `drizzle/0053_*.sql` y su snapshot.
- `src/modules/fx/` (nuevo), `src/modules/organizations/` (`main_currency`, `getMainCurrency`, el script), `src/modules/cash/` (los tres cobros, la anulación, la caja, las cuentas), `src/modules/audit/schema.ts`.
- `src/shared/money/` (la conversión, el tipo de la cotización y el redondeo) y `src/shared/lines/line-total.ts` (importa el redondeo).
- `src/app/(autenticado)/caja/` (la cotización, la caja, el cierre, las sesiones, los cobros, los deudores), `ventas/[saleId]/cobrar/`, `pedidos/[orderId]/senar/`, `clientes/[clientId]/` (la cuenta y el cobro a cuenta), `cobros/[receiptId]/`, y los formularios de precio, costo y orden de compra (solo la moneda propuesta).
- `eslint.config.mjs` (el módulo `fx`).
- `scripts/` (`org:currency`) y `package.json` (el script).
- `tests/` (unitarias, integración, guardas y end-to-end).
- La documentación del cierre.

## Alcance excluido

- La 29.4.2 y la 29.4.3, y todo lo de la 29.5 en adelante.
- `read-v1`, `read-v2`, la ingestión y la búsqueda global.
- Cualquier salida a internet: la aplicación no sale.
- Cambios en «Demostración Vixora» o en cualquier organización que no sea «iPhone Demo».
- Dependencias nuevas.
- Cambios en el agente o en su repositorio.

## Invariantes

1. **Una organización sin moneda principal se comporta exactamente como hoy**: cobros, caja, cuentas, formularios y menú.
2. **`currency` y `amount` no cambian de significado**: siguen siendo lo aplicado, en la moneda del destino.
3. **`imputeAccount` y `computeCashTotals` no cambian sus reglas.**
4. **El dinero y la cotización nunca pasan por `number`.**
5. **Lo aplicado se calcula una vez, al registrar**, y nunca se recalcula.
6. **El arqueo sigue por moneda**; los totales de referencia no se guardan.
7. **Aislamiento por organización**: ni la configuración ni las cotizaciones se comparten; las claves compuestas lo exigen en la base.
8. **La migración es aditiva** y da los `GRANT` a `crm_app`.
9. **Los contratos del agente no cambian.**

## Criterios de aceptación

- **AC-1**: `org:currency` fija USD como principal y ARS como la otra moneda, auditado, y se niega a cambiar una moneda principal ya fijada.
- **AC-2**: un `admin` carga una cotización; la vigente es la última, con su fecha y el aviso de antigüedad; un `viewer` la ve sin cargarla.
- **AC-3**: un `admin` cobra una venta en USD con pesos, con la vigente o con una acordada; la cuenta baja en dólares y la caja suma pesos. Lo mismo la seña y el cobro a cuenta, con su regla de moneda.
- **AC-4**: la anulación de un cobro en pesos devuelve los pesos a la caja y los dólares a la cuenta, y el trigger rechaza una anulación que no copia lo recibido.
- **AC-5**: la caja, el cierre, la ficha del cliente, su estado de cuenta y la lista de deudores muestran el total de referencia, marcado como tal.
- **AC-6**: sin moneda principal, nada cambia, y `/caja/cotizacion` da 404.
- **AC-7**: guardas, unitarias, integración y end-to-end pasan en CI, con axe sin violaciones.
- **AC-8**: la revisión independiente se hizo antes del despliegue, con cada hallazgo verificado.
- **AC-9**: desplegada, con la moneda de «iPhone Demo» fijada, y recorrida por el usuario.

## Implementación: precisiones y desvíos (2026-10-18)

Registrados al implementar, antes de la revisión independiente.

- **P-1. El cobro a cuenta acepta también una moneda con saldo que no es del par** (D-6, H-4). La regla aplicada es «la principal, o una en la que el cliente tenga saldo pendiente o a favor». Así, una venta vieja en euros se sigue cobrando en euros, como antes. Lo recibido solo se convierte entre la principal y la otra. Va como nota fechada en el ADR 0025, punto 5.
- **P-2. La auditoría de la moneda principal no lleva `origen`.** `recordAudit` exige los mismos campos antes y después en una edición, y la moneda principal no tiene otro camino que el script. La configuración, que es un alta, sí lo lleva.
- **P-3. `exchange_rate_settings` es de solo inserción en esta subfase**, con `fx_reject_change()`, porque nada la edita. La 29.4.2 le suma `UPDATE` y saca el trigger, en su migración.
- **P-4. La vigente que mostró el formulario viaja con el cobro** (`exchangeRateId`). Si cambió mientras se cargaba, el cobro se rechaza con `exchange_rate_changed` y el `admin` vuelve a ver la equivalencia. Ni el ADR ni D-6 lo nombraban. Con una cotización acordada no se compara.
- **P-5. La moneda que entra se elige con un enlace** (`?moneda=ARS`) en el cobro de una venta y en la seña: el servidor vuelve a armar el formulario con el monto propuesto en esa moneda, y así funciona sin JavaScript. El cobro a cuenta, que ya tiene vista previa, usa un selector, y la vista previa muestra lo aplicado.
- **P-6. La cotización se escribe con coma decimal y punto de miles** («1.565,50»). «1.565» es mil quinientos sesenta y cinco, nunca uno con algo: con un punto decimal, una cotización de pesos se leería mil veces menor.
- **P-7. La devolución y el pago a un proveedor no cambian** hasta la 29.4.3. Comparten `readPayment` con los cobros: una sobrecarga mantiene sus fallas como antes.
- **P-8. El total de referencia es null si todo ya está en la principal**: no hay nada que convertir. En una sesión cerrada se calcula con la vigente de hoy, como dice el ADR, no con la del cierre.
- **P-9. Archivos fuera de la lista del alcance**:
  - `src/app/(autenticado)/devoluciones/messages.ts`: los rechazos compartidos ahora pueden nombrar campos de la otra moneda, y la devolución se queda con los suyos;
  - `docs/decisions/README.md`: la fila de la 29.4 y la de la 29.2, que faltaba.

  No se tocó ningún contrato del agente ni ninguna dependencia.

- **P-10. Revisión independiente (D-14), R1, 9 hallazgos, verificados contra el código el 2026-10-18.** Hecha por un agente que no participó del trabajo, solo con lectura y sin ejecutar nada.
  - **R1-1 [alto], corregido.** Un destino en la otra moneda (una venta en pesos) ofrecía cobrarse en la principal, y lo propuesto excedía lo que falta en más de un centavo: 63,90 × 1.565 = 100.003,50 contra 100.000,00. `canConvert` ahora convierte solo la otra moneda contra un destino en la principal, como dice el ADR 0025 en el punto 5 («la del destino y la otra moneda de la organización»). El cobro a cuenta ofrece solo la otra moneda. Va como nota fechada en el ADR.
  - **R1-2 [medio], corregido.** Una acordada se aceptaba sin vigente, en contra de D-6, del ADR (punto 5) y de FR-CAJ-27. Ahora se rechaza, y la pantalla ya no invita a escribir una acordada sin vigente.
  - **R1-3 [medio], corregido.** Después de `exchange_rate_changed`, el formulario volvía a mandar el id viejo. Los tres cobros ahora vuelven a leer su página en ese rechazo, con el patrón de `conversaciones/actions.ts`. Tiene un caso nuevo en `exchange.spec.ts`.
  - **R1-4 [bajo], aceptado como límite.** Nada impide fijar un par con cotización < 1. Lo dice el runbook en §1c, y el script lo corre quien opera el CRM. Si pasa, no se puede cargar ninguna cotización, y la moneda principal ya no se puede cambiar.
  - **R1-5 [bajo], aceptado como límite.** Que la moneda principal no se cambie lo impide el servicio (`where main_currency is null`), no un trigger. El brief no lo pedía. Queda para cuando haga falta.
  - **R1-6 [bajo], corregido.** La apertura sin cierre anterior decía «Se propone lo que se contó al cerrar la última sesión».
  - **R1-7 [bajo], registrado.** `fx/schema.ts` importa `@/modules/auth/schema` para la FK de `recorded_by`. D-10 no lo nombraba. La guarda `fx-dependencies` lo permite solo en `schema.ts`, como en los demás módulos.
  - **R1-8 [bajo], aceptado.** La base no ata `exchange_rate` a la fila de `exchange_rate_id`. Lo escribe el servicio, en la misma transacción. El ADR no lo exige.
  - **R1-9 [bajo], corregido.** `Overview.md` describía en presente el lector de la 29.4.2, y la fila de fases del ADR nombraba el cambio de fuente. Los dos quedan en la nota fechada del ADR y en el Overview.

## Pruebas y evidencia requerida

Las de D-13, en CI sobre el SHA desplegado; el recorrido del usuario en «iPhone Demo»; y una consulta de solo conteos que muestre que «Demostración Vixora» no tiene moneda principal ni cotizaciones.

## Condiciones de detención

Detenerse y avisar si:

- la regla de lo aplicado obliga a cambiar `imputeAccount` o `computeCashTotals`;
- un cobro sin moneda principal cambia en cualquier forma;
- la conversión necesita pasar por `number`;
- hace falta tocar un contrato del agente, una dependencia, la 29.4.2 o la 29.4.3, o un archivo fuera del alcance.

Pedir autorización explícita, en su turno, **antes de**:

- cualquier commit, push o despliegue;
- ejecutar la migración en producción;
- fijar la moneda principal en producción.
