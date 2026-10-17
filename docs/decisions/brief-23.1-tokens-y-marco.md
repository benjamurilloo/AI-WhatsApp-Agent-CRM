---
schema: task-brief.v1
task_id: "23.1"
task_type: implementation
generated_at: 2026-10-17
---

# Brief: 23.1 — Tokens y marco

**Estado: aprobado el 2026-10-17 por el usuario, con las recomendaciones de D-1 a D-9. Cerrado el 2026-10-17 (§Cierre).** Eso fija:

- las piezas según la tabla de D-1;
- los radios de 12 px (D-2);
- `outlineButtonClass`, que se define acá y se aplica en la Fase 24 (D-3);
- el orden del menú y el ítem activo con barra (D-4);
- el menú del usuario en la barra superior y el usuario al pie del panel (D-5);
- las migas «‹organización› / ‹sección›» (D-6);
- la barra inferior en el teléfono con «Inicio» y «Chats» (D-7);
- el despliegue a producción (D-8);
- la autoevaluación declarada (D-9).

Ese mismo día, el usuario autorizó crear la Fase 23 en Notion y hacer el commit del Roadmap, de este brief y de los mockups de `docs/ui-redesign/`. La aprobación no autoriza ningún otro commit, ninguna dependencia nueva ni el despliegue: cada uno se autoriza aparte, en el turno en que ocurre.

- **Nivel de evidencia objetivo**:
  - `deterministic`: el cálculo de contraste y los tests unitarios;
  - `producer-consumer`: Playwright sobre `next start` contra PostgreSQL real, con axe en claro y en oscuro;
  - `isolated-runtime`: la versión desplegada en producción, recorrida por el usuario.
- **Nivel de validación alcanzable**: **validado en integración** y **verificado en producción**. No certifica «preparado para producción», que sigue siendo el gate de la Fase 13.
- **Orden**: primera subfase de la Fase 23 ([Roadmap](../planning/Roadmap.md), §Fases 23 a 28). La 13.5.2-b conserva su prioridad: si arranca a mitad de camino, esta subfase se pausa en el último punto con la CI en verde.

## Objetivo

Que el marco común del CRM (el panel, la barra superior y la navegación en el teléfono) y los estilos compartidos se vean como los mockups de [docs/ui-redesign/00-sistema-visual](../ui-redesign/manifest.md), en claro y en oscuro y con contraste AA. Todo eso **sin cambiar ningún dato, consulta, contrato ni permiso**.

## Situación

La Fase 15 ([brief-15.1](brief-15.1-identidad-visual-y-marco.md)) dejó la paleta violeta, Manrope local, los tres temas y un marco con panel lateral de 16 rem. El 2026-10-17 el usuario trajo 44 mockups nuevos, generados con otra herramienta, y aprobó rediseñar el CRM sobre ellos en las Fases 23 a 28. Esta subfase es la base de todas las demás: lo que fije acá lo heredan las pantallas de la Fase 24.

## Hallazgos antes de diseñar

- **H-1. La paleta de los mockups ya está aplicada.**
  - Los ocho colores del manifest coinciden con los tokens de [globals.css](../../src/app/globals.css), y Manrope también.
  - Los colores semánticos del mockup (éxito `#16A34A`, error `#EF4444`) son más claros que los vigentes (`#17704a`, `#b42318`), que se eligieron para cumplir AA como texto. No se adoptan.
  - El foco del mockup es azul, como el `--focus` vigente.

  La subfase no cambia ningún valor de color.
- **H-2. Los radios no coinciden con los mockups.** El manifest pide 12 px. Hoy hay:
  - controles y botones con `rounded-lg` (8 px), 30 usos;
  - cuadros de ícono con `rounded-xl` (12 px), 15 usos;
  - tarjetas con `rounded-2xl` (16 px), en `cardClass` y en tres usos más;
  - avisos con `rounded-md`, 16 usos;
  - píldoras con `rounded-full`, 11 usos.

  Casi todo pasa por [form-styles.ts](../../src/app/_components/form-styles.ts), así que el cambio se concentra ahí.
- **H-3. El mockup tiene tres niveles de botón; el CRM tiene dos.**
  - El primario relleno existe.
  - El «secundario» del mockup (borde y texto violeta) no existe.
  - El «terciario» del mockup (neutro) es el `secondaryButtonClass` de hoy.

  Contraste del violeta sobre la superficie: 7,10:1 en claro y 6,55:1 en oscuro, así que sirve como texto y como borde.
- **H-4. El ítem activo del mockup no se distingue por su fondo.** El mockup lo marca con un fondo violeta suave, el texto violeta y una barra a la izquierda. Pero `primary-soft` contra el fondo del panel (`sidebar`) da **1,05:1** en claro y **1,35:1** en oscuro: el fondo solo no alcanza los 3:1 que pide un indicador de estado. La barra sí alcanza (`primary` contra `sidebar`: 6,21:1 en claro y 6,85:1 en oscuro), y el texto también (`primary` sobre `primary-soft`: 5,91:1 en claro y 5,09:1 en oscuro). Hoy el activo es un relleno `action` con texto blanco. Se resuelve en D-4.
- **H-5. La organización está en la barra superior a propósito.** Así lo dice [Screens.md](../product/Screens.md), §Reglas comunes, en la nota de la 15.1: dentro del `banner` la encuentran las pruebas y un lector de pantalla. El mockup no muestra la organización, pero muestra migas «CRM / Clientes» en ese lugar. Con dos organizaciones en producción, ocultarla invita a confundirlas. Se resuelve en D-5 y D-6.
- **H-6. Los end-to-end que dependen del marco.**
  - `navigation` «Principal» aparece en 13 archivos. Si se conserva ese nombre accesible, esos pasos no cambian.
  - Lo que sí cambia:
    - `frame.spec.ts`, casos 1 y 2: el botón «Menú» y su panel a 375 px;
    - `users.spec.ts`, caso 1: el texto «‹nombre› (admin)» y «Salir» dentro del `banner`;
    - `login.spec.ts`, líneas 211 y 228, y `sales.spec.ts`, líneas 258 a 289: el botón «Salir».
- **H-7. El teléfono hoy usa un panel desplegable**, «Menú», en [mobile-nav.tsx](../../src/app/_components/mobile-nav.tsx). El mockup usa una barra inferior fija con cinco destinos: Inicio, Chats, Clientes, Ventas y Más. Los cuatro primeros los ven los dos roles; Compras y Usuarios, solo `admin`, quedan dentro de «Más». Una barra fija tapa el final del contenido, así que el contenido necesita un margen inferior debajo de `lg`. Y la barra no se imprime.
- **H-8. Cada página arma su propio contenedor** (`<main className="mx-auto max-w-6xl px-4 py-8 …">`, en 65 lugares con 6 variantes). La densidad de cada pantalla («hay elementos muy separados», pedido del 2026-10-14) es de la Fase 24, módulo por módulo. Esta subfase toca solo el espaciado del marco.

## Decisiones pendientes

### D-1 — Qué piezas de los mockups de fundamentos entran y dónde

| Pieza | Destino recomendado | Motivo |
|---|---|---|
| Radios de 12 px | **23.1** | sistema compartido (H-2) |
| Botón secundario con borde violeta | **23.1** define la clase; **Fase 24** la aplica en cada pantalla | qué botón pasa a secundario es una decisión por pantalla |
| Menú en el orden del mockup e ítem activo con barra | **23.1** | marco |
| Usuario al pie del panel y menú del usuario | **23.1** | marco (D-5) |
| Migas en la barra superior | **23.1** | marco (D-6) |
| Barra inferior en el teléfono con «Más» | **23.1** | marco (D-7) |
| Esqueleto de carga, estado vacío con ícono, error recuperable, aviso tras una acción y cambios sin guardar | **23.2** | componentes de estado: cada uno toca muchas pantallas y conviene una subfase propia |
| Buscador global «Buscar clientes, pedidos o productos…» | **23.3** | consulta nueva de solo lectura que cruza módulos y permisos |
| Saludo «Buenos días, ‹nombre›» y tarjeta KPI con sparkline | **Fase 25** | el dashboard es su propia fase |
| Casilla de selección en las filas | **Fase 27** | sin acciones masivas, una casilla promete algo que no existe |
| Columna «configurar columnas» de las tablas | **Fase 24**, si alguna pantalla la necesita | es de cada listado |
| Campana de notificaciones | **fuera** | el [Scope](../product/Scope.md) excluye las notificaciones; una campana inerte luce peor que ninguna |
| Colores semánticos del mockup | **fuera** | rebajan el contraste vigente (H-1) |

*Recomendación: la tabla tal como está.*

### D-2 — Radios

- (a) **12 px para todo lo que el mockup dibuja como componente**: tarjetas (`cardClass`, de 16 a 12), controles, botones, avisos y cuadros de ícono. Lo que queda dentro de otro componente (las opciones del selector de tema, los números de la paginación, el anillo de foco de un enlace) conserva su radio menor, para que el anidado se lea. Las píldoras siguen redondas.
- (b) solo las tarjetas a 12 px; controles y botones quedan en 8.

*Recomendación: (a).* Es lo que pide el manifest, y el cambio vive casi entero en `form-styles.ts`.

### D-3 — Botón secundario

- (a) una clase nueva, `outlineButtonClass` (borde y texto `primary`, fondo `surface`, y en el hover `primary-soft`), que la Fase 24 aplica pantalla por pantalla. `secondaryButtonClass` conserva su nombre y su aspecto neutro: es el «terciario» del mockup;
- (b) convertir ya todos los `secondaryButtonClass` al violeta: cambia de golpe la jerarquía de 60 pantallas sin mirarlas.

*Recomendación: (a).*

### D-4 — Menú: orden e ítem activo

**Orden**, como en el mockup: Dashboard, Conversaciones, Clientes, Productos, Pedidos, Ventas, Caja, Compras (solo `admin`), Información y Usuarios (solo `admin`). Hoy Productos va segundo y Conversaciones octavo.

**Ítem activo**:
- (a) como el mockup: fondo `primary-soft`, texto `primary` y una barra de 3 px en `primary` a la izquierda. Lo que lo distingue es la barra (6,21:1) y el texto, no el fondo (H-4). Sigue llevando `aria-current="page"`;
- (b) conservar el relleno `action` con texto blanco de la 15.1.

*Recomendación: (a).* Es el aspecto del mockup y cumple, siempre que la barra no se quite.

### D-5 — Usuario y organización

El mockup pone al usuario en dos lugares: al pie del panel (avatar, nombre, rol y una flecha) y en la barra superior (avatar con flecha).

- (a) **un menú del usuario en la barra superior**: un botón con el avatar y una flecha, `aria-expanded` y `aria-controls`, que despliega el nombre, el rol y «Salir». Escape lo cierra y devuelve el foco. **Al pie del panel**, solo en escritorio, el avatar con el nombre y el rol, como texto y sin acciones. La organización queda en el `banner`, como primer nivel de las migas (D-6). Sin JavaScript, el menú queda abierto y «Salir» funciona igual;
- (b) solo el pie del panel, con «Salir» ahí: la barra superior queda sin usuario y en el teléfono no hay panel;
- (c) como hoy: nombre, rol y «Salir» visibles en la barra superior.

*Recomendación: (a).* Es lo que dibuja el mockup y funciona igual en el teléfono, donde el avatar de la barra superior es el único acceso al usuario. Cambia los pasos de H-6 que buscan «Salir» o el nombre en el `banner`: ahora abren el menú primero.

### D-6 — Migas

El mockup muestra «CRM / Clientes» a la izquierda de la barra superior.

- (a) **«‹organización› / ‹sección›»**: el nombre de la organización ocupa el lugar de «CRM», y la sección se deriva del primer segmento de la ruta con la misma tabla del menú. Va en un `<nav aria-label="Migas">` con `aria-current="page"` en el último nivel. Mantiene la organización en el `banner` (H-5) y no toca ninguna página. Los niveles más profundos («Clientes / Juan Pérez») quedan para la Fase 24, donde cada pantalla de detalle conoce su título; hasta entonces, cada detalle conserva su enlace «Volver a …»;
- (b) migas completas desde ya: cada una de las 66 páginas pasa sus niveles, así que la subfase toca todas las pantallas;
- (c) sin migas, como hoy.

*Recomendación: (a).*

### D-7 — La navegación en el teléfono

Debajo de `lg` (1024 px):

- (a) **una barra inferior fija** con Inicio, Chats, Clientes, Ventas y «Más».
  - Es la misma `<nav aria-label="Principal">`: el panel lateral queda oculto debajo de `lg` y la barra oculta desde `lg`, así nunca hay dos navegaciones «Principal» visibles a la vez.
  - «Más» es un botón con `aria-expanded` y `aria-controls`. Despliega, sobre la barra, el resto de las secciones según el rol. Escape y la navegación lo cierran, y el foco vuelve al botón: es el comportamiento del «Menú» de hoy, con otra forma.
  - Cada destino tiene 44 px de alto como mínimo. El activo lleva el fondo `primary-soft`, el texto `primary` y `aria-current`. Si el destino activo vive dentro de «Más», el que se marca es «Más».
  - El contenido suma un margen inferior igual a la altura de la barra.
  - Sin JavaScript no hay barra fija: la navegación completa queda visible arriba, como hoy.
  - **Etiquetas**: las del mockup, «Inicio» y «Chats». El nombre accesible es la etiqueta visible (WCAG 2.5.3), así que en el teléfono el enlace del dashboard se llama «Inicio» y el de conversaciones, «Chats»;
- (b) la misma barra, pero con las etiquetas del panel («Dashboard», «Conversaciones»): no entran cinco a 375 px sin achicar la letra por debajo de 12 px;
- (c) conservar el panel desplegable «Menú».

*Recomendación: (a).* Es el patrón del mockup, y deja las cuatro secciones más usadas a un toque. El caso 2 de `frame.spec.ts` se reescribe sobre «Más».

### D-8 — Despliegue a producción

- (a) con la CI del SHA exacto en verde, el usuario autoriza y el despliegue sigue el [README de producción](../../deploy/production/README.md), §Desplegar. No hay migraciones ni cambios en `app.env`. Para volver atrás, `69d3cad`, lo que corre hoy;
- (b) no desplegar hasta tener también la 23.2.

*Recomendación: (a).* Cada subfase de la Fase 23 se despliega sola, y el usuario ve el marco nuevo en producción antes de seguir.

### D-9 — Revisión

La 23.1 no abre ni cierra un gate y solo cambia la presentación.

- (a) autoevaluación declarada, con axe en los dos temas y a dos tamaños (1280 y 375 px) como evidencia externa al autor;
- (b) además, una revisión independiente de solo lectura antes de desplegar.

*Recomendación: (a).* La regla del proyecto pide revisión independiente para los gates.

## Alcance incluido

1. Registrar la resolución de D-1 a D-9.
2. **Radios** según D-2, en `form-styles.ts` y en los componentes compartidos de `src/app/_components/` que fijan el suyo: `page-header.tsx`, `detail-header.tsx`, `stat-tile.tsx`, `section-card.tsx`, `pagination.tsx`, `page-notice.tsx` y `tag-chip.tsx`.
3. **`outlineButtonClass`** según D-3, sin aplicarla a ninguna pantalla todavía, más un test que fija que existe y usa solo tokens.
4. **Menú** según D-4: el orden nuevo y el ítem activo con barra, en el `layout.tsx` autenticado y en `app-nav.tsx`.
5. **Usuario** según D-5: el menú del usuario en la barra superior y el bloque al pie del panel.
6. **Migas** según D-6: un componente nuevo que deriva la sección de la ruta, con su test unitario de la tabla de rutas, incluida una ruta desconocida.
7. **Barra inferior** según D-7: reemplaza `CollapsiblePanel` debajo de `lg` y conserva su manejo del teclado y del foco.
8. **Espaciado del marco**: la barra superior, el panel y la barra inferior, según el mockup. El contenedor de cada página no se toca (H-8).
9. **End-to-end**:
   - se actualizan los pasos de H-6;
   - el caso 1 de `frame.spec.ts` suma las migas y el menú del usuario a 1280 px;
   - el caso 2 se reescribe para la barra inferior a 375 px: «Más» se abre, Escape lo cierra y devuelve el foco, navegar lo cierra, el activo lleva `aria-current` y no hay desplazamiento horizontal;
   - axe en claro y en oscuro, a los dos tamaños.
10. **Documentación**: [Screens.md](../product/Screens.md), §Reglas comunes, con una nota fechada que reemplaza la descripción del marco de la nota de la 15.1.
11. **Despliegue** según D-8.

## Alcance excluido

- Todo lo que D-1 manda a la 23.2, a la 23.3, a las Fases 24, 25 y 27, o deja fuera.
- Cambios de color en los tokens (H-1), de la fuente o del contenedor de cada página (H-8).
- Cambios en `src/modules/`, en las consultas, en las migraciones, en los contratos o en los permisos.
- Librerías nuevas y cambios en `package.json`: los íconos que falten se agregan a `icons.tsx`, copiados de Lucide como en la 15.1 (D-3 de ese brief).
- La pantalla de inicio de sesión, más allá de lo que hereda de los radios.

## Criterios de aceptación

- **AC-1**: los radios de D-2 se ven en las tarjetas, los botones y los controles del marco y de una pantalla de cada módulo, en claro y en oscuro.
- **AC-2**: a 1280 px, el panel muestra las secciones en el orden de D-4. El activo lleva la barra y `aria-current="page"`. Al pie aparece el usuario con su rol.
- **AC-3**: la barra superior muestra «‹organización› / ‹sección›» en todas las pantallas autenticadas, y la sección coincide con el ítem activo.
- **AC-4**: el menú del usuario se abre y se cierra con el mouse y con el teclado, Escape devuelve el foco, y «Salir» cierra la sesión.
- **AC-5**: a 375 px, la barra inferior muestra los cinco destinos con al menos 44 px de alto. «Más» lista el resto según el rol (un `viewer` no ve Compras ni Usuarios). El último elemento de una pantalla larga no queda tapado. No hay desplazamiento horizontal.
- **AC-6**: axe no reporta violaciones en el marco, en claro y en oscuro, a 1280 y a 375 px.
- **AC-7**: la CI pasa completa en el SHA que se despliega: lint, typecheck, unitarios, integración, end-to-end y las guardas.
- **AC-8**: desplegado en producción y recorrido por el usuario.

## Condiciones de detención

- Si un cambio exige tocar `src/modules/`, una consulta o un permiso: se detiene y se consulta.
- Si axe reporta una violación que no se resuelve sin apartarse del mockup: gana la accesibilidad, y la diferencia se informa.
- Si la 13.5.2-b arranca: se pausa en el último punto con la CI en verde.

## Riesgos

- **R-1**: el marco lo comparten todas las pantallas y casi todos los end-to-end. Se mitiga conservando los nombres accesibles («Principal», «Tema», las tres opciones del tema y «Salir») y listando cada paso que cambia (H-6).
- **R-2**: la barra inferior fija puede tapar botones al final de los formularios largos. Se mitiga con el margen inferior y con un caso que lo comprueba (AC-5).
- **R-3**: las migas de un solo nivel pueden parecer incompletas en las pantallas de detalle hasta la Fase 24. Es una limitación aceptada en D-6.

## Cierre de la subfase 23.1, 2026-10-17

Cierra el 2026-10-17, después del recorrido del usuario en producción («esta todo perfecto, continua»). Es autoevaluación declarada (D-9): ningún agente independiente revisó la entrega.

- **AC-1 a AC-8 cumplidos.**
- **Commits, CI y despliegue**:
  - `2a45cb8`, la apertura de la fase: el Roadmap, este brief y los mockups de `docs/ui-redesign/`.
  - `3873306`, la implementación. CI 39071541179 `success`, leída por el SHA completo.
  - Desplegado el 2026-10-17 según [deploy/production/README.md](../../deploy/production/README.md) §Desplegar, **sin migración**, con `69d3cad` anotado para volver atrás. Después: el servicio `active`, sin advertencias en el journal, `/login` con `200` y `/` con `307`.
- **Lo entregado**:
  - los radios de 12 px en `form-styles.ts` y en los componentes compartidos (D-2);
  - `outlineButtonClass`, con su test, sin aplicar todavía (D-3);
  - el menú en el orden de D-4, con el activo marcado por la barra de 3 px, el texto `primary` y `aria-current`;
  - el menú del usuario en la barra superior y el usuario al pie del panel (D-5), con `useDisclosure` en `disclosure.ts`: Escape, el toque afuera y la navegación lo cierran, y el foco vuelve al botón;
  - las migas «‹organización› / ‹sección›» (D-6), que salen de `nav-links.ts`, con `/cobros` y `/devoluciones` dentro de la caja;
  - la barra inferior debajo de 1024 px (D-7), con «Más» según el rol, destinos de 56 px de alto y el margen inferior del contenido. Antes de hidratar, la barra no aparece y el panel completo queda visible, como sin JavaScript.
- **Los end-to-end que cambiaron**:
  - `frame.spec.ts`: los casos 1 y 2 reescritos, el 2b nuevo (el «Más» de un `viewer`) y el 3 con la marca filtrada por visible, porque ahora está dos veces;
  - `users.spec.ts`, `login.spec.ts` y `sales.spec.ts` abren el menú del usuario antes de «Salir»;
  - los recorridos con teclado de `users`, `clients`, `knowledge` y `products` suben su tope de 16 a 20 tabulaciones, por la parada nueva de las migas.
- **Batería**, sin nada en paralelo:
  - formato, lint, typecheck, build, y 1.581 unitarios y guardas;
  - end-to-end 220 de 227 en una corrida de 36,7 min. Tres fallas eran el tope de tabulaciones (corregido). Cuatro vencieron los 30 s sin una aserción en rojo y pasaron solas: los dos de `receipts.spec.ts`, uno de `sales.spec.ts` y el caso 9 de `clients.spec.ts`, que solo tarda de 18 a 22 s;
  - la integración no corrió en local: la subfase no toca `src/modules/`. La cubrió la CI.
- **Lo que no certifica**:
  - **diez avisos con `rounded-md` escritos en las páginas** (los comprobantes de venta, cobro, devolución y pago, la orden, la recepción y su formulario, el horario y el alta de un usuario) siguen en 6 px, igual que el esqueleto de las conversaciones del cliente y las pestañas del gráfico del dashboard. El alcance 2 cubría `form-styles.ts` y los componentes compartidos; las páginas quedan para la Fase 24;
  - las migas de un solo nivel en las pantallas de detalle (R-3, aceptado en D-6);
  - una revisión independiente: no se pidió (D-9).
- **Volver a `69d3cad` es limpio**: la subfase no tiene migración ni escribe datos.
- **Nivel**: validado en integración (end-to-end sobre `next start` con axe en claro y oscuro, a 1280 y 375 px), desplegado en producción y recorrido por el usuario. No es «preparado para producción».
