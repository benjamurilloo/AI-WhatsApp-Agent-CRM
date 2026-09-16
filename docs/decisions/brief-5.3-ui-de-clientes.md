---
schema: task-brief.v1
task_id: 5.3
task_type: implementation
generated_at: 2026-09-16
---

# Brief: 5.3 — UI de clientes

## Objetivo

1. Implementar las pantallas 6 (lista de clientes) y 7 (detalle y edición), **sin la sección de conversaciones**, sobre el servicio de `crm` ya validado.
2. Cerrar la mitad de pantalla de **H-5**: el HTML y los datos que recibe el navegador de un `viewer` no contienen el teléfono completo.
3. Verificar la **minimización** de FR-CLI-05 contra NonFunctionalRequirements, como pide el Roadmap para la Fase 5.
4. Dejar las dos pantallas **validadas en integración** (`producer-consumer`), con axe en claro y oscuro, teclado y móvil, y habilitar el gate de salida de la Fase 5.

## Ubicación en la Fase 5

- **Orden previsto**: 5.1 y 5.2 (cerradas) → **5.3** → cierre de la Fase 5.
- **Notion**: "M. Pantallas 6 y 7, sin la sección de conversaciones." Estado: "Bandeja de Entrada".
- **Gate de salida de la Fase 5** (Roadmap): "FR del alcance probados". Sus criterios son búsqueda por nombre y teléfono, `CONFLICT` por teléfono duplicado y minimización verificada. Los tres ya están a nivel de servicio; falta el recorrido de UI.
- **Fuera de esta fase**: última interacción, conversaciones del cliente y su filtro por estado (FR-CLI-04, Fase 6).
- **Gates de entrada**: 5.2 cerrada con CI en verde (`c6bfa1f`); contenedor de PostgreSQL en marcha. No se esperan migraciones.

## Hallazgos de la verificación previa (2026-09-16)

1. **`crm` ya expone todo lo que las pantallas necesitan**: `searchClients`, `getClient`, las cuatro escrituras y `listClientAudit`. Esta subfase no debería tocar `src/modules/crm/`.
2. **El wireframe 06 muestra el teléfono del `admin` "formateado para lectura"** (`+54 9 11 5555-1234`), pero agrupar dígitos depende del país, y el proyecto no tiene reglas de numeración (5.2, D-1). Se resuelve en D-1.
3. **El enmascarado puede llegar sin dígitos** (`lastDigits: ""`), para números de 4 dígitos o menos (5.2, D-2). El wireframe solo dibuja `•••• 1234`. Se resuelve en D-1.
4. **El `CONFLICT` por teléfono no dice si el duplicado está inactivo.** El wireframe 07 muestra "Ya existe un cliente con ese teléfono.", pero con la 5.1 (D-3) el número puede ser de un cliente desactivado, que la lista oculta por defecto. Se resuelve en D-2.
5. **Sin conversaciones no hay última interacción.** Los wireframes 06 y 07 tienen una columna y un dato "Última interacción", la sección "Conversaciones" y el filtro por estado. Se resuelve en D-3.
6. **La auditoría del cliente guarda teléfono y notas completos** (5.2, D-6). La pantalla de productos muestra "campo: antes → después". Con notas de hasta 1 000 caracteres, eso rompe la tabla. Se resuelve en D-4.
7. **Con React Server Components, lo que la página pasa a un componente de cliente viaja serializado en el HTML.** El test de H-5 tiene que revisar el documento completo que recibe el navegador y las respuestas de navegación, no solo el texto visible. Se resuelve en D-5.
8. **La navegación no tiene "Clientes".** El marco común agrega los enlaces fase a fase (`layout.tsx`); el orden del wireframe 02 es Inicio · Productos · Clientes · … · Usuarios.
9. **El seed básico no crea clientes**, igual que con productos. Se sigue la 4.4 (D-5): cada caso del end-to-end crea lo que necesita, por la pantalla o por SQL.
10. **Precedentes de UI que se siguen sin decisión nueva** (3.7 y 4.4):
    - filtros y página en la URL, con `filters.ts` y `messages.ts` por ruta y sus tests;
    - Server Actions con `useActionState`, botón deshabilitado, `logEvent` con organización y duración y revalidación ante un rechazo;
    - campos controlados que sobreviven a un rechazo;
    - edición con `?editar=1` y confirmación con `?confirmar=desactivar` sobre la misma ruta;
    - alta en `/clientes/nuevo`;
    - tabla en escritorio y tarjetas en móvil;
    - fechas en la zona de la organización, con la leyenda al pie;
    - id inválido o ajeno → "Este cliente no existe.";
    - estilos solo con tokens.
11. **Los logs no pueden llevar datos del cliente** (SecurityModel): las acciones registran ids, código y duración, nunca nombre, teléfono ni notas.

## Alcance incluido

1. Registrar la resolución de D-1 a D-5.
2. **Pantalla 6 — lista de clientes** (`/clientes`):
   - búsqueda de nombre o teléfono completo y filtro de actividad (por defecto, solo activos), con la página, todo en la URL;
   - tabla en escritorio y tarjetas en móvil, con nombre, teléfono según D-1 y estado;
   - vacío y sin resultados distinguidos;
   - "Nuevo" y "Crear el primero" solo para `admin`;
   - columnas según D-3.
3. **Alta** (`/clientes/nuevo`): nombre, teléfono con su ayuda de formato y notas con el aviso de minimización; mensajes de validación y de `CONFLICT` en el campo, según D-2; solo `admin`.
4. **Pantalla 7 — detalle y edición** (`/clientes/[clientId]`):
   - datos (teléfono según D-1, notas y estado);
   - edición con `?editar=1`, con los mismos campos, avisos y mensajes del alta;
   - desactivar y reactivar con confirmación como segundo paso;
   - historial de auditoría paginado solo para `admin`, con el resumen de D-4 y fechas en la zona de la organización;
   - "Este cliente no existe." para un id inválido o de otra organización;
   - secciones según D-3.
5. **Navegación**: "Clientes" en el marco común, entre "Productos" y "Usuarios", para los dos roles.
6. **Tests**:
   - unitarios de `filters.ts`, `messages.ts`, del resumen de auditoría y de la presentación del teléfono;
   - end-to-end `tests/e2e/clients.spec.ts`: alta, búsqueda por nombre y por teléfono en otro formato, filtros y paginación en la URL, edición con `CONFLICT` en el campo (también contra un cliente inactivo), desactivación y reactivación, auditoría solo para `admin`, `viewer` sin formularios ni auditoría, cliente inexistente, alta solo con teclado, móvil a 375 px y axe en cada estado, en claro y oscuro;
   - **H-5** según D-5.
7. **Minimización (FR-CLI-05)**: revisar que las pantallas muestran solo nombre, teléfono, notas y estado, y que ningún log de las acciones lleva datos del cliente. El resultado se registra en el cierre, contra NonFunctionalRequirements.
8. **Documentación**:
   - Screens §6 y §7 y los wireframes 06 y 07: estado "implementado", con los desvíos de D-1 a D-4;
   - TraceabilityMatrix: H-5 cerrado en las dos mitades;
   - TestingStrategy y RepositoryStructure: fila de la 5.3.

## Alcance excluido

- Cambios en `src/modules/crm/` y en cualquier otro servicio, migraciones y dependencias nuevas.
- Última interacción, conversaciones del cliente, su filtro y los enlaces a la pantalla 9: Fase 6.
- Orden de la lista por última interacción: Fase 6 (5.2, D-4).
- Exportar o eliminar los datos de un cliente: Fase 8.
- Seeds de clientes para desarrollo.
- Formato del teléfono por país.
- Token de advertencia en `globals.css`.

## Archivos o componentes autorizados

Lista cerrada:

- `src/app/(autenticado)/clientes/` completo, incluidos `nuevo/` y `[clientId]/`, con sus `filters.ts`, `messages.ts`, `actions.ts`, componentes de formulario, la presentación del teléfono, el resumen de auditoría y sus tests unitarios.
- `src/app/(autenticado)/layout.tsx`, solo para el enlace "Clientes".
- `src/app/_components/`, solo para extraer lo que la pantalla de productos y la de clientes compartan sin cambiar su comportamiento. Si algo de `productos/` tiene que moverse, se anota como ajuste.
- `tests/e2e/clients.spec.ts` (nuevo).
- `docs/product/Screens.md`, `docs/product/wireframes/06` y `07`, `docs/architecture/TraceabilityMatrix.md`, `RepositoryStructure.md` y `docs/development/TestingStrategy.md`.
- Este brief y su fila en `docs/decisions/README.md`.
- `CHANGELOG.md`, `HANDOFF.md` y las líneas de estado de `README.md` y `docs/README.md`, al cerrar.

## Fuentes de verdad

1. [Screens.md](../product/Screens.md) §6 y §7, con los wireframes [06](../product/wireframes/06-lista-de-clientes.md) y [07](../product/wireframes/07-detalle-de-cliente.md).
2. FR-CLI-01 a 07 y FR-AUD-02 en [FunctionalRequirements.md](../product/FunctionalRequirements.md); minimización en [NonFunctionalRequirements.md](../product/NonFunctionalRequirements.md).
3. [brief-5.1](brief-5.1-migracion-de-clientes.md) y [brief-5.2](brief-5.2-servicio-de-clientes.md), con `src/modules/crm/index.ts`.
4. [brief-4.4](brief-4.4-ui-de-productos-e-inventario.md) y `src/app/(autenticado)/productos/` como patrón de pantalla.
5. [SecurityModel.md](../architecture/SecurityModel.md): enmascarado en `crm` y logs sin datos personales.
6. [Roadmap.md](../planning/Roadmap.md), Fase 5: criterios y gate de salida.

## Dependencias

- 5.2 cerrada.
- Contenedor de PostgreSQL en marcha; `npm run build` antes del end-to-end.

## Resolución (2026-09-16)

El usuario aprobó el brief con D-1 a D-5 según la recomendación: (a) en todas. También autorizó pasar la 5.3 a "En proceso" en Notion.

## Decisiones pendientes

Cada decisión trae una recomendación, no una resolución: la resuelve el usuario.

### D-1 — Cómo se muestra el teléfono

- **Opciones**:
  - (a) **E.164 tal como está guardado** (`+5491155551234`) para `admin`, y `•••• 1234` para `viewer`, con el texto accesible "Teléfono enmascarado, termina en 1234". Sin dígitos: `••••` con "Teléfono enmascarado". Sin teléfono: "Sin teléfono" en tarjetas y en el detalle, y `—` con ese texto accesible en la tabla.
  - (b) **Agrupar dígitos solo para Argentina** (`+54 9 11 5555-1234`), y el resto en E.164.
- **Recomendación**: (a).
  - Es lo que el `admin` escribe en el formulario y lo que busca: el mismo texto en todas partes.
  - (b) necesita reglas de numeración (códigos de área de 2 a 4 dígitos) que el proyecto descartó en la 5.2 (D-1), y un agrupado equivocado es peor que ninguno.
- **Consecuencia**: desvío anotado en los wireframes 06 y 07. Si más adelante hace falta agrupar, es un cambio de presentación en un solo archivo.

### D-2 — Mensaje del teléfono duplicado

- **Opciones**:
  - (a) **Mensaje genérico que cubre los dos casos**, sin tocar el servicio: "Ya existe un cliente con ese teléfono. Si está desactivado, buscalo con el filtro «Inactivos» o «Todos» y reactivalo."
  - (b) **El servicio devuelve el cliente que tiene el número** (id y si está activo), y el mensaje enlaza a su detalle.
- **Recomendación**: (a).
  - (b) reabre `crm`, cerrado en la 5.2, para un caso poco frecuente.
  - El `admin` ya puede encontrar el cliente buscando el mismo número con el filtro "Todos".
- **Consecuencia**: si el caso resulta frecuente en el piloto (Fase 9), (b) es aditiva.

### D-3 — Qué se muestra en lugar de la última interacción y las conversaciones

- **Opciones**:
  - (a) **Omitirlas hasta la Fase 6**: la lista no tiene columna "Última interacción" y el detalle no tiene ese dato ni la sección "Conversaciones". La lista se ordena por nombre (5.2, D-4).
  - (b) **Mostrarlas vacías** ("Sin interacciones", "Sin conversaciones registradas").
- **Recomendación**: (a).
  - (b) afirma algo que el sistema todavía no puede saber: un cliente con conversaciones en WhatsApp aparecería "sin interacciones".
  - La Fase 6 agrega las dos cosas junto con los datos que las alimentan.
- **Consecuencia**: la lista no tiene fechas, así que no lleva la leyenda "Fechas en …". El detalle la lleva solo si muestra auditoría. Desvío anotado en los wireframes.

### D-4 — Resumen de la auditoría del cliente

- **Opciones**:
  - (a) **Valores para nombre, teléfono y estado; solo el nombre del campo para las notas**: "Teléfono: +5491155551234 → vacío · Notas actualizadas". En el alta: "Nombre: Ana Pérez · Teléfono: +54911… · Notas cargadas".
  - (b) **Todos los valores**, como productos.
  - (c) **Solo los nombres de los campos**, como el wireframe ("Notas actualizadas").
- **Recomendación**: (a).
  - Las notas pueden tener 1 000 caracteres y no entran en una celda. El teléfono y el nombre sí, y son lo que un `admin` necesita para recuperar un número anterior (5.2, D-6).
  - Solo `admin` ve la auditoría, y ya ve el teléfono completo.
- **Consecuencia**: el valor anterior de las notas queda en la base, pero no en la pantalla. Si hace falta verlo, se suma un detalle por registro más adelante.

### D-5 — Cómo se prueba H-5 en la pantalla

- **Opciones**:
  - (a) **Con la sesión de un `viewer`, pedir el HTML de `/clientes`, de `/clientes?q=<número>` y de `/clientes/[id]` con `request.get`, y además registrar todas las respuestas de la navegación real** (documento y datos de RSC). Ninguna puede contener el número completo ni sus dígitos anteriores a los últimos 4. El mismo caso con `admin` sí lo encuentra, para que el test no pase por error.
  - (b) **Solo el texto visible** (`page.content()` o locators).
- **Recomendación**: (a).
  - (b) no ve lo que la página serializa para los componentes de cliente, que es justamente por donde se filtraría el número.
  - El control con `admin` evita un test que pase porque la página no muestra ningún teléfono.
- **Consecuencia**: se corre una vez con la página pasando el número completo al `viewer` para registrar que el test falla, como en la 5.2.

## Invariantes

- El teléfono completo nunca llega al navegador de un `viewer`, ni en el HTML ni en los datos de RSC.
- La auditoría y los formularios nunca llegan a un `viewer`.
- Ningún log de las acciones de clientes lleva nombre, teléfono ni notas.
- Los componentes de cliente no importan `@/modules/*`; toda mutación es una Server Action.
- Estilos solo con tokens de `globals.css`, sin `transition-colors` en lo que axe analiza.
- Sin cambios en `crm` ni en otros servicios, sin migraciones y sin dependencias nuevas.
- El comportamiento de las pantallas de productos y usuarios no cambia: sus end-to-end siguen pasando sin modificaciones.
- Sin referencias a Airtable ni al repositorio del agente de WhatsApp.

## Criterios de aceptación

- **AC-1**: D-1 a D-5 tienen resolución del usuario con fecha.
- **AC-2**: pantalla 6 — busca por nombre y por teléfono completo en cualquier formato, filtra por actividad, pagina y refleja todo en la URL; distingue "no hay clientes" de "sin resultados"; el `viewer` no recibe el botón de alta y ve el teléfono enmascarado.
- **AC-3**: alta y edición — validación en línea (nombre vacío, teléfono sin `+`, notas largas); `CONFLICT` en el campo teléfono con el mensaje de D-2, también contra un cliente inactivo; aviso de minimización en las notas; los campos sobreviven a un rechazo.
- **AC-4**: pantalla 7 — muestra los datos según D-1 y D-3; desactivar y reactivar piden confirmación; la auditoría, paginada y resumida según D-4, solo llega a `admin`; un id inválido o ajeno muestra "Este cliente no existe.".
- **AC-5 (H-5)**: el caso de D-5 pasa con `viewer` y con `admin`, y falla cuando la página entrega el número completo al `viewer` (evidencia registrada en el cierre).
- **AC-6**: "Clientes" aparece en la navegación para los dos roles, marcado como sección actual en `/clientes` y sus subrutas.
- **AC-7**: `tests/e2e/clients.spec.ts` cubre lo del punto 6, con axe sin violaciones en cada estado, en claro y oscuro, recorrido por teclado y móvil a 375 px.
- **AC-8**: cada Server Action registra `logEvent` con organización, código y duración, sin datos del cliente; la revisión de minimización del punto 7 queda escrita en el cierre.
- **AC-9**: `npm run test` y `npm run test:e2e` pasan completos, con los specs existentes sin cambios; con la base detenida pasan typecheck, lint, formato, guardas, unitarios y build, y `db:generate` no produce migraciones.
- **AC-10**: CI en verde en el commit de la subfase, verificado con `gh run view`.
- **AC-11**: `git status` muestra solo archivos autorizados; Screens y los wireframes 06 y 07 quedan en "implementado" con sus desvíos, y TraceabilityMatrix, RepositoryStructure y TestingStrategy reflejan la cobertura.

## Pruebas y evidencia requerida

- **Evidencia `deterministic`**: tests unitarios de presentación.
- **Evidencia `producer-consumer`**: end-to-end con Chromium sobre `next start` contra la base `_e2e`, sin mocks: UI ↔ Server Action ↔ `crm` ↔ base, más la corrida de mutación de AC-5.

**Nivel resultante esperado**: **validado en integración** para las pantallas 6 y 7. Con esto queda cubierto el gate de salida de la Fase 5.

**No se valida**:

- última interacción y conversaciones del cliente (Fase 6);
- rendimiento de la lista con volumen real (Fase 8);
- navegadores distintos de Chromium;
- la aplicación en staging o conectada con `crm_app` (Fases 8 y 9).

La revisión es una autoevaluación (`self_assessment: true`).

## Condiciones de detención

- Si alguna pantalla necesita un cambio en `crm` u otro servicio, una migración o una dependencia nueva.
- Si el número completo aparece en la respuesta a un `viewer` y no se puede evitar desde la página.
- Si axe informa una violación que obligue a cambiar un token de color o el diseño base.
- Si un spec o un test existente necesita cambios, o si extraer un componente compartido cambia el comportamiento de productos.
- Si el end-to-end resulta intermitente en alguna corrida.
- Antes de commit, push o cambios en Notion.

## Cierre (2026-09-16)

Cerrado con confirmación del usuario. Los once criterios se cumplen; la evidencia está en [CHANGELOG.md](../../CHANGELOG.md). CI en verde en el commit `c2fa98b` ([ejecución 35132808628](https://github.com/benjamurilloo/AI-WhatsApp-Agent-CRM/actions/runs/35132808628)). Nivel alcanzado: **validado en integración** para las pantallas 6 y 7.

### Evidencia de mutación (AC-5)

Con `phoneForRole` de `crm` devolviendo el número completo para cualquier rol, y la aplicación reconstruida, el caso H-5 de `tests/e2e/clients.spec.ts` falló ("Expected substring: not 5491166667788", 1 fallido). Con el código restaurado, pasó, y `git diff` sobre `src/modules/crm/` quedó vacío.

### Revisión de minimización (punto 7, FR-CLI-05 y NonFunctionalRequirements)

- **Pantallas**: la lista muestra nombre, teléfono y estado; el detalle, nombre, teléfono, notas y estado. No hay otros campos del cliente, y `clients` no tiene otros.
- **Teléfono**: un `viewer` recibe solo los últimos 4 dígitos, desde `crm`; el end-to-end revisa el HTML y las respuestas RSC.
- **Notas**: el formulario muestra el aviso "No registres datos sensibles innecesarios.", y el resumen de auditoría no repite su contenido (D-4).
- **Logs**: cada Server Action registra solo `userId`, `organizationId`, código y duración; ningún log lleva nombre, teléfono ni notas.
- **Límite conocido**: `audit_logs` guarda el teléfono y las notas en el `diff` (5.2, D-6); su eliminación a pedido sigue registrada en Risks para la Fase 8.

Resultado: **cumple** para lo que muestra y registra la aplicación.

### Ajustes durante la ejecución

- **Ninguna condición de detención se activó**: sin migraciones ni dependencias, `src/modules/crm/` sin cambios y ningún test existente modificado.
- **Orden del resumen de auditoría**: `jsonb` reordena las claves del `diff` al guardarlo, y el resumen salía en otro orden. Se recorre un orden fijo de campos (el del formulario), con su test unitario. Defecto encontrado por el end-to-end.
- **Teléfono de prueba de H-5**: el número de ejemplo de la ayuda de formato viaja en el JavaScript del cliente, así que el spec usa otro (`+5491166667788`). Los fragmentos prohibidos son las formas compactas del número, porque la página devuelve al `viewer` el texto que él mismo escribió en la búsqueda.
- **Lista con solo clientes inactivos**: con el filtro por defecto muestra "Todavía no hay clientes.", igual que productos. Se quitó una aserción que esperaba otro mensaje y el comportamiento quedó anotado en el wireframe 06.
- **Índice de wireframes**: se actualizó su línea de estado, que no figuraba en los archivos autorizados.
