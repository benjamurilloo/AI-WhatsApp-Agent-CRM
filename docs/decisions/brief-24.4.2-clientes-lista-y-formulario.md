---
schema: task-brief.v1
task_id: "24.4.2"
task_type: implementation
generated_at: 2026-10-29
---

# Brief: 24.4.2 — Clientes: lista y formulario

**Estado: aprobado el 2026-10-29 por el usuario, con las recomendaciones de D-1 a D-9; cerrado el 2026-10-30, desplegado (`d55b916` y el ajuste del menú `d2b2226`, sin migraciones) y recorrido por el usuario.**

## Objetivo

Que la lista de clientes (`/clientes`, pantalla 6) y el formulario de alta y edición queden **como los mockups de la v2** (`docs/ui-redesign/v2/04-clientes/`: 01, 02, 06 y los paneles 02, 03 y 04 de 08). La lista suma las vistas con su cantidad, el saldo por moneda y «En curso». El formulario suma el aviso de teléfono duplicado. Cada diferencia que quede se declara en el §Cierre, como en la [24.4.1](brief-24.4.1-clientes-ficha.md).

Es la quinta subfase de la Fase 24. **El usuario dividió el 2026-10-29 la fila 24.4.2 del Roadmap en dos**:
- esta subfase: la lista, el formulario y el aviso de duplicado;
- la **24.4.3 — Clientes: operaciones y actividad**, nueva: la tabla unificada de Operaciones (04), la cronología de Actividad (panel 05 de 08) y «Próxima atención» (03). Son lecturas de un solo cliente; esta subfase trae las de muchos clientes a la vez.

## Situación

- **La lista hoy** (`clientes/page.tsx`):
  - lee `searchClientsByLastInteraction` de `conversations`, que compone con `crm` (Overview, «La lista de clientes por última interacción»);
  - tiene columnas Nombre, Teléfono, Etiquetas (hasta tres y «+N»), Última interacción, Activo y, para un `admin`, Acciones;
  - sus filtros son un formulario GET: texto (prefijo del nombre o teléfono completo), actividad, etiqueta, tipo, provincia, segmento, orden y filas por página (10, 25 o 50; 25 por defecto);
  - en el teléfono, tarjetas;
  - el botón «Etiquetas» lleva a `/clientes/etiquetas`, y «+ Nuevo cliente» es solo para un `admin`.
- **El formulario hoy** (`client-form.tsx`, en `/clientes/nuevo` y en la ficha con `?editar=1`):
  - seis tarjetas;
  - el teléfono en E.164, opcional;
  - DNI e Instagram solo con `trade_ins`.

  Un teléfono repetido devuelve `CONFLICT`: el índice `clients_organization_phone_unique` alcanza también a los inactivos (brief-5.1, D-3). El error queda en el campo, con un texto que dice cómo buscar al cliente, sin enlace a él. El formulario todavía no usa el resumen de errores ni la barra de guardado de la 24.1.
- **La v2:**
  - **01, la lista en escritorio:**
    - el título con subtítulo, «Gestionar etiquetas» y «Nuevo cliente»;
    - las vistas «Todos 124», «Con saldo 18» y «Con reparaciones 9»;
    - la búsqueda, «Etiquetas», «Última actividad» y «Más filtros»;
    - una tabla con casilla, Cliente con avatar, Contacto, Etiquetas, En curso («1 reparación», «1 turno», «1 pedido», «1 usado», «1 conversación» o «Sin operaciones abiertas»), Saldo ARS con «Pendiente», Última actividad y «⋮»;
    - debajo, «1–6 de 124 clientes», «Los saldos se muestran por moneda.» y la paginación numerada.
  - **06, la lista en el teléfono:** tarjetas con avatar, nombre, teléfono, etiqueta, hora, «···», «En curso» con íconos, el saldo en un recuadro («Saldo ARS 35.000 Pendiente» o «Sin saldo pendiente») y flecha. Arriba van «Nuevo cliente» a todo el ancho, la búsqueda, «Todos» y «Con saldo», «Filtros» y «Gestionar etiquetas».
  - **02, el formulario:**
    - «← Clientes», «Nuevo cliente» con subtítulo;
    - «Datos de contacto»: nombre, teléfono con país y email;
    - «Identificación y domicilio», plegado;
    - «Organización interna»: etiquetas y observaciones;
    - a la derecha, «Antes de guardar»;
    - abajo, una barra fija con «Sin guardar», «Cancelar» y «Crear cliente».
  - **08:** el panel 02, «Posible duplicado», con la ficha existente, «Ver ficha existente» y «Volver al formulario»; el 03, la validación con el error en el campo; el 04, los vacíos «Todavía no hay clientes» y «No encontramos coincidencias» con «Limpiar filtros».
  - **El README de 04-clientes** dice tres cosas que importan acá:
    - los contadores de las vistas se calculan sobre un ámbito definido, no sobre la página visible;
    - el saldo nunca suma ARS y USD, y un error se muestra como «No disponible», nunca como cero;
    - el duplicado se detecta por el teléfono normalizado, sin fusionar registros.

## Hallazgos antes de diseñar

- **H-1. No hay lecturas por lote por cliente.** Cada módulo lee de a un cliente: `listRecentClientOrders`, `listClientServiceOrders`, `listClientAppointments`, `listClientTradeIns`, `getClientAccountSummary`. Ninguno acepta una lista de ids. La única lectura de muchos clientes es `listDebtors` de `cash`, que no exporta su lectura interna `readDebts` y devuelve solo deudas, sin el saldo a favor. Las vistas, el saldo y «En curso» necesitan lecturas nuevas, permitidas por la regla de la Fase 24 («las que leen por lote, las mide»).
- **H-2. El saldo de muchos clientes ya tiene un costo medido.** `readDebts` lee la organización entera en cuatro consultas y pasa cada cuenta por `imputeAccount`. La lista de deudores tiene un límite aceptado por el usuario el 2026-10-15: con 400 clientes, 4.000 ventas y 4.200 cobros, entre 170 y 200 ms; con 2.000, 20.000 y 21.000, entre 390 y 620 ms, por encima del umbral de 400 ms (Overview, «la lista de deudores»). La vista «Con saldo» y su cantidad necesitan el saldo de **todos** los clientes del filtro, no solo los de la página. Así que la lista hereda ese costo en cada carga.
- **H-3. El `viewer` ve los saldos.** `cash` autoriza a los dos roles: el `viewer` ve la cuenta y el estado de cuenta en la ficha (brief-24.4.1, H-7) y la lista de deudores. El README pide ocultar las columnas financieras «para roles sin permiso», y hoy ningún rol de la aplicación está en ese caso. Si el `viewer` no debiera ver saldos en la lista, tampoco debería verlos en la ficha, y eso sería otra decisión.
- **H-4. «En curso» no tiene una definición en el sistema.** Se define acá, con un estado por módulo:
  - pedidos `pending` o `confirmed`;
  - órdenes de servicio en `OPEN_SERVICE_ORDER_STATUSES` (con `repairs`), las mismas que cuenta «Reparaciones abiertas» de la ficha;
  - turnos `requested` o `confirmed` desde hoy (con `appointments`);
  - conversaciones `open` o `pending`.

  Un usado no tiene un estado abierto: su recepción es un hecho cerrado. El «1 usado» de 01 no entra (desvío, D-3).
- **H-5. «Última actividad» es hoy la última interacción.** La lista ordena por `MAX(last_message_at)` de las conversaciones del cliente. El mockup la llama «Última actividad», y la ficha de la 24.4.1, «Última interacción». Una actividad que sumara ventas, reparaciones y cobros es la cronología de la 24.4.3.
- **H-6. La búsqueda no encuentra por documento.** El mockup dice «Buscar por nombre, teléfono o documento». Hoy busca por prefijo del nombre o por teléfono completo. Buscar por documento sería una lectura nueva en `crm`, y además un `viewer` no recibe el documento (brief-17.1, D-8): encontrarlo por documento le confirmaría un dato que no ve. No entra (D-5).
- **H-7. La selección múltiple escribe.** Las casillas de 01 sirven para aplicar o quitar etiquetas a varios clientes juntos. Eso es una escritura nueva en lote, con su auditoría por cliente, y la Fase 24 no agrega escrituras. No entra (D-5).
- **H-8. El teléfono del formulario es un solo campo E.164.** 02 lo parte en país («Argentina +54») y número local («11 5555 0182»). En la Argentina, un celular en E.164 lleva un 9 que nadie escribe en el número local (`+54 9 11…`). Componerlo desde dos campos es una regla de normalización nueva, y de ella depende que una conversación de WhatsApp encuentre a su cliente. Se queda como un solo campo E.164, con la ayuda de hoy (D-7).
- **H-9. El teléfono es opcional.** 02 lo marca obligatorio. Hoy un cliente puede no tener WhatsApp, y el README pide «conservar las reglas del negocio, incluyendo clientes sin WhatsApp si están permitidos». Sigue opcional.
- **H-10. Las etiquetas en el alta escriben.** 02 asigna etiquetas al crear. Hoy se asignan desde la ficha (16.1), con su auditoría. Crear el cliente y asignarle etiquetas en la misma transacción es una escritura nueva. No entra (D-7).
- **H-11. El aviso de duplicado necesita encontrar al otro cliente.** El `CONFLICT` de hoy no dice cuál es. El aviso de 08 muestra su nombre y su teléfono. Hace falta una lectura en `crm` por teléfono exacto, solo para un `admin`, que es quien ve el formulario (D-8).
- **H-12. El orden por saldo no entra.** 01 dibuja flechas de orden en Cliente, Saldo y Última actividad. Ordenar por saldo pide el saldo de todos, que la vista «Con saldo» ya lee (H-2), pero ordenar dos monedas juntas no tiene un criterio: ¿ARS 35.000 va antes que USD 100? Se queda el orden de hoy, con su selector (D-6).

## Decisiones

### D-1 — Las vistas

- **(a)** «Todos», «Con saldo» y, con `repairs`, «Con reparaciones», como enlaces `?vista=` con `SubNav` y `aria-current`, como las pestañas de la 24.4.1. Cada una lleva su cantidad.
  - La cantidad se calcula con todos los demás filtros aplicados (texto, actividad, etiqueta, tipo, provincia, segmento y última actividad), sin la vista: es «el ámbito definido» del README.
  - «Con saldo» es un cliente que debe algo en alguna moneda. El saldo a favor no cuenta: el README rotula los positivos «Pendiente».
  - «Con reparaciones» es un cliente con alguna orden abierta (H-4).
  - En el teléfono, como 06: «Todos» y «Con saldo» a la vista, y «Con reparaciones» también, porque es una vista y no un filtro. Recomendada.
- (b) Solo «Todos» y «Con saldo», sin cantidades.

### D-2 — El saldo en la lista

- **(a)** Una lectura nueva en `cash`, `getClientBalances(context)`. Lee la organización con la misma lectura de `readDebts` y devuelve, por cliente y moneda, lo que debe y lo que tiene a favor. La lista la compone con los ids del filtro:
  - para la vista «Con saldo» y su cantidad;
  - para la columna de la página.

  La columna se llama «Saldo» y muestra una línea por moneda, sin sumar:
  - con deuda, el importe y la insignia «Pendiente»;
  - con saldo a favor, «A favor» y el importe;
  - sin nada, «Sin saldo pendiente», como 06. 01 dice «ARS 0», que con dos monedas no dice cuál;
  - si la lectura falla, «No disponible», y la vista «Con saldo» no se ofrece.

  El `viewer` la ve, como ve la cuenta en la ficha (H-3). Se mide (R-1). Recomendada.
- (b) Leer el saldo solo de los clientes de la página, con lecturas nuevas por ids en `sales`, `orders` y `cash`, y sin la vista «Con saldo». Es más barato, pero no cumple la vista de 01 ni la de 06.

### D-3 — «En curso»

- **(a)** Cuatro lecturas nuevas, una por módulo, con los ids de la página: `countOpenOrdersByClient` (`orders`), `countOpenServiceOrdersByClient` (`service`, con `repairs`), `countUpcomingAppointmentsByClient` (`appointments`, con `appointments`) y `countOpenConversationsByClient` (`conversations`).
  - Cada una es un `GROUP BY client_id` sobre su propia tabla, sin `JOIN`.
  - La columna muestra hasta dos líneas con ícono («1 reparación», «2 turnos») y «+N» con las demás. Sin nada, «Sin operaciones abiertas».
  - Los usados no entran (H-4).
  - «Con reparaciones» (D-1) usa la misma definición, pero sobre todos los ids del filtro: una quinta lectura, `listClientIdsWithOpenServiceOrders` (`service`). Recomendada.
- (b) Sin la columna, hasta que exista una lectura de «operaciones abiertas» compartida.

### D-4 — «Última actividad»

- **(a)** La columna sigue siendo la última interacción (H-5). Se rotula **«Última interacción»**, como la ficha. El filtro «Última actividad» de 01 entra como **«Última interacción»**: «Todas», «Últimos 7 días», «Últimos 30 días» y «Sin interacciones». `conversations` lo aplica en memoria, sobre la lectura agrupada que ya hace para ordenar. Recomendada.
- (b) Rotular la columna «Última actividad», como 01, aunque sea la interacción.

### D-5 — Lo que la tabla de 01 no lleva

- **(a)** Ni casillas ni barra de selección (H-7). La búsqueda sigue siendo por nombre o teléfono, y la ayuda lo dice (H-6). La columna «Activo» de hoy, que 01 no dibuja, pasa a la insignia «Inactivo» junto al nombre, solo cuando lo está, como en la ficha de la 24.4.1. «Contacto» es el teléfono, enmascarado para un `viewer` como hoy. El «⋮» de cada fila es un «Más acciones» de la 24.1 con «Ver ficha» y, para un `admin`, «Editar», que lleva a `?editar=1`. «Gestionar etiquetas» por fila no entra: las etiquetas de un cliente se editan en su ficha. Recomendada.
- (b) Sin «⋮»: el nombre ya abre la ficha.

### D-6 — Los filtros y el orden

- **(a)** Como 01:
  - a la vista, la búsqueda, «Etiquetas» y «Última interacción»;
  - en «Más filtros», un `<details>` que funciona sin JavaScript y queda abierto si alguno de sus filtros está aplicado: actividad, tipo, provincia, segmento, orden y filas por página;
  - en el teléfono, como 06, la búsqueda a la vista y el resto en «Filtros», con el mismo `<details>`.

  El orden es el de hoy, con su selector (H-12). La paginación es la `Pagination` de hoy. El texto «Los saldos se muestran por moneda.» va al pie, como 01. Recomendada.
- (b) Todos los filtros a la vista, como hoy.

### D-7 — El formulario

- **(a)** Como 02, en el alta y en la edición:
  - **«Datos de contacto»:** nombre, teléfono y email. El teléfono es un solo campo E.164 y opcional (H-8, H-9), con la ayuda de 02 («Usamos el teléfono para vincular conversaciones») sumada a la del formato.
  - **«Identificación y domicilio»:** un `<details>` plegado, que se abre solo si trae datos o un error. Lleva documento e Instagram (con `trade_ins`), dirección, localidad, provincia y código postal.
  - **«Organización interna»:** tipo, empresa, cargo, segmento y observaciones, con el aviso de datos sensibles de hoy.
  - **«Antes de guardar»**, en escritorio, a la derecha, con los textos de 02. «Buscá por nombre o teléfono antes de crear» enlaza a la lista.
  - **Abajo**, el resumen de errores (`ErrorSummary`) y la barra de guardado (`FormActionBar`) de la 24.1: «Cancelar» y «Crear cliente» o «Guardar cambios».

  Sin etiquetas en el alta (H-10). Recomendada.
- (b) Solo el resumen de errores y la barra de guardado, con las tarjetas de hoy.

### D-8 — El aviso de duplicado

- **(a)** Una lectura nueva en `crm`, `findClientByPhone(context, phoneE164)`. Es solo para un `admin` y devuelve id, nombre, teléfono y si está activo, o nada.
  - Cuando el alta o la edición devuelven `CONFLICT`, la Server Action la llama y el formulario muestra arriba el aviso de 08 (panel 02): «Este teléfono ya está registrado», la ficha del otro cliente con su nombre y su teléfono, e «Inactivo» si lo está.
  - Las acciones son «Ver ficha existente», un enlace a su ficha, donde se reactiva si está inactivo, y «Volver al formulario», que lleva el foco al campo del teléfono.
  - El borrador queda como se escribió. Funciona sin JavaScript: es la respuesta del envío.
  - No se fusiona nada.
  - El aviso se anuncia como el resumen de errores. Recomendada.
- (b) El error de hoy en el campo, con un enlace a la ficha existente.

### D-9 — Revisión y despliegue

- **(a)** Revisión independiente antes de desplegar y despliegue al cerrar, como la 24.4.1. Recomendada.

## Alcance incluido

1. **Las lecturas nuevas** (D-2, D-3, D-4 y D-8), cada una en su módulo, por su `index.ts`, sin `JOIN` entre módulos:
   - `cash`: `getClientBalances`;
   - `orders`: `countOpenOrdersByClient`;
   - `service`: `countOpenServiceOrdersByClient` y `listClientIdsWithOpenServiceOrders`;
   - `appointments`: `countUpcomingAppointmentsByClient`;
   - `conversations`: `countOpenConversationsByClient`, y el filtro por última interacción en `searchClientsByLastInteraction`;
   - `crm`: `findClientByPhone`.

   Cada una autoriza su rol y su capacidad, y lee solo la organización del contexto.
2. **La composición de la lista**: la vista y su cantidad, el saldo y «En curso», en la página o en `conversations`, que ya compone la lista. Cuál de los dos lo hace se decide al implementar y se declara en el §Cierre.
3. **La lista** (`clientes/page.tsx` y `filters.ts`), con D-1 a D-6, en escritorio y en el teléfono, y sus vacíos como el panel 04 de 08.
4. **El formulario** (`client-form.tsx`, `nuevo/` y la edición en la ficha), con D-7 y D-8, y sus Server Actions.
5. **La documentación:**
   - `Screens.md`, pantalla 6 y la parte del formulario de la 7, con una nota fechada;
   - `Overview.md`, con la composición de la lista y su límite medido;
   - la fila 24.4.2 del Roadmap dividida y la fila 24.4.3 nueva (decisión del usuario del 2026-10-29).
6. **Los tests:**
   - de integración, uno por lectura nueva: el resultado, el aislamiento por organización, el rol y la capacidad;
   - unitarios de los filtros nuevos;
   - end-to-end de la lista (las vistas y sus cantidades, el saldo en dos monedas, «En curso», «Más filtros» sin JavaScript), del formulario (secciones, errores y barra de guardado) y del aviso de duplicado, con un cliente activo y uno inactivo, para los dos roles;
   - el `viewer`, sin el teléfono completo en la lista, como hoy;
   - axe en claro y en oscuro, a 1280 y 375 px, en la lista, el formulario y el aviso.
7. **La comparación visual (AC-9):** capturas de la lista y del formulario a 1440 y 375 px, con datos de alto desigual (clientes con y sin saldo, en dos monedas, con muchas y ninguna operación), lado a lado con 01, 02, 06 y los paneles 02 a 04 de 08, con la tabla de diferencias en el §Cierre.

## Archivos autorizados

- `src/app/(autenticado)/clientes/page.tsx`, `filters.ts`, `filters.test.ts`, `client-form.tsx`, `actions.ts`, `messages.ts`, `messages.test.ts` y `nuevo/**`.
- `src/app/(autenticado)/clientes/[clientId]/page.tsx`, solo para pasarle al formulario lo que pide.
- `src/modules/cash`, `orders`, `service`, `appointments`, `conversations` y `crm`: solo las lecturas de D-2, D-3, D-4 y D-8, sus tipos, sus exports en `index.ts` y sus tests de integración.
- `src/app/_components/`, solo con una opción nueva que no cambie el comportamiento por defecto.
- `tests/e2e/clients.spec.ts`, `client-fields.spec.ts`, `client-tags.spec.ts` y los specs que llegan a la lista o al formulario; `tests/guards/exposed-surface.test.ts` si cambian las Server Actions.
- `scripts/medir-caminos.ts`, para el camino nuevo de la lista (R-1).
- `docs/product/Screens.md` (pantallas 6 y 7), `docs/architecture/Overview.md` (la composición), `docs/planning/Roadmap.md` (las filas 24.4.2 y 24.4.3) y este brief.
- **Sin migraciones, tablas ni contratos.**

## Alcance excluido

- La tabla unificada de Operaciones, la cronología de Actividad y «Próxima atención»: son de la 24.4.3.
- La selección múltiple y las etiquetas en lote (H-7).
- La búsqueda por documento (H-6).
- El teléfono partido en país y número (H-8), y hacerlo obligatorio (H-9).
- Las etiquetas en el alta (H-10).
- El orden por saldo (H-12).
- Los usados en «En curso» (H-4).
- Fusionar clientes, en cualquier forma.

## Invariantes

- Un `viewer` no recibe el teléfono completo, el email, la calle ni el código postal, en la lista ni en el formulario, que sigue siendo solo para un `admin`.
- Ningún importe en dos monedas se suma, ni en la columna ni en la cantidad de «Con saldo».
- Un saldo que no se pudo leer nunca se muestra como cero.
- Cada lectura de un módulo con capacidad se hace solo con ella: sin `repairs`, ni la vista «Con reparaciones» ni las reparaciones de «En curso»; sin `appointments`, ningún turno.
- Ninguna lectura cruza la organización del contexto.
- Ningún `JOIN` entre tablas de dos módulos.
- La lista y el formulario funcionan sin JavaScript.
- La accesibilidad verificada con axe no retrocede.

## Criterios de aceptación

- **AC-1**: las vistas, como D-1, con su cantidad sobre los demás filtros, por la URL, con `aria-current`, combinables con la búsqueda y los filtros, para los dos roles. «Con reparaciones», solo con `repairs`.
- **AC-2**: el saldo, como D-2: una línea por moneda, «Pendiente» y «A favor» sin sumar monedas, «Sin saldo pendiente» y «No disponible» ante un error. Se prueba con un cliente que debe en ARS y tiene a favor en USD.
- **AC-3**: «En curso», como D-3, con la definición de H-4, cada módulo con su capacidad, y «Sin operaciones abiertas».
- **AC-4**: la última interacción y su filtro, como D-4.
- **AC-5**: la tabla, los filtros y el orden, como D-5 y D-6. «Más filtros» funciona sin JavaScript y queda abierto con un filtro aplicado.
- **AC-6**: el formulario, como D-7, en el alta y en la edición, con el resumen de errores, la barra de guardado y las secciones. Los campos de `trade_ins` solo aparecen con la capacidad.
- **AC-7**: el aviso de duplicado, como D-8, en el alta y en la edición, con un cliente activo y uno inactivo. El borrador se conserva, y «Volver al formulario» lleva el foco al teléfono. Funciona sin JavaScript.
- **AC-8**: un `viewer` ve la lista con las vistas, el saldo y «En curso», sin el teléfono completo ni ninguna acción de `admin`. Se comprueba sobre lo que llega a su navegador.
- **AC-9**: la comparación visual con 01, 02, 06 y los paneles 02 a 04 de 08 está en el §Cierre, con datos de alto desigual. Cada diferencia cita la regla que la excluye o queda como desvío para el usuario.
- **AC-10**: R-1 medido y en el §Cierre.
- **AC-11**: axe sin violaciones en la lista, el formulario y el aviso, en claro y en oscuro, a 1280 y 375 px. Nada se sale del ancho a 375 px.
- **AC-12**: la CI pasa completa en el SHA que se despliega.
- **AC-13**: desplegado y recorrido por el usuario, con la revisión independiente antes (D-9).

## Condiciones de detención

- Si una lectura necesita un `JOIN` entre módulos, una migración o un índice nuevo: se detiene y se consulta.
- Si R-1 supera su umbral: se informa con los números antes de seguir.
- Si `getClientBalances` no da el mismo saldo que `getClientAccountSummary` para algún cliente del test: se detiene. Las dos tienen que salir de `imputeAccount`.
- Si axe reporta una violación que no se resuelve sin apartarse de la v2: gana la accesibilidad, y se informa.
- Antes de cada commit, del push, del despliegue y de cada cambio en Notion: cada uno se autoriza en su turno.

## Riesgos

- **R-1: el costo de la lista.** Con D-2, cada carga de la lista lee el saldo de toda la organización, que hoy solo lee la lista de deudores.
  - **Cómo se mide:** con `scripts/medir-caminos.ts` sobre una base de medición, en la tanda de la 21.6 (400 clientes, 4.000 ventas y 4.200 cobros) y en la de 2.000 clientes, 20.000 ventas y 21.000 cobros. Se mide la lista de hoy contra la nueva, primera y última página, en «Todos» y en «Con saldo».
  - **El umbral**, fijado antes de medir: el de la 21.6, 400 ms de camino completo con 400 clientes. Si se supera, se informa (condición de detención).
  - **Con 2.000 clientes** se espera que se supere, como la lista de deudores. Se informa la cifra, y el usuario decide si se acepta el mismo límite («se revisa si un negocio se acerca a 20.000 ventas con cliente»).
- **R-2: los localizadores de los end-to-end.** «Etiquetas» pasa a «Gestionar etiquetas», «Más filtros» esconde selectores que hoy están a la vista, y la columna «Saldo» y «En curso» suman texto a cada fila. Se buscan en todos los specs antes de correr la suite, como en la 24.2 y la 24.4.1.
- **R-3: el aviso le muestra a un `admin` otro cliente.** Un `admin` ya ve todos los clientes con su teléfono completo, así que el aviso no le da nada que no vea en la lista. `findClientByPhone` rechaza a un `viewer` igual, y su test lo prueba.
- **R-4: la CI cerca de su límite.** Las dos corridas de la 24.4.1 tardaron 39 de los 45 minutos por job. Esta subfase suma end-to-end. Si una corrida se acerca a 45, se informa antes de seguir; subir el límite es otra decisión.

## Situación en la fase

- **Necesario ahora:** la lista y el formulario con la forma de 01, 02 y 06, el saldo y las vistas.
- **Antes de producción:** nada nuevo; la lista y el formulario de hoy ya están desplegados.
- **Después:** la 24.4.3 (Operaciones y Actividad unificadas, «Próxima atención»); el panel de cobro y el período (24.7.2).


## Cierre

*Del 2026-10-29, antes del commit de la implementación; completado el 2026-10-30, con la CI, el despliegue y el recorrido del usuario.*

**Decisión del usuario (2026-10-29, después del commit c5c2287):** acepta, con la recomendación, el límite del 5× de R-1 (el mismo de la lista de deudores, a revisar si un negocio se acerca a 20.000 ventas con cliente) y los desvíos 9, 10, 11, 15, 19 y 21. O-1 y O-2 quedan declarados.

### Criterios

| Criterio | Estado | Evidencia |
|---|---|---|
| AC-1 | cumple | `filters.ts` (`?vista=`, `VIEW_PARAM`) y `list-data.ts`: una vista que no se ofrece vale «Todos». Las cantidades salen de `searchClientsByLastInteraction` con `scopeTotal` y `viewCounts`, sobre los ids del filtro sin la vista (`client-list.test.ts`, «las vistas y la última interacción»). Caso 23: «Todos 3» y «Con saldo 1», `aria-current`, la vista recorta la lista y viaja con la búsqueda, para los dos roles. Caso 27: «Con reparaciones 1» solo con `repairs` |
| AC-2 | cumple | `getClientBalances` sale de `readAccounts` e `imputeAccount`, como la ficha: da lo mismo que `getClientAccountSummary` para el cliente que debe en ARS y tiene a favor en USD, y para el que solo tiene un cobro a cuenta (`client-accounts.test.ts`). `list-cells.test.ts`: «No disponible» sin ningún número, «Sin saldo pendiente» y una línea por moneda sin sumar. Caso 23, en la pantalla |
| AC-3 | cumple | Las cuatro lecturas de «En curso» con su estado abierto, su rol, su capacidad y su organización (`client-list.test.ts`). `list-cells.test.ts`: dos líneas, «+N» con el detalle y «Sin operaciones abiertas». Casos 23, 24 y 27 |
| AC-4 | cumple | `interactionFilter` (`filters.test.ts`) y `matchesInteraction` (`client-list.test.ts`); caso 24 en la pantalla. La columna se llama «Última interacción» |
| AC-5 | cumple, con dos desvíos | «Más filtros» es un `<details>` que queda abierto con un filtro aplicado; caso 25 sin JavaScript. El «⋮» de cada fila con «Ver ficha» y, solo para un `admin`, «Editar» (caso 23). Las filas por página y los filtros en el teléfono, desvíos 9 y 10 |
| AC-6 | cumple | Las tres secciones, el resumen de errores, la barra de guardado y «Antes de guardar» (`client-form.tsx`). `client-fields.spec.ts` 1 y 2, casos 1, 2, 5 y 11 (el orden del teclado) |
| AC-7 | cumple | `findClientByPhone` solo para un `admin` y sin cruzar la organización (`client-list.test.ts`). Caso 3: el aviso con el cliente inactivo, el foco, «Ver ficha existente», «Volver al formulario» que lleva el foco al teléfono y el borrador intacto. Caso 6, en la edición. Caso 26, sin JavaScript |
| AC-8 | cumple | Caso 23: lo que recibe un `viewer` en `/clientes` no tiene el teléfono completo, y ve las vistas, el saldo y «En curso» sin «Editar». `client-fields.spec.ts` 3: ni el email, ni la calle, ni el código postal |
| AC-9 | cumple, con los desvíos aceptados por el usuario | La comparación, abajo |
| AC-10 | cumple, con el 5× por encima del umbral, aceptado por el usuario | La medición, abajo |
| AC-11 | cumple | Axe en claro y en oscuro en la lista (casos 1, 4, 23 y 27, y a 375 px en el 23), en el alta (caso 1), en el alta y el aviso a 375 px con el domicilio abierto y sin desplazamiento horizontal (caso 28), y en el aviso (caso 3) |
| AC-12 | cumple | CI en verde en los dos SHA desplegados: `d55b916` (run 40990920881) y `d2b2226` (run 41043718346). La primera corrida, de `c5c2287` (run 40989599266), falló y no se desplegó: ver abajo |
| AC-13 | cumple | La revisión independiente, antes del despliegue (abajo). Desplegada en `d55b916` y `d2b2226`, con `/api/health` y `/login` en 200, y recorrida por el usuario, que pidió un ajuste (abajo) y aprobó el cierre |

### La medición de R-1

- **Método:** `scripts/medir-caminos.ts`, con el camino nuevo `clientes.readClientList`, que llama a la misma composición que la pantalla (`list-data.ts`). Corrió contra la base `_test`, con dos organizaciones sembradas por un script del scratchpad, fuera del repositorio (`sembrar-lista-2442.ts`). Cinco corridas por camino, tras una de calentamiento, sin otra corrida en el mismo servidor.
  - **1×:** 400 clientes, 4.000 ventas y 4.200 cobros (3.800 de venta y 400 a cuenta), una conversación por cliente y 100 pedidos pendientes.
  - **5×:** 2.000 clientes, 20.000 ventas y 21.000 cobros, con lo mismo.
- **El umbral**, fijado antes de medir: 400 ms de camino completo con 1×.

| Camino (mediana) | 1× | 5× |
|---|---|---|
| La lista de hoy (`searchClientsByLastInteraction`), primera y última página | 16,1 a 17,4 ms | 36,6 a 43,4 ms |
| La lista nueva, «Todos», primera página | 88,3 ms | 373,4 ms |
| La lista nueva, «Todos», última página | 104,8 ms | 520,3 ms |
| La lista nueva, «Con saldo», primera página | 88,2 ms | 566,4 ms |
| La lista nueva, «Con saldo», última página | 77,4 ms | 345,1 ms |
| La lista de deudores (`listDebtors`), las tres variantes | 65,1 a 82,5 ms | 303,3 a 381,8 ms |

- **Resultado:** con 1× la lista cumple el umbral con holgura: 77 a 105 ms, de 5 a 6 veces la de hoy. Con 5× lo supera en tres de las cuatro variantes, de 345 a 566 ms, como se esperaba (R-1): cuesta un poco más que la lista de deudores, porque lee lo mismo y además las vistas y «En curso». **El usuario decide** si se acepta el mismo límite de la lista de deudores: se revisa si un negocio se acerca a 20.000 ventas con cliente.
- **Límites:** mide las lecturas del servidor, no el render ni la red, y una llamada por vez. Las 30 corridas que el script marca como fallidas son de caminos de la API del agente que esta siembra no tiene (sin conversaciones con referencia del emisor), no de esta lista.

### La comparación visual (AC-9)

Capturas de la lista, el alta, la edición, el aviso de duplicado, «Más filtros» abierto y el vacío sin resultados, a 1440 y 375 px, con un spec temporal, borrado después, lado a lado con 01, 02, 06 y los paneles 02 a 04 de 08. Los datos son de alto desigual: clientes con y sin saldo, en dos monedas, con dos pedidos y con ninguna operación, con dos etiquetas y con una. Se corrigió durante la comparación: el nombre y «Sin saldo pendiente» se partían en dos líneas en escritorio.

| # | Diferencia | Mockup | Por qué queda |
|---|---|---|---|
| 1 | Sin casillas ni barra de selección | 01 | H-7: la acción en lote es una escritura nueva |
| 2 | La búsqueda es por nombre o teléfono, sin documento | 01, 06 | H-6 |
| 3 | La columna se llama «Saldo», con una línea por moneda, y sin deuda dice «Sin saldo pendiente», no «ARS 0» | 01 | D-2: «ARS 0» no dice de qué moneda con dos; 06 usa «Sin saldo pendiente» |
| 4 | Sin flechas de orden en las columnas: el orden está en «Más filtros» | 01 | H-12 y D-6 |
| 5 | «Última interacción», no «Última actividad» | 01 | H-5 y D-4 |
| 6 | Los usados no aparecen en «En curso» | 01 | H-4 |
| 7 | El teléfono en E.164, sin espacios | 01, 06, 08 | Como la ficha (24.4.1, diferencia 8) |
| 8 | El «⋮» de cada fila es el botón con borde de «Más acciones» | 01, 06 | El patrón de la 24.1 |
| 9 | «Filas por página» sigue en la paginación, no en «Más filtros» | — | **Desvío** (H-4 de la revisión): D-6 la ponía en «Más filtros»; la `Pagination` compartida ya la tiene, y con un selector más habría dos controles para lo mismo |
| 10 | En el teléfono, «Etiquetas» y «Última interacción» quedan a la vista y el desplegable dice «Más filtros», no «Filtros» | 06 | **Desvío** (H-4 de la revisión): D-6 los ponía en «Filtros». Moverlos solo en el teléfono duplicaría los campos del formulario GET, y un campo oculto viaja igual |
| 11 | En el teléfono, «Gestionar etiquetas» es un botón a todo el ancho, no un enlace con flecha | 06 | **Desvío**: es el mismo enlace del encabezado de escritorio |
| 12 | La paginación dice «Mostrando 1 a 5 de 5 clientes», con «Página siguiente» y las filas | 01, 06 | Es la `Pagination` compartida de la 15.1 |
| 13 | El teléfono del formulario es un solo campo E.164, sin el país aparte, y opcional | 02 | H-8 y H-9 |
| 14 | «Organización interna» lleva tipo, empresa, cargo, segmento y observaciones, sin etiquetas | 02 | H-10 y D-7: los campos existen; las etiquetas en el alta son una escritura nueva |
| 15 | En «Antes de guardar», el enlace es «Buscar en la lista», aparte del texto | 02 | **Desvío** (O-4 de la revisión): un enlace con el texto entero sería largo de nombrar |
| 16 | «Volver a clientes», no «← Clientes» | 02 | Como la ficha |
| 17 | El borde del aviso de duplicado es neutro, no ámbar | 08 (02) | No hay un token de borde ámbar; agregarlo cambia los tokens de la 23.1 |
| 18 | «Crear cliente» nunca se deshabilita por un error | 08 (03) | El README de 04-clientes lo pide así: permitir el intento y explicar los errores |
| 19 | El vacío con filtros dice «Ningún cliente coincide con esta búsqueda.», no «No encontramos coincidencias» | 08 (04) | **Desvío** (O-4 de la revisión): es el texto de la pantalla 6 desde la 5.3, con sus pruebas |
| 20 | Dos etiquetas de una fila van una debajo de la otra | 01 | El ancho de la columna con siete columnas |

### Defectos encontrados y corregidos

- **El nombre y el saldo se partían en dos líneas** en escritorio: en la comparación visual.
- **Una vista vacía decía «Todavía no hay clientes»** (H-2 de la revisión): en «Con saldo» sin deudores, la página mostraba el vacío de una organización sin clientes y «Nuevo cliente». Ahora dice «Ningún cliente en esta vista.» con «Ver todos» (caso 27).
- **Un test con el texto corrupto** (H-3 de la revisión): una edición hecha con PowerShell guardó `client-list.test.ts` con el UTF-8 decodificado dos veces. Se reparó y se releyó.
- **Si la búsqueda del duplicado lanzaba un error**, se perdía también el error del campo (O-3 de la revisión). Ahora la lectura que falla deja el aviso de siempre.
- **El formateo tocó seis archivos de `service`** que la subfase no cambia, solo en los finales de línea. Se restauraron antes de seguir.
- **Los localizadores de R-2**: «Nombre completo», «Correo electrónico», «Teléfono», que también encuentra el aviso «Este teléfono…», «Etiqueta», que también encuentra «Más acciones de Hugo Sin Etiqueta», y el foco, que va al resumen de errores como en la 24.1. Se ajustaron en `clients`, `client-fields`, `client-tags` y `security-headers`.

### Después del commit de la implementación

- **La CI de `c5c2287` falló en la guarda de superficie de log**: `list-data.ts` usaba `console.error`. La corrida local de las guardas era anterior a esa línea y no se repitió antes de pedir el commit. Se corrigió con `logEvent` en `d55b916`, y las 898 guardas se corrieron enteras antes de pedir el siguiente.
- **El ajuste del recorrido (`d2b2226`)**: el contenedor de la tabla, con `overflow-x-auto`, también desplaza en vertical, así que el menú «···» de una fila le agregaba una barra y, en la última fila, quedaba fuera de la vista. `MoreActions` ganó `floating`: la lista se ubica respecto de la ventana y abre hacia arriba si no entra abajo. Solo lo usa la lista de clientes. Caso 29 de `clients.spec.ts`. Las otras pantallas que usan el menú no cambian de forma; las cubre la CI.

### La revisión independiente (D-9)

Un agente que no participó del trabajo, con acceso de solo lectura, revisó el working tree contra el brief y las reglas. Veredicto **R1**: un bloqueante, siete no bloqueantes y seis observaciones, sin fugas a un `viewer`, sin `JOIN` entre módulos y con `listDebtors` igual en lo observable. Cada hallazgo se verificó contra el código antes de aceptarlo:

| Hallazgo | Qué decía | Resultado |
|---|---|---|
| H-1 (bloqueante) | `list-data.ts` y `list-cells.tsx` están fuera de los archivos autorizados | Verificado. Desvío 21, abajo, para el usuario |
| H-2 | Una vista vacía decía «Todavía no hay clientes» | Corregido (arriba) |
| H-3 | Mojibake en `client-list.test.ts` | Corregido (arriba) |
| H-4 | Las filas por página y los filtros en el teléfono se apartan de D-6 | Desvíos 9 y 10, para el usuario |
| H-5 | Ningún caso pasaba axe por el formulario y el aviso a 375 px | Corregido: caso 28 |
| H-6 | «No disponible» y «Con reparaciones» con `repairs` no tenían prueba | Corregido: `list-cells.test.ts` y caso 27 |
| H-7 | Faltaban el aislamiento de los turnos, los dos roles en tres lecturas y el cliente sin ventas | Corregido en `client-list.test.ts` y `client-accounts.test.ts` |
| H-8 | Faltaba la medición, y el Overview la daba por hecha | La medición, arriba |
| O-1 | «Reparación abierta» en la lista no es exactamente la de la ficha | Verificado. La lista usa los estados abiertos de cada tipo, como el filtro «En curso» de Reparaciones. La ficha cuenta lo no entregado ni cancelado de las 5 más recientes. Difieren solo en un reclamo o una unidad propia con estados que la ficha cuenta y la lista no. Queda declarado; unificarlo es de la 24.4.3 |
| O-2 | Una lectura de «En curso» rechazada se ve como «nada abierto» | Verificado. Con las autorizaciones de hoy, cada lectura solo se rechaza por un id inválido, que la página nunca pasa. Queda declarado |
| O-3 | El aviso podía perder el error del campo | Corregido (arriba) |
| O-4 | Dos textos de 02 y 08 no son literales | Diferencias 15 y 19 |
| O-5 | Un comentario de test contradecía el código | Corregido |
| O-6 | `.claude/settings.json` sin seguimiento | No entra en el commit |

La revisión señaló además que el HANDOFF, el CHANGELOG de la 24.4.1 y el brief de la 24.4.1 remiten a la 24.4.2 lo que ahora es de la 24.4.3. El HANDOFF se actualiza al cerrar. Los otros dos son registros históricos, escritos antes de la división.

### Desvío 21, de archivos

- `src/app/(autenticado)/clientes/list-data.ts`: la composición de la lista, que el §Alcance incluido (punto 2) permitía hacer en la página. Va aparte para que `scripts/medir-caminos.ts` mida exactamente ese camino (R-1).
- `src/app/(autenticado)/clientes/list-cells.tsx` y `list-cells.test.ts`: las celdas que comparten la tabla y las tarjetas, y su prueba.
- `tests/integration/client-list.test.ts`: la integración de las lecturas nuevas, que el §Alcance incluido (punto 6) pide. El brief no nombraba el archivo.

### Pruebas

- **Typecheck, lint y prettier**: sin errores.
- **Unitarias y guardas**: 2.098 de 2.098, antes de `list-cells.test.ts`. `forbidden-references.test.ts` cortó por tiempo en la corrida completa (39 s, con la máquina cargada) y pasó sola, 10 de 10, como en la 24.4.1. Después, los unitarios de `clientes/`: 51 de 51.
- **Integración**: `client-accounts.test.ts` y `client-list.test.ts`, 13 de 13, después de las correcciones de la revisión.
- **End-to-end**:
  - `clients`, `client-fields`, `client-tags` y `security-headers` corrieron completos: 33 de 45 la primera vez y 40 de 45 la segunda, con los localizadores corregidos.
  - Las cinco que quedaban pasaron repetidas. Eran una corrección de test (el error del código postal sale en el resumen y en el campo), la limpieza del caso 23 (`receipts` no admite `DELETE`) y tres cortes por tiempo o por la caída del servidor de prueba.
  - Después de las correcciones de la revisión, los casos 3, 23, 26, 27 y 28: 5 de 5.
- **En esta máquina**, con 387 MB libres, el servidor de prueba se cayó una vez y varias pruebas cortaron por tiempo en lugares distintos. Ninguna falla quedó sin repetir.

### Autoevaluación

Esta sección la escribió quien implementó, y es autoevaluación salvo la revisión independiente, que se cita. Lo que no está probado:
- O-1 y O-2, que quedan declarados;
- la suite end-to-end completa en esta máquina: solo los cuatro specs que tocan la lista y el formulario. La CI la corre entera.
