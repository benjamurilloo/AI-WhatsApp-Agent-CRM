---
schema: task-brief.v1
task_id: "29.6"
task_type: implementation
generated_at: 2026-10-20
---

# Brief 29.6 — Las reparaciones de equipos de clientes

- **Contrato**: `task-brief.v1`
- **Tipo de tarea**: `implementation`. Migración, código, pruebas y despliegue.
- **Nivel de evidencia objetivo**: `deterministic` (tests contra PostgreSQL) y `producer-consumer` (pantallas ↔ servicio ↔ base, con end-to-end).
- **Estado**: **aprobado** por el usuario el 2026-10-20, con las recomendaciones del brief tal como están; **cerrado** el 2026-10-20, desplegado (`b00e53d`) y recorrido (§Cierre). Las decisiones de división, de la deuda con el técnico y de `in_review` las tomó el usuario el 2026-10-20 (abajo, «Decidido por el usuario»).
- **Fuentes**: [ADR 0024](0024-rubros-y-capacidades.md), puntos 7, 10, 13, 14, 16 y 17; [ADR 0023](0023-compras-y-proveedores.md), puntos 2, 11 y 12; [ADR 0025](0025-tipo-de-cambio.md), puntos 1 y 5; [ADR 0019](0019-bases-de-los-comprobantes.md), punto 3; [ADR 0021](0021-la-venta.md); [DataModel](../architecture/DataModel.md).

## Objetivo

Que un negocio con la capacidad `repairs` lleve **la lista de reparaciones por modelo**, **marque a sus técnicos** y registre **la reparación del equipo de un cliente** desde que lo recibe hasta que se lo entrega cobrado: presupuesto, aprobación, técnico, venta y entrega. Lo que se le debe al técnico queda **al debe de su cuenta de proveedor**.

## Contexto

La 29.6 del ADR 0024 (punto 17) crea la capacidad `repairs`, el producto de servicio, la marca del técnico, la lista de reparaciones y las órdenes de servicio de sus dos tipos con la venta de una reparación. Es grande, y uno de sus dos tipos, el de la unidad propia, devuelve la unidad a `in_review`, un estado que todavía no existe (H-5). **El usuario decidió dividirla** el 2026-10-20:

- **29.6 — Las reparaciones de equipos de clientes** (este brief): la capacidad, la lista, el técnico, el producto de servicio, la orden `customer_device` y su venta.
- **29.6.2 — Las reparaciones de unidades propias**: la orden `own_unit`, los estados `in_repair` e `in_review`, `sendUnitToRepair`, `returnUnitFromRepair`, `releaseUnit` y el costo del técnico sumado al de la unidad. La 29.7 reutiliza `in_review` y `releaseUnit` para los usados.

### Decidido por el usuario (2026-10-20)

- **U-1, la división**: dos subfases, como arriba.
- **U-2, la deuda con el técnico**: la orden reparada pone su costo **al debe de la cuenta del técnico**, como una recepción, y el pago a proveedor de la 22.6 se aplica contra ella. Necesita notas fechadas en el ADR 0024 (punto 10, «sin cambios en `cash`») y en el ADR 0023 (puntos 11 y 12) (H-1).
- **U-3, `in_review`**: lo crea la 29.6.2, no la 29.7. Fuera de este brief.

## Hallazgos (verificados contra el código en `8b5f320`, 2026-10-20)

- **H-1. La cuenta del proveedor pone al debe solo recepciones.** `supplierAccountInput` (`cash/supplier-payments.ts:134`) arma `sales` con las recepciones y nada más. Un pago al técnico sin una deuda en su cuenta sería un pago a cuenta contra nada, y su estado de cuenta mostraría un saldo a favor que no existe. El ADR 0024, punto 10, dice «sin cambios en `cash`»: con U-2, cambia. `imputeAccount` (`cash/imputation.ts:174`) aplica lo pagado a cuenta de la deuda más vieja a la más nueva, por moneda, así que **una deuda nueva en `sales` se paga con el pago a cuenta que ya existe**, sin tocar `supplier_payments`.
- **H-2. Quién lee la cuenta está fijado por una guarda.** `purchasing-dependencies` (regla 3, `LEDGER_READ` y `LOCKED_LEDGER_CALLERS`, l.100-107) acepta solo las lecturas de `SNAPSHOT_READS` y el pago. Una lectura nueva de las deudas del técnico tiene que entrar por esa lista.
- **H-3. La venta sin pedido exige stock.** `issueSale` (`sales/service.ts:379`) llama a `sellStock`, que bloquea el saldo con `lockBalance` (`inventory/repository.ts:157`, crea la fila si falta) y rechaza si no alcanza. Un producto de servicio, sin saldo, saldría `insufficient_stock`. Su anulación, por `restoreSaleStock`, le sumaría stock.
- **H-4. No hay una venta de monto fijo fuera de la de un pedido.** `issueSaleFromOrder` (`sales/service.ts:149`) copia los montos del pedido sin tocar el stock. La venta de una reparación necesita una tercera forma: una línea con el total aprobado (ADR 0024, punto 10; R-7).
- **H-5. `in_review` no existe.** `stock_unit_status` tiene `available`, `written_off`, `reserved` y `sold`. Resuelto por U-1 y U-3.
- **H-6. El precio vigente.** `evaluateLines` rechaza un producto sin precio (`no_price`, `shared/lines/rules.ts:291`) y fija la moneda del comprobante por la primera línea (l.318). El producto de servicio no tiene precio propio: vale lo aprobado en cada orden.
- **H-7. Lo que ya excluye el agente.** `findActiveProductsRanked` excluye los `used` con `excludeUsed` (`catalog/repository.ts:261`), y la lectura de un producto los descarta (`catalog/service.ts:1023`). El producto de servicio necesita la misma exclusión (ADR 0024, punto 10).
- **H-8. El perfil copia por módulo.** `scripts/activar-capacidad.ts` compone los módulos: los atributos con `applyAttributeTemplate` (`catalog`) y los grados con `applyGradeTemplate` (`inventory`), en una transacción. `organizations` no importa otros módulos. La lista de reparaciones entra igual, con una función de `service`.
- **H-9. Nada de esto existe.** No hay módulo `service`, ni `repairs` en `capability`, ni `service_order` en `document_kind`, ni `is_service` en `products` ni `is_technician` en `suppliers`.

## Decisiones

### D-1 — La capacidad y el perfil

- **`repairs`** suma un valor a `capability`. La pantalla y las acciones de la 29.6 exigen la capacidad; sin ella, nada cambia.
- **El perfil de iPhone, versión 3**, suma `repairs` y **los tipos de reparación de ejemplo**, con la marca `is_example` (ADR 0024, punto 13): «Cambio de batería», «Cambio de pantalla», «Cámara trasera», «Cámara frontal», «Pin de carga» y «Face ID». **Sin precios**: los precios son por modelo, y los modelos son de cada negocio.
- `org:capability` copia los tipos con `applyRepairTypeTemplate` (`service`) al activar `repairs` con el perfil, y **crea el producto de servicio** «Reparación» con una función de `catalog` (D-5), en la misma transacción.

### D-2 — La lista de reparaciones (ADR 0024, punto 7)

- **`repair_types`** (`service`): nombre único por organización sin distinguir mayúsculas, activo, orden y `is_example`.
- **`repair_prices`** (`service`): una fila por tipo y **modelo** (`product_models`), con el **precio al cliente** y su moneda, y el **costo estimado** del técnico y su moneda, los dos mayores que cero. `UNIQUE (organization_id, repair_type_id, model_id)`.
- La edita un `admin`, en una pantalla «Reparaciones» con una grilla por modelo. Cada cambio se audita: los tipos como `repair_type`, y los precios como `price_change` y `cost_change` con el tipo de entidad del precio de reparación (ADR 0024, punto 6, R-24).
- **Un `viewer` ve el precio al cliente, no el costo** (punto 14).

### D-3 — El técnico (ADR 0023, punto 2; ADR 0024, punto 10)

- **`suppliers.is_technician`**, boolean, por defecto `false`. Un `admin` lo marca en la ficha del proveedor. Puede haber varios.
- La orden elige el técnico entre los proveedores activos con la marca.

### D-4 — La orden de servicio de un cliente

- **`service_orders`** (`service`), numerada `OS-000123` (`document_kind` suma `service_order`). En la 29.6 su `kind` es solo `customer_device`; el enum se crea con ese valor, y `own_unit` entra en la 29.6.2 (R-19).
- **Lleva**:
  - el cliente, obligatorio (FK `RESTRICT`, ADR 0024, punto 14);
  - el modelo (`product_models`), obligatorio, porque da los precios;
  - el IMEI del equipo, opcional, de 1 a 32 caracteres. **No es una unidad del stock**, y no se compara con `stock_units`;
  - lo que reporta el cliente, texto obligatorio de hasta 1000 caracteres;
  - el técnico, desde que se manda;
  - el estado, sus fechas, el motivo de cancelación, y el enlace a la venta.
- **Estados** (punto 10), con un trigger que fija las transiciones, como `orders_guard`:
  - `received` → `sent` (elige el técnico) → `quoted` (el presupuesto) → `approved` o `rejected`;
  - `approved` → `repaired` → `delivered`, con la venta;
  - `rejected` → `delivered`: **el equipo vuelve sin reparar y sin venta**;
  - `cancelled` desde `received`, `sent`, `quoted` o `approved`, con motivo de lista. Una reparada no se cancela.
- **Las líneas** (`service_order_lines`, `service`, **de solo inserción**): una por tipo de reparación, con el precio al cliente y el costo del técnico, **copiados de la lista** del modelo del equipo y **editables antes de guardar el presupuesto**. Se insertan todas al pasar a `quoted` y no cambian. Un presupuesto distinto es otra orden: se cancela la anterior.
  - **Una moneda para el precio al cliente y una para el costo** en toda la orden. Una lista con monedas mezcladas se rechaza, como R-12 del ADR 0024.
  - Un tipo sin precio para ese modelo se carga a mano en el presupuesto, o se rechaza si no se carga.
- **Los totales** (al cliente y del técnico) se guardan en la orden al presupuestar y se fijan al aprobar.

### D-5 — El producto de servicio (ADR 0024, punto 10)

- **`products.is_service`**, boolean. Un `CHECK` en la base exige `tracking = 'quantity'`; la capacidad `repairs` la exige el servicio. Lo crea `org:capability` (D-1), **uno por organización**, y no se crea desde la pantalla de productos.
- **No tiene fila en `inventories`**, ni la tiene nunca:
  - **un pedido lo rechaza** (regla nueva `service_product` en `evaluateLines`);
  - **la venta sin pedido de la pantalla lo rechaza** con la misma regla: se vende solo por su orden (D-6);
  - **el ajuste manual lo rechaza**;
  - **no aparece** en las listas y el estado de stock, ni en `read-v1` ni `read-v2` (con la exclusión de H-7);
  - la lista de productos lo muestra, marcado como servicio.

### D-6 — La entrega y la venta (ADR 0024, punto 10; R-4 y R-7)

- **Entregar una orden reparada emite su venta**, en la misma transacción: `service` llama a `issueServiceSale`, una función nueva de `sales` que recibe la transacción:
  - una venta sin pedido, **con una sola línea**: el producto de servicio, cantidad 1, y **el total aprobado** como precio y monto, en su moneda;
  - **sin tocar el stock**;
  - con el cliente de la orden.

  `service_orders.sale_id` apunta a la venta: **`sales` no conoce `service`**. Una guarda fija que `issueServiceSale` tiene un solo llamador.
- **El cobro** es el de cualquier venta (21.3), también en la otra moneda (ADR 0025, punto 5).
- **La anulación de esa venta** pasa por `voidSale`, que salta el stock para el producto de servicio. **La orden sigue `delivered`** y su detalle dice que la venta está anulada. Volver a cobrarla queda fuera (límite declarado).
- Notas fechadas: ADR 0019, punto 3 (el monto de la venta de una reparación), y ADR 0021 (la venta sin pedido de un producto de servicio).

### D-7 — La deuda con el técnico (U-2)

- **Una orden `repaired`** (y después `delivered`) **pone el costo total del técnico al debe de su cuenta**, con el número de la orden, su moneda y la fecha de reparación. Una `cancelled` o `rejected` no.
- **`cash` lee las deudas por `listTechnicianChargesForAccount`** (de `service`), y `supplierAccountInput` las suma a `sales` junto con las recepciones. Una arista nueva, **`cash → service`**, sin ciclo: `service` no importa `cash`.
- **El pago**: a cuenta del técnico, que `imputeAccount` aplica de la deuda más vieja a la más nueva (H-1). **No hay pago contra una orden**: `supplier_payments` no cambia.
- El estado de cuenta, el resumen y la lista «A pagar» de la 22.7 muestran la orden como una fila más, con un enlace a ella.
- Las guardas: `LEDGER_READ` y `SNAPSHOT_READS` (H-2) suman la lectura nueva.
- Notas fechadas: ADR 0024, punto 10; ADR 0023, puntos 11 y 12; ADR 0022 por la dependencia de `cash`.

### D-8 — Los módulos y las guardas (ADR 0024, punto 16)

- **`service`** depende de `catalog`, `crm`, `purchasing` (el técnico), `sales` (`issueServiceSale`), `numbering`, `organizations` y `audit`. **No de `inventory`** en la 29.6: lo suma la 29.6.2.
- Entra en la lista de dominio de `eslint.config.mjs` y en el Overview.
- **`service-dependencies`**, una guarda nueva como la de `purchasing`. **`purchasing-dependencies`, regla 2**: `cash` y `service` importan `purchasing`.
- **`service-writes`**: cada escritura de `service_orders`, `service_order_lines`, `repair_types` y `repair_prices` con su función y su llamador. **`sale-writes`** suma `issueServiceSale`.

### D-9 — El orden de bloqueo

- **Entregar**: la orden `FOR UPDATE` → el cliente en modo compartido → el producto de servicio `FOR SHARE` → el contador de la venta → los inserts de la venta → la orden.
- **Las demás transiciones**: la orden `FOR UPDATE`, y el técnico `FOR SHARE` al mandarla.
- **La deuda** no toma el bloqueo del pago. Una deuda que aparece mientras se paga solo sube lo que se debe, así que el tope del pago nunca queda corto. Se prueba.

### D-10 — Las pantallas

- **«Reparaciones»**: los tipos y la grilla de precios por modelo.
- **«Órdenes de servicio»**: la lista con filtros por estado; «Nueva orden» (cliente, modelo, IMEI, lo que reporta); y el detalle, con las acciones de cada estado, el presupuesto armado con la lista y la entrega con la venta.
- **El comprobante de recepción del equipo**, imprimible, para el cliente: el número, el cliente, el modelo, el IMEI, lo que reporta y la fecha. Sin el técnico ni el costo.
- **La ficha del proveedor**: la marca de técnico. **El estado de cuenta**: las órdenes al debe.
- **La ficha del cliente**: sus órdenes de servicio.
- Todo se ve con y sin JavaScript, en claro y oscuro, a 1280 y 375 px, con axe sin violaciones.

### D-11 — Roles y datos personales (ADR 0024, punto 14)

- **Un `admin`** edita la lista, marca técnicos y opera las órdenes.
- **Un `viewer`** ve las órdenes y la lista **sin el técnico ni su costo**, ni la cuenta del técnico (ADR 0023, punto 12).
- **El IMEI de un equipo de un cliente es un dato personal**: entra en el runbook [datos de un cliente](../runbooks/datos-de-un-cliente.md), para exportar y vaciar, con `service_orders`. El agente no lo lee.

### D-12 — La migración `0058`

Aditiva:
- `capability` suma `repairs`;
- `document_kind` suma `service_order`;
- `products.is_service` con su `CHECK`;
- `suppliers.is_technician`;
- las tablas `repair_types`, `repair_prices`, `service_orders` y `service_order_lines`, con sus enums, triggers y permisos de `crm_app`.

**Un valor nuevo de un enum no se usa en el mismo lote**: un test migra hasta la 0057 y aplica la 0058 sola.

### D-13 — Pruebas

- **Integración**:
  - la lista y su auditoría;
  - cada transición de la orden y cada rechazo del trigger;
  - el presupuesto con monedas mezcladas;
  - la entrega con su venta sin tocar el stock;
  - la anulación de esa venta;
  - el producto de servicio rechazado en el pedido, la venta de la pantalla y el ajuste, y excluido de las lecturas del agente;
  - la deuda en la cuenta del técnico y su pago a cuenta;
  - dos entregas simultáneas de la misma orden, **forzando la carrera con una tercera conexión que toma el bloqueo**;
  - el `viewer`;
  - sin la capacidad, nada cambia.
- **Unitarias**: las transiciones y la armadura del presupuesto.
- **End-to-end**: la lista, una orden de punta a punta hasta la venta y el cobro, el rechazo, la cancelación, y la cuenta del técnico.
- **Las suites existentes** pasan sin cambios de conducta.

### D-14 — Revisión, despliegue y cierre

- **Revisión independiente** antes del despliegue (`CLAUDE.md`).
- **Despliegue con el servicio detenido durante el build.**
- **Activación** de `repairs` en «iPhone Demo» por el usuario, con `org:capability --profile iphone`, porque el script crea el producto de servicio.
- **Recorrido del usuario.**
- **Cierre**: DataModel, FR (sección nueva «Servicio técnico», FR-SRV-*), las notas de los ADR, Overview, el runbook, CHANGELOG, HANDOFF, Roadmap con la 29.6.2, Notion (la 29.6.2 nueva en «Esperando») y Knowledge Capture.

## Alcance incluido

Todo lo de D-1 a D-14.

## Alcance excluido

- **La orden `own_unit`**, `in_repair`, `in_review`, `releaseUnit` y el costo sumado a la unidad: la 29.6.2.
- **El reclamo de garantía** (`warranty_claim`): la 29.9.
- **Lo que lee el agente** (las reparaciones y sus precios, el estado de las órdenes): la 29.8.
- **El cobro de un diagnóstico** de una orden rechazada, el pago contra una orden puntual, un segundo presupuesto en la misma orden y volver a cobrar una orden cuya venta se anuló.
- **Avisos al cliente**: el CRM no envía mensajes.

## Invariantes

- Sin `repairs`, ninguna pantalla, acción ni dato cambia.
- **El producto de servicio nunca tiene fila en `inventories`** ni movimientos.
- Una orden `delivered` que se reparó tiene exactamente una venta. Una `rejected` entregada no tiene venta.
- **Lo que se le debe a un técnico** es igual a la suma de sus recepciones vigentes y sus órdenes reparadas o entregadas.
- `sales` e `inventory` no importan `service`. No hay ciclos.
- Un `viewer` nunca recibe el técnico ni un costo de reparación.

## Criterios de aceptación

- **AC-1**: un `admin` carga tipos de reparación y precios por modelo, con auditoría; un `viewer` ve el precio al cliente, no el costo.
- **AC-2**: un `admin` marca un proveedor como técnico, y solo los técnicos activos aparecen en la orden.
- **AC-3**: una orden recorre `received → sent → quoted → approved → repaired → delivered`; el trigger rechaza toda otra transición, y una reparada no se cancela.
- **AC-4**: el presupuesto se arma con la lista del modelo, se rechaza con monedas mezcladas, y sus líneas no cambian después.
- **AC-5**: entregar una orden reparada emite una venta de una línea con el total aprobado, sin tocar el stock; se cobra como cualquier venta, y su anulación no toca el stock.
- **AC-6**: una orden rechazada se entrega sin venta.
- **AC-7**: la orden reparada aparece al debe de la cuenta del técnico, y un pago a cuenta la cancela; el tope del pago y el estado de cuenta la cuentan.
- **AC-8**: el producto de servicio se rechaza en el pedido, la venta de la pantalla y el ajuste, y no aparece en el stock ni en `read-v1` y `read-v2`.
- **AC-9**: dos entregas simultáneas de la misma orden emiten una sola venta, probado con una tercera conexión que toma el bloqueo.
- **AC-10**: un `viewer` ve las órdenes sin el técnico ni el costo.
- **AC-11**: sin la capacidad, nada cambia, y las suites existentes pasan sin cambios de conducta.
- **AC-12**: `org:capability --profile iphone` copia los tipos de ejemplo y crea el producto de servicio una sola vez.
- **AC-13**: guardas, unitarias, integración y end-to-end pasan en CI, con axe sin violaciones.
- **AC-14**: la revisión independiente se hizo antes del despliegue, con cada hallazgo verificado.
- **AC-15**: desplegada, con `repairs` activada en «iPhone Demo» y recorrida por el usuario; «Demostración Vixora» intacta.

## Pruebas y evidencia requerida

Las de D-13, más la CI en verde sobre el SHA desplegado y los recuentos por organización después del recorrido.

## Condiciones de detención

Pedir autorización explícita, en su turno, **antes de**:
- el commit, el push y el despliegue;
- migrar una base real;
- activar la capacidad en producción (la corre el usuario).

**Detenerse y consultar** si:
- la venta de una reparación no puede emitirse sin que `sales` conozca `service`;
- la deuda del técnico obliga a cambiar `supplier_payments` o `imputeAccount`;
- una suite existente cambia de conducta;
- aparece una dependencia circular.

## Cierre

*Del 2026-10-20, después del despliegue, la activación y el recorrido del usuario.*

### Criterios

| Criterio | Estado | Evidencia |
|---|---|---|
| AC-1 | cumple | `repair-list.ts` (costo en null para un `viewer`; auditoría `create`, `price_change` y `cost_change`); `service-orders.test.ts`, «la lista de reparaciones»; `repairs.spec.ts` |
| AC-2 | cumple | `purchasing/technicians.ts`; «el técnico» |
| AC-3 | cumple | el trigger `service_orders_guard`, que desde la revisión fija también las columnas de cada transición (hallazgo 3); «el ciclo de la orden» y los dos tests de «el trigger de la orden», cada rechazo por su mensaje |
| AC-4 | cumple | `quote.ts` (`price_currency_mismatch` y `cost_currency_mismatch`); `service_order_lines_guard`, de solo inserción y, desde la revisión, sin pasar los totales (hallazgo 4); `quote.test.ts` y la integración |
| AC-5 | cumple | `issueServiceSale` sin `sellStock` y la anulación sin `restoreSaleStock`; «la anulación de la venta de una reparación» y el end-to-end hasta el cobro |
| AC-6 | cumple | `deliverServiceOrder` y el CHECK `service_orders_sale_delivered`; «el ciclo de la orden» |
| AC-7 | cumple | `supplierAccountInput` con las órdenes reparadas; «la deuda con el técnico», con el pago a cuenta y, desde la revisión, una recepción cubierta que no cambia cuando aparece una orden (hallazgo 1) |
| AC-8 | cumple | la regla `service_product` en el pedido, la venta, el ajuste, el seguimiento, la orden de compra y la recepción; las lecturas del agente lo excluyen; los triggers de `inventories` e `inventory_movements`; «el producto de servicio fuera de su orden» |
| AC-9 | cumple | «dos entregas simultáneas», con una tercera conexión que retiene la orden |
| AC-10 | cumple | `getServiceOrder` y `listServiceOrders` sin el técnico ni el costo para un `viewer`; «el viewer» y el end-to-end |
| AC-11 | cumple | «el aislamiento y la capacidad»; las suites existentes pasan, con los cambios de forma de las desviaciones 6 y 7 y de `catalog.test.ts` |
| AC-12 | cumple | «la activación»; en producción, «iPhone Demo» con 6 tipos y 1 producto de servicio |
| AC-13 | cumple | CI run 39497730523 en `success` sobre `b00e53d60e3a3ccce347780358ee41d5c4194ca3`: unitarias 1047, guardas 818, integración 1669 y end-to-end 270, con axe |
| AC-14 | cumple | revisión independiente del 2026-10-20, antes del despliegue (abajo) |
| AC-15 | cumple | desplegada (`b00e53d`, 59 migraciones); el usuario activó `repairs` en «iPhone Demo» con `org:capability --profile iphone`, recorrió el flujo y dijo «esta todo perfecto». Recuentos después: «iPhone Demo» con `repairs`, `serialized_units` y `variants`, 6 tipos, 6 precios, 1 producto de servicio sin fila de stock, 1 técnico y 1 orden entregada con su línea; «Demostración Vixora» y «Vixora» sin capacidades ni nada de reparaciones |

**Nivel alcanzado**: validado en integración (`producer-consumer`), desplegado y recorrido en producción sobre una organización demo. No hay negocio real. La orden de una unidad propia es de la 29.6.2.

### El despliegue

El primer build en producción **se quedó sin memoria en el paso de tipos**: el heap de Node llegó a su límite por defecto, unos 980 MB, con 1,5 GB libres en el droplet y el servicio detenido. Como dice el README, el servicio volvió a arrancar, pero sobre un `.next` incompleto, y quedó reiniciándose: **producción no respondió durante unos minutos**. El segundo build, con `NODE_OPTIONS=--max-old-space-size=1536`, terminó bien. La migración 0058 se había aplicado antes de detener el servicio. El paso 3 del [README de producción](../../deploy/production/README.md#desplegar-un-cambio) usa ese heap desde este cierre.

### Desviaciones y decisiones de implementación

Registradas al implementar, el 2026-10-20, para la revisión independiente. Ninguna toca una condición de detención: `sales` no conoce `service`, `supplier_payments` e `imputeAccount` no cambian, ninguna suite existente cambió de conducta y no hay ciclos.

1. **La orden de compra y la recepción también rechazan el producto de servicio** (regla `service_product` de `evaluatePurchaseOrderLines`). D-5 no las nombra, pero el invariante «nunca tiene fila en `inventories`» las exige: una recepción le sumaría stock.
2. **Más defensas en la base que las de D-5 y D-12**: el trigger `products_service_fixed` impide cambiar `is_service`; `inventories_no_service_product` e `inventory_movements_no_service_product` rechazan el saldo y el movimiento del producto de servicio; un índice único parcial deja uno por organización; y `service_order_lines_guard` exige, además de solo inserción, que la orden esté `quoted`.
3. **`service_orders.reported_issue` admite null en la base**: el vaciado de datos de un cliente (D-11) deja en null el IMEI y lo que reportó, y el trigger deja pasar solo ese `UPDATE` sin cambio de estado. La orden sigue naciendo con lo que reporta el cliente: lo exige el trigger del `INSERT` y el servicio.
4. **La marca de técnico es una acción propia de la ficha del proveedor**, como desactivar, y no un campo de su formulario: el formulario no cambia. Se audita como `update` del proveedor.
5. **`org:capability` crea el producto de servicio al activar `repairs` también sin `--profile`**: sin él no hay venta de una reparación. Los tipos de ejemplo se copian solo con el perfil.
6. **La carga del catálogo de la demo ignora el producto de servicio**: si no, la organización «iPhone Demo» quedaría con un producto ajeno al catálogo y la carga se negaría. `variants.test.ts` espera ahora 36 productos (los 35 y el de servicio).
7. **El estado de cuenta del proveedor dice qué es cada fila al debe** (`kind`: recepción u orden de servicio), para el enlace. `supplier-accounts.test.ts` suma ese campo a su `toEqual` exacto: cambia la forma, no la conducta.
8. **Las listas de `TRUNCATE` de 27 specs end-to-end suman `service_order_lines` y `service_orders`**: PostgreSQL no trunca `sales`, `suppliers` ni `clients` mientras otra tabla las referencie, aunque esté vacía.
9. **El producto de servicio en la lista de productos** dice «Servicio» en lugar del estado de stock, no entra en un filtro de estado de stock, y su ficha reemplaza la sección de stock por una explicación.
10. **Las pantallas viven en una sola sección del menú, «Reparaciones»** (`/reparaciones`), con dos subpantallas: «Órdenes de servicio», que es la portada y arranca en las que están en curso, y «Lista de reparaciones» (`/reparaciones/lista`). La orden, su comprobante y su alta, en `/reparaciones/[id]`, `/reparaciones/[id]/recepcion` y `/reparaciones/nueva`.
11. **El motivo de la cancelación** es una lista de cuatro: «El cliente la retiró», «No tiene arreglo», «Cargada por error» y «Otro motivo». D-4 no la fijaba.
12. **`repairs` usa los modelos de `variants`**: sin `variants`, la lista de reparaciones no tiene modelos y no se carga una orden. El perfil de iPhone activa las dos. Es un límite: activar `repairs` sola con `--capability` deja la sección sin modelos.
13. **La guarda `purchasing-dependencies`, regla 3**, suma `supplierLedger` a los llamadores permitidos, porque ahí se leen las deudas del técnico con la transacción que recibe.
14. **Sin JavaScript** se probó el alta de una orden con el nombre exacto del cliente, el envío al técnico y el presupuesto; el resto de las pantallas son formularios comunes, pero no tienen un end-to-end sin JavaScript propio.
15. **`cash` lee dos funciones de `service`, no una**: además de `listTechnicianChargesForAccount`, que nombra D-7, `listTechnicianChargesForAccounts`, para «A pagar», que lee todas las cuentas de una vez. La nota del ADR 0022 las nombra a las dos. *Señalada por la revisión independiente.*
16. **La entrega no mira si el cliente o el producto de servicio siguen activos**: la orden ya está aprobada y reparada, y el equipo se devuelve igual. `issueServiceSale` toma el cliente en modo compartido y el producto FOR SHARE, sin exigir que estén activos. *Señalada por la revisión independiente.*

### Revisión independiente

Hecha el 2026-10-20 por un agente que no participó del trabajo, con acceso de solo lectura, contra este brief y las reglas vigentes. **Veredicto R1: ocho hallazgos menores, ninguno crítico ni mayor.** Los ocho se verificaron contra el código antes de aceptarlos, y se corrigieron:

| # | Hallazgo | Verificación | Corrección |
|---|---|---|---|
| 1 | Faltaba la prueba de D-9: una deuda que aparece no baja lo que falta de las anteriores | confirmado | `service-orders.test.ts`: una recepción cubierta por un pago a cuenta sigue en cero después de que se repara una orden, que toma el saldo a favor. **La prueba es secuencial**: marcar reparada no toma el bloqueo de cobros, así que no hay una carrera que forzar, y la orden reparada es siempre la deuda más nueva |
| 2 | El vaciado de datos de un cliente y una entrega se podían trabar | confirmado: el vaciado tomaba la ficha y después las órdenes; la entrega, al revés | el vaciado bloquea primero las órdenes del cliente, en el orden de la entrega |
| 3 | El trigger fijaba las transiciones pero no qué columnas cambia cada una | confirmado | `service_orders_guard`: cada transición cambia el estado, `updated_at` y solo sus columnas |
| 4 | Se podía insertar otra línea después del presupuesto, con la orden todavía presupuestada | confirmado | `service_order_lines_guard`: lo que suman las líneas no pasa los totales de la orden |
| 5 | `service-writes` no fijaba el llamador de aprobar, rechazar y marcar reparada | confirmado | la acción llama a cada una por su nombre, y la guarda fija las tres. Se comprobó que falla con una llamada desde otro archivo |
| 6 | La cuenta del proveedor decía «recepciones» donde ahora hay órdenes | confirmado | «Debe (comprobantes vigentes)», la columna «Comprobante» y «Comprobantes con saldo» |
| 7 | `<main>` y `<h1>` duplicados en «Nueva orden» sin modelos | confirmado | un párrafo en una tarjeta en lugar de `PageNotice` |
| 8 | Las pruebas del trigger cubrían una parte de D-13, y el presupuesto proponía «USD» sin moneda principal ni precios | confirmado | una prueba con cada rechazo nuevo, `rejected → approved`, salir de entregada y de cancelada y un vaciado que arrastra otro cambio, cada uno por su mensaje; sin moneda propuesta, el campo pide elegir una |

**Fuera de la revisión, en la integración completa**: la prueba de rendimiento de `supplier-payments` (el detalle de una sesión con 500 pagos, umbral de 754 ms) falló dos de tres veces con este cambio y **una de tres en `8b5f320`, sin él** (856 ms). Medida consulta por consulta en los dos árboles, no hay diferencia: es una prueba al borde del umbral en esta máquina, previa a la 29.6. `catalog.test.ts` suma a su lista exacta el CHECK y el índice del producto de servicio: cambia la forma, no la conducta.
