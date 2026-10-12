# 0021 — La venta

- Estado: **aceptada** (decisión del usuario del 2026-10-12, después de la revisión independiente y con sus correcciones, entre ellas la de R-2, que cambia el motivo de la anulación de D-7 a una lista cerrada; subfase 20.1, [brief-20.1](brief-20.1-adr-de-la-venta.md), aprobado el 2026-10-12 con las recomendaciones de D-1 a D-15).
- Fecha: 2026-10-12
- Nivel: **diseñado**. No hay código, tablas ni ejecución.

## Contexto

El [Roadmap](../planning/Roadmap.md) §Fase 20 pide «la venta que confirma un pedido o se registra sola, descuenta el stock y emite un comprobante interno». El [ADR 0020](0020-el-pedido.md), punto 4, lo enmendó el 2026-10-11:

- entregar un pedido ya descuenta el stock, así que **una venta que corresponde a un pedido no vuelve a descontar**;
- solo una venta sin pedido descuenta;
- la venta no «confirma» un pedido;
- cómo se vincula la venta al pedido lo decide esta fase.

El usuario abrió la Fase 20 el 2026-10-12, con la Fase 13 abierta ([ADR 0016](0016-el-crm-se-amplia-hacia-un-erp-por-fases.md), punto 3).

Lo que acota la decisión, verificado el 2026-10-12 contra `main` (`89dc3ef`):

- **El [ADR 0019](0019-bases-de-los-comprobantes.md)** fija:
  - la numeración sin huecos por `(organization_id, tipo)`, con el contador bloqueado `FOR UPDATE`;
  - una moneda por comprobante, la de su primera línea, y el rechazo de una línea sin precio o en otra moneda;
  - los montos copiados al emitir y el redondeo por línea con el medio hacia afuera del cero;
  - que un comprobante emitido no se edita ni se borra y **se anula con otro**, conservando su número;
  - la leyenda «Documento no válido como factura».

  Deja abiertos el signo de los montos de una anulación y, para «la primera fase que discrimine el IVA», la condición de la organización y la alícuota de cada producto.
- **El ADR 0020**:
  - el pedido es un compromiso con estado, con `delivered` y `cancelled` finales;
  - sus líneas guardan el precio, la moneda y el total copiados al crear;
  - el contador vive en `numbering` para que la venta numere sin depender de `orders`;
  - el orden de bloqueo es cliente, productos, saldos y, al final, el contador (punto 6).
- **`numbering`**: `document_kind` solo tiene `order`. La única escritura del contador es `takeNextNumber`, vigilada por `counter-writes`, y la llama el módulo que emite con `nextDocumentNumber`.
- **`inventory`**:
  - `inventory_movement_type` tiene `adjustment_positive`, `adjustment_negative` y `order_delivery`, y el ajuste manual acepta solo los dos primeros;
  - lo disponible es `quantity_on_hand − quantity_reserved`, con un `CHECK` que impide que lo reservado supere el saldo;
  - `reserveStock`, `releaseStock` y `deliverStock` reciben la transacción de `orders`, y la guarda `stock-writes` fija quién escribe.
- **`orders`**:
  - las transiciones bloquean la cabecera `FOR UPDATE` dentro de su propia transacción, y la interfaz no expone una lectura con bloqueo para otro módulo;
  - el total de una línea lo calcula `computeLineTotal` de `orders/line-total.ts`;
  - **solo `ingestion` depende de `orders`**, desde la 19.4.
- **Dinero**: `moneyToDatabase` rechaza los montos negativos (`src/shared/money/index.ts`).
- **El cliente**: el [ADR 0007](0007-identificador-de-cliente-solo-telefono.md) no admite documento ni código interno. La 17.1 mandó documento y CUIT/CUIL a la Fase 20 con la condición frente al IVA.
- **No hay un negocio real** (13.5.2-b): su condición frente al IVA no se conoce.
- **No hay ninguna vista de impresión** en `src/` ni una dependencia de PDF.

## Decisión

### 1. Qué decide este ADR

**Decide**:
- la naturaleza de la venta;
- su vínculo con el pedido y la venta sin pedido;
- el número y lo que se guarda;
- el stock y la anulación;
- el comprobante entregable;
- el IVA y los datos fiscales del cliente;
- las pantallas y las dependencias;
- los roles, el agente y los datos de un cliente;
- qué crea cada subfase.

**No decide**:
- los cobros, los medios de pago y las señas (Fase 21);
- las devoluciones como operación propia y las notas de crédito o débito parciales;
- los descuentos, las listas de precios y los tipos de cambio;
- la factura de ARCA (ADR 0016, punto 6);
- las métricas de ventas.

### 2. La venta es un comprobante emitido, de solo inserción

- **La venta es el comprobante del ADR 0019.** Lo que la base guarda al emitirla no cambia nunca.
- **La cabecera (`sales`) y las líneas (`sale_lines`) son de solo inserción**: `crm_app` con `SELECT` e `INSERT`, y un trigger que rechaza `UPDATE` y `DELETE` (ADR 0013, regla 10 de DataModel). El test de cobertura de privilegios las suma a la lista de tablas de solo inserción.
- **No tiene estados.** «Anulada» se deriva de que exista su anulación (punto 6), que es otro comprobante.
- **Se audita en la misma transacción**, con un `entity_type` nuevo, `sale` (valor aditivo del enum), y la acción `create`.

### 3. La venta de un pedido

- **Se emite solo desde un pedido `delivered`.** Es cuando la mercadería salió y el stock ya bajó; la venta registra la operación comercial y **no toca el stock** (ADR 0020, punto 4).
- **Copia del pedido** el cliente, la moneda, las líneas (producto, cantidad, precio unitario, moneda y total, en el mismo orden) y el total. **No vuelve a cotizar**: el cliente aceptó el precio del pedido, y una venta que dijera otro monto contradiría al pedido entregado.
- **No exige que el cliente ni los productos estén activos**: la operación ya ocurrió, como cancelar un pedido no depende del cliente.
- **Es una relectura del ADR 0019, punto 3**, como la del ADR 0020 («emitir» leído como «crear el pedido»): la venta de un pedido **copia los montos del pedido**, no el precio vigente al emitirse, y no rechaza un producto que hoy no tenga precio. El precio vigente se aplicó al crear el pedido, y el pedido no se recalcula (ADR 0020, punto 3).
- **Un pedido tiene a lo sumo una venta vigente** (sin anular). Si se anula, se puede emitir otra para corregir. Lo garantizan dos defensas:
  - **el servicio** bloquea la cabecera del pedido `FOR UPDATE` en la transacción de `sales` y comprueba que no haya una venta vigente del pedido. Dos emisiones simultáneas se serializan en esa fila;
  - **la base**, con una cadena de reemplazos:
    - la venta guarda `replaces_sale_id`, la venta anulada a la que reemplaza;
    - un índice único parcial sobre `(organization_id, order_id) WHERE replaces_sale_id IS NULL` deja una sola primera venta por pedido;
    - un `UNIQUE (replaces_sale_id)` deja reemplazar cada venta una sola vez;
    - el trigger de alta rechaza un reemplazo cuya venta reemplazada no esté anulada o sea de otro pedido.

    Así las ventas de un pedido forman una sola cadena, y solo su último eslabón puede estar vigente.
- **La venta apunta al pedido** con la clave compuesta `(organization_id, order_id)` hacia `orders (organization_id, id)`, `ON DELETE RESTRICT`. **`sales` depende de `orders`; `orders` no depende de `sales`** (punto 9).
- **`orders` expone una función nueva** que recibe la transacción de `sales`, bloquea la cabecera `FOR UPDATE` y devuelve el pedido con sus líneas. Es una lectura con bloqueo, no una escritura: `orders` no escribe nada por la venta, y el estado del pedido no cambia.

### 4. La venta sin pedido

- **Se arma con líneas, como un pedido**, con las reglas del ADR 0019, puntos 3 y 4, y las del ADR 0020, punto 3:
  - el precio unitario es el vigente de `product_prices`, leído con el producto bloqueado en modo compartido;
  - una moneda por venta, la de su primera línea;
  - se rechaza la línea de un producto sin precio, con el precio en otra moneda o inactivo;
  - un producto no se repite: la cantidad va en una sola línea;
  - la cantidad es mayor que cero;
  - el total de la línea se redondea a los decimales de la moneda con el medio hacia afuera del cero, y el total es la suma;
  - se rechazan una línea en cero y los montos que no caben en `numeric(14, 2)`;
  - el límite de líneas es el del pedido.

  **Las reglas se comparten con el pedido sin duplicarlas.** Dónde vive el código compartido (por ejemplo, `computeLineTotal` movido a `src/shared/`, o expuesto por la interfaz de `orders`) lo decide el brief de la 20.3, sin que `orders` dependa de `sales`.
- **El cliente es opcional.**
  - Sin cliente es la venta de mostrador a un consumidor final no identificado.
  - Con cliente, el cliente tiene que estar activo, como en el alta de un pedido, y se bloquea en modo compartido.
  - Obligar a un cliente forzaría una ficha ficticia («Consumidor final») en la lista de clientes, sus filtros y sus métricas.

### 5. El stock de una venta sin pedido

- **Descuenta al emitir**, con un movimiento de `inventory_movements` de un **tipo nuevo, `sale`** (valor aditivo del enum), uno por línea, con `balance_after` y el motivo `Venta V-000123`. **Sin clave foránea a la venta**: `inventory` no depende de `sales`, como no depende de `orders`.
- **Comprueba lo disponible, no el saldo.** Se rechaza con `BUSINESS_RULE_VIOLATION` y la regla `insufficient_stock` si alguna línea pide más que `quantity_on_hand − quantity_reserved`, informando lo disponible de cada línea que no alcanza, y no se descuenta nada parcialmente. **Una venta sin pedido nunca se lleva unidades reservadas**: si lo hiciera, el `CHECK` de lo reservado se dispararía como un defecto, o un pedido confirmado quedaría sin poder entregarse.
- **Es una función nueva de `inventory`**, que recibe la transacción de `sales`, bloquea los saldos y escribe saldo y movimiento juntos. **No es una extensión de `applyStockChange`**, como la entrega del pedido. La guarda `stock-writes` se extiende a ella y a la reposición del punto 6, con sus llamadores.
- **Lo reservado no cambia** en la venta sin pedido ni en la reposición de su anulación (punto 6): las dos mueven solo el saldo físico, siempre con su movimiento.
- **El ajuste manual sigue aceptando solo sus dos tipos**: `sale` y `sale_void` no los acepta, y un test lo fija.
- **Lo disponible y el estado de stock** de las pantallas y de la lectura v2 ya descuentan lo reservado. Una venta sin pedido baja el saldo físico, así que los dos lo reflejan sin cambiar ningún cálculo ni contrato.

### 6. La anulación

- **Una venta se anula entera con otro comprobante, la anulación** (`sale_voids`), de solo inserción como la venta, con su propia serie: tipo `sale_void` en `document_kind` y prefijo **`A`** (`A-000045`). **Sin anulaciones parciales.**
- **Una venta se anula a lo sumo una vez**: `UNIQUE (sale_id)`. Una segunda anulación simultánea choca con esa restricción y se informa como regla de negocio (`already_voided`), no como error.
- **El signo**: **los montos de la anulación son los de la venta, positivos**, y el efecto lo da el tipo del comprobante, como en `inventory_movements`. La anulación copia la moneda y el total de la venta y no tiene líneas propias: anula todas las de su venta. `src/shared/money/` no cambia. Montos negativos obligarían a cambiar `moneyToDatabase` y cada suma, y mezclarían dos tipos de comprobante en una serie.
- **El stock**:
  - la anulación de una **venta sin pedido** repone lo que esa venta descontó, con un movimiento de un **tipo nuevo, `sale_void`**, uno por línea, con el motivo `Anulación A-000045 de la venta V-000123`. **No se rechaza por un producto inactivo**: lo que salió tiene que poder volver, como cancelar libera siempre. Si la reposición dejara un saldo que no cabe en `numeric(14, 3)`, se rechaza con la regla `stock_limit`, como el ajuste;
  - la anulación de una **venta de pedido no toca el stock**: el pedido sigue entregado y la mercadería no volvió por la anulación. Si vuelve, es un ajuste manual. Las devoluciones como operación propia quedan fuera.
- **La anulación de una venta de pedido deja el pedido libre** para otra venta (punto 3).
- **Lleva un motivo obligatorio, de una lista cerrada y sin texto libre**: un enum nuevo, `sale_void_reason`, con valores como «error de carga», «operación no concretada», «cliente equivocado» y «otro». La lista exacta la fija el brief de la 20.4. *Decidido por el usuario el 2026-10-12, por la revisión independiente (R-2)*: el brief aprobado decía un texto de 1 a 200 caracteres. Un texto libre quedaría en una tabla de solo inserción que cuelga de un cliente a través de la venta, y el vaciado no podría borrarlo (ADR 0015). Una lista no guarda nada de la persona.
- **La auditoría de la anulación** lleva el número de la anulación y su motivo de la lista, y nada más.
- **Se audita en la misma transacción** sobre la venta: `entity_type` `sale` con una acción nueva, `void` (valor aditivo del enum), para que el historial de la venta muestre su anulación.

### 7. El número y lo que se guarda

- **Toda venta lleva número** del contador de `numbering`, con un tipo nuevo `sale` en `document_kind` y el prefijo **`V`** y seis dígitos (`V-000123`). Se asigna al emitir, en la misma transacción; si se revierte, el número no se consume.
- **`UNIQUE (organization_id, number)`** en `sales` y en `sale_voids`: equivale al `UNIQUE (organization_id, tipo, número)` del ADR 0019, porque cada tabla guarda un solo tipo, como `orders`.
- **La cabecera de la venta** guarda:
  - el número, la organización y el cliente (nulable);
  - el pedido (nulable) y la venta reemplazada (nulable, solo con pedido);
  - la moneda y el total;
  - el autor y la fecha de emisión.

  El autor es siempre un usuario, porque el agente no emite (punto 10).
- **Las claves hacia filas de la misma organización son compuestas** con `organization_id` (DataModel, convención de la 4.1, D-3): la venta hacia el cliente y el pedido, la línea hacia la venta y el producto, `replaces_sale_id` hacia `sales` y la anulación hacia su venta.
- **La venta reemplazada solo existe con pedido**: `CHECK (replaces_sale_id IS NULL OR order_id IS NOT NULL)`. El trigger que exige el mismo pedido compara con `IS DISTINCT FROM`, para que un `NULL` no se escape de la comparación.
- **Cada línea** guarda su posición, el producto, la cantidad, el precio unitario, la moneda y el total.
- **La anulación** guarda el número, la organización, la venta, la moneda, el total, el motivo, el autor y la fecha.
- **Sin texto libre de la persona**, como el pedido: ni notas ni dirección.
- **El orden de bloqueo** extiende el del ADR 0020, punto 6, con la regla de siempre: el contador va al final.

  | Operación | Bloquea, en este orden |
  |---|---|
  | Venta de un pedido | la cabecera del pedido `FOR UPDATE`; el contador de `sale` |
  | Venta sin pedido | el cliente en modo compartido, si hay; los productos en modo compartido, por `product_id`; sus saldos `FOR UPDATE`, en el mismo orden; el contador de `sale` |
  | Anulación de una venta de pedido | la cabecera del pedido `FOR UPDATE`; el contador de `sale_void` |
  | Anulación de una venta sin pedido | los productos en modo compartido, por `product_id`; sus saldos `FOR UPDATE`, en el mismo orden; el contador de `sale_void` |

  Ningún camino bloquea un contador y después otra fila, ni saldos antes que productos. Las transiciones del pedido bloquean la cabecera, los productos y los saldos en ese orden, así que no se forma un ciclo con la venta.

### 8. El comprobante entregable

- **Emitir es guardar el comprobante y mostrar una página imprimible** del detalle de la venta y de la anulación, con estilos `@media print` y **sin dependencias nuevas**. El usuario la imprime o la guarda como PDF desde el navegador.
- **La página muestra**:
  - el nombre de la organización;
  - el número, la fecha en la zona de la organización, el cliente si hay y el pedido si hay;
  - las líneas y el total;
  - en la anulación, la venta que anula y el motivo;
  - la leyenda **«Documento no válido como factura»** (ADR 0019, punto 6).
- **Un PDF generado en el servidor** exigiría una dependencia y servir un archivo nuevo, para un resultado que el navegador ya da. **Mandar el comprobante por WhatsApp** sería un efecto externo que el CRM no produce (ADR 0014; ADR 0016, punto 7).

### 9. Pantallas y dependencias

- **Una lista de ventas**, con filtros por fecha, cliente y si está anulada, y **un detalle** con su anulación si la tiene.
- **El detalle del pedido muestra su venta vigente y el detalle de la venta muestra su pedido.** Lo compone la página, llamando a la interfaz de cada módulo, **nunca `orders` leyendo `sales`**, como el emisor de la credencial de la 19.4.
- **El módulo `sales`** depende de:
  - `crm`, para el cliente;
  - `catalog`, para los productos y su precio;
  - `inventory`, para el stock;
  - `orders`, para leer y bloquear el pedido;
  - `numbering`, `organizations` y `audit`;
  - `auth`, solo en `schema.ts` por la clave del autor.

  **Ningún módulo depende de `sales`.** Hoy no lo fija ninguna guarda: la guarda de dependencias entre módulos sigue como tarea aparte (brief-19.4, R-2).

### 10. Roles y agente

- **Solo un `admin`** emite y anula, como crea y entrega pedidos y ajusta stock.
- **Un `viewer`** ve la lista y el detalle, **sin los datos de contacto del cliente** (`contact` nulo, como en `crm` y en `orders`).
- **Ninguna venta muestra el costo ni el margen**: siguen siendo solo de un `admin`, en el producto.
- **El agente no emite, no anula ni lee ventas.** Nadie pidió ese uso, y emitir una venta es cerrar la operación comercial, que el CRM deja a una persona como confirmar un pedido. El ADR 0016, punto 5, prohíbe al agente registrar cobros, pagos y movimientos de caja; no habla de ventas, y esta decisión no se apoya en él. **Ningún contrato con el agente cambia.** La lectura de los pedidos del cliente que el agente pidió después de la 19.4 sigue siendo una candidata aparte, fuera de esta fase.

### 11. El IVA y los datos fiscales del cliente

- **La Fase 20 no discrimina el IVA.** El comprobante muestra el precio final, con los impuestos incluidos si corresponden (ADR 0019, punto 4), sin alícuota, neto ni IVA. Es lo que corresponde a un comprobante interno y a la condición más probable de un negocio chico. Ninguna de las dos cosas está confirmada.
- **La condición de la organización y la alícuota de cada producto siguen sin tabla** hasta que la 13.5.2-b conozca la condición del negocio real. Si es responsable inscripto, una subfase posterior las crea, discrimina el IVA en los comprobantes nuevos y revisa el margen (ADR 0019, punto 5).
- **Supera la previsión del ADR 0019**: el punto 7 asigna esas tablas a «la primera fase que discrimine el IVA (la **20**), o antes si la 13.5.2-b cambia la base del margen». La regla es «la primera fase que discrimine»; el paréntesis anticipaba que sería la 20, y este ADR decide que no lo es. Se le agrega una nota fechada que remite a este ADR, sin cambiar su texto.
- **Documento y CUIT/CUIL no entran en la Fase 20.** Un comprobante interno a consumidor final no los necesita, y sin discriminar el IVA no tienen uso. Entran con la subfase que discrimine el IVA o con el ADR de la factura de ARCA, con una enmienda del ADR 0007 y su lugar en el vaciado. **El ADR 0007 no cambia.**

### 12. Datos de un cliente

- **La venta apunta al cliente** con la clave compuesta `(organization_id, client_id)` hacia `clients (organization_id, id)`, `ON DELETE RESTRICT`. **Un cliente con ventas no se borra**: se vacía, como un cliente con pedidos.
- **La venta y la anulación no guardan texto libre**, así que el vaciado no las toca y las cifras quedan. El motivo de la anulación es un valor de una lista cerrada (punto 6), no un texto de la persona.
- **La exportación incluye sus ventas** (número, fecha, pedido, moneda, total, líneas y si está anulada) **y sus anulaciones**, y el informe del runbook las cuenta.
- **Si una fase futura agrega texto de la persona** a la venta, lo suma al vaciado, con el mismo test de columnas que `clients`.

### 13. Qué crea cada subfase

| Qué | Subfase |
|---|---|
| El módulo `sales`; `sales` (con `order_id` obligatorio) y `sale_lines`; el tipo `sale` de `document_kind`; el `entity_type` `sale`; la función de `orders` que bloquea un pedido para la venta; la emisión desde un pedido entregado; la lista, el detalle y la página imprimible; la venta en el detalle del pedido; las ventas en la exportación y en el criterio de borrado de un cliente; `sales` en la lista de módulos de dominio de `eslint.config.mjs` | **20.2** |
| La venta sin pedido: `order_id` y el cliente nulables; el tipo de movimiento `sale` y su función en `inventory`; la regla de lo disponible; las reglas de línea compartidas con el pedido | **20.3** |
| La anulación: `sale_voids`; el tipo `sale_void` de `document_kind` y del movimiento; la reposición; `replaces_sale_id` con su índice y su trigger; la acción `void` de la auditoría; el enum `sale_void_reason`; las anulaciones en la exportación | **20.4** |

`replaces_sale_id` llega con la 20.4: antes no hay anulaciones, y en la 20.2 alcanza con un índice único sobre `(organization_id, order_id)`, que la 20.4 reemplaza por el parcial.

## Alternativas descartadas

- **La venta con estado** (`issued`, `voided`) y un trigger de columnas permitidas, como `orders`: un comprobante emitido cambiaría una columna, y el ADR 0016, punto 4, pide solo inserción para lo que mueve dinero.
- **Vender desde un pedido `confirmed`**: la venta existiría sin que la mercadería saliera. Si el negocio cobra antes de entregar, lo resuelve la Fase 21 con un cobro contra el pedido.
- **Varias ventas vigentes por pedido**: el pedido no tiene entregas parciales (ADR 0020).
- **Volver a cotizar la venta de un pedido**: diría otro monto que el pedido entregado que el cliente aceptó.
- **Un cliente obligatorio en la venta sin pedido**: forzaría una ficha ficticia.
- **Descontar contra el saldo físico en la venta sin pedido**: se llevaría unidades reservadas (punto 5).
- **Extender `applyStockChange` para la venta**: mezclaría el ajuste manual con una salida de otro módulo, como ya se descartó para la entrega.
- **Una clave foránea del movimiento a la venta**: invertiría la dependencia entre `inventory` y `sales`.
- **Solo el servicio para impedir dos ventas vigentes del mismo pedido**: el invariante quedaría sin defensa en la base, contra la regla de que la base es la última.
- **Montos negativos en la anulación**: exigen cambiar `src/shared/money/` y cada suma.
- **Anular con una marca en la venta**: contradice el punto 2 y el ADR 0016, punto 4.
- **Anulaciones parciales**: son notas de crédito, sin un uso pedido.
- **Un motivo de texto libre**, el de D-7 del brief: quedaría fuera del alcance del vaciado (punto 6). Hacerlo vaciable exigiría una excepción de trigger y una enmienda del ADR 0015, como las notas de la conversación, para un texto que una lista ya cubre.
- **Reponer el stock al anular una venta de pedido**: la mercadería no volvió por la anulación, y el pedido sigue entregado.
- **Un PDF generado en el servidor**: dependencia nueva para lo que el navegador ya da.
- **Discriminar el IVA ahora con monotributo por defecto**: tablas para una condición que nadie confirmó.
- **Documento y CUIT/CUIL ahora**: datos personales sin uso, contra FR-CLI-05 y el ADR 0007.
- **Que `orders` lea las ventas para su detalle**: dependencia circular entre `orders` y `sales`.
- **Que el agente emita o lea ventas**: ningún uso pedido.
- **Una sola serie para la venta y la anulación**: los números de las ventas tendrían huecos donde caen las anulaciones, y un hueco se lee como un comprobante borrado (ADR 0019, punto 2).
- **El número de la venta al cerrar el día, o un número por punto de venta**: el ADR 0019 fija el número al emitir y un solo punto de emisión.
- **Copiar en la venta el nombre o el teléfono del cliente**, para que el comprobante no dependa de la ficha: serían datos de la persona en una tabla de solo inserción, que el vaciado no alcanza. El comprobante lee la ficha.
- **`ON DELETE CASCADE` o `SET NULL` hacia el cliente**: borrar una ficha borraría ventas o dejaría ventas de un cliente identificado sin cliente, y el registro comercial tiene que sobrevivir a un borrado a pedido, como en el ADR 0020, punto 10.
- **Dejar las ventas fuera de la exportación**: son operaciones de la persona, y el runbook exporta todo lo que el CRM le atribuye.

## Consecuencias

- **Enmiendas, con fecha y conservando el texto anterior**, al aceptarse:
  - el **Roadmap** §Fase 20, con las subfases, y §Fase 17 (documento y CUIT/CUIL «quedan para la Fase 20»: la 20.1 los posterga);
  - **DataModel**, que está por encima de los ADR en la jerarquía de `CLAUDE.md`, así que la enmienda se escribe al aceptarse este ADR, con la vigencia de cada parte:
    - **§`inventories`**: la lista de quién cambia `quantity_on_hand` y de quién escribe la tabla es cerrada. Suma la venta sin pedido (20.3) y la reposición de su anulación (20.4), las dos **con su movimiento**. La regla que se conserva: el saldo físico nunca cambia sin su movimiento, y lo reservado lo cambian solo la reserva, la liberación y la entrega;
    - **la regla 14** («Ningún modelo de ventas … existe en este schema»): deja de ser cierta para las ventas desde la 20.2;
    - **§`clients`**: «consumidor final» como condición frente al IVA y documento y CUIT/CUIL ya no llegan con la Fase 20; quedan para la subfase que discrimine el IVA (punto 11);
    - **§`document_counters`**: la Fase 20 suma dos tipos, `sale` y `sale_void`, no uno;
    - **§«Explícitamente fuera de este modelo»**: una nota de diseño con las tablas que vienen (`sales`, `sale_lines`, `sale_voids`; `sale_details` no existirá), sin tablas. Precisa que la nota del ADR 0019 («en cada línea, los montos y el IVA de cuando se emitió») vale sin IVA mientras no se discrimine;
  - **Overview**: §Evolución hacia ERP, con fecha. `sales` sí suma a `inventory` dos tipos de movimiento y dos funciones, y a `orders` una función de su interfaz. La 20.2 actualiza la tabla de módulos: `sales`, y la fila de `orders`, que ya no tendrá a `ingestion` como único módulo que depende de él;
  - **FR-CLI-05** de [FunctionalRequirements](../product/FunctionalRequirements.md): «entran con el comprobante de la Fase 20» pasa a la subfase que discrimine el IVA;
  - **el ADR 0019**: una nota fechada que remite a este, sin cambiar su texto, por la relectura del punto 3 en la venta de un pedido (punto 3 de este ADR), por el punto 7 (la Fase 20 no discrimina el IVA) y por el signo de la anulación;
  - **el ADR 0020**: una nota fechada, sin cambiar su texto, por:
    - el punto 4, que dejó el vínculo con la venta a esta fase;
    - las escrituras de `inventories` (l. 80-82), a las que la Fase 20 suma dos funciones;
    - el punto 2, que esperaba un solo tipo de la Fase 20;
    - §Consecuencias, porque `ingestion` deja de ser la única dependencia hacia `orders`;
  - **`docs/decisions/README.md`**: este ADR y su brief.
- **Por decisión**:
  - **solo inserción (2)**: el test de cobertura de privilegios suma `sales`, `sale_lines` y `sale_voids`;
  - **venta de un pedido (3)**: `orders` suma una función de su interfaz que bloquea un pedido para otro módulo;
  - **venta sin pedido (4, 5)**: el código de las reglas de línea se comparte con el pedido; `inventory` suma dos funciones y `stock-writes` se extiende a ellas;
  - **anulación (6)**: `audit_action` suma `void`;
  - **número (7)**: `document_kind` suma `sale` y `sale_void`;
  - **pantallas (8, 9)**: la primera vista de impresión del CRM;
  - **datos de un cliente (12)**: el runbook y `scripts/client-data-delete.ts` cuentan las ventas, en la 20.2, y las anulaciones, en la 20.4.
- **Ningún contrato con el agente cambia**, y el agente no recibe ningún aviso en esta fase.
- **Riesgos**:
  - **El IVA**: si el negocio real resulta responsable inscripto, los comprobantes emitidos antes de discriminar el IVA quedan sin él. Lo mitiga que son internos y no fiscales, y que hoy no hay un negocio real.
  - **La Ley 27.743**: el ADR 0019 dejó **pendiente** si un documento interno entregado a un consumidor final queda fuera de la obligación de detallar el IVA contenido (puntos 4 y 6), y la 20.2 crea justamente un comprobante imprimible para entregar. La leyenda «Documento no válido como factura» no resuelve esa pregunta. Se confirma con la 13.5.2-b, con una fuente leída, **antes de que un negocio real entregue comprobantes**; hasta entonces solo los ve la organización de demostración.
  - **La serialización**: una organización con muchas ventas simultáneas se serializa en la fila del contador y en los saldos de los productos más vendidos. Es aceptable mientras el volumen sea el de un negocio chico, como en los ADR 0019 y 0020.

## Lo que este ADR no decide

- Los cobros, las señas, los medios de pago y la caja (Fase 21).
- Las devoluciones como operación propia y las notas de crédito o débito parciales.
- La discriminación del IVA, la condición de la organización y las alícuotas (con la 13.5.2-b).
- La factura de ARCA.
- Dónde vive el código de las reglas de línea compartidas (brief de la 20.3).
- Si la venta sin pedido rechaza con `CONFLICT` un precio que cambió mientras se cargaba, como el alta de un pedido (brief-19.2, D-5), y si busca el producto por su código de barras, que el brief-17.2 reservó para «las ventas de la Fase 20» (brief de la 20.3).
- Las métricas de ventas.
