# Runbook: exportar o eliminar los datos de un cliente

**Estado: validado localmente y en CI.** No ejecutado todavía contra un entorno con datos reales.

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
   borrar, y qué quedaría retenido.

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
opaca suya, el hash del payload y fechas. No tiene datos personales. El propio archivo lo dice en
su campo `excluded`, para que quien lo reciba no tenga que deducirlo.

**El archivo que sale tiene datos personales.** No va al repositorio ni a ningún directorio
versionado, y se entrega por un canal acordado con quien lo pidió. Borralo cuando termines.

## Eliminar

Acá hay que ser preciso, porque el sistema **no puede borrar todo** y prometerlo sería mentir.

### Caso A — el cliente no tiene conversaciones

La ficha se borra de verdad:

```
npx tsx scripts/client-data-delete.ts --org <organization_id> --client <client_id> --borrar
```

Si además tuvo cambios auditados, **sus entradas de `audit_logs` quedan**, con el teléfono y las
notas anteriores en el `diff`. El informe lo avisa antes.

### Caso B — el cliente tiene conversaciones

**La ficha no se puede borrar, con ningún rol.** La cadena está cerrada:

- `messages` tiene un trigger `BEFORE UPDATE OR DELETE` que rechaza las dos operaciones para
  cualquier rol, y `crm_app` solo tiene `SELECT` e `INSERT` sobre ella ([ADR 0013](../decisions/0013-rol-de-aplicacion-y-tablas-de-solo-insercion.md));
- `messages` → `conversations` es `ON DELETE RESTRICT`;
- `conversations` → `clients` es `ON DELETE RESTRICT`.

Sin borrar los mensajes no se borra la conversación, y sin borrar la conversación no se borra el
cliente. Tampoco se pueden anonimizar los mensajes: el mismo trigger rechaza el `UPDATE`.

Lo que sí se puede es **vaciar los datos personales de la ficha**, que es lo que vincula esos
registros con la persona:

```
npx tsx scripts/client-data-delete.ts --org <organization_id> --client <client_id> --minimizar
```

Deja `phone_e164` y `notes` en nulo y el nombre en `Cliente eliminado <primeros 8 del id>`.

**Esto es una minimización, no una eliminación.** Después de correrlo queda retenido:

| Dónde | Qué | Por qué no se borra |
|---|---|---|
| `messages.body_text` | el texto de cada mensaje de sus conversaciones | tabla de solo inserción, con trigger |
| `conversations` | sus conversaciones | no se borran mientras tengan mensajes |
| `audit_logs.diff` | teléfono y notas anteriores | tabla de solo inserción, con trigger |

Sin el teléfono ni el nombre en la ficha, lo retenido queda sin titular identificable **dentro del
sistema**. No es lo mismo que haberlo borrado, y quien atienda el pedido tiene que decirlo así.

### Por qué la ejecución no queda auditada en la base

El script no escribe en `audit_logs`, por dos razones:

1. lo corre un operador, no un usuario de la aplicación, y `audit_logs.actor_user_id` es
   obligatorio;
2. sobre todo, **auditar el cambio volvería a escribir el teléfono y las notas en el `diff`**,
   deshaciendo justo lo que se acaba de hacer.

Registrá la ejecución fuera de la base —el ticket o el canal donde se pidió— con la fecha, el
`client_id`, quién lo pidió y qué opción se usó. Nunca con el teléfono.

## Qué hacer si hace falta un borrado real

Hoy no es posible sin cambiar el modelo de datos. Requiere una subfase propia que revise el
ADR 0013 y decida cómo convivir un registro inmutable con un derecho de borrado: por ejemplo un
borrado administrativo con una vía controlada y auditada, o una política de retención que venza
los mensajes. Está registrado en [Risks](../planning/Risks.md).

No lo resuelvas a mano desactivando un trigger: esa es exactamente la defensa que el ADR 0013
levantó, y hacerlo en producción deja la tabla sin garantía y sin rastro.
