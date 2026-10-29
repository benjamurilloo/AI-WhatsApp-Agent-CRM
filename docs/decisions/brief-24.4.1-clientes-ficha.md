---
schema: task-brief.v1
task_id: "24.4.1"
task_type: implementation
generated_at: 2026-10-29
---

# Brief: 24.4.1 — Clientes: ficha

**Estado: aprobado el 2026-10-29 por el usuario, con las recomendaciones de D-1 a D-8.**

## Objetivo

Que la ficha del cliente (`/clientes/{id}`, pantalla 7) quede **como los mockups de la v2** (`docs/ui-redesign/v2/04-clientes/`: 03, 04, 05, 07 y el panel 05 de 08), con cuatro pestañas (Resumen, Operaciones, Cuenta corriente y Actividad), **con las lecturas que ya existen**. Cada diferencia que quede se declara en el §Cierre, como en la [24.3.1](brief-24.3.1-conversaciones-como-chat.md).

Es la cuarta subfase de la Fase 24 (Roadmap, §Fase 24, fila 24.4.1). La [24.4.2](../planning/Roadmap.md) trae lo que pide lecturas nuevas: las operaciones y la actividad unificadas, «Próxima atención», el saldo en la lista y el aviso de duplicado.

## Situación

- **Hoy** (`clientes/[clientId]/page.tsx`): una sola página larga.
  - **Encabezado:** volver, avatar, nombre, «Activo» o «Inactivo», «Última interacción», y para un `admin` «Editar» y «Desactivar» como botones sueltos.
  - **A la izquierda:** «Información principal» (nombre, teléfono, última interacción, notas) y cuatro tarjetas (Contacto, Empresa, Dirección, Clasificación).
  - **A la derecha:** Estadísticas, Etiquetas, Cuenta corriente, Pedidos, Equipos (con `serialized_units`), Órdenes de servicio (`repairs`), Turnos (`appointments`) y Usados (`trade_ins`).
  - **Debajo de todo:** la tabla de conversaciones con su filtro y, para un `admin`, la auditoría.
  - **El estado de cuenta** es otra página, `/clientes/{id}/cuenta`, y cobrar a cuenta otra más, `/cobrar`.
- **La v2**, en escritorio:
  - **03, Resumen:** el encabezado con avatar, nombre, etiquetas como insignias, «Cliente desde 12 sep 2026», «Abrir conversación» como acción principal, «Editar» y «···». Debajo, las pestañas subrayadas. Después vienen «Próxima atención» en ámbar, «Datos de contacto» con copiar, «Etiquetas» con «Editar etiquetas», tres indicadores («Ventas registradas», «Reparaciones abiertas» y «Saldo pendiente» con «Consultar cuenta corriente»), «En curso» (la reparación y el turno, con sus botones) y «Última interacción» con el texto del mensaje.
  - **04, Operaciones:** una tabla unificada con chips por tipo, búsqueda, filtros, importe y «Nueva operación».
  - **05, Cuenta corriente:** selector ARS o USD, período, «Saldo inicial del período», tres indicadores, una tabla de movimientos con saldo corrido y el panel lateral «Registrar cobro».
  - **08, panel 05, Actividad:** una cronología con autor, hora, origen y enlace.
- **En el teléfono (07):** «← Clientes» y «··· Más» arriba, «Abrir conversación» y «Editar cliente» a todo el ancho, las cuatro pestañas, y tarjetas («Próxima atención», «Saldo pendiente», «En curso», «Datos de contacto» con «Más datos» y «Próximo turno»).

## Hallazgos antes de diseñar

- **H-1. La última interacción no lleva contenido.** Screens.md, pantalla 7: «última interacción (fecha y canal, sin contenido)». El mockup 03 cita el texto del último mensaje. Queda la fecha y el canal, con «Ver conversación».
- **H-2. El estado de cuenta no tiene saldo corrido.** El brief-21.6 lo excluye (§Alcance excluido y D-4) porque una seña retenida cuenta cuando su pedido se vende o se cancela, y el ADR 0022 descarta la tabla de movimientos con saldo corrido (§Alternativas). El mockup 05 dibuja un «Saldo inicial del período» y una columna «Saldo ARS». Ninguna de las dos entra; la pestaña muestra el estado de cuenta que existe (D-4).
- **H-3. Lo que necesita lecturas nuevas es de la 24.4.2** (Roadmap, fila 24.4.2): la tabla unificada de 04, la cronología de 08, «Próxima atención», y los chips con cantidades por tipo. Esta subfase arma las pestañas con lo que ya se lee.
- **H-4. «Registrar cobro» en un panel lateral es de la 24.7.2** (Roadmap: «"Registrar cobro" con elección de destino» y «Estado de cuenta compartido con la ficha»). El Roadmap dice que la 24.7.2 «va antes de la pestaña de cuenta de la ficha (24.4.1), o comparte su componente». Como la 24.4.1 va primero en la tabla, se toma la segunda opción: esta subfase saca el estado de cuenta a un componente compartido, y la 24.7.2 lo reusa (D-4).
- **H-5. «Ventas registradas» no tiene una lectura propia.** No hay un conteo de ventas por cliente. `getClientStatement` (cash) ya trae las ventas vigentes de cada moneda, así que se puede contar de ahí sin una lectura nueva (D-3).
- **H-6. «Cliente desde»** es `clients.created_at`, que `getClient` ya entrega.
- **H-7. El viewer.** Hoy ve la ficha, la cuenta y el estado de cuenta (cash autoriza a los dos roles), con el teléfono enmascarado y sin email, calle ni código postal (brief-17.1, D-8). No ve la auditoría (FR-AUD-02) ni ningún botón. Eso no cambia.
- **H-8. Las capacidades.** DNI e Instagram con `trade_ins` (brief-29.7, D-6); los equipos y su garantía con `serialized_units` (brief-29.9, D-3); reparaciones con `repairs`; turnos con `appointments`. Cada bloque aparece solo con su capacidad, como hoy.

## Decisiones

### D-1 — Cómo se cambia de pestaña

- **(a)** Cada pestaña es un enlace (`?pestana=operaciones`, `cuenta`, `actividad`; sin parámetro, Resumen), con `aria-current` y la `SubNav` con `scroll` de la 24.3.1. El servidor lee solo lo que muestra la pestaña elegida. Funciona sin JavaScript. Recomendada.
- (b) Pestañas en el cliente (`role="tablist"`), con todo leído de entrada.

### D-2 — El encabezado

- **(a)** Como 03: avatar, nombre, las etiquetas como insignias y «Inactivo» si lo está, «Cliente desde {fecha}». Las acciones:
  - **«Abrir conversación»** es la principal, para los dos roles, y lleva a la conversación más reciente, que desde la 24.3.1 une todo el hilo del cliente. Sin conversaciones no aparece.
  - **«Editar»** solo para un `admin`.
  - **«···»** («Más acciones del cliente») con «Desactivar» o «Reactivar», solo para un `admin`, con la confirmación de hoy.

  En el teléfono, como 07: «← Clientes» y «···» arriba, y «Abrir conversación» y «Editar cliente» a todo el ancho. Recomendada.
- (b) Mantener «Editar» y «Desactivar» como botones sueltos.

### D-3 — El Resumen

- **(a)** Como 03, sin lo que pide la 24.4.2:
  - **«Datos de contacto»:** teléfono y email con copiar, y en el teléfono «Más datos», que muestra documento, Instagram, empresa, dirección y segmento. En escritorio, esos datos van en la misma tarjeta. DNI e Instagram, con `trade_ins`. A un viewer, lo que el servidor no le entrega dice «Solo visible para administradores.».
  - **«Etiquetas»:** los chips y, para un `admin`, el agregar y quitar de hoy (16.1).
  - **Los indicadores:**
    - **«Ventas registradas»:** las ventas vigentes, contadas de `getClientStatement` (H-5).
    - **«Reparaciones abiertas»:** con `repairs`.
    - **«Saldo pendiente»:** por moneda, sin sumar monedas, con «Consultar cuenta corriente» que lleva a la pestaña. Cuando el cliente tiene saldo a favor, en lugar de «Pendiente» dice «A favor», como hoy.
  - **«En curso»:** la reparación abierta más reciente y el próximo turno, con `pickOpenServiceOrder` y `pickNextAppointment` de la 24.3. Sin ninguno, dice «Nada en curso».
  - **«Última interacción»:** la fecha, el canal y «Ver conversación», sin el texto del mensaje (H-1).
  - **Las notas:** debajo de «Datos de contacto».

  «Próxima atención» no entra: es de la 24.4.2, que la define con su orden. Recomendada.
- (b) Sin «Ventas registradas» hasta la 24.4.2.

### D-4 — La pestaña Cuenta corriente

- **(a)** El estado de cuenta de hoy dentro de la pestaña, como un componente compartido entre la pestaña y `/clientes/{id}/cuenta`, que sigue existiendo para imprimir:
  - el selector de moneda como 05 cuando hay más de una;
  - los indicadores «Saldo pendiente» (o «A favor»), «Debe» y «Haber», por moneda;
  - la imputación de cada venta vigente y los comprobantes, sin saldo corrido (H-2);
  - para un `admin`, «Registrar cobro», que lleva a `/cobrar` como hoy, y «Devolver saldo a favor» si hay.

  El panel lateral de 05 y el período quedan para la 24.7.2, que reusa el componente (H-4). Recomendada.
- (b) La pestaña con el resumen de hoy y un enlace al estado de cuenta.

### D-5 — La pestaña Operaciones

- **(a)** Las tarjetas que hoy están apiladas a la derecha, cada una con su capacidad: Pedidos, Órdenes de servicio, Turnos, Usados y Equipos con su garantía. Cada una tiene la forma de las tarjetas de la v2 (ícono, título, cantidad), conserva sus acciones de hoy para un `admin` y tiene un enlace a cada ficha. Debajo va la nota de 04: «Los importes corresponden a cada operación. Consultá pagos y saldos en Cuenta corriente.». La tabla unificada, los chips y «Nueva operación» quedan para la 24.4.2 (H-3). Recomendada.
- (b) Adelantar la tabla unificada. Pide una composición entre módulos, que es la lectura nueva de la 24.4.2.

### D-6 — La pestaña Actividad

- **(a)** Las conversaciones del cliente, con su filtro y su paginación de hoy y la tabla compartida de la pantalla 8. Para un `admin`, la auditoría debajo, como hoy. La cronología de 08 queda para la 24.4.2 (H-3). Recomendada.
- (b) Las conversaciones en el Resumen y la auditoría sola en Actividad.

### D-7 — El formulario de edición

- (a) Llevarlo a 02 en esta subfase.
- **(b)** Dejarlo como está, con `?editar=1`, fuera de las pestañas. Se lleva a 02 con el aviso de duplicado de la 24.4.2, que toca el mismo formulario. Recomendada.

### D-8 — Revisión y despliegue

- **(a)** Revisión independiente antes de desplegar y despliegue al cerrar, como la 24.3.1. Recomendada.

## Alcance incluido

1. **La ficha** (`clientes/[clientId]/page.tsx` y sus componentes), con D-1 a D-6:
   - el encabezado;
   - las pestañas;
   - el Resumen;
   - la pestaña Cuenta corriente con el componente compartido del estado de cuenta;
   - Operaciones;
   - Actividad;
   - la forma en el teléfono (07).
2. **`/clientes/{id}/cuenta`**, que pasa a usar el mismo componente que la pestaña, imprimible como hoy.
3. **Los enlaces dentro de la ficha:** el filtro y la paginación de las conversaciones y la paginación de la auditoría quedan en la pestaña Actividad (R-1).
4. **`Screens.md`**, pantalla 7, con una nota fechada.
5. **Los tests:**
   - los end-to-end de `clients.spec.ts` y de los specs que llegan a la ficha, con las pestañas;
   - un caso por pestaña para los dos roles;
   - el viewer, sin el teléfono completo, el email, la calle, el código postal, la auditoría ni ningún botón;
   - cada bloque solo con su capacidad;
   - axe en claro y en oscuro, a 1280 y 375 px, en las cuatro pestañas.
6. **La comparación visual (AC-9):** capturas de las cuatro pestañas y del teléfono, lado a lado con 03, 04, 05, 07 y el panel 05 de 08, con la tabla de diferencias en el §Cierre.

## Archivos autorizados

- `src/app/(autenticado)/clientes/[clientId]/**`, incluidos `cuenta/` y `cobrar/` solo para los enlaces.
- `src/app/(autenticado)/clientes/messages.ts` y `filters.ts`.
- `src/app/(autenticado)/conversaciones/filters.ts` y `filters.test.ts`, solo `clientSectionsHref` y lo que use la ficha, y `[conversationId]/client-context-pick.ts`, si `pickOpenServiceOrder` o `pickNextAppointment` se mueven a un lugar compartido.
- `src/app/_components/`, solo con una opción nueva que no cambie el comportamiento por defecto (la adenda del 2026-10-29 en el vault, de la 24.3.1).
- `tests/e2e/clients.spec.ts` y los specs que llegan a la ficha, y `tests/guards/exposed-surface.test.ts` si cambian las Server Actions.
- `docs/product/Screens.md` (pantalla 7) y este brief.
- **Sin cambios** en `src/modules/` ni migraciones.

## Alcance excluido

- La tabla unificada de operaciones, la cronología de actividad, «Próxima atención», los chips con cantidades y «Nueva operación»: son de la 24.4.2 (H-3).
- El panel lateral «Registrar cobro», el período y la revisión del cobro: son de la 24.7.2 (H-4).
- El saldo inicial y el saldo corrido del estado de cuenta (H-2).
- El texto del último mensaje en la ficha (H-1).
- El formulario de alta y edición en la forma de 02, con D-7 (b).
- La lista de clientes (01 y 06): es de la 24.4.2.

## Invariantes

- Un `viewer` no recibe el teléfono completo, el email, la calle, el código postal ni la auditoría, y no ve ningún botón ni formulario.
- Cada bloque de un módulo con capacidad aparece solo con ella, y no se lee sin ella.
- Ningún importe en dos monedas se suma.
- La ficha funciona sin JavaScript: las pestañas son enlaces y las acciones, formularios.
- Ninguna lectura nueva en `src/modules/`. Si una pieza la necesita, se detiene.
- La accesibilidad verificada con axe no retrocede.

## Criterios de aceptación

- **AC-1**: las cuatro pestañas se eligen por la URL, con `aria-current`, para los dos roles. Cada una lee solo lo que muestra, y funciona sin JavaScript.
- **AC-2**: el encabezado, como D-2. «Abrir conversación» lleva a la conversación más reciente y no aparece sin conversaciones. «Editar» y «···» son solo para un `admin`, y desactivar pide la confirmación de hoy.
- **AC-3**: el Resumen, como D-3: los datos de contacto, las etiquetas, los tres indicadores (cada uno con su capacidad, y el saldo sin sumar monedas), «En curso» y «Última interacción» sin el texto del mensaje.
- **AC-4**: la Cuenta corriente, como D-4: el mismo componente en la pestaña y en `/cuenta`, por moneda, sin saldo corrido, con «Registrar cobro» y «Devolver saldo a favor» para un `admin`.
- **AC-5**: Operaciones y Actividad, como D-5 y D-6: las tarjetas de cada módulo con su capacidad, las conversaciones con su filtro y su paginación, y la auditoría para un `admin`.
- **AC-6**: un `viewer` ve las cuatro pestañas sin botones ni formularios. No recibe el teléfono completo, el email, la calle, el código postal ni la auditoría. Se comprueba sobre lo que llega a su navegador, con un cliente que sí tenga esos datos.
- **AC-7**: el filtro y la paginación de las conversaciones y la paginación de la auditoría quedan en la pestaña Actividad.
- **AC-8**: axe sin violaciones en las cuatro pestañas y en la confirmación de desactivar, en claro y en oscuro, a 1280 y 375 px. Nada se sale del ancho a 375 px.
- **AC-9**: la comparación visual con 03, 04, 05, 07 y el panel 05 de 08 está en el §Cierre. Cada diferencia cita la regla que la excluye o queda como desvío para el usuario.
- **AC-10**: la CI pasa completa en el SHA que se despliega.
- **AC-11**: desplegado y recorrido por el usuario, con la revisión independiente antes (D-8).

## Condiciones de detención

- Si una pieza necesita una lectura nueva en `src/modules/`, una migración o un contrato: se detiene y se consulta.
- Si el componente compartido del estado de cuenta cambia lo que imprime `/cuenta`: se informa antes de seguir.
- Si axe reporta una violación que no se resuelve sin apartarse de la v2: gana la accesibilidad, y se informa.
- Antes de cada commit, del push, del despliegue y de cada cambio en Notion: cada uno se autoriza en su turno.

## Riesgos

- **R-1: los enlaces viejos.** `clientSectionsHref` (`conversaciones/filters.ts`) arma el filtro y la paginación de las conversaciones y de la auditoría de la ficha. Con las pestañas, tiene que conservar `?pestana=actividad`. Sus usos se buscan en `src/` y en los specs antes de cambiarla.
- **R-2: los localizadores de los end-to-end.** «Editar», «Desactivar» (que pasa a «···») y los títulos de tarjeta («Cuenta corriente» es también el nombre de una pestaña) pueden capturar localizadores por subcadena, como en la 24.2. Se buscan en todos los specs antes de correr la suite.
- **R-3: el Resumen lee de varios módulos.** Son las lecturas de hoy, pero en otra pestaña. Se mide la carga del Resumen contra la ficha de hoy, en local, con un cliente con 50 ventas, 10 órdenes y 10 turnos, en 20 corridas. Si tarda más del doble, se informa.

## Situación en la fase

- **Necesario ahora:** las pestañas, el encabezado, el Resumen y la forma de 03, 05 y 07 con lo que existe.
- **Antes de producción:** nada nuevo; la ficha de hoy ya está desplegada.
- **Después:** la tabla de operaciones, la actividad unificada, «Próxima atención», el formulario y la lista (24.4.2); el panel de cobro y el período (24.7.2).

## Cierre

*Del 2026-10-29, antes del commit de la implementación. AC-10 y AC-11 se completan después de la CI, del despliegue y del recorrido del usuario.*

### Criterios

| Criterio | Estado | Evidencia |
|---|---|---|
| AC-1 | cumple | `tabs.ts` y `tabs.test.ts`: `?pestana=` con Resumen por defecto y un valor desconocido que vuelve a Resumen. `page.tsx`: las etiquetas activas solo en Resumen, la auditoría solo en Actividad, y la edición sin la actividad. Caso 19: las cuatro pestañas por la URL con `aria-current`. Caso 21, sin JavaScript: las pestañas son enlaces, y «Abrir conversación» y la fila de la conversación llegan en el HTML. Ese caso encontró un defecto: con `Suspense`, sin JavaScript quedaba el esqueleto; se sacó (abajo, «Defectos») |
| AC-2 | cumple | Encabezado con avatar, etiquetas, «Inactivo» solo si lo está, «Cliente desde 29 oct 2026», «Abrir conversación» a la más reciente y oculto sin conversaciones (casos 14, 15 y 19). «Editar» y «···» solo para `admin` (caso 20). «···» lleva «Desactivar» con la confirmación de hoy (caso 7) o, con el cliente inactivo, «Reactivar» (N-1 de la revisión, abajo) |
| AC-3 | cumple | `summary-tab.tsx`: «Datos de contacto» con copiar solo con el teléfono completo, «Más datos», etiquetas; «Ventas registradas» (las vigentes de cada moneda), «Reparaciones abiertas» con `repairs`, «Saldo pendiente» por moneda sin sumar; «En curso» con `pickOpenServiceOrder` y `pickNextAppointment`; «Última interacción» con canal y hora, sin el texto (H-1). Casos 1, 14, 19 y `client-fields.spec.ts` |
| AC-4 | cumple | `account-statement.tsx` (`StatementBody`) lo usan la pestaña y `/cuenta`. La salida de `/cuenta` no cambió: el cuerpo es el mismo JSX que antes, comparado línea por línea (N-5 de la revisión). Sin saldo corrido (H-2). «Registrar cobro» y «Devolver saldo a favor» solo para `admin`: `accounts.spec.ts` y `exchange.spec.ts` |
| AC-5 | cumple, con un desvío | Operaciones: las tarjetas de cada módulo con su capacidad y la nota de 04. Actividad: las conversaciones con su filtro y su paginación, y la auditoría para `admin` (casos 5, 14, 16; `client-tags.spec.ts`). Las tarjetas no llevan la cantidad que pedía D-5 (desvío 9) |
| AC-6 | cumple | Caso 20: un `viewer` recorre las cuatro pestañas, sin «Editar», «···», «Registrar cobro», copiar ni formularios salvo el filtro GET de Actividad. Lo que llega a su navegador y la respuesta cruda del servidor no contienen el teléfono, el email, la calle, el código postal, «Historial de auditoría» ni «Auditoría de», con un cliente que tiene todos esos datos |
| AC-7 | cumple | `clientSectionsHref` siempre con `pestana=actividad` (`filters.test.ts`); el filtro lleva el campo oculto. Casos 5, 14 y 16 |
| AC-8 | cumple | Axe en claro y en oscuro en las cuatro pestañas (caso 19, 1280 px) y a 375 px con la confirmación de desactivar (caso 22), sin desplazamiento horizontal |
| AC-9 | cumple; los desvíos los decide el usuario | La comparación, abajo |
| AC-10 | pendiente | Se completa con la CI del SHA que se despliegue |
| AC-11 | pendiente | La revisión independiente se hizo antes del despliegue (abajo). Faltan el despliegue y el recorrido |

### La medición de R-3

- **Método:** en local, con PostgreSQL de desarrollo, un test temporal de integración, borrado después. Un cliente con 50 ventas, 10 pedidos, 10 órdenes de servicio y 10 turnos. Las lecturas de la ficha de `e065cb1` (todas las secciones, la auditoría con sus autores y las garantías de las unidades) contra las del Resumen, alternadas, después de una corrida de calentamiento.
- **Corridas:** 20 por variante.
- **Resultado:** el Resumen, 59,7 ms de mediana (p90 65,4); la ficha anterior, 72,3 ms (p90 79,3). **0,83 veces**: por debajo del umbral. Las lecturas del Resumen son un subconjunto de las de antes.
- **Límite:** mide las lecturas, no el render ni la red.

### La comparación visual (AC-9)

Capturas de las cuatro pestañas a 1440 y 375 px y del menú «···», con un spec temporal, borrado después, lado a lado con 03, 04, 05, 07 y el panel 05 de 08. Se corrigió durante la comparación: los indicadores ocupan todo el ancho según cuántos haya, el avatar del encabezado es violeta claro (tono `brand`, como 03), los tres botones del encabezado tienen la misma altura (44 px) y, en el teléfono, el contacto va después de los indicadores, como 07.

| # | Diferencia | Mockup | Por qué queda |
|---|---|---|---|
| 1 | Sin «Próxima atención» arriba del Resumen | 03, 07 | H-3: pasa a la 24.4.2 |
| 2 | Operaciones con las tarjetas de hoy, sin la tabla unificada, sus filtros ni «Nueva operación» | 04 | H-3 y D-5: 24.4.2 |
| 3 | Actividad con las conversaciones y la auditoría, sin el historial unificado | 08, panel 05 | H-3 y D-6: 24.4.2 |
| 4 | Sin saldo corrido ni «Saldo inicial del período», y sin el selector de período | 05 | H-2 (brief-21.6, ADR 0022); el período, 24.7.2 |
| 5 | Sin el panel «Registrar cobro»: es un enlace a `/cobrar` | 05 | H-4: 24.7.2 |
| 6 | «Última interacción» sin el texto del mensaje | 03 | H-1 (Screens.md, pantalla 7) |
| 7 | El bloque «En ARS» de la Cuenta repite las cifras de los indicadores | 05 | D-4: es el cuerpo compartido con `/cuenta`, que no cambia |
| 8 | El teléfono en E.164 (`+5491155550000`), sin espacios | 03, 07 | Es el formato de toda la aplicación; darle formato es otra decisión |
| 9 | Las tarjetas de Operaciones sin la cantidad que pedía D-5 | 04 | Desvío: solo Pedidos y Reparaciones la tienen sin una lectura nueva, y la 24.4.2 rehace esa pestaña con los contadores de 04 (N-2 de la revisión; el usuario lo aceptó el 2026-10-29) |
| 10 | En el teléfono, «···» queda debajo de «Editar cliente», no arriba junto a «← Clientes» | 07 | Desvío: moverlo cambia el encabezado compartido de todas las fichas (O-5; aceptado el 2026-10-29) |
| 11 | Las notas van dentro de «Más datos», cerrado en el teléfono | 07 | Desvío, como describe Screens.md (O-5; aceptado el 2026-10-29) |
| 12 | Los indicadores van uno debajo del otro en el teléfono; 07 pone dos por fila | 07 | Desvío: a 375 px, «$ 77.500,00» no entra en media fila con el tamaño de 07 |
| 13 | «Más datos» muestra todos los campos del cliente; 03 muestra solo documento y localidad | 03 | D-3: los campos existen y el admin los ve hoy |
| 14 | Las etiquetas con su «✕» y el selector de hoy, sin «Editar etiquetas» | 03 | Desvío: es el componente de etiquetas de la 16.1, con su teclado y su auditoría |
| 15 | La insignia «Activo» ya no aparece; solo «Inactivo» | 03 | Desvío, como 03, que no la dibuja |
| 16 | «Ventas registradas» con el ícono de comprobante, no el carrito | 03 | El juego de íconos no tiene carrito |
| 17 | La migaja del marco dice «Clientes», sin el nombre del cliente | 03 | Es el marco de la 24.1; la ficha lleva «← Clientes» |

Los desvíos 12 y 14 a 17 no se consultaron por separado: los decide el usuario en el recorrido.

### Defectos encontrados y corregidos

- **Las clases de «Más acciones» llegaban como código.** `moreActionItemClass` y `moreActionDangerClass` vivían en `more-actions.tsx`, que es `"use client"`. Un componente de servidor que las importaba recibía una referencia de cliente y no el texto: el ítem salía con el código de una función como clase. Afectaba a la ficha nueva («Desactivar» no se podía tocar a 375 px, caso 22) y **a la ficha de Información en producción desde la 24.1** (`fcefdb8`), en «Eliminar». Se movieron a `more-action-styles.ts`. Toca `informacion/[entryId]/page.tsx` y `conversaciones/[conversationId]/status-actions.tsx`, fuera de los archivos autorizados, solo en el import, y saca dos exports de `more-actions.tsx`, más de lo que permite la regla de `_components/` (desvío 18, para el usuario).
- **Sin JavaScript, la actividad quedaba en el esqueleto.** «Abrir conversación» y las conversaciones de Actividad estaban dentro de un `Suspense`; sin JavaScript no se reemplazaba. Se espera la lectura en la página, sin `Suspense`. La lectura ya estaba en la medición de R-3.
- **La fecha salía «29 de oct de 2026».** Ahora se arma con `formatToParts`: «29 oct 2026».

### La revisión independiente (D-8)

Un agente que no participó del trabajo, con acceso de solo lectura, revisó el working tree contra el brief y las reglas. Veredicto **R1**, sin bloqueantes y sin fugas a un `viewer`. Cada hallazgo se verificó contra el código antes de aceptarlo:

| Hallazgo | Qué decía | Resultado |
|---|---|---|
| N-1 | «Reactivar» no estaba en «···», como pide D-2 | Corregido: «Reactivar» es un ítem de «···» y no queda la tarjeta «Estado». Screens.md, pantalla 7, ajustado |
| N-2 | Las tarjetas de Operaciones sin la cantidad de D-5 | Desvío 9, aceptado por el usuario |
| N-3 | El caso 20 no probaba que el `viewer` no reciba la auditoría: el cliente no tenía filas y la tarjeta vacía no dibuja «Auditoría de» | Corregido: busca también «Historial de auditoría», que sale aunque no haya filas |
| N-4 | Dos archivos fuera de los autorizados y un cambio en `_components` | Verificado y justificado: el defecto de las clases, arriba. Desvío 18, para el usuario |
| N-5 | No verificaba que `/cuenta` imprima lo mismo | Verificado: mismo JSX (AC-4) |
| O-1 | «Ventas registradas» contaba de una lista cortada en 500 comprobantes | Corregido: cuenta las vigentes de cada moneda, que llegan enteras |
| O-2 | Con deuda en una moneda, el saldo a favor en otra no se veía | Corregido: la deuda y debajo «A favor …», sin sumar. Sin test propio |
| O-3 | La edición leía la actividad sin mostrarla | Corregido |
| O-4 | Sin JavaScript, lo que va en un `Suspense` no estaba probado | El caso 21 reforzado lo confirmó como defecto; corregido (arriba) |
| O-5 | «···» y las notas en el teléfono, distintos de D-2 y D-3 | Desvíos 10 y 11, aceptados por el usuario |
| O-6 | Un comentario de `CopyButton` engañoso; dos `aria-current` en Cuenta; `.claude/settings.json` sin trackear | El comentario, corregido. Los dos `aria-current` (pestaña y moneda) quedan: son dos navegaciones distintas y axe no los marca. `.claude/settings.json` no entra en el commit |

### Desvío 18, de archivos

- `src/app/_components/more-action-styles.ts`, nuevo, y `more-actions.tsx` sin los dos exports de clases.
- `src/app/(autenticado)/informacion/[entryId]/page.tsx` y `src/app/(autenticado)/conversaciones/[conversationId]/status-actions.tsx`: solo el import.
- `src/app/_components/avatar.tsx` suma el tono `brand`, una opción nueva que no cambia el comportamiento por defecto, dentro de la regla.

### Pruebas

- **Typecheck, lint y prettier** en los archivos cambiados: sin errores.
- **Unitarias y guardas:** 2093 de 2094. Falló `forbidden-references.test.ts` por tiempo (42 s, con la máquina cargada); sola pasó 10 de 10.
- **Integración:** solo el test temporal de R-3. Esta subfase no toca `src/modules/`.
- **End-to-end:** la suite completa se cortó al terminar una sesión, después de 282 tests, con 269 pasados. Las 13 que fallaron, todas por tiempo y ninguna con un localizador de la ficha, pasaron solas con el build siguiente. Los specs que no llegó a correr (`users`, `variants`, `warranty`, `warranty-claims`) y `clients.spec.ts`: 48 de 50; los casos 21 (el defecto sin JavaScript, corregido) y 22 (por tiempo; pasó solo). Después de las últimas correcciones, con un build nuevo: `clients`, `client-fields`, `client-tags`, `accounts` y `exchange`, 50 de 50.
- **En esta máquina**, con poca memoria libre (116 MB en un momento), un build y un servidor de prueba se cayeron, y varias pruebas cortaron por tiempo en lugares distintos. Ninguna falla quedó sin repetir.

### Autoevaluación

Esta sección la escribió quien implementó, y es autoevaluación salvo la revisión independiente, que se cita. Lo que no está probado: O-2 no tiene test propio; el formato del teléfono y los desvíos 12 y 14 a 17 no se consultaron por separado.
