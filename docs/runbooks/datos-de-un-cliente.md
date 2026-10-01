# Runbook: exportar o eliminar los datos de un cliente

**Estado: validado localmente y en CI.** No ejecutado todavía contra un entorno con datos reales. *Actualizado el 2026-10-01 por la 13.4*: borrar pasó de minimizar la ficha a vaciar el contenido de todo lo del cliente.

Atiende un pedido de acceso o de borrado de los datos de una persona, que
[NonFunctionalRequirements](../product/NonFunctionalRequirements.md) §Privacidad exige que exista
aunque sea manual en el MVP. Nace de la subfase 8.2
([brief-8.2](../decisions/brief-8.2-logs-y-privacidad.md)).

Lo corre un operador con acceso a la base, no la aplicación: no hay pantalla para esto y no está
previsto que la haya en el MVP.

## Antes de tocar nada

1. **Identificá el cliente**: necesitás su `organization_id` y su `client_id`. Los dos salen de la
   URL de su ficha en la aplicación.
2. **Confirmá quién pide y con qué derecho.** El procedimiento no verifica identidad: eso pasa
   fuera del sistema.
3. **Corré primero el informe**, que no escribe nada:

   ```
   npx tsx scripts/client-data-delete.ts --org <organization_id> --client <client_id>
   ```

   Dice cuántas conversaciones, mensajes y entradas de auditoría tiene, si la ficha se puede
   borrar, y qué quedaría después.

## Exportar

```
npx tsx scripts/client-data-export.ts --org <organization_id> --client <client_id> --out <archivo.json>
```

Incluye los cuatro orígenes que guardan datos de la persona:

| Origen | Qué lleva |
|---|---|
| `clients` | nombre, teléfono en E.164 y notas |
| `conversations` | sus conversaciones, con estado y fechas |
| `messages` | sus mensajes, **con el cuerpo** |
| `audit_logs` | los cambios sobre su ficha, **con los valores anteriores** de teléfono y notas |

**No incluye `ingestion_events`**, y es a propósito: esa tabla guarda el emisor, una referencia
opaca suya, el hash del payload y fechas. El propio archivo lo dice en su campo `excluded`, para
que quien lo reciba no tenga que deducirlo. *Precisión del 2026-10-01 ([brief-13.4](../decisions/brief-13.4-retencion-y-borrado.md),
I-1)*: que la referencia no lleve el teléfono lo pide el contrato al emisor, y el CRM no lo
valida. Con la API oficial de WhatsApp, un `wamid` crudo lo llevaría codificado.

**El archivo que sale tiene datos personales.** No va al repositorio ni a ningún directorio
versionado, y se entrega por un canal acordado con quien lo pidió. Borralo cuando termines.

## Eliminar

**Borrar es vaciar el contenido y conservar la forma** ([brief-13.4](../decisions/brief-13.4-retencion-y-borrado.md), D-2, decidido por el usuario el 2026-10-01). Se borra todo lo que el CRM puede atribuirle a la persona, con una excepción: las conversaciones sin cliente (§Lo que el vaciado no alcanza). Quedan fechas, direcciones, tipos y estados, que es lo que cuentan las métricas. Así las métricas de los períodos pasados no cambian.

### Con qué rol

**Con el rol dueño**, el de `migrate.env` en producción. `messages` y `audit_logs` son de solo inserción: su trigger deja pasar un único `UPDATE`, que es este vaciado, y el rol de la aplicación no tiene `UPDATE` sobre ellas ([ADR 0015](../decisions/0015-vaciado-de-una-sola-direccion-en-tablas-de-solo-insercion.md)). Con el rol de la aplicación, la base lo rechaza por permisos y no se escribe nada. En el droplet de producción:

```
sudo bash -c 'set -a && . /etc/crm-production/migrate.env && set +a && cd /srv/crm-production && exec sudo -u crm --preserve-env=DATABASE_URL npx tsx scripts/client-data-delete.ts --org <organization_id> --client <client_id>'
```

Esa línea corre el informe. Para vaciar o borrar se le agrega `--vaciar` o `--borrar`.

### Caso A — el cliente no tiene conversaciones

La ficha se borra de verdad, y sus entradas de auditoría se vacían en la misma transacción:

```
npx tsx scripts/client-data-delete.ts --org <organization_id> --client <client_id> --borrar
```

Queda en `audit_logs` que hubo cambios sobre una ficha, de qué tipo y cuándo, sin los valores.

### Caso B — el cliente tiene conversaciones

La ficha no se puede borrar: `messages` → `conversations` → `clients` son `ON DELETE RESTRICT`, y los mensajes no se borran. Se vacía:

```
npx tsx scripts/client-data-delete.ts --org <organization_id> --client <client_id> --vaciar
```

En una sola transacción:

| Dónde | Qué se vacía | Qué queda |
|---|---|---|
| `clients` | nombre, teléfono y notas | la ficha, con el nombre `Cliente eliminado <primeros 8 del id>` |
| `conversations` | la referencia externa | fechas y estado |
| `messages` | el texto y la referencia externa | fecha, dirección, tipo y autor |
| `audit_logs` (entradas del cliente) | los valores anteriores y nuevos | que hubo un cambio, de qué tipo y cuándo |

Un segundo vaciado no cambia nada ni falla. Con la ingestión encendida, el vaciado espera a los mensajes de esa persona que se están guardando en ese momento, y los alcanza (revisión independiente de la 13.4, R-2).

**Si la persona vuelve a escribir**, el vaciado no lo impide, pero la ficha ya no tiene teléfono:

- un `conversation.resolved` se rechaza con `422 client_not_found` hasta que la persona vuelva a tener una ficha con su teléfono;
- un `message.recorded` crea una conversación **sin cliente**, que cae en la excepción de abajo.

### Lo que el vaciado no alcanza

**Las conversaciones sin cliente.** Las crea la ingestión v1, o un mensaje de un teléfono que todavía no era cliente, y nada las enlaza después a una ficha. Sus mensajes conservan el texto. El CRM no guarda el teléfono de una conversación sin cliente, así que no tiene cómo atribuirla a quien pide el borrado. En el flujo normal de v2 no aparecen: `conversation.resolved` exige el cliente. El script lo dice en su salida, y quien atienda el pedido tiene que decirlo así (revisión independiente de la 13.4, R-1; decidido por el usuario el 2026-10-01).

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

No desactives un trigger para borrar a mano. Es la defensa que el ADR 0013 levantó: hacerlo en producción deja la tabla sin garantía y sin rastro. **Esta regla es de procedimiento, no de permisos**: el rol dueño, el mismo con el que se corre el vaciado, puede desactivar el trigger de sus tablas (`ALTER TABLE … DISABLE TRIGGER`); no hace falta un superusuario (revisión independiente de la 13.4, R-10). El único cambio que admiten `messages` y `audit_logs` es el de este script.
