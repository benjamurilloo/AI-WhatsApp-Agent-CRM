---
schema: task-brief.v1
task_id: "24.2"
task_type: implementation
generated_at: 2026-10-28
---

# Brief: 24.2 — Búsqueda en diálogo

**Estado: aprobado el 2026-10-28 por el usuario, con las recomendaciones de D-1 a D-8.** Eso fija el botón y Ctrl/Cmd+K con un `<dialog>` modal (D-1, a), la lupa que abre el diálogo a pantalla completa (D-2, a), las reparaciones por número y por cliente y los turnos por cliente (D-3, a), el teléfono como en la 23.3 (D-4, a), sin chips (D-5, a), el pie de la v2 con el título «Buscar en el sistema» (D-6, a), el despliegue al cerrar (D-7, a) y la revisión independiente antes de desplegar (D-8, b).

## Objetivo

Llevar la búsqueda global de la 23.3 al patrón de la v2:
- un diálogo que se abre con Ctrl/Cmd+K o desde la barra, con el foco adentro y devuelto al cerrar;
- en el teléfono, a pantalla completa;
- con los grupos de reparaciones y turnos, cada uno con los permisos y la capacidad de su módulo.

Es la segunda subfase de la Fase 24 (Roadmap, §Fases 23 a 28). Hereda el marco de la 24.1.

## Situación

- **Hoy** ([brief-23.3](brief-23.3-busqueda-global.md)):
  - **Escritorio:** un combobox en la barra desde 1024 px, con hasta tres resultados por tipo, agrupados.
  - **Página de resultados:** con Enter, `/buscar?q=…`, con hasta ocho por tipo.
  - **Teléfono:** debajo de 1024 px, una lupa que lleva a `/buscar`.
  - **Atajo de teclado:** ninguno. La 23.3 lo dejó «para la Fase 24 si se pide» (D-5); el usuario lo pidió al replanificar, el 2026-10-28.
- **Los tipos de hoy:** Clientes, Pedidos, Productos, Equipos, Ventas, Compras y Proveedores.
  - Equipos son las unidades y las órdenes de servicio con ese IMEI exacto. Existe desde la 29.9 (U-3).
  - Compras y Proveedores son solo para `admin`.
- **La v2:**
  - `manifest-v2.md`, línea 28;
  - `00-arquitectura-global/desktop/05-busqueda-global-v2.png`;
  - `32-consistencia-accesibilidad/referencias/06-teclado-foco-lectura-v2.png`;
  - `prompts-lote-v2-01.md` §05 y `prompts-v2-13.md` §06.

  Dibuja un diálogo «Buscar en Vixora», con el subtítulo «Clientes, equipos, ventas, reparaciones y turnos».
  - **Filtros:** chips «Todos (4)», «Clientes (1)», «Equipos / IMEI (0)» y «Operaciones (3)».
  - **Grupos:** Clientes, Reparaciones, Turnos y Ventas, con la fila elegida en violeta suave y «Abrir ficha».
  - **Pie:** «4 resultados · Solo contenido al que tenés acceso» y las teclas ↑ ↓ Navegar, ↵ Abrir y Esc Cerrar.
  - **Teclado:** el foco entra al buscador, Tab y Mayús+Tab quedan adentro, Esc cierra y devuelve el foco, y se anuncia la cantidad de resultados. El fondo queda inerte.
  - **Teléfono:** pantalla completa.

## Hallazgos antes de diseñar

- **H-1. La búsqueda por IMEI ya existe.** El grupo «Equipos» (`buscar/search.ts`, `devices`) lee `findUnitsBySerial` y `listServiceOrdersBySerial` con el IMEI exacto. El punto «Búsqueda por IMEI» del Roadmap está cubierto: la 24.2 solo lo lleva al diálogo.
- **H-2. Las reparaciones por número ya tienen lectura.** `listServiceOrders({ number })` acepta «OS-000123», «000123» o «123» (`service-orders.ts:117` y `:922`). Pide la capacidad `repairs` (`NOT_FOUND` sin ella) y sirve para los dos roles (`requireRepairs` sin rol).
- **H-3. Los turnos no tienen número.** La v2 los encuentra por el cliente («Lucía» → «27 oct · 14:30 · Lucía Gómez»). Lo mismo pasa con su reparación. Las dos lecturas por cliente ya existen:
  - `listClientServiceOrders(context, clientId)`, hasta 5;
  - `listClientAppointments(context, clientId)`, hasta 20.

  Las dos son para los dos roles, con su capacidad (`NOT_FOUND` sin ella), y la ficha del cliente ya las usa. **No hacen falta lecturas nuevas en `src/modules/`**: se componen en la aplicación, como decidió la 23.3 (D-4).
- **H-4. El teléfono.** La v2 dice que la búsqueda «funciona con nombre, teléfono, IMEI y número de operación». La 23.3 decidió otra cosa (D-3, a):
  - las sugerencias no buscan teléfonos;
  - `/buscar` muestra el cliente con ese teléfono exacto, solo con su nombre;
  - un `viewer` nunca recibe un teléfono (H-6 de la 23.3, comprobado por un end-to-end).

  Seguir a la v2 cambia esa decisión. Se mantiene salvo que el usuario diga otra cosa (D-4).
- **H-5. El sistema ya tiene un diálogo modal:** `unsaved-changes-dialog.tsx`, de la 23.2, un `<dialog>` con `showModal()`. El navegador deja el fondo inerte, atrapa Tab dentro del diálogo (solo puede salir a la interfaz del navegador), cierra con Esc y devuelve el foco al elemento anterior. Es lo que pide la v2, sin una trampa de foco propia.
- **H-6. Lo que los end-to-end esperan hoy** (`search.spec.ts`, cinco casos):
  - el combobox «Buscar en el sistema» visible en la barra a 1280 px;
  - la lupa como enlace a `/buscar` a 375 px.

  Con un diálogo cambian los pasos de abrir, no lo que se busca ni lo que llega al navegador. El caso del `viewer` (AC-4 de la 23.3) se conserva tal cual.
- **H-7. Ctrl+K** es, en Chrome y Edge, el atajo para buscar en la barra del navegador, y en Firefox, el de la barra de búsqueda. La aplicación lo toma con `preventDefault` solo dentro de la página, como hacen GitHub, Linear o Notion. Cmd+K en macOS no choca con nada del navegador.

## Decisiones pendientes

### D-1 — Cómo se abre en escritorio

- (a) **un botón en lugar del campo de la barra**, con la forma de un campo y la tecla «Ctrl K» o «⌘K» al costado, como dibuja la v2.
  - El texto visible es «Buscar en el sistema…», como hoy, y no el «Buscar cliente, IMEI, venta o reparación…» de la v2: el texto visible tiene que estar dentro del nombre accesible (WCAG 2.5.3), y ese nombre ya lo usan los end-to-end (R-3).
  - El botón y Ctrl/Cmd+K, desde cualquier pantalla y también dentro de un campo, abren el diálogo.
  - El diálogo tiene el mismo combobox de hoy, con los grupos y Enter que abre `/buscar`.
  - Sin JavaScript, el botón es un enlace a `/buscar`.
- (b) conservar el campo de la barra y que Ctrl/Cmd+K solo lo enfoque, sin diálogo.

*Recomendación: (a).* Es lo que pide la v2, y el diálogo da lugar a los grupos nuevos sin una lista desplegable de 28 rem colgando de la barra.

### D-2 — Cómo se abre en el teléfono

- (a) **la lupa abre el mismo diálogo a pantalla completa** (v2, línea 28). Sin JavaScript sigue siendo el enlace a `/buscar`.
- (b) la lupa sigue llevando a `/buscar` (23.3, D-5).

*Recomendación: (a).* El teléfono y el escritorio quedan iguales, y `/buscar` sigue como respaldo sin JavaScript y como página de «ver todos».

### D-3 — Los grupos de reparaciones y turnos

| Grupo | Regla | Lectura | Quién | Muestra |
|---|---|---|---|---|
| Reparaciones | número exacto de la orden (H-2), y las órdenes de los clientes encontrados | `listServiceOrders({ number })` y `listClientServiceOrders` | los dos roles, con `repairs` | el número y el modelo; debajo, el cliente y el tipo si es un reclamo; a la derecha, el estado |
| Turnos | los turnos de los clientes encontrados | `listClientAppointments` | los dos roles, con `appointments` | la fecha y la hora; debajo, el cliente y el motivo; a la derecha, el estado |

- (a) **las dos reglas de la tabla**:
  - «los clientes encontrados» son los primeros tres del grupo Clientes, en el diálogo y en `/buscar`;
  - de cada uno se muestran hasta tres órdenes y tres turnos, en el orden de su ficha;
  - las lecturas por cliente van después de la de clientes, en paralelo entre sí. Son hasta 6 lecturas más por búsqueda, y se miden (R-1);
  - sin la capacidad, el grupo no aparece.
- (b) solo las reparaciones por número, y los turnos sin grupo: se ven desde la ficha del cliente.
- (c) lecturas nuevas en `service` y `appointments`, que busquen por el nombre del cliente con una consulta propia.

*Recomendación: (a).* Es lo que dibuja la v2 («Lucía» trae su reparación y su turno) sin tocar `src/modules/`. (c) necesitaría que `service` y `appointments` lean los nombres de `crm`, y no hay una necesidad medida que lo justifique.

### D-4 — El teléfono escrito en la búsqueda (H-4)

- (a) **como decidió la 23.3**: las sugerencias del diálogo no buscan teléfonos, y `/buscar` sí, mostrando solo el nombre;
- (b) que el diálogo también busque el teléfono entero, mostrando solo el nombre, como `/buscar`.

*Recomendación: (a).* La v2 no es un contrato de permisos («son propuestas, no endpoints comprobados», `criterios-implementacion-v2.md:116`). Cambiar lo que un `viewer` puede confirmar desde el diálogo es una decisión de seguridad que no pide esta subfase. Con (a), un texto con forma de teléfono muestra en el diálogo una línea: «Para buscar por teléfono, Enter abre la búsqueda completa».

### D-5 — Los chips de filtro

- (a) **sin chips en la 24.2**: los grupos ya separan los tipos, y los recuentos que dibuja la v2 («Operaciones (3)») serían de lo mostrado, cortado en tres por tipo, no del total;
- (b) chips sin recuento (Todos, Clientes, Equipos, Operaciones), que ocultan los demás grupos.

*Recomendación: (a).* Un recuento que no es el total engaña, y sin recuento el chip ahorra poco frente a los títulos de grupo. Queda como mejora si el usuario lo pide.

### D-6 — Lo que se anuncia y el pie

- (a) **como la v2**:
  - el título «Buscar en Vixora» y el subtítulo con los tipos que el rol y las capacidades pueden ver;
  - el pie con «N resultados · Solo contenido al que tenés acceso» y las teclas «↑ ↓ Navegar · Enter Abrir · Esc Cerrar», estas desde 640 px;
  - la cantidad, en una región `aria-live="polite"` que se actualiza al terminar cada búsqueda;
  - la fila elegida, con el fondo `primary-soft` y «Abrir» a la derecha.

  El nombre de la organización no va en el título: dice «Buscar en el sistema», el nombre accesible que ya usan los end-to-end.
- (b) el título «Buscar en el sistema» sin subtítulo, y la cantidad solo en la región viva.

*Recomendación: (a), con el título «Buscar en el sistema».* «Vixora» es la marca del operador, no de cada negocio, y el nombre «Buscar en el sistema» ya está en todos los end-to-end y en la regla de nombres de la 23.3.

### D-7 — Despliegue a producción

- (a) **desplegar al cerrar**, como la 24.1;
- (b) esperar a otras subfases.

*Recomendación: (a).*

### D-8 — Revisión

- (a) autoevaluación declarada;
- (b) **revisión independiente antes de desplegar**, como la 24.1, que encontró tres bloqueantes con todas las pruebas en verde.

*Recomendación: (b).* La búsqueda junta lecturas de siete módulos con permisos distintos, y lo que llega al navegador de un `viewer` es lo que más importa revisar.

## Alcance incluido

1. `search-dialog.tsx`, nuevo en `src/app/_components/` y de cliente:
   - un `<dialog>` modal con el combobox de hoy (`SuggestInput` con `searchEverythingAction`);
   - el botón que lo abre y el atajo Ctrl/Cmd+K;
   - el anuncio de la cantidad y el pie (D-6);
   - a pantalla completa debajo de 640 px (D-2).
2. El marco (`layout.tsx`): el botón en lugar del campo desde 1024 px y la lupa que abre el diálogo debajo, los dos enlaces a `/buscar` sin JavaScript.
3. Los grupos «Reparaciones» y «Turnos» (D-3) en `buscar/groups.ts` y `buscar/search.ts`, con su orden: Clientes, Reparaciones, Turnos, Pedidos, Productos, Equipos, Ventas, Compras y Proveedores. En el diálogo y en `/buscar`.
4. Un texto con forma de teléfono en el diálogo (D-4, a).
5. Los unitarios de `groups.test.ts` y, si hace falta, de `suggest-input`.
6. Los end-to-end:
   - **`search.spec.ts`:** los cinco casos, con el diálogo, y casos nuevos:
     - Ctrl+K desde un campo y Esc que devuelve el foco;
     - Tab que no sale del diálogo;
     - el diálogo a pantalla completa a 375 px, sin desplazamiento horizontal;
     - reparaciones y turnos de un cliente en una organización con `repairs` y `appointments`, y sin ellos.
   - **Las comprobaciones de siempre:** axe en claro y en oscuro, a 1280 y 375 px, con el diálogo abierto; y el caso del `viewer` (AC-4 de la 23.3) con los grupos nuevos.
7. La medición de R-1 y la nota fechada en `docs/product/Screens.md`.

## Archivos autorizados

- `src/app/_components/search-dialog.tsx` (nuevo) y, si hace falta, `suggest-input.tsx` y `suggest-filter.ts`.
- `src/app/(autenticado)/layout.tsx`.
- `src/app/(autenticado)/buscar/groups.ts`, `groups.test.ts`, `search.ts`, `actions.ts` y `page.tsx`.
- `src/app/globals.css`, solo si el diálogo lo necesita.
- `tests/e2e/search.spec.ts` y los specs que abran la búsqueda desde el marco, con el paso que cambia listado al cerrar.
- `docs/product/Screens.md` y este brief.

## Alcance excluido

- Cualquier cambio en `src/modules/`, una migración o un contrato.
- Buscar el teléfono en el diálogo (D-4, b) y los chips (D-5, b).
- Buscar pedidos o ventas por cliente (D-2, b, de la 23.3), turnos por fecha, o usados y técnicos.
- Recientes, favoritos o acciones («Nueva venta») dentro del diálogo: la v2 no los dibuja.
- Las pantallas de reparaciones y turnos: son la 24.9.1 y la 24.9.3.

## Invariantes

- Cada grupo aplica la lectura y el permiso de su módulo. La aplicación no pide lo que el rol no puede ver: Compras y Proveedores no se piden para un `viewer`.
- Sin la capacidad, su grupo no aparece. Tampoco aparece en el subtítulo.
- Ningún cuerpo que llega al navegador de un `viewer` contiene un teléfono entero, un email, una dirección, un costo, una orden de compra ni un proveedor.
- Una lectura que falla deja su grupo afuera y las demás se muestran. Se registra sin el texto buscado.
- `/buscar` sigue funcionando sin JavaScript.
- La accesibilidad verificada con axe no retrocede.

## Criterios de aceptación

- **AC-1**: el botón de la barra, la lupa y Ctrl/Cmd+K abren el diálogo desde cualquier pantalla, también con el foco en un campo. El foco entra al buscador.
- **AC-2**: con el diálogo abierto, el fondo es inerte y Tab y Mayús+Tab no salen del diálogo. Esc y el botón de cerrar lo cierran y devuelven el foco al disparador.
- **AC-3**: flechas recorren, Enter abre la ficha de la opción elegida, y Enter sin opción abre `/buscar?q=…`. La cantidad de resultados se anuncia en una región viva.
- **AC-4**: el grupo Reparaciones muestra la orden por su número, y las órdenes de los clientes encontrados. El grupo Turnos muestra los turnos de esos clientes. Sin `repairs` o sin `appointments`, el grupo no aparece. Las dos reglas valen para los dos roles.
- **AC-5**: un `viewer` no recibe teléfono, email, dirección, costo, orden de compra ni proveedor en ningún cuerpo de la búsqueda, ni del diálogo ni de `/buscar`.
- **AC-6**: a 375 px el diálogo ocupa la pantalla, sin desplazamiento horizontal, con la barra inferior detrás e inerte.
- **AC-7**: sin JavaScript, el botón y la lupa llevan a `/buscar`, que muestra también los grupos nuevos.
- **AC-8**: axe no reporta violaciones con el diálogo abierto y con resultados, en claro y en oscuro, a 1280 y 375 px.
- **AC-9**: la medición de R-1 está en el §Cierre: la duración de una búsqueda con y sin los grupos nuevos, con el método.
- **AC-10**: la CI pasa completa en el SHA que se despliega.
- **AC-11**: desplegado en producción y recorrido por el usuario. Con D-8 (b), con la revisión independiente antes.

## Condiciones de detención

- Si un grupo necesita una lectura nueva o un cambio en `src/modules/`: se detiene y se consulta.
- Si R-1 mide una búsqueda claramente más lenta que la de la 23.3 (más del doble en local): se informa antes de seguir, con la opción (b) de D-3.
- Si axe reporta una violación que no se resuelve sin apartarse de la v2: gana la accesibilidad, y se informa.
- Antes de cada commit, del push, del despliegue y de cada cambio en Notion: cada uno se autoriza en su turno.
- Si la 13.5.2-b arranca: se pausa en el último punto con la CI en verde.

## Riesgos

- **R-1: las lecturas por cliente** suman hasta 6 consultas después de la de clientes, en cada búsqueda.
  - **Mitigación:** se piden solo con la capacidad, solo para los primeros tres clientes y en paralelo.
  - **Medición:** en local, la duración de la acción con el texto de un cliente con órdenes y turnos, con y sin los grupos nuevos, en 20 corridas.
- **R-2: el atajo Ctrl+K le gana al del navegador.** Se acepta, como en las aplicaciones de H-7. La tecla se muestra al lado del botón.
- **R-3: el diálogo cambia los pasos de abrir la búsqueda** en `search.spec.ts` y en cualquier spec que use el campo de la barra. Se mitiga conservando el nombre «Buscar en el sistema» del combobox y del botón, y listando los pasos que cambian.
- **R-4: el foco devuelto por el navegador al cerrar un `<dialog>`** depende de la versión. Se comprueba en el end-to-end. Si no llega al disparador, se devuelve a mano.

## Cierre

*Del 2026-10-28, después del despliegue y del recorrido del usuario («esta todo perfecto»).*

### Criterios

| Criterio | Estado | Evidencia |
|---|---|---|
| AC-1 | cumple | `search-dialog.tsx`: el botón de la barra, la lupa y el atajo (⌘K en Mac y Ctrl+K en los demás, desvío 4), y el foco al buscador después de `showModal`. `search.spec.ts`: Ctrl+K desde `#q` en `/clientes`, sin escribir en el campo, y la lupa a 375 px |
| AC-2 | cumple | `showModal()` deja el fondo inerte. Tab y Escape se toman a mano (desvío 1). El foco vuelve a quien abrió. `search.spec.ts`: Tab y Mayús+Tab quedan en el diálogo de búsqueda, y Esc y «Cerrar la búsqueda» devuelven el foco al campo y al botón |
| AC-3 | cumple | El combobox de la 23.3 con `inline`. La cantidad va en un `aria-live="polite"` del pie. `search.spec.ts`: «3 resultados», flechas y Enter hasta la ficha, y Enter con un teléfono hasta `/buscar` |
| AC-4 | cumple | `search.ts`: Reparaciones por número y por los primeros tres clientes, y Turnos por esos clientes. Sin la capacidad, las lecturas del módulo responden `NOT_FOUND`. `search.spec.ts`, en la tienda iPhone: el admin y el viewer ven los dos grupos, y desde la revisión (B-2) con `repairs` y `appointments` apagadas ni el diálogo ni `/buscar` los muestran |
| AC-5 | cumple | Cada resultado copia solo número, cliente, modelo, motivo y estado. Desde la revisión (B-1), `search.spec.ts` junta todo lo que recibe el viewer de la tienda iPhone: los documentos de `/buscar`, por nombre, teléfono entero y número, y las respuestas de la Server Action. Una clienta con teléfono y email y una orden presupuestada: no llegan ni el teléfono, ni el email, ni lo reportado, ni los dos totales. La prueba se comprobó al revés: con el total metido a propósito en el detalle, falla en «987.65». El caso de la 23.3 sigue igual |
| AC-6 | cumple | Debajo de `sm`, `h-dvh w-full m-0`. `search.spec.ts`: la caja mide 0, 375 y 800 y no hay desplazamiento horizontal |
| AC-7 | cumple | Sin hidratar, los dos disparadores son enlaces a `/buscar`. `search.spec.ts`, sin JavaScript: el botón de la barra a 1280 px y, desde la revisión (NB-5), la lupa a 375 px hasta `/buscar`, que muestra Clientes, Reparaciones y Turnos |
| AC-8 | cumple | axe en claro y en oscuro: la lista abierta a 1280 px, el diálogo con resultados a 375 px, `/buscar` a 375 px y el diálogo con reparaciones y turnos |
| AC-9 | cumple | La medición, abajo |
| AC-10 | cumple | CI de `d169b84` (run 40755256574, `success`): lint, tipos, guardas, unitarios, integración, build y los end-to-end. En local pasaron los 306 end-to-end, en dos corridas. En la primera, el servidor de pruebas se cayó sin dejar causa en el log, y desde ahí 193 casos fallaron con «conexión rechazada». En la segunda, que repitió solo esos 193, pasaron 192 y `sales.spec.ts` agotó el tiempo en su última aserción. Ese spec, repetido solo, pasa sus 12 casos. Antes pasaron typecheck, lint, build y las 1185 pruebas de Vitest |
| AC-11 | cumple | Desplegada el 2026-10-28 en `d169b84`, sin migraciones; antes corría `fcefdb8`. Revisión independiente antes del despliegue (D-8, b). Recorrida por el usuario el mismo día |

### La medición de R-1

- **Método:** en local, con `next start` y PostgreSQL de desarrollo, un spec temporal de Playwright, borrado después. Se escribe «Lucía» en el diálogo y se toma desde la última tecla hasta que se ve «N resultados», menos los 250 ms de espera de la escritura.
  - Incluye el dibujo de la lista.
  - No se midió la respuesta de red sola: en una respuesta de Server Action, Playwright no da `finished()`, `body()` ni `requestfinished`.
- **Corridas:** 20 por variante, intercaladas.
  - **Sin las capacidades:** la búsqueda de la 23.3.
  - **Con los grupos nuevos:** tres clientas, cada una con 2 órdenes y 2 turnos.
- **Resultado:** las medianas fueron de 180,4 y 140,5 ms sin los grupos nuevos y de 170,4 y 152,4 ms con ellos. El máximo, 236,9 y 250,2 ms.
- **Conclusión:** no hay diferencia medible, y la condición de detención (más del doble) no se cumple.

### La revisión independiente

La hizo un agente que no participó del trabajo, con acceso de solo lectura, contra este brief, el de la 23.3, la v2 y las reglas del proyecto. Cada hallazgo se verificó contra el código antes de aceptarlo. No ejecutó pruebas.

- **Dos bloqueantes**, los dos confirmados y corregidos:
  - **B-1:** el caso del viewer no cubría los grupos nuevos con datos. La clienta no tenía teléfono, y el caso de la tienda iPhone solo miraba los títulos.
  - **B-2:** no había un caso con reparaciones y turnos guardados y la capacidad apagada.
- **Nueve no bloqueantes:**
  - **NB-1** (la trampa de foco propia, sin declarar) y **NB-2** (las filas, distintas de la tabla de D-3): se declaran como desvíos 1 y 2. En NB-2, además, un motivo vacío dejaba «Lucía · · Confirmado»: corregido.
  - **NB-3** (Ctrl+K con el diálogo abierto pisaba a quien lo abrió): corregido, ahora vuelve al buscador.
  - **NB-4:**
    - El atajo se apilaba sobre otro diálogo: corregido.
    - En Mac tomaba Ctrl+K: corregido, solo ⌘K.
    - Ignora la composición de texto y la tecla mantenida: corregido.
    - Elegir un resultado no pasa por el guarda de cambios sin guardar: queda abierto (ver abajo).
  - **NB-5** (la lupa sin JavaScript y los grupos nuevos en `/buscar` sin JavaScript): corregido con un caso.
  - **NB-6** (la comprobación de Tab daba verdadero en cualquier `<dialog>`): corregida, mira el de búsqueda.
  - **NB-7** (`.claude/settings.json` sin seguimiento): queda fuera del commit.
  - **NB-8** (los comentarios de `buscar/page.tsx` sobre la lupa): corregidos.
  - **NB-9** (una lectura por cliente que fallaba se llevaba también la orden por número): corregido con `allSettled`.
- **Estado documental:**
  - `Screens.md` decía que la búsqueda muestra solo el nombre o el número: se corrige en la nota de la 24.2.
  - `HANDOFF.md` y el índice de `docs/decisions/` se actualizan al cerrar.
  - `SecurityModel.md:55` nombraba solo cinco módulos y «solo el nombre o el número». No estaba entre los archivos autorizados. El usuario autorizó corregirlo en el commit de la implementación.

### Desvíos

1. **La trampa de foco y Escape, a mano.** H-5 esperaba que el `<dialog>` nativo bastara.
   - **Qué pasaba en Chromium:**
     - el primer Escape en un campo de búsqueda con texto borraba el texto sin cerrar;
     - Tab desde el último control salía a la interfaz del navegador.
   - **Corrección:** el diálogo toma las dos teclas antes que el campo, y Tab da la vuelta entre los controles visibles.
   - Es lo que preveía R-4 para el foco.
2. **Las filas de Reparaciones y Turnos.** D-3 dibujaba el número y el modelo arriba, el cliente debajo y el estado a la derecha.
   - Quedan como el resto de la búsqueda de la 23.3: el número arriba y, debajo, una línea con cliente, modelo y estado.
   - En una unidad propia, el IMEI ocupa el lugar del cliente.
   - El turno muestra la fecha y el horario, y debajo el cliente, el motivo y el estado.
3. **Diez localizadores en seis specs que no abren la búsqueda.** Son `client-fields`, `client-tags`, `clients`, `goods-receipt-voids`, `supplier-payments` y `suppliers`.
   - `getByRole("button", { name: "Buscar" })` coincidía por subcadena también con «Buscar en el sistema…», que ahora es un botón.
   - Llevan `exact: true`, como «Clientes» en la 24.1.
   - El nombre del botón no se cambió, porque es su texto visible (WCAG 2.5.3).
4. **El atajo según el sistema.** El brief decía Ctrl/Cmd+K. Queda ⌘K en Mac y Ctrl+K en los demás, para no quitarle a macOS el Ctrl+K de los campos de texto.
   - `aria-keyshortcuts` y la tecla al lado del botón siguen al sistema.
5. **Cambios en `SuggestInput` y `suggest-filter.ts`**, autorizados «si hace falta»:
   - `inline`, `onResults` y `onNavigate`;
   - `looksLikeFullPhone`.

### Qué queda abierto

- **Elegir un resultado con cambios sin guardar.** Se navega con `router.push` y no pregunta, porque el guarda solo intercepta clics en enlaces.
  - Ya pasaba con la barra de la 23.3. Ahora se llega desde cualquier pantalla.
  - Arreglarlo toca el guarda, fuera de los archivos autorizados.
  - Es una tarea en Notion, en «Esperando», en el proyecto de la Fase 24.
- **Por teléfono, `/buscar` muestra más que antes.** Encuentra al cliente y también sus reparaciones y turnos. Es coherente con H-7 de la 23.3 (riesgo aceptado), y no muestra el número.

### Autoevaluación

Esta sección la escribió el mismo agente que implementó; la revisión de arriba es la única independiente.
