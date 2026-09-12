# 0007 — El teléfono E.164 es el único identificador de negocio del cliente

- Estado: aceptada (resuelta por el usuario en la subfase 1.3, 2026-09-11)
- Fecha: 2026-09-11

## Contexto

`DataModel.md` define la unicidad de negocio de `clients` como `(organization_id, phone_e164)`. La Fase 0 dejó abierta la pregunta de si el negocio necesita además un identificador propio: documento de identidad o código interno de cliente.

La pregunta no es cosmética. Una restricción de unicidad adicional cambia qué significa "el mismo cliente", y agregarla después de que existan datos obliga a un backfill manual, porque nadie puede inferir un código interno a partir de un teléfono.

## Decisión

En el MVP, un cliente se identifica de forma única por `(organization_id, phone_e164)` y por nada más. No se agregan columnas de documento ni de código interno.

## Alternativas descartadas

- **Código interno opcional, único cuando está presente**: descartado porque hoy no hay ningún sistema que lo emita ni ningún flujo que lo complete. Sería una columna vacía, exactamente lo que prohíbe el principio de no crear estructura especulativa.
- **Documento de identidad**: descartado por la misma razón, con el agravante de que es un dato personal sensible que el MVP no necesita para operar (ver FR-CLI-05, minimización).

## Consecuencias

- El origen de los datos es WhatsApp, donde el teléfono es el identificador natural. El modelo coincide con la realidad de la fuente.
- Un cliente que cambia de número se ve como un cliente nuevo. Es un límite aceptado y conocido del MVP, no un defecto a corregir en esta etapa.
- Si más adelante aparece un código interno, la migración es aditiva (columna nueva, índice único parcial `WHERE codigo IS NOT NULL`), pero el backfill es manual. Esta consecuencia queda registrada, no mitigada.
- `clients.phone_e164` sigue siendo opcional a nivel de columna para clientes cargados sin teléfono; la unicidad aplica solo cuando está presente.
