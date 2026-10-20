# Runbook: exportar o eliminar los datos de un cliente

**Estado: validado localmente y en CI.** No ejecutado todavía contra un entorno con datos reales. *Actualizado el 2026-10-01 por la 13.4*: borrar pasó de minimizar la ficha a vaciar el contenido de todo lo del cliente. *Actualizado el 2026-10-07 por la 16.4*: el informe, la exportación y el vaciado incluyen las notas de sus conversaciones. *Actualizado el 2026-10-08 por la 17.1*: la ficha tiene campos ampliados, y la exportación y el vaciado los alcanzan; esa parte está validada localmente y pasa a la CI con su commit. *Actualizado el 2026-10-14 por la 21.3*: la exportación trae sus cobros, el informe los cuenta y un cliente con cobros no se borra; validado localmente. *Actualizado el 2026-10-14 por la 21.4*: la exportación trae también sus señas, los cobros contra un pedido, con el número del pedido; validado localmente. *Actualizado el 2026-10-14 por la 21.5*: la exportación trae las anulaciones de sus cobros, sus devoluciones y las anulaciones de sus devoluciones, el informe las cuenta y un cliente con devoluciones no se borra; validado localmente.

Atiende un pedido de acceso o de borrado de los datos de una persona, que
[NonFunctionalRequirements](../product/NonFunctionalRequirements.md) §Privacidad exige que exista
aunque sea manual en el MVP. Nace de la subfase 8.2
([brief-8.2](../decisions/brief-8.2-logs-y-privacidad.md)).

Lo corre un operador con acceso a la base, no la aplicación: no hay pantalla para esto y no está
previsto que la haya en el MVP.

*Nota del 2026-10-15 ([ADR 0023](../decisions/0023-compras-y-proveedores.md), punto 14)*: este
runbook **no cubre a los proveedores**, que desde la Fase 22 pueden ser personas físicas. El ADR
deja diseñado el vaciado de la ficha de un proveedor, incluida la extensión del trigger de
`audit_logs`, y se construye cuando un caso lo pida.

*Nota del 2026-10-18 ([ADR 0024](../decisions/0024-rubros-y-capacidades.md), punto 14)*: la Fase 29
suma datos del cliente que este runbook tiene que exportar y vaciar cuando existan: el DNI y el
Instagram (`clients.document_number` e `instagram`, 29.7), las recepciones de usados (`trade_ins`,
29.7), las órdenes de servicio de sus equipos con el IMEI (`service_orders`, 29.6) y sus turnos
(`appointments`, 29.10). Sus claves al cliente son `RESTRICT`. Cada subfase amplía este runbook y
su test cuando crea la tabla.

## Antes de tocar nada

1. **Identificá el cliente**: necesitás su `organization_id` y su `client_id`. Los dos salen de la
   URL de su ficha en la aplicación.
2. **Confirmá quién pide y con qué derecho.** El procedimiento no verifica identidad: eso pasa
   fuera del sistema.
3. **Corré primero el informe**, que no escribe nada:

   ```
   npx tsx scripts/client-data-delete.ts --org <organization_id> --client <client_id>
   ```

   Dice cuántas conversaciones, mensajes, notas de conversación, entradas de auditoría, etiquetas, desde la 19.2 pedidos, desde la 20.2 ventas desde la 21.3 cobros y desde la 21.5 anulaciones de cobros, devoluciones y anulaciones de devoluciones tiene, si la ficha se puede
   borrar, y qué quedaría después.

## Exportar

```
npx tsx scripts/client-data-export.ts --org <organization_id> --client <client_id> --out <archivo.json>
```

Incluye los seis orígenes que guardan datos de la persona y, desde la 19.2, sus pedidos; desde la 20.2, también sus ventas; desde la 21.3, sus cobros:

| Origen | Qué lleva |
|---|---|
| `clients` | nombre, teléfono en E.164 y notas; *desde la 17.1*, email, tipo, empresa, cargo, dirección (calle, ciudad, provincia y código postal) y segmento ([brief-17.1](../decisions/brief-17.1-campos-de-clientes.md), D-12) |
| `conversations` | sus conversaciones, con estado y fechas |
| `messages` | sus mensajes, **con el cuerpo** |
| `conversation_notes` | *desde la 16.4*: las notas internas de sus conversaciones, con el texto, la fecha y el id del usuario del CRM que la escribió ([brief-16.4](../decisions/brief-16.4-notas-de-la-conversacion.md), D-5) |
| `audit_logs` | los cambios sobre su ficha, **con los valores anteriores** de teléfono y notas, y desde la 16.1 las etiquetas que se le pusieron y quitaron |
| `client_tag_assignments` | *desde la 16.1*: sus etiquetas actuales, con su nombre, color, estado y fecha (campo `client_tags`; [brief-16.1](../decisions/brief-16.1-etiquetas-de-clientes.md), D-10) |
| `orders` y `order_lines` | *desde la 19.2*: sus pedidos, con número, estado, fechas, moneda y total, y sus líneas, con el producto (su SKU y su nombre de hoy), la cantidad, el precio y el total (campos `orders` y `order_lines`; [ADR 0020](../decisions/0020-el-pedido.md), punto 10). No tienen texto de la persona, pero son suyos |
| `sales` y `sale_lines` | *desde la 20.2*: sus ventas, con número, fecha, el número del pedido, moneda y total, y sus líneas, con el producto (su SKU y su nombre de hoy), la cantidad, el precio y el total (campos `sales` y `sale_lines`; [ADR 0021](../decisions/0021-la-venta.md), punto 12). Si está anulada se suma con la 20.4. *Desde la 20.4* ([brief-20.4](../decisions/brief-20.4-la-anulacion.md), D-10): cada venta dice si está anulada (`voided`) y por cuál anulación (`void_display_number`), y la lista `sale_voids` trae cada anulación de sus ventas, con el número, la fecha, la venta, la moneda, el total y el motivo de la lista. El informe de `client-data-delete.ts` las cuenta y dice que quedan: no guardan texto de la persona, y el vaciado no las toca. *Desde la 20.3*, también sus ventas sin pedido, con el pedido en `null` ([brief-20.3](../decisions/brief-20.3-la-venta-sin-pedido.md), H-9); una venta sin cliente no es de ningún cliente y no aparece |
| `receipts` | *desde la 21.3* ([brief-21.3](../decisions/brief-21.3-el-cobro-de-una-venta.md), D-9; [ADR 0022](../decisions/0022-cobros-y-caja.md), punto 14): sus cobros, con el número (`display_number`, `R-000123`), la fecha, la venta y su número, el medio, la moneda y el monto (campo `receipts`). Llegan al cliente por el `client_id` que el cobro copia de la venta; el cobro de una venta sin cliente no aparece. No guardan texto de la persona. *Desde la 21.4* ([brief-21.4](../decisions/brief-21.4-la-sena.md), D-9): también sus señas, que copian el cliente del pedido; cada fila dice su destino (`target`, `sale` u `order`) y, en una seña, el pedido y su número (`order_id`, `order_number`) en lugar de la venta |
| `receipt_voids`, `refunds` y `refund_voids` | *desde la 21.5* ([brief-21.5](../decisions/brief-21.5-la-anulacion-y-la-devolucion.md), D-10; ADR 0022, punto 14): las anulaciones de sus cobros (`AR-…`, con el cobro y su número, la moneda, el monto y el motivo de la lista), sus devoluciones (`D-…`, con su destino, el medio, la moneda y el monto) y las anulaciones de sus devoluciones (`AD-…`, con la devolución y su número). Las anulaciones llegan al cliente por su cobro o su devolución; la devolución, por el `client_id` de la cuenta. La devolución de una venta sin cliente no aparece. **Los comprobantes, no el saldo**: calcularlo acá sería una segunda implementación de la regla de imputación. No guardan texto de la persona |
| `service_orders` y `service_order_lines` | *desde la 29.6* ([brief-29.6](../decisions/brief-29.6-las-reparaciones-de-equipos-de-clientes.md), D-11): sus órdenes de servicio, con número, fecha, estado, el modelo (su nombre de hoy), **el IMEI del equipo y lo que reportó**, que son datos suyos, lo que paga y sus fechas, y el presupuesto por reparación, con el nombre de hoy del tipo y el precio. Sin el técnico ni su costo, que no son datos de la persona |

**No incluye `ingestion_events`**, y es a propósito: esa tabla guarda el emisor, una referencia
opaca suya, el hash del payload y fechas. El propio archivo lo dice en su campo `excluded`, para
que quien lo reciba no tenga que deducirlo. *Precisión del 2026-10-01 ([brief-13.4](../decisions/brief-13.4-retencion-y-borrado.md),
I-1)*: que la referencia no lleve el teléfono lo pide el contrato al emisor, y el CRM no lo
valida. Con la API oficial de WhatsApp, un `wamid` crudo lo llevaría codificado.

**El archivo que sale tiene datos personales.** No va al repositorio ni a ningún directorio
versionado, y se entrega por un canal acordado con quien lo pidió. Borralo cuando termines.

## Eliminar

**Borrar es vaciar el contenido y conservar la forma** ([brief-13.4](../decisions/brief-13.4-retencion-y-borrado.md), D-2, decidido por el usuario el 2026-10-01). Se borra todo lo que el CRM puede atribuirle a la persona, con una excepción: las conversaciones sin cliente (§Lo que el vaciado no alcanza). Quedan fechas, estados y, de los mensajes, la dirección y el tipo, que es lo que cuentan las métricas. Así las métricas de los períodos pasados no cambian.

### Con qué rol

**Con el rol dueño**, el de `migrate.env` en producción. `messages`, `conversation_notes` y `audit_logs` son de solo inserción: su trigger deja pasar un único `UPDATE`, que es este vaciado, y el rol de la aplicación no tiene `UPDATE` sobre ellas ([ADR 0015](../decisions/0015-vaciado-de-una-sola-direccion-en-tablas-de-solo-insercion.md)). Con el rol de la aplicación, la base lo rechaza por permisos y no se escribe nada. En el droplet de producción:

```
sudo bash -c '. /etc/crm-production/migrate.env && export DATABASE_URL && cd /srv/crm-production && exec runuser -u crm -- npx tsx scripts/client-data-delete.ts --org <organization_id> --client <client_id>'
```

Esa línea corre el informe. Para vaciar o borrar se le agrega `--vaciar` o `--borrar`.

### Caso A — el cliente no tiene conversaciones ni pedidos

*Desde la 20.2* ([brief-20.2](../decisions/brief-20.2-la-venta-de-un-pedido.md), H-1): ni ventas. Una venta apunta a la ficha con `ON DELETE RESTRICT`. En la 20.2 toda venta tiene un pedido, así que no cambia qué clientes caen acá; con la venta sin pedido de la 20.3, sí. *Desde la 20.3*: un cliente con una venta sin pedido tampoco se borra, aunque no tenga pedidos; una venta sin cliente no cuenta para ninguno. *Desde la 21.3* ([brief-21.3](../decisions/brief-21.3-el-cobro-de-una-venta.md), D-9): ni cobros. Un cobro apunta a la ficha con `receipts_client_fk`, `ON DELETE RESTRICT`. Todo cobro es de una venta, y su cliente ya la frena, así que no cambia qué clientes caen acá; el informe igual los cuenta y `--borrar` exige cero. *Desde la 21.4* ([brief-21.4](../decisions/brief-21.4-la-sena.md), D-9): una seña es de un pedido, y un cliente con pedidos ya no se borra, así que tampoco cambia; el informe la cuenta entre los cobros.

*Desde la 19.2* ([brief-19.2](../decisions/brief-19.2-el-pedido.md), D-9; ADR 0020, punto 10): decía «el cliente no tiene conversaciones». Un pedido apunta a la ficha con `ON DELETE RESTRICT`, así que un cliente con pedidos va al caso B aunque no tenga conversaciones; el informe y `--borrar` lo dicen.

La ficha se borra de verdad, y sus entradas de auditoría se vacían en la misma transacción:

```
npx tsx scripts/client-data-delete.ts --org <organization_id> --client <client_id> --borrar
```

Queda en `audit_logs` que hubo cambios sobre una ficha, de qué tipo y cuándo, sin los valores. Sus etiquetas se van con la ficha, por la clave en cascada de `client_tag_assignments` (16.1, D-10); el informe previo dice cuántas tiene.

### Caso B — el cliente tiene conversaciones o pedidos

La ficha no se puede borrar: `messages` → `conversations` → `clients` son `ON DELETE RESTRICT`, y los mensajes no se borran; desde la 19.2, también `orders` → `clients`, y un pedido nunca se borra; desde la 20.2, también `sales` → `clients`, y una venta nunca se borra; desde la 21.3, también `receipts` → `clients`, y un cobro nunca se borra; desde la 21.5, también `refunds` → `clients`, y una devolución nunca se borra. Se vacía:

```
npx tsx scripts/client-data-delete.ts --org <organization_id> --client <client_id> --vaciar
```

En una sola transacción:

| Dónde | Qué se vacía | Qué queda |
|---|---|---|
| `clients` | nombre, teléfono y notas, y desde la 17.1 **todos** los campos ampliados, también el tipo, la provincia y el segmento | la ficha, con el nombre `Cliente eliminado <primeros 8 del id>` y, desde la 19.2, **desactivada**: sin nombre ni teléfono no hay a quién cargarle un pedido, y el alta rechaza a un cliente inactivo (D-9). Reactivarla a mano sigue siendo posible |
| `conversations` | la referencia externa | fechas y estado |
| `messages` | el texto y la referencia externa | fecha, dirección, tipo y autor |
| `conversation_notes` (desde la 16.4) | el texto de las notas de sus conversaciones: son texto libre y pueden nombrar a la persona | la nota, con su fecha y el usuario del CRM que la escribió |
| `audit_logs` (entradas del cliente) | los valores anteriores y nuevos, también los nombres de las etiquetas | que hubo un cambio, de qué tipo y cuándo |
| `client_tag_assignments` (desde la 16.1) | **se borran**: «Reclamo» o «Quiere señar» son datos sobre la persona (D-10) | nada; el catálogo de etiquetas no es de la persona y queda |
| `orders`, `order_lines` y su auditoría (desde la 19.2) | **nada**: no guardan texto de la persona, solo ids, cantidades, montos, estados y fechas, y la auditoría del pedido tampoco (brief-19.2, D-11) | los pedidos completos, con el cliente ya vaciado |
| `sales`, `sale_lines` y su auditoría (desde la 20.2) | **nada**: no guardan texto de la persona, solo ids, cantidades, montos y fechas, y la auditoría de la venta tampoco (brief-20.2, D-7) | las ventas completas, con el cliente ya vaciado |
| `receipts` y su auditoría (desde la 21.3) | **nada**: no guardan texto de la persona, solo el número, la venta, el medio, la moneda, el monto y la fecha, y la auditoría del cobro tampoco (brief-21.3, D-7) | los cobros completos, con el cliente ya vaciado |
| `receipt_voids`, `refunds`, `refund_voids` y su auditoría (desde la 21.5) | **nada**: no guardan texto de la persona, solo el número, el comprobante que anulan, el medio, la moneda, el monto, el motivo de la lista y la fecha, y la auditoría tampoco ([brief-21.5](../decisions/brief-21.5-la-anulacion-y-la-devolucion.md), D-13) | los comprobantes completos, con el cliente ya vaciado |
| `service_orders` (desde la 29.6) | **el IMEI del equipo y lo que reportó el cliente** quedan en `null` ([brief-29.6](../decisions/brief-29.6-las-reparaciones-de-equipos-de-clientes.md), D-11). El trigger `service_orders_guard` deja pasar ese `UPDATE`, en cualquier estado, y ningún otro sin cambio de estado. La auditoría de la orden no los guarda | el número, el modelo, el estado, las fechas, el técnico, los montos y el presupuesto. **Una orden de servicio retiene la ficha** (`ON DELETE RESTRICT`): un cliente con órdenes va al caso B |

Un segundo vaciado no cambia nada ni falla. Con la ingestión encendida, el vaciado espera a los mensajes de esa persona que se están guardando en ese momento, y los alcanza (revisión independiente de la 13.4, R-2). Lo mismo con una nota que un usuario del CRM está guardando en ese momento (revisión de la 16.4, R-1).

**Una nota escrita después del vaciado conserva su texto** (desde la 16.4). El vaciado no impide que un admin escriba notas nuevas en esas conversaciones. Si la nota vuelve a nombrar a la persona, se repite el vaciado: alcanza las notas nuevas y no cambia lo ya vaciado.

**Si la persona vuelve a escribir**, el vaciado no lo impide, pero la ficha ya no tiene teléfono:

- un `conversation.resolved` se rechaza con `422 client_not_found` hasta que la persona vuelva a tener una ficha con su teléfono;
- un `message.recorded` crea una conversación **sin cliente**, que cae en la excepción de abajo.

### Lo que el vaciado no alcanza

**Las conversaciones sin cliente.** Las crea la ingestión v1, o un mensaje de un teléfono que todavía no era cliente, y nada las enlaza después a una ficha. Sus mensajes y, desde la 16.4, sus notas conservan el texto. El CRM no guarda el teléfono de una conversación sin cliente, así que no tiene cómo atribuirla a quien pide el borrado. En el flujo normal de v2 no aparecen: `conversation.resolved` exige el cliente. El script lo dice en su salida, y quien atienda el pedido tiene que decirlo así (revisión independiente de la 13.4, R-1; decidido por el usuario el 2026-10-01).

### Lo que queda fuera de la base

El script no lo alcanza, y quien atienda el pedido tiene que decirlo así:

| Dónde | Por cuánto | Qué hacer |
|---|---|---|
| Las copias de seguridad | unos 7 días en el servidor y unos 30 en la copia externa, **mientras el backup diario funcione**: el servidor conserva una cantidad de copias, no días, y la copia externa se poda solo después de un backup exitoso. Si los backups fallan varios días, lo vaciado dura más | nada: vencen solas. Si se restaura una copia anterior al vaciado, se vuelve a aplicar ([runbook de restauración](restaurar-la-base.md)) |
| La copia del agente de WhatsApp y su n8n | lo que decida el agente | avisarle al agente: el CRM no la alcanza ([ADR 0014](../decisions/0014-el-agente-de-whatsapp-como-consumidor-del-crm.md)) |
| `ingestion_events` | mientras exista la base | nada: guarda identificadores del emisor, que por contrato no llevan el teléfono ([ingestion-v2](../contracts/ingestion-v2.md), §Guía para el emisor). **El CRM no lo valida** ([brief-13.4](../decisions/brief-13.4-retencion-y-borrado.md), I-1) |
| El journal del servidor | 31 días como mucho: 30 de retención más un día de archivo | nada: guarda identificadores internos, no el teléfono ni el texto |
| `/var/log/syslog` del servidor | hasta unos 35 días: `rsyslog` copia ahí lo que la aplicación escribe por pantalla, y rota cada semana con 4 archivos | nada: son los mismos identificadores que el journal. Alinearlo a 30 días tiene tarea en Notion (revisión independiente de la 13.4, R-12) |

### Registro del pedido, fuera de la base

El script no escribe en `audit_logs`, por dos razones:

1. lo corre un operador, no un usuario de la aplicación, y `audit_logs` exige un actor;
2. sobre todo, **auditar el vaciado volvería a escribir lo que se acaba de borrar**.

Registrá la ejecución fuera de la base, en el ticket o el canal donde se pidió, con la fecha, el `organization_id`, el `client_id`, quién lo pidió y qué opción se usó. Nunca con el teléfono. **Ese registro es el que permite volver a aplicar el vaciado después de restaurar una copia**: sin él, una restauración trae de vuelta los datos.

### Lo que no se hace

No desactives un trigger para borrar a mano. Es la defensa que el ADR 0013 levantó: hacerlo en producción deja la tabla sin garantía y sin rastro. **Esta regla es de procedimiento, no de permisos**: el rol dueño, el mismo con el que se corre el vaciado, puede desactivar el trigger de sus tablas (`ALTER TABLE … DISABLE TRIGGER`); no hace falta un superusuario (revisión independiente de la 13.4, R-10). El único cambio que admiten `messages`, `conversation_notes` y `audit_logs` es el de este script.
