# 0015 — Vaciado de una sola dirección en las tablas de solo inserción

- Estado: aceptada por el usuario el 2026-10-01 (brief-13.4, D-3 y AC-1). **Enmienda al [ADR 0013](0013-rol-de-aplicacion-y-tablas-de-solo-insercion.md)** en `messages` y `audit_logs`; no cambia `inventory_movements` ni `ingestion_events`. **Enmendada el 2026-10-07** ([brief-16.4](brief-16.4-notas-de-la-conversacion.md), H-1): suma `conversation_notes` (§Enmienda del 2026-10-07).
- Fecha: 2026-10-01

## Contexto

El ADR 0013 hizo de `messages` y `audit_logs` tablas de solo inserción: `crm_app` solo tiene `SELECT` e `INSERT`, y un trigger rechaza `UPDATE` y `DELETE` para cualquier rol. Por eso, hoy, el pedido de borrado de una persona con conversaciones solo puede **minimizar** su ficha. Sus mensajes quedan enteros, y la auditoría conserva su teléfono y sus notas anteriores ([runbook de datos de un cliente](../runbooks/datos-de-un-cliente.md), caso B). La 13.5 trae los primeros datos reales, así que el borrado tiene que existir antes ([brief-13.4](brief-13.4-retencion-y-borrado.md), O-11).

El usuario decidió el 2026-10-01 que borrar es **vaciar el contenido y conservar la forma** (D-2). Quedan fechas, direcciones, tipos y cantidades. Así las métricas de los períodos pasados no cambian, porque ninguna lee el texto (brief-13.4, H-3).

## Decisión

1. **El trigger de `messages` deja pasar un único `UPDATE`**: el que lleva `body_text` y `external_ref` a nulo y deja el resto de la fila idéntico. La comparación es contra la fila entera, no contra una lista de columnas, así que una columna que se agregue después no queda abierta. Todo otro `UPDATE` y todo `DELETE` se siguen rechazando con `P0001`, para cualquier rol.
2. **El trigger de `audit_logs` deja pasar un único `UPDATE`, y solo en entradas de un cliente** (`entity_type = 'client'`): el que lleva `diff` al marcador fijo `{"before": null, "after": null, "vaciado": true}` y deja el resto idéntico. Las entradas de productos, inventario, conversaciones, miembros e información del negocio siguen intactas: no guardan datos de una persona del negocio. El marcador mantiene `before` y `after` porque la ficha del cliente los lee. Con `after` nulo muestra «—».
3. **`crm_app` sigue sin `UPDATE` en las dos tablas.** La aplicación no puede vaciar nada. Lo hace un operador con el rol dueño, desde `scripts/client-data-delete.ts`, como indica el runbook.
4. **Invariante nuevo**: un mensaje nunca cambia de contenido, solo puede perderlo. Lo mismo para el `diff` de la entrada de auditoría de un cliente. El vaciado no se deshace: una fila vaciada solo admite el mismo vaciado otra vez.
5. **`ingestion_events` no cambia.** Su identidad sigue inmutable. Que esa identidad no lleve datos personales lo pide el contrato al emisor ([ingestion-v2](../contracts/ingestion-v2.md), §Guía para el emisor; brief-13.4, I-1).

## Alternativas descartadas

- **Desactivar el trigger en una transacción** (`ALTER TABLE … DISABLE TRIGGER`). Es DDL: toma un bloqueo sobre toda la tabla y la deja sin garantía mientras dura. El runbook ya lo prohibía.
- **Mover el texto a una tabla aparte, borrable.** Cambia todas las lecturas de mensajes y es una migración de datos. Es el diseño correcto solo si el vaciado tuviera que ser masivo.
- **Borrar las filas.** Cambia las métricas de los períodos pasados (D-2 a).
- **Dar `UPDATE` a `crm_app` con una política.** Abre a la aplicación lo que hoy solo puede el dueño (condición de detención 2 del brief).

## Consecuencias

- Migración `drizzle/0025_*`, a medida, que reemplaza `messages_reject_change()` y `audit_logs_reject_change()`. Los triggers y los privilegios no cambian.
- El test de cobertura de privilegios de `audit.test.ts` no cambia: `messages` y `audit_logs` siguen en la lista de solo inserción.
- **Limitaciones aceptadas**:
  - el dueño puede vaciar, que es justamente el propósito. Un vaciado no queda registrado en la base, porque auditarlo volvería a escribir lo que se borra; se registra fuera, en el ticket del pedido;
  - las del ADR 0013 siguen: el dueño puede `TRUNCATE` y puede desactivar el trigger, igual que un superusuario. *Corregido el 2026-10-01* (revisión independiente de la 13.4, R-10): decía «un superusuario puede desactivar el trigger»; el dueño de la tabla también puede, comprobado en PostgreSQL local. Pesa más que antes, porque el vaciado se corre con ese rol: el runbook lo prohíbe por procedimiento;
  - lo vaciado sigue en las copias de seguridad hasta que vencen, a unos 30 días mientras el backup diario funcione (precisado por la revisión independiente de la 13.4, R-8: decía «a los 30 días como mucho»), y una restauración lo trae de vuelta. El runbook de restauración manda volver a aplicar los vaciados posteriores a la copia (brief-13.4, D-5).

## Enmienda del 2026-10-07: `conversation_notes`

Aprobada por el usuario con el [brief-16.4](brief-16.4-notas-de-la-conversacion.md) (H-1, D-1 y D-5). Solo suma la tabla nueva; los puntos 1 a 5 no cambian.

- **Contexto**: la 16.4 trae notas internas por conversación, de texto libre, que pueden nombrar a la persona. Si su texto entrara en el `diff` de una auditoría de conversación, el vaciado no lo alcanzaría, porque el punto 2 deja intactas esas entradas.
- **Decisión**:
  - `conversation_notes` es de solo inserción con el mismo diseño que `messages`. `crm_app` solo tiene `SELECT` e `INSERT`. El trigger `conversation_notes_insert_only` (`drizzle/0030`) deja pasar un único `UPDATE`: el que lleva `body_text` a nulo con el resto de la fila idéntico, comparado contra la fila entera.
  - El texto de la nota vive solo en esa tabla: la auditoría `note_added` guarda el id, no el texto. Así el punto 2 sigue siendo cierto: las entradas de conversaciones no guardan datos de una persona.
  - El vaciado de un cliente lleva a nulo el texto de las notas de todas sus conversaciones, en la misma transacción que sus mensajes. Las de una conversación sin cliente no se alcanzan, como sus mensajes.
  - El invariante del punto 4 se extiende: una nota nunca cambia de texto, solo puede perderlo.
- **Consecuencias**: `conversation_notes` entra en la lista de solo inserción de `audit.test.ts`, y las limitaciones aceptadas valen igual para ella.
