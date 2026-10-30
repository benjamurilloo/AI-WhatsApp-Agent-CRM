---
schema: task-brief.v1
task_id: "24.4.3"
task_type: implementation
generated_at: 2026-10-30
---

# Brief: 24.4.3 — Clientes: operaciones y actividad

**Estado: aprobado el 2026-10-30 por el usuario, con las recomendaciones de D-1 a D-8.**

## Objetivo

Que tres partes de la ficha del cliente queden **como los mockups de la v2** (`docs/ui-redesign/v2/04-clientes/`):
- la pestaña Operaciones, como una tabla unificada (04);
- la pestaña Actividad, como una cronología (panel 05 de 08);
- el Resumen, con «Próxima atención» arriba (03 y 07).

Cada diferencia que quede se declara en el §Cierre, como en la [24.4.2](brief-24.4.2-clientes-lista-y-formulario.md). Es la sexta subfase de la Fase 24, y salió de la división de la 24.4.2 que decidió el usuario el 2026-10-29. Resuelve además O-1 de esa subfase: qué es una reparación abierta.

## Situación

- **Operaciones hoy** ([page.tsx](../../src/app/(autenticado)/clientes/[clientId]/page.tsx)): cinco tarjetas en dos columnas (Pedidos, Reparaciones, Turnos, Usados y Equipos), cada una con su lectura y su botón de alta. No están las ventas: se ven en Cuenta corriente.
- **Actividad hoy:** la tarjeta «Conversaciones», con su filtro de estado y sus estadísticas, y la auditoría para un `admin`.
- **Resumen hoy** ([summary-tab.tsx](../../src/app/(autenticado)/clientes/[clientId]/summary-tab.tsx)): sin «Próxima atención». «Reparaciones abiertas» cuenta lo no entregado ni cancelado de las 5 más recientes.
- **La v2:**
  - **04:** «Operaciones de Lucía», «+ Nueva operación» desplegable, los chips «Todas 8», «Ventas 3», «Pedidos 1», «Reparaciones 1», «Turnos 2» y «Usados 1», la búsqueda «Buscar número, equipo o IMEI», los filtros Estado y Fecha, la tabla (Tipo, Referencia y detalle, Fecha, Estado, Importe, «Ver detalle»), «1 – 5 de 8 operaciones», la paginación y la franja «Los importes corresponden a cada operación».
  - **Panel 05 de 08:** la cronología con hora, ícono, qué pasó, origen y una línea entre comillas («Nota interna agregada · Carla Méndez», «Mensaje recibido · WhatsApp», «Reparación lista · REP-0248», «Cobro registrado · COB-0042»), y «Ver más actividad».
  - **03 y 07:** la tarjeta ámbar «Próxima atención», con «Ver reparación».
  - **El README de 04-clientes:**
    - no se suman importes de operaciones distintas;
    - el orden es por fecha descendente;
    - «Nueva operación» solo preselecciona al cliente y abre un formulario;
    - sin pendientes, un estado neutral, sin inventar una recomendación;
    - la cronología no es un historial exhaustivo, y los eventos solo aparecen si la fuente los da;
    - la auditoría va por separado.

## Hallazgos antes de diseñar

- **H-1. Las lecturas por cliente están cortadas.** Pedidos, reparaciones y usados leen las 5 más recientes (`CLIENT_*_LIMIT`), y turnos, 20. Una tabla paginada con cantidades reales necesita más. Las ventas solo se leen con `listSales`, con su página fija.
- **H-2. Una tabla entre cinco módulos no se pagina en SQL.** Un `UNION` entre tablas de módulos distintos rompe «otro módulo no hace `JOIN` directo contra tablas ajenas fuera de `analytics`» (Overview, línea 49). Se compone en memoria, como la lista de clientes de la 24.4.2, con un tope por tipo (D-2).
- **H-3. El texto de los mensajes no se muestra fuera del hilo.** El panel 05 y el mockup 03 citan el mensaje entre comillas. Screens prohíbe la vista previa del contenido (pantalla 8, subfase 1.3, D-2; pantalla 7: «sin el texto del mensaje»), y FR-CONV-01 quedó enmendado así en la 24.3.1. La cronología no cita mensajes ni notas (D-5).
- **H-4. Un mensaje por fila taparía todo lo demás.** Una charla de 40 mensajes llenaría dos páginas de la cronología. Hace falta decidir qué es un evento de conversación (D-5).
- **H-5. El historial de una reparación sí está en la orden.** `service_orders` guarda `sent_at`, `quoted_at`, `approved_at`, `rejected_at`, `repaired_at`, `delivered_at` y `cancelled_at`. Se puede decir «Reparación lista» sin leer la auditoría, que es solo para un `admin`. Solo queda la última vez de cada estado, no un historial completo. Los turnos guardan lo mismo (`confirmed_at`, `cancelled_at`, `attended_at`, `no_show_at`). Pedidos y ventas no se revisaron con este detalle: se comprueba al implementar.
- **H-6. Un turno no se vincula con una reparación ni tiene número.** 03 dice «Retiro de equipo · Hoy a las 17:00» junto a «REP-0248», y 04 usa «TUR-0186». La tabla `appointments` no tiene número ni referencia a una orden. Unir los dos por cercanía sería inventar una relación (D-6). En la tabla, el turno se identifica por su motivo y su hora.
- **H-7. Pedidos y ventas no traen el detalle de lo vendido.** `OrderSummary` y `SaleSummary` dan la cantidad de líneas, no los productos. 04 dice «Funda y cargador». Leerlos sería una lectura más por módulo. El detalle dice «2 productos» (D-1). Las reparaciones sí dan el modelo, y los usados, el producto.
- **H-8. El IMEI es un dato personal.** El IMEI del equipo de un cliente se vacía con sus datos (`device_serial`, D-11 de la 29.6) y no viene en `ServiceOrderSummary`. La búsqueda de 04 por IMEI pediría entregarlo al navegador o una lectura nueva en tres módulos. La búsqueda es por número y equipo (D-3).
- **H-9. El `viewer` no ve todo.** El valor de un usado llega en null para un `viewer`, y su importe se muestra como «—». Las notas, las ventas y los cobros sí los lee, por sus módulos.
- **H-10. Equipos no es una operación.** 04 no la dibuja, y el README dice que los equipos se encuentran por Ventas. Pero «Equipos» es de donde sale el reclamo de garantía (`warranty-claims.spec.ts`), y ese camino no tiene otra entrada desde la ficha. Se queda debajo de la tabla (D-1).
- **H-11. Las altas de hoy están en cada tarjeta.** Pedido, reparación, turno y usado aceptan `?cliente=`. El alta de venta (`/ventas/nueva`) no lo muestra en su página: se comprueba al implementar si recibe un cliente (D-4).
- **H-12. Sin JavaScript.** Los chips, los filtros y la paginación son enlaces o un formulario GET, como la lista. «Nueva operación» usa `MoreActions`, que sin JavaScript deja la lista a la vista.
- **H-13. El Resumen y la lista cuentan distinto** (O-1 de la 24.4.2). La lista usa los estados abiertos de cada tipo, y la ficha, «no entregada ni cancelada» de las 5 más recientes. `countOpenServiceOrdersByClient` ya existe, sin tope.

## Decisiones

### D-1 — La pestaña Operaciones

- **(a)** Una sola tarjeta como 04: título «Operaciones de {nombre}», chips, búsqueda, filtros, tabla, «1 – 25 de N operaciones», `Pagination` y la franja de hoy. Reemplaza las cuatro tarjetas de pedidos, reparaciones, turnos y usados.
  - **Columnas:** Tipo con ícono, Referencia y detalle, Fecha, Estado con la insignia de cada módulo, Importe y «Ver detalle», un enlace a su ficha de origen. Sin total: no se suman importes.
  - **Referencia y detalle:** el número y el modelo o producto. Pedido y venta: «2 productos» (H-7). Turno: su motivo y hora, sin número (H-6).
  - **Importe:** el de la operación, con su moneda. Un turno, o un valor que el rol no recibe, dice «—». Una reparación sin presupuesto también.
  - **Una venta anulada** dice «Anulada». Un usado anulado, lo mismo.
  - **Cada tipo con su capacidad:** sin `repairs` no hay chip ni filas de reparaciones.
  - **«Equipos»** queda debajo, como tarjeta aparte, con `serialized_units` (H-10).
  - **En el teléfono**, tarjetas en lugar de la tabla, como la lista. Recomendada.
- (b) Mantener las tarjetas de hoy y sumar solo las ventas. No cumple 04.

### D-2 — Las lecturas y el tope

- **(a)** Una lectura por módulo, con un tope de **200 por tipo**, las más recientes: `listClientOperations…` en `orders`, `sales`, `service`, `tradeins` y `appointments`, cada una con su rol y su capacidad. La página las compone en memoria en `clientes/[clientId]/operations-data.ts`, con funciones puras para unir, filtrar y paginar.
  - Los chips dicen la cantidad real de cada tipo, aunque pase de 200.
  - Si un tipo pasa del tope, la tabla lo dice: «Se muestran las 200 más recientes de cada tipo», con un enlace a la lista de ese módulo filtrada por cliente, donde exista.
  - Si un módulo falla, la tabla muestra el resto y avisa cuál no se pudo leer, sin ponerlo en cero. Recomendada.
- (b) Sin tope: un cliente con miles de operaciones leería todo en cada carga.

### D-3 — Búsqueda y filtros

- **(a)** Por la URL, combinables: `?tipo=`, `?buscar=`, `?estado=`, `?fecha=` y `?pagina=`.
  - **Búsqueda:** «Buscar número o equipo», sobre las filas ya leídas. Sin IMEI (H-8).
  - **Estado:** «Todos», «En curso» y «Cerradas». Cada módulo tiene sus estados, y un selector con todos mezclaría veinte valores. «En curso» es la definición de la 24.4.2 (H-4 de ese brief), con D-7 para reparaciones. Con un chip de tipo elegido sigue igual.
  - **Fecha:** «Todas», «Últimos 30 días» y «Últimos 90 días».
  - **Orden:** por fecha descendente, sin selector. La fecha de un turno es la del turno, así que uno futuro va arriba. La de lo demás, su creación.
  - **Los chips** cuentan sobre los otros filtros, como las vistas de la lista. Recomendada.
- (b) Un selector de estado por tipo, solo con un chip elegido. Más exacto, más código y más texto.

### D-4 — «Nueva operación»

- **(a)** `MoreActions` con el nombre «Nueva operación», solo para un `admin` y con el cliente activo: Pedido, Reparación, Turno y Usado, cada uno con su capacidad y `?cliente=`. **Venta** entra solo si `/ventas/nueva` puede recibir el cliente con un cambio chico; si no, queda afuera y se declara. Abre el formulario, no registra nada. Recomendada.
- (b) Sin el botón, con las altas fuera de la ficha. Se perdería lo que ya hay hoy.

### D-5 — La cronología de Actividad

- **(a)** Una tarjeta «Actividad» arriba de la pestaña, con los últimos 20 eventos, de más nuevo a más viejo, y «Ver más actividad», un enlace que suma 20 (`?eventos=40`), hasta 200. **Sin citar el texto** de mensajes ni notas (H-3).
  - **Conversaciones:** un evento por conversación, en su último mensaje: «Última interacción · WhatsApp», con su enlace (H-4).
  - **Notas:** «Nota interna agregada · {autor}», con enlace a su conversación. Una lectura nueva en `conversations`, sin el cuerpo de la nota.
  - **Reparaciones y turnos:** su alta y cada estado con fecha (H-5), como «Reparación lista · {número}».
  - **Pedidos, ventas y usados:** su alta y su anulación o cancelación.
  - **Cobros y devoluciones:** desde `documents` de `getClientStatement`, con importe y moneda: «Cobro registrado · {número}», y su anulación. Sin el medio de pago, que ese documento no trae: desvío respecto del panel.
  - **Cada evento** enlaza a su registro. Un módulo que falla se dice, sin ocultarlo en silencio.
  - **Debajo siguen** la tarjeta «Conversaciones» con su filtro y la auditoría de un `admin`, como pide el README: «Historial por separado». Recomendada.
- (b) Un evento por mensaje, como el panel, con «Mensaje recibido · WhatsApp». Se parece más al mockup, pero las charlas tapan el resto (H-4), y una página con mensajes y notas lee hasta 102 filas por conversación.
- (c) Citar mensajes y notas, como el panel. Cambia FR-CONV-01 y la regla de Screens; es otra decisión, con su enmienda.

### D-6 — «Próxima atención»

- **(a)** La primera tarjeta del Resumen, ámbar como 03, a todo el ancho. Muestra una cosa, en este orden:
  1. el próximo turno pedido o confirmado desde hoy (`pickNextAppointment`), con día, hora y motivo, y «Ver turno»;
  2. si no hay turno, la reparación abierta lista para retirar (`repaired`), la más vieja primero, con número, modelo y estado, y «Ver reparación»;
  3. si no hay ninguna, un estado neutral: «Sin atenciones pendientes.», sin ámbar.

  Si hay más de una, «Ver todas», a Operaciones con «En curso». No une un turno con una reparación (H-6): el texto compuesto de 03 no se reproduce. Recomendada.
- (b) La reparación primero. Una reparación lista espera al cliente, mientras que un turno tiene fecha; el README ordena «por vencimiento o fecha».

### D-7 — Qué es una reparación abierta (O-1)

- **(a)** Una sola definición, la de la lista: `openClientOrdersQuery`, con los estados abiertos de cada tipo. «Reparaciones abiertas» del Resumen pasa a `countOpenServiceOrdersByClient`, sin «de las 5 más recientes», y «En curso» del Resumen elige con ese mismo criterio. Una unidad propia no entra: no es de un cliente. Recomendada.
- (b) Dejarlo declarado, como en la 24.4.2.

### D-8 — Revisión y despliegue

- **(a)** Revisión independiente antes de desplegar y despliegue al cerrar, como la 24.4.2. Recomendada.

## Alcance incluido

1. **Las lecturas nuevas**, cada una en su módulo y por su `index.ts`, sin `JOIN` entre módulos: las cinco de D-2, la cantidad por tipo y las notas sin cuerpo de D-5. `service` y `appointments` entregan además las fechas de sus estados.
2. **La composición:** `operations-data.ts` y `activity-data.ts`, con funciones puras y sus tests.
3. **La pestaña Operaciones** (D-1, D-3 y D-4), en escritorio y en el teléfono.
4. **La pestaña Actividad** (D-5).
5. **El Resumen** (D-6 y D-7).
6. **La documentación:** `Screens.md`, pantalla 7, con una nota fechada, y `Overview.md`, con la composición y su medición.
7. **Los tests:**
   - de integración, uno por lectura nueva: resultado, tope, aislamiento por organización, rol y capacidad;
   - unitarios de unir, filtrar, paginar, de los eventos y de «Próxima atención»;
   - end-to-end de los chips y filtros sin JavaScript, de la cronología, de «Próxima atención» en sus tres casos y de «Nueva operación», para los dos roles;
   - el `viewer`, sin el valor de un usado ni el texto de mensajes o notas en lo que llega a su navegador;
   - axe en claro y en oscuro, a 1280 y 375 px, con «Nueva operación» abierto.
8. **La comparación visual (AC-9):** capturas de las tres partes a 1440 y 375 px, con datos de alto desigual (un cliente con todos los tipos, otro sin nada y otro con dos monedas), lado a lado con 03, 04, 07 y el panel 05 de 08, con la tabla de diferencias en el §Cierre.

## Archivos autorizados

- `src/app/(autenticado)/clientes/[clientId]/**`.
- `src/modules/orders`, `sales`, `service`, `tradeins`, `appointments`, `conversations` y `cash`: solo las lecturas de D-2, D-5 y D-7, sus tipos, sus exports en `index.ts` y sus tests de integración.
- `src/app/(autenticado)/ventas/nueva/**`, solo si D-4 lo permite con un cambio chico.
- `src/app/_components/`, solo con una opción nueva que no cambie el comportamiento por defecto.
- `src/app/(autenticado)/conversaciones/[conversationId]/client-context-pick.ts`, solo si D-7 cambia a quién elige.
- `tests/e2e/`, los specs que entran a la pestaña Operaciones o a la Actividad: `clients`, `orders`, `appointments`, `trade-ins`, `warranty`, `warranty-claims`, `client-fields` y los que aparezcan al buscar (R-2).
- `scripts/medir-caminos.ts`, para los caminos nuevos (R-1).
- `docs/product/Screens.md` (pantalla 7), `docs/architecture/Overview.md` (la composición) y este brief.
- **Sin migraciones, tablas ni contratos.**

## Alcance excluido

- El texto de mensajes y notas en la cronología o en el Resumen (H-3).
- La búsqueda por IMEI (H-8).
- El detalle de productos de pedidos y ventas (H-7).
- El número de turno y su vínculo con una reparación (H-6): piden una migración.
- El medio de pago en la cronología.
- El panel de cobro y el período de la Cuenta corriente (24.7.2).
- Las escrituras: ninguna operación nueva, ningún cambio de estado desde estas pestañas.

## Invariantes

- Ningún importe de operaciones distintas se suma, ni en una moneda ni en dos.
- Un dato que no se pudo leer nunca se muestra como cero o como vacío: se dice.
- Un `viewer` no recibe el valor de un usado, el teléfono completo, el email, la calle ni el código postal.
- Ni un mensaje ni una nota llegan con su texto a estas pestañas.
- Cada lectura de un módulo con capacidad se hace solo con ella.
- Ninguna lectura cruza la organización del contexto.
- Ningún `JOIN` entre tablas de dos módulos.
- Las tres partes funcionan sin JavaScript.
- La accesibilidad verificada con axe no retrocede.

## Criterios de aceptación

- **AC-1**: la tabla, como D-1: las cinco fuentes en un solo orden, sus columnas, sin total, con «Ver detalle» a la ficha de origen y tarjetas en el teléfono. «Equipos» sigue debajo, con su reclamo de garantía.
- **AC-2**: el tope y las fallas, como D-2: las cantidades reales, el aviso con más de 200 y el módulo que falla dicho, sin ceros.
- **AC-3**: los chips, la búsqueda, el estado y la fecha, como D-3, por la URL, combinables y sin JavaScript.
- **AC-4**: «Nueva operación», como D-4: solo un `admin` con el cliente activo, cada opción con su capacidad y el cliente preseleccionado.
- **AC-5**: la cronología, como D-5, con sus fuentes, «Ver más actividad» y un enlace por evento. La tarjeta «Conversaciones» y la auditoría de un `admin` siguen debajo.
- **AC-6**: «Próxima atención», como D-6, en sus tres casos, y «Ver todas» con más de una.
- **AC-7**: la reparación abierta, como D-7: el Resumen y la lista dan la misma cantidad para un cliente con los tres tipos de orden y con más de 5 órdenes.
- **AC-8**: un `viewer` recorre las tres partes sin acciones de `admin`, sin el valor de un usado y sin texto de mensajes o notas. Se comprueba sobre lo que llega a su navegador.
- **AC-9**: la comparación visual con 03, 04, 07 y el panel 05 de 08 está en el §Cierre, con datos de alto desigual. Cada diferencia cita la regla que la excluye o queda como desvío para el usuario.
- **AC-10**: R-1 medido y en el §Cierre.
- **AC-11**: axe sin violaciones en las tres partes, en claro y en oscuro, a 1280 y 375 px. Nada se sale del ancho a 375 px.
- **AC-12**: la CI pasa completa en el SHA que se despliega.
- **AC-13**: desplegado y recorrido por el usuario, con la revisión independiente antes (D-8).

## Condiciones de detención

- Si una lectura necesita un `JOIN` entre módulos, una migración o un índice nuevo: se detiene y se consulta.
- Si R-1 supera su umbral: se informa con los números antes de seguir.
- Si la cantidad de reparaciones abiertas del Resumen y la de la lista difieren para algún cliente del test: se detiene.
- Si un estado con fecha de H-5 no se puede leer sin exponer un dato personal: ese evento no entra, y se informa.
- Si axe reporta una violación que no se resuelve sin apartarse de la v2: gana la accesibilidad, y se informa.
- Antes de cada commit, del push, del despliegue y de cada cambio en Notion: cada uno se autoriza en su turno. **Antes de pedir un commit, la batería entera se corre después de la última línea de código** (lo que falló en `c5c2287`).

## Riesgos

- **R-1: el costo de las pestañas.** Operaciones lee hasta 1.000 filas y Actividad suma el estado de cuenta.
  - **Cómo se mide:** con `scripts/medir-caminos.ts`, sobre un cliente con pocas operaciones (10 por tipo) y sobre uno en el tope (más de 200 por tipo).
  - **El umbral**, fijado antes de medir: 400 ms de camino completo, el de la 21.6, para cada pestaña con el cliente en el tope. Si se supera, se informa (condición de detención).
- **R-2: los localizadores de los end-to-end.** Las tarjetas «Pedidos», «Reparaciones», «Turnos» y «Usados» desaparecen, y seis specs entran por ahí. Se buscan todos antes de correr la suite. La región de `TABS` en `clients.spec.ts` cambia.
- **R-3: se pierden caminos de las tarjetas.** Enlaces como «Ver los N pedidos» o «Ver en la lista de pedidos» dejan de estar. Se revisan una por una, y cada una se lleva a la tabla o se declara.
- **R-4: la CI cerca de su límite.** Las corridas de la 24.4.2 tardaron 31 y 32 de 45 minutos. Si una se acerca a 45, se informa.

## Situación en la fase

- **Necesario ahora:** las tres partes con la forma de la v2 y la reparación abierta unificada.
- **Antes de producción:** nada nuevo; las pestañas de hoy ya están desplegadas.
- **Después:** el panel de cobro y el período (24.7.2). El número de turno, si algún día se quiere, sería otra subfase con migración.
