---
schema: task-brief.v1
task_id: 5.2
task_type: implementation
generated_at: 2026-09-16
---

# Brief: 5.2 — Servicio de clientes

## Objetivo

1. Implementar a nivel de servicio **FR-CLI-01, 02, 03 y 05**: crear, editar, desactivar, reactivar y buscar clientes.
2. Auditar cada escritura **en la misma transacción** (FR-AUD-01).
3. Entregar el teléfono **enmascarado a un `viewer` desde el servicio** (FR-CLI-06) y probar que su respuesta no contiene el número completo (**H-5**).
4. Validar todo **localmente y en CI** contra PostgreSQL real, incluidos `FORBIDDEN`, `NOT_FOUND` entre organizaciones y `CONFLICT` por teléfono.

No crea pantallas ni Server Actions: las pantallas 6 y 7 llegan en la 5.3.

## Ubicación en la Fase 5

- **Orden previsto**: 5.1 (cerrada) → **5.2** → 5.3.
- **Notion**: "FR-CLI-01, 02, 03 y 05 con auditoría. FR-CLI-04 se completa en 6.3." Estado: "Bandeja de Entrada".
- **Necesario ahora**: casos de uso, normalización del teléfono, enmascarado, búsqueda, lista paginada y sus tests.
- **Fuera de esta fase**: última interacción y conversaciones del cliente (FR-CLI-04, Fase 6); exportación y eliminación de datos de un cliente (Fase 8).
- **Gates de entrada**: 5.1 cerrada con CI en verde (`b43af0d`); contenedor de PostgreSQL en marcha. Esta subfase no necesita migraciones.

## Hallazgos de la verificación previa (2026-09-16)

1. **El teléfono llega escrito de muchas formas.** El `CHECK` de la 5.1 (D-1) solo acepta E.164 canónico (`+5491155551234`). Un `admin` va a escribir "+54 9 11 5555-1234" o "011 5555-1234". Sin código de país no hay forma segura de completar el número: `organizations` no tiene país, solo zona horaria. Se resuelve en D-1.
2. **FR-CLI-06 pide enmascarar en el servidor**, y la respuesta a un `viewer` no puede contener el número completo. Si el servicio devuelve el mismo tipo a los dos roles y la página decide qué mostrar, el número completo llega igual al componente. Además, un número de 4 dígitos o menos quedaría completo con "últimos 4". Se resuelve en D-2.
3. **Una sola caja de búsqueda para nombre o teléfono completo** (Screens §6, wireframe 06). Hay que decidir cómo se interpreta el texto. Por FR-CLI-06, un `viewer` puede buscar por teléfono completo: puede confirmar que un número es cliente, aunque no lo vea. Eso ya lo aceptó la 1.3 (D-1). Se resuelve en D-3.
4. **La lista de Screens §6 se ordena por última interacción**, que sale de `conversations` y no existe hasta la Fase 6. Se resuelve en D-4.
5. **DataModel no fija límites de texto** para `display_name` ni `notes`. El wireframe 07 muestra las notas "con aviso de minimización". Se resuelve en D-5.
6. **La auditoría guarda datos personales.** Con el `diff` de la 4.2, el teléfono y las notas quedan en `audit_logs`, que es de solo inserción. Solo `admin` lee la auditoría, y ya ve el teléfono completo. Pero NonFunctionalRequirements pide poder eliminar los datos de un cliente, y una fila de solo inserción no se puede borrar. Se resuelve en D-6. La eliminación queda para la Fase 8 y se registra en Risks.
7. **La lectura de auditoría del cliente (FR-AUD-02) no está asignada.** La 4.4 dejó `listEntityAuditLogs` en `audit`, sin contexto; el módulo dueño de la entidad autoriza y compone el autor con `auth`. Overview dice que `crm` depende solo de `organizations`, pero su propia fila de `audit` ya lo lista entre los usuarios de `audit`. Se resuelve en D-7.
8. **Precedentes que se siguen sin decisión nueva** (4.2 y 4.4):
   - `CONFLICT` por unicidad: escritura en un savepoint y traducción de `23505` con el nombre de la constraint (`clients_organization_phone_unique`);
   - un cambio sin diferencias devuelve `changed: false` y no escribe ni audita;
   - orden de autorización `must_change_password` → rol → recurso filtrado por organización en SQL;
   - escritura con la fila bloqueada con `FOR UPDATE`, `diff` sobre lo leído y última escritura gana;
   - un id que no es UUID devuelve `VALIDATION_ERROR` sin `fields` (4.4, D-6);
   - búsqueda por prefijo con `lower(display_name) LIKE`, escapando `\`, `%` y `_`;
   - lista paginada de a 25, con desempate estable, y una página fuera de rango llevada a la última.
9. **A diferencia de productos, la lista no cruza módulos**: todo sale de `clients`, así que se filtra, ordena y pagina en SQL, sin composición en memoria.
10. **Reactivar no puede chocar con un duplicado**: la unicidad de la 5.1 (D-3) alcanza a los inactivos, así que ningún otro cliente pudo tomar el número mientras estaba inactivo.

## Alcance incluido

1. Registrar la resolución de D-1 a D-7.
2. **`crm`** (`index.ts`, `service.ts`, `repository.ts`, y la normalización y el enmascarado del teléfono con sus tests unitarios):
   - `createClient(context, input)`: `admin`; valida según D-1 y D-5; `CONFLICT` por teléfono, también contra un cliente inactivo; audita `create` según D-6.
   - `updateClient(context, clientId, input)`: `admin`; también sobre clientes inactivos; permite quitar el teléfono; bloqueo y `diff`; audita `update` solo con lo que cambió; `CONFLICT` por teléfono.
   - `deactivateClient` y `reactivateClient`: `admin`; auditan `deactivate` y `reactivate`; sin cambio → `changed: false`.
   - `getClient(context, clientId)`: `admin` y `viewer`, con el teléfono según D-2.
   - `searchClients(context, filters)`: `admin` y `viewer`; texto según D-3; actividad (por defecto solo activos); orden según D-4; 25 por página, con total y cantidad de páginas; teléfono según D-2.
   - Lectura de auditoría del cliente según D-7.
   - Id que no es UUID → `VALIDATION_ERROR` sin `fields`; cliente de otra organización o inexistente → `NOT_FOUND`.
3. **Tests unitarios**: normalización del teléfono (formatos aceptados y rechazados), enmascarado (incluidos los números cortos) y validación de campos.
4. **Tests de integración** en `tests/integration/crm.test.ts`, contra PostgreSQL real:
   - cada escritura con su registro de auditoría y `diff` exacto; un cambio sin diferencias no escribe ni audita; si la auditoría falla, el cliente no cambia;
   - teléfono duplicado en alta y en edición, escrito de otra forma y contra un cliente inactivo → `CONFLICT`, sin auditoría; dos altas simultáneas con el mismo teléfono → una sola se crea;
   - `viewer` → `FORBIDDEN` en las escrituras y acceso a las lecturas; `must_change_password` → `FORBIDDEN`;
   - cliente de otra organización → `NOT_FOUND` en lectura, edición, desactivación, reactivación y auditoría;
   - lista: texto por nombre y por teléfono, `%` y `_` literales, actividad, orden, paginación y totales;
   - **H-5**: para un `viewer`, el resultado de `getClient` y de `searchClients` (incluida una búsqueda por el teléfono completo), serializado a JSON, no contiene el número completo ni sus dígitos anteriores a los últimos 4; para un `admin`, sí lo contiene.
5. **Documentación**:
   - Overview: dependencias de `crm` según D-7;
   - DataModel: dónde se normaliza el teléfono;
   - TraceabilityMatrix: H-5 resuelto;
   - Risks: H-5 cerrado, y la eliminación de datos del cliente frente a la auditoría de solo inserción (D-6) asignada a la Fase 8;
   - SecurityModel: el enmascarado en el servicio;
   - TestingStrategy y RepositoryStructure: fila de la 5.2.

## Alcance excluido

- Pantallas, Server Actions y rutas: 5.3.
- Última interacción, conversaciones del cliente y el orden de la lista por última interacción: Fase 6.
- Exportación y eliminación de los datos de un cliente: Fase 8.
- Búsqueda por contenido, sin distinguir acentos o por parte del teléfono.
- Validar que el número exista o corresponda a un país.
- Migraciones y cambios en `clients`, en `audit_logs` o en sus enums.
- Seeds de clientes.
- `organization_id` y duración en el log: llegan con las Server Actions de la 5.3.

## Archivos o componentes autorizados

Lista cerrada:

- `src/modules/crm/`: `index.ts`, `service.ts`, `repository.ts`, un archivo para el teléfono (normalización y enmascarado) y sus tests unitarios. `schema.ts` no cambia.
- `tests/integration/crm.test.ts`.
- Los documentos del punto 5.
- Este brief y su fila en `docs/decisions/README.md`.
- `CHANGELOG.md`, `HANDOFF.md` y las líneas de estado de `README.md` y `docs/README.md`, al cerrar.

## Fuentes de verdad

1. [FunctionalRequirements.md](../product/FunctionalRequirements.md): FR-CLI-01 a 07, FR-AUD-01 y 02.
2. [DataModel.md](../architecture/DataModel.md): `clients` y las decisiones de la 5.1.
3. [Screens.md](../product/Screens.md) §6 y §7, con los wireframes [06](../product/wireframes/06-lista-de-clientes.md) y [07](../product/wireframes/07-detalle-de-cliente.md).
4. [brief-1.3](brief-1.3-decisiones-de-producto-abiertas.md), D-1 (enmascarado) y [ADR 0007](0007-identificador-de-cliente-solo-telefono.md).
5. [Overview.md](../architecture/Overview.md) y [SecurityModel.md](../architecture/SecurityModel.md): módulos, taxonomía de errores, roles y logs sin datos personales.
6. [NonFunctionalRequirements.md](../product/NonFunctionalRequirements.md): minimización y exportación o eliminación a pedido.
7. [brief-4.2](brief-4.2-servicio-de-catalogo.md) y [brief-4.4](brief-4.4-ui-de-productos-e-inventario.md) (D-1 y D-6), con `src/modules/catalog/` como patrón de servicio.

## Dependencias

- 5.1 cerrada.
- Contenedor de PostgreSQL en marcha.

## Resolución (2026-09-16)

El usuario aprobó el brief con D-1 a D-7 según la recomendación: (a) en todas. También autorizó pasar la 5.2 a "En proceso" en Notion.

## Decisiones pendientes

Cada decisión trae una recomendación, no una resolución: la resuelve el usuario.

### D-1 — Qué teléfono acepta el servicio

- **Opciones**:
  - (a) **Solo formato internacional**: el texto tiene que empezar con `+`. Se quitan espacios, guiones, puntos y paréntesis, y el resultado tiene que cumplir el `CHECK` de la 5.1. "+54 9 11 5555-1234" → `+5491155551234`; "011 5555-1234" → `VALIDATION_ERROR`. Vacío → sin teléfono.
  - (b) **Completar con un país por defecto** (Argentina) cuando falta el `+`.
  - (c) **Una librería de numeración** (`libphonenumber-js`), que valida por país.
- **Recomendación**: (a).
  - (b) adivina: "011…" y "11…" necesitan reglas propias de Argentina, y un número de otro país quedaría mal guardado sin aviso. Como el teléfono es el identificador del cliente (ADR 0007), un número mal completado crea un cliente duplicado.
  - (c) suma una dependencia y un país por organización que el modelo no tiene.
  - Los números que llegan de WhatsApp ya vienen en formato internacional.
- **Consecuencias**:
  - el mensaje de error de la 5.3 pide el número con `+` y código de país;
  - la búsqueda normaliza con la misma función (D-3);
  - **límite documentado**: un número con `+` pero con los dígitos equivocados se acepta.

### D-2 — Cómo llega el teléfono a cada rol

- **Opciones**:
  - (a) **El servicio devuelve un tipo distinto según el rol**: `phone: { kind: "full"; e164 } | { kind: "masked"; lastDigits } | null`. Para un `viewer`, el número completo nunca sale de `crm`. Un número de 4 dígitos o menos se entrega sin ningún dígito (`lastDigits: ""`).
  - (b) **El servicio devuelve el número completo y la página lo enmascara.**
- **Recomendación**: (a).
  - Es lo que piden FR-CLI-06 y la 1.3: con (b), el número completo llega al componente del `viewer`.
  - El tipo obliga a la 5.3 a tratar los dos casos, y el test de H-5 se escribe sobre el servicio, no sobre el HTML.
  - Con "últimos 4" a secas, un número corto quedaría completo.
- **Consecuencia**: SecurityModel registra que el enmascarado vive en `crm`. La 5.3 lo formatea como `•••• 1234`, con el texto accesible del wireframe 06.

### D-3 — Cómo se interpreta el texto de búsqueda

- **Opciones**:
  - (a) **Si el texto, normalizado según D-1, es un teléfono válido, se busca ese teléfono exacto; si no, se busca por prefijo de nombre.**
  - (b) **Las dos a la vez**: nombre por prefijo **o** teléfono exacto.
  - (c) **Dos campos separados**: nombre y teléfono.
- **Recomendación**: (a).
  - Un texto que empieza con `+` y solo tiene dígitos y separadores no es un nombre, así que (a) y (b) dan lo mismo en la práctica, y (a) usa un solo índice por consulta.
  - (c) contradice el wireframe 06, que tiene una sola caja.
- **Consecuencia**: buscar "+54 9 11 5555-1234" encuentra `+5491155551234`. Buscar un fragmento del número ("5555") no encuentra nada. **Riesgo aceptado en la 1.3 y registrado ahora**: un `viewer` puede confirmar si un número es cliente.

### D-4 — Orden de la lista mientras no hay conversaciones

- **Opciones**:
  - (a) **Por nombre** (`lower(display_name)`, desempate por `id`). La Fase 6 lo cambia a última interacción, como pide Screens §6.
  - (b) **Por fecha de alta**, del más reciente al más antiguo.
- **Recomendación**: (a).
  - Es el orden más útil para encontrar a alguien, y coincide con productos.
  - Un orden por "última interacción" sin conversaciones sería una columna siempre vacía.
- **Consecuencias**:
  - HANDOFF y TraceabilityMatrix registran que el orden por última interacción llega en la Fase 6, junto con la dirección de dependencia: `conversations` depende de `crm`, así que la lista con última interacción la compone `conversations` o la página, no `crm`. Eso se decide en la Fase 6;
  - **límite aceptado**: el orden sigue el collation de la base.

### D-5 — Validación de campos

- **Opciones**:
  - (a) **Recortar espacios**, y:
    - `displayName`: 1 a 200 caracteres;
    - `phone`: opcional, según D-1;
    - `notes`: hasta 1 000, y vacías se guardan como `null`.
  - (b) **Solo no vacíos**, sin máximos.
- **Recomendación**: (a).
  - Mismo criterio que productos (4.2, D-4).
  - Notas más cortas que la descripción de un producto: son "notas operativas" (FR-CLI-05), no un historial del cliente, y la minimización pide no juntar datos que no hacen falta.
- **Consecuencia**: `VALIDATION_ERROR` con la lista de campos inválidos.

### D-6 — Datos personales en la auditoría

- **Opciones**:
  - (a) **`diff` completo**, como productos: el teléfono en E.164 y las notas quedan en `audit_logs`.
  - (b) **Teléfono y notas solo como "cambió"**, sin valores: el `diff` registra `{ phone: "changed" }`.
- **Recomendación**: (a).
  - La auditoría existe para saber qué cambió (FR-AUD-02). Con (b), un `admin` no puede saber a qué número se cambió un cliente ni recuperar el anterior.
  - Solo `admin` lee la auditoría, y `admin` ya ve el teléfono completo (D-2).
  - Los logs de aplicación siguen sin datos personales (SecurityModel).
- **Consecuencia**: la eliminación de los datos de un cliente a pedido (NonFunctionalRequirements) choca con `audit_logs` de solo inserción. Se registra en Risks como pendiente de la Fase 8, que ya tiene asignado ese procedimiento. No se decide acá.

### D-7 — Lectura de auditoría del cliente (FR-AUD-02)

- **Opciones**:
  - (a) **En la 5.2**: `listClientAudit(context, clientId, page)` en `crm`, como `listProductAudit`. Autoriza solo `admin`, verifica la organización, lee con `listEntityAuditLogs` y `["client"]` y compone el autor con `getUserSummaries` de `auth`. Overview suma `audit` y `auth` a las dependencias de `crm`.
  - (b) **En la 5.3**, junto con la pantalla 7.
- **Recomendación**: (a).
  - A diferencia de la 4.2, la lectura de `audit` ya existe, y probar autorización y aislamiento es trabajo de servicio.
  - La 5.3 queda solo con pantallas.
  - `crm` no crea un ciclo: ni `audit` ni `auth` dependen de `crm`.
- **Consecuencia**: Overview corrige la fila de `crm`, que ya debía incluir `audit` para escribir.

## Invariantes

- Sin referencias a Airtable ni al repositorio del agente de WhatsApp.
- Sin `JOIN` entre módulos; `crm` solo importa `organizations`, `audit` y `auth` por su interfaz.
- Toda consulta de negocio filtra por `organization_id` en SQL, tomado del contexto y nunca del input.
- Toda escritura de cliente y su auditoría son atómicas.
- Un `viewer` nunca recibe el número completo de `crm`, por ninguna función.
- Ningún log de aplicación contiene el teléfono, el nombre ni las notas de un cliente.
- Sin dependencias nuevas ni migraciones.
- Ninguna columna nueva: solo los campos de FR-CLI-05.

## Criterios de aceptación

- **AC-1**: D-1 a D-7 tienen resolución del usuario con fecha.
- **AC-2**: tests unitarios de la normalización (con `+` y separadores, sin `+`, con letras, demasiado corto o largo, vacío), del enmascarado (número normal, de 4 dígitos o menos, sin teléfono) y de la validación según D-5.
- **AC-3**: crear, editar, desactivar y reactivar escriben su registro de auditoría con `diff` exacto en la misma transacción; un cambio sin diferencias no escribe ni audita; si la auditoría falla, el cliente no cambia.
- **AC-4**: teléfono duplicado en alta y en edición, escrito con otro formato o de un cliente inactivo → `CONFLICT` sin auditoría; dos altas simultáneas con el mismo teléfono → una sola se crea.
- **AC-5**: `viewer` → `FORBIDDEN` en las escrituras y en la auditoría, y acceso a las lecturas; `must_change_password` → `FORBIDDEN`; id ajeno → `NOT_FOUND`; id inválido → `VALIDATION_ERROR` sin `fields`.
- **AC-6**: la lista cumple el punto 2 del alcance, verificada contra PostgreSQL real.
- **AC-7 (H-5)**: las respuestas a un `viewer` cumplen el caso H-5 del punto 4, y el test falla si el servicio devuelve el número completo (evidencia de mutación registrada en el cierre).
- **AC-8**: la auditoría del cliente devuelve sus cambios paginados con autor, solo a `admin` y solo de la propia organización.
- **AC-9**:
  - `npm run test` pasa completo, sin cambios en tests existentes;
  - `npm run test:e2e` pasa 38 de 38;
  - con la base detenida pasan `typecheck`, `lint`, `format:check`, `test:guards`, `test:unit` y `build`, y `db:generate` no produce migraciones.
- **AC-10**: CI en verde en el commit de la subfase, verificado con `gh run view`.
- **AC-11**: `git status` muestra solo archivos autorizados, y los documentos del punto 5 reflejan las resoluciones.

## Pruebas y evidencia requerida

- **Evidencia `deterministic`**: tests unitarios y de integración contra PostgreSQL 18.6 real, local y en CI, más la corrida de mutación de AC-7.

**Nivel resultante esperado**: **validado localmente y en CI** para el servicio de clientes, el enmascarado del teléfono y la lectura de su auditoría.

**No se valida**:

- las pantallas 6 y 7, su accesibilidad y que el HTML del `viewer` no contenga el número (5.3);
- la última interacción y las conversaciones del cliente (Fase 6);
- el rendimiento de la lista con volumen real (Fase 8).

La revisión es una autoevaluación (`self_assessment: true`).

## Condiciones de detención

- Si hace falta una migración, una dependencia nueva o un cambio en `audit_logs` o en `audit`.
- Si `crm` necesita importar un módulo distinto de `organizations`, `audit` y `auth`, o hacer un `JOIN` con otra tabla.
- Si algún test existente necesita cambios.
- Si aparece la necesidad de pantallas, Server Actions o datos de conversaciones.
- Si un caso de uso no puede evitar que un `viewer` reciba el número completo.
- Antes de commit, de push o de cambios en Notion.

## Cierre (2026-09-16)

Cerrado con confirmación del usuario. Los once criterios se cumplen; la evidencia está en [CHANGELOG.md](../../CHANGELOG.md). CI en verde en el commit `62e6b3c` ([ejecución 35113732213](https://github.com/benjamurilloo/AI-WhatsApp-Agent-CRM/actions/runs/35113732213)). Nivel alcanzado: **validado localmente y en CI**.

### Evidencia de mutación (AC-7)

Con `phoneForRole` devolviendo `{ kind: "full", e164 }` para cualquier rol, el caso "la respuesta a viewer no contiene el número en la lectura ni en la lista" de `crm.test.ts` falló (1 fallido, 1 pasado de los 2 casos de H-5). Con el código restaurado, los dos pasaron.

### Ajustes durante la ejecución

- **Ninguna condición de detención se activó**: sin migraciones ni dependencias, `crm` solo importa `organizations`, `audit` y `auth`, y ningún test existente cambió.
- **`AuditLogEntry` no incluye `entityId`**: el test de la auditoría del cliente prueba el aislamiento con el total de registros, no comparando ids.
- **Orden y collation**: el collation de la base ignora los espacios al ordenar ("anabel Ruiz" antes que "Ana Pérez"). El test de búsqueda por prefijo compara sin orden; el orden se prueba en su propio caso. Es el límite aceptado en D-4.
- **Un texto que mezcla `+` y letras** ("+54 Ana") no normaliza como teléfono y se busca como prefijo de nombre, cubierto en los tests unitarios de `interpretSearch`.
- **Normalización**: los espacios no separables también se quitan, porque la expresión `\s` los incluye; los dígitos no ASCII se rechazan.
