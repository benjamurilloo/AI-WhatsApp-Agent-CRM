---
schema: task-brief.v1
task_id: "24.1"
task_type: implementation
generated_at: 2026-10-28
---

# Brief: 24.1 — Marco y patrones

**Estado: aprobado el 2026-10-28 por el usuario, con las recomendaciones de D-1 a D-11.** Eso fija:

- los grupos de D-1, con «Inicio»;
- los grupos abiertos al empezar y recordados en el navegador (D-2, a);
- «Más» con títulos de grupo (D-3, a);
- las migas «‹organización› / ‹grupo› / ‹sección›» (D-4, a);
- el foco con los valores de `primary` (D-5, a);
- `StatusBadge` migrado con el tono de hoy (D-6, a);
- la lista cerrada de rutas sin barra inferior (D-7, a);
- los patrones aplicados en Información (D-8, a);
- lo heredado de la 23.1, que va con cada pantalla (D-9);
- el despliegue con la CI en verde (D-10, a);
- **la revisión independiente antes de desplegar** (D-11, b).

La aprobación no autoriza el commit, el push, el despliegue ni los cambios en Notion: cada uno se autoriza aparte, en el turno en que ocurre.

- **Nivel de evidencia objetivo**:
  - `deterministic`: los tests unitarios de las funciones puras (grupos del menú, sección activa, migas, rutas sin barra inferior) y el cálculo de contraste de este brief;
  - `producer-consumer`: Playwright sobre `next start` contra PostgreSQL real, con axe en claro y en oscuro, a 1280 y a 375 px;
  - `isolated-runtime`: la versión desplegada en producción, recorrida por el usuario.
- **Nivel de validación alcanzable**: **validado en integración** y **verificado en producción**. No certifica «preparado para producción», que sigue siendo el gate de la Fase 13.
- **Orden**: es la primera subfase de la Fase 24 replanificada el 2026-10-28 ([Roadmap](../planning/Roadmap.md), §Fases 23 a 28, tabla de la Fase 24). Va primero porque las otras 18 heredan sus patrones. La 13.5.2-b conserva su prioridad: si arranca a mitad de camino, esta subfase se pausa en el último punto con la CI en verde.

## Objetivo

Que el marco común del CRM y los patrones compartidos sigan la v2 del rediseño ([manifest-v2](../ui-redesign/v2/manifest-v2.md), lotes V2-01 y V2-13, y los [criterios de implementación](../ui-redesign/v2/criterios-implementacion-v2.md)). El marco común es el menú, el «Más» del teléfono, las migas y la barra inferior. Los patrones compartidos son el foco, las insignias de estado, la ficha con su siguiente paso y el formulario con su resumen de errores. Todo esto **sin cambiar ningún dato, consulta, contrato ni permiso**.

## Situación

- **La 23.1** ([brief-23.1](brief-23.1-tokens-y-marco.md)) dejó:
  - un menú plano de 10 a 16 ítems, según el rol y las capacidades;
  - el ítem activo con barra;
  - el menú del usuario en la barra superior;
  - las migas «‹organización› / ‹sección›»;
  - la barra inferior con «Más».
- **La Fase 29** sumó al menú plano Modelos, Grados, Reparaciones, Usados y Turnos.
- **La v2** agrupa la navegación por tarea. El 2026-10-28 el usuario decidió reabrir todo el marco de la 23.1 (Roadmap, regla de la Fase 24).
- **El gate** sigue siendo que la accesibilidad verificada con axe no retrocede.

## Hallazgos antes de diseñar

- **H-1. El borde funcional de la v2 ya existe.** La v2 propone `#817A98` para el contorno de los campos (4,06:1 sobre blanco). El CRM usa `border-strong`, `#7d7799` en claro y `#7a75a0` en oscuro, desde la 15.1: da 4,22:1 sobre `surface` en claro y 4,18:1 en oscuro, y ya lo usan `inputClass`, `selectClass` y `secondaryButtonClass` ([form-styles.ts](../../src/app/_components/form-styles.ts)). No hace falta cambiar ningún token de borde.
- **H-2. El foco es azul desde la 15.1, y la v2 lo pide violeta.** `--focus` vale `#1d4ed8` en claro y `#7cb4f5` en oscuro ([globals.css](../../src/app/globals.css)), y todos los componentes lo usan a través de `outline-focus` con 2 px de separación (`outline-offset-2`). La v2 pide un contorno violeta sólido de 2 px con 2 px de separación. El Roadmap ya pone «foco violeta con separación» en la 24.1. Cálculo propio, con luminancia relativa sRGB sobre los colores opacos de los tokens:

  | Foco contra | Claro, `#6d28d9` | Oscuro, `#a48bfa` |
  |---|---|---|
  | `background` | 6,55:1 | 7,08:1 |
  | `surface` | 7,10:1 | 6,55:1 |
  | `sidebar` | 6,21:1 | 6,85:1 |
  | `surface-muted` | 6,10:1 | 5,96:1 |
  | `primary-soft` | 5,91:1 | 5,09:1 |
  | `danger-soft` | 6,21:1 | 5,83:1 |

  Todos superan los 3:1 que pide un indicador no textual. Con la separación, el contorno queda junto al fondo y no junto al botón violeta, así que también se distingue alrededor de un botón primario. El cálculo no reemplaza a axe ni mide transparencias.
- **H-3. La sección activa se deriva del primer segmento de la ruta** (`sectionHref` en [nav-links.ts](../../src/app/_components/nav-links.ts)). Con destinos que son subrutas, como Recepciones (`/compras/recepciones`) u Horarios (`/informacion/horario`), el primer segmento marcaría Compras o Información. Hace falta buscar el destino de prefijo más largo.
- **H-4. Los destinos directos de la v2 tienen su propio control de rol.** Deudores, Cotización y Horario muestran un aviso de acceso cuando el servicio devuelve `FORBIDDEN` (por ejemplo, [caja/deudores/page.tsx](../../src/app/(autenticado)/caja/deudores/page.tsx)). El menú tiene que mostrarle cada enlace solo al rol que la página ya admite: reorganizar el menú no concede acceso (criterios v2, §Permisos).
- **H-5. Las insignias de estado viven en once archivos, cada una con su implementación.** Por ejemplo, [pedidos/status-badge.tsx](../../src/app/(autenticado)/pedidos/status-badge.tsx) usa caracteres (`●`, `✓`, `✕`) como ícono. Los once archivos:
  - los `status-badge.tsx` de conversaciones, información, pedidos y órdenes de compra;
  - la pausa del agente en `conversation-table.tsx`;
  - `caja/session-tables.tsx`, `clientes/etiquetas/page.tsx` y `productos/stock-status.tsx`;
  - los `sub-nav.tsx` de reparaciones, turnos y usados.

  A eso se suman las tres clases `roleBadgeClass`, `activeBadgeClass` e `inactiveBadgeClass` de `form-styles.ts`. La v2 pide nombre e ícono en todos, con una semántica de color común.
- **H-6. No hay resumen de errores.** Las acciones de los formularios devuelven un `message` y, a lo sumo, un `field`. El formulario marca ese campo con `aria-invalid` y `aria-describedby` y lleva el foco a un aviso al final, como en [knowledge-form.tsx](../../src/app/(autenticado)/informacion/knowledge-form.tsx). La v2 pide un resumen al comienzo, con enlace al campo y el foco en el resumen. Con un solo campo por respuesta, el resumen tiene un ítem como máximo. Para listar varios campos habría que cambiar lo que devuelve cada acción, y eso queda afuera.
- **H-7. No hay «Más acciones».** `DetailHeader` ([detail-header.tsx](../../src/app/_components/detail-header.tsx)) recibe sus `actions` y las pone en fila. En la ficha de una entrada de información, «Editar» y «Desactivar» están al mismo nivel.
- **H-8. La barra inferior aparece en todas las rutas**, y el contenido reserva su alto (`pb-24`) en el `layout.tsx` autenticado. La v2 la retira en el hilo y en los formularios, para que no compita con la tarea.
- **H-9. Los end-to-end que dependen del marco:**
  - el enlace «Dashboard» de la navegación «Principal», en 5 pasos (`dashboard`, `purchase-orders`, `suppliers`, y otros);
  - «Compras» en 5 pasos, «Más» en 3 y el resto en 1 o 2;
  - los recorridos con teclado de `users`, `clients`, `knowledge` y `products`, con su tope de 20 tabulaciones: los botones de los grupos suman paradas antes del contenido;
  - `frame.spec.ts` completo.

  12 de los 43 archivos de `tests/e2e/` nombran la navegación «Principal».

## Decisiones pendientes

### D-1 — Grupos del menú y qué entra de la v2

**Grupos**, en este orden. Cada destino aparece solo si su capacidad y su rol lo permiten. Un grupo sin destinos visibles no se muestra.

| Grupo | Destinos (ruta) | Condición |
|---|---|---|
| — | Inicio (`/`) | todos |
| Atención | Conversaciones, Clientes, Turnos (`/turnos`) | Turnos con `appointments` |
| Catálogo e inventario | Productos, Modelos, Grados, Usados | Modelos con `variants`, Grados con `serialized_units`, Usados con `trade_ins` |
| Servicio técnico | Reparaciones | con `repairs` |
| Comercial | Pedidos, Ventas | todos |
| Finanzas | Caja, Cuentas de clientes (`/caja/deudores`), Tipo de cambio (`/caja/cotizacion`) | según la página (H-4) |
| Abastecimiento | Compras (`/compras/ordenes`), Recepciones, Pagos, Proveedores | solo `admin` |
| Administración | Información, Horarios (`/informacion/horario`), Usuarios | Horarios según la página (H-4); Usuarios, solo `admin` |

**La etiqueta del dashboard**: «Inicio», como en la barra inferior desde la 23.1 y en la v2. El título de la página no cambia.

**Lo que no entra en el marco:**

| Pieza de la v2 | Destino |
|---|---|
| Técnicos en el menú | 24.8.2, que hace su ficha |
| Búsqueda en diálogo con Ctrl/Cmd+K | 24.2 |
| Contador de conversaciones en el menú | 24.3, si mide el contador; lo no leído es de la Fase 26 |
| Análisis junto a Inicio | Fase 25 |
| Campana de notificaciones | fuera: el [Scope](../product/Scope.md) excluye las notificaciones (brief-23.1, D-1) |
| Favoritos, «Personalizar accesos» y la página «Espacio de trabajo» | fuera (Roadmap, «Fuera del rediseño», nota del 2026-10-28) |
| «Buscar un módulo» y el bloque del usuario dentro de «Más» | fuera: son a lo sumo 15 destinos, y el usuario ya está en la barra superior |

*Recomendación: los grupos de la tabla y «Inicio».* Las cuentas a pagar, los medios de pago, la lista de reparaciones y los atributos siguen dentro de la sub-navegación de su sección, como hoy.

### D-2 — Cómo se abren y se cierran los grupos

- (a) **Cada grupo es un botón con `aria-expanded` y `aria-controls`** (patrón de revelación de la APG), con su lista debajo.
  - La primera vez, todos están abiertos.
  - Lo que el usuario cierra se recuerda en `localStorage` de ese navegador, con cada lectura y escritura en `try/catch`. Si el almacenamiento falla, todo queda abierto.
  - El grupo de la página actual se abre siempre.
  - Sin JavaScript, todos quedan abiertos y sin botón.
  - El panel se desplaza solo y el usuario queda visible al pie (manifest-v2, §Decisiones funcionales);
- (b) como (a), pero con los grupos cerrados por defecto salvo el actual. Los end-to-end que clickean un enlace de otra sección tendrían que abrir primero su grupo;
- (c) grupos como títulos fijos, sin abrir ni cerrar.

*Recomendación: (a).* Es lo que dibuja la v2. Con todo abierto al empezar, los pasos de H-9 que clickean un enlace siguen funcionando.

### D-3 — El «Más» del teléfono

- (a) **Un panel sobre la barra**, del alto disponible y con desplazamiento propio, que lista los destinos que no están en la barra, bajo el título de su grupo, con todas las listas abiertas.
  - Sigue siendo la revelación de la 23.1 y no un diálogo modal: Escape, la navegación y el toque afuera lo cierran, y el foco vuelve a «Más».
  - Cada destino mide al menos 44 px de alto;
- (b) como el mockup: acordeones dentro de «Más», con un segundo nivel de botones.

*Recomendación: (a).* Con 15 destinos como máximo, los títulos alcanzan y ahorran un toque por destino. La diferencia con el mockup se declara.

### D-4 — Migas con grupo

La v2 muestra «Comercial / Pedidos / P-000204», sin la organización. La organización está en el `banner` a propósito ([Screens.md](../product/Screens.md), §Reglas comunes, y brief-23.1, H-5): con dos organizaciones en producción, ocultarla invita a confundirlas.

- (a) **«‹organización› / ‹grupo› / ‹sección›»**.
  - El grupo es texto y no enlace, porque no tiene página. Inicio no tiene grupo.
  - Debajo de `sm`, la organización se acorta con puntos suspensivos antes que el grupo y la sección.
  - El nivel del detalle (P-000204) llega con la subfase de cada módulo, que conoce el título de su ficha. Hasta entonces, cada detalle conserva su «Volver a …»;
- (b) como la v2: sin la organización, que pasa al menú del usuario. Contradice Screens.md y tiene que corregirlo con una nota fechada;
- (c) sin cambios: «‹organización› / ‹sección›».

*Recomendación: (a).*

### D-5 — Foco violeta

- (a) **`--focus` pasa a los valores de `primary`**: `#6d28d9` en claro y `#a48bfa` en oscuro, con el contorno de 2 px y la separación de 2 px de hoy, que deja ver el fondo.
  - Ningún componente cambia su clase: todos usan `outline-focus`.
  - El contraste es el de la tabla de H-2.
  - La «separación blanca» de la v2 se lee como esa separación, y no como un anillo blanco pintado, que en oscuro se vería como un borde claro;
- (b) un anillo doble: el contorno violeta más un `box-shadow` de 2 px en `surface`. Asegura la separación sobre cualquier fondo, pero hay que tocar las clases de foco de cada componente.

*Recomendación: (a).* Es un cambio de dos valores, y axe en los dos temas lo verifica (AC-6).

### D-6 — Insignias de estado

- (a) **Un componente compartido, `StatusBadge`**, en `src/app/_components/`.
  - Recibe un tono y un ícono de [icons.tsx](../../src/app/_components/icons.tsx).
  - Los tonos son `success`, `primary`, `warning`, `info`, `neutral` y `danger`, sobre los tokens `*-soft` y `on-*-soft` de hoy, y no sobre los colores de la v2 (brief-23.1, H-1).
  - Reemplaza a las implementaciones de H-5. Cada insignia **conserva el tono que tiene hoy** y cambia el carácter por un ícono SVG.
  - Llevar cada estado a la semántica de color de la v2 (por ejemplo, la caja abierta en verde y la orden de compra abierta en ámbar) queda para la subfase de su módulo, que revisa sus estados con su pantalla;
- (b) como (a), y además aplicar ya la tabla semántica de la v2 en todos los módulos;
- (c) crear el componente y no migrar nada: cada módulo lo adopta en su subfase.

*Recomendación: (a).* Deja un solo componente y un solo vocabulario (criterios v2, P1) sin decidir en bloque el color de 40 estados que no se miraron uno por uno. Si falta un tono que hoy no existe, como el azul de «Reservada», sale de `tag-blue-soft`.

### D-7 — Dónde se retira la barra inferior

- (a) **Una función pura en `nav-links.ts`**, con su test, que dice si una ruta oculta la barra.
  - Las rutas que la ocultan son el hilo (`/conversaciones/‹id›`) y las rutas cuyo último segmento está en una lista cerrada de formularios: `nuevo`, `nueva`, `editar`, `cobrar`, `devolver`, `senar`, `pagar`, `abrir`, `cerrar`, `movimiento`, `anulacion` y `anular`.
  - En esas rutas, el contenido no reserva el alto de la barra.
  - Volver sigue siendo el «Volver a …» de cada página, o el botón atrás del navegador.
  - La lista se revisa contra el árbol de `src/app/(autenticado)` al implementar: una ruta que no está en ella conserva la barra;
- (b) que cada página declare si oculta la barra: toca cada formulario.

*Recomendación: (a).*

### D-8 — Patrones de ficha y de formulario, y dónde se prueban

Los patrones son tres:

- **«Más acciones»**:
  - un botón de revelación (`useDisclosure` de [disclosure.ts](../../src/app/_components/disclosure.ts)) con nombre propio, por ejemplo «Más acciones de la entrada»;
  - despliega enlaces y botones. No es un menú de la APG con flechas: los criterios v2 piden no imponer flechas a todos los controles;
  - las acciones destructivas van al final, en `danger`, y llevan a su confirmación de siempre.
- **El encabezado de ficha** con una acción primaria (la siguiente transición válida), las secundarias visibles y «Más acciones». Es una extensión de `DetailHeader`.
- **El formulario**, con dos piezas:
  - el resumen de errores al comienzo: «Revisá 1 campo para guardar» y un enlace al campo, que recibe el foco después de un envío rechazado (H-6);
  - una barra de guardado al pie del formulario, pegada abajo al desplazarse, con «Cancelar edición» y la acción con su nombre. El documento reserva su alto con `scroll-padding-bottom`, para que el campo enfocado no quede tapado (WCAG 2.4.11).

Las opciones:

- (a) **definirlos y aplicarlos en una pantalla de referencia: Información.** Es el ejemplo de la lámina 03 de V2-13 y tiene ficha y formulario.
  - La ficha de una entrada: «Editar» como primaria y «Desactivar» dentro de «Más acciones». Si la entrada está inactiva, «Reactivar» es la primaria.
  - El alta y la edición (`knowledge-form.tsx`): el resumen de errores y la barra de guardado.

  El resto de Información (las pestañas y la vista previa) sigue en la 24.10;
- (b) definirlos sin aplicarlos: el primer uso llega con la 24.3 o la 24.4.1. Ni axe ni un end-to-end los verificarían en esta subfase.

*Recomendación: (a).* Un patrón sin una pantalla que lo use no se puede recorrer con el teclado ni pasar por axe, y las otras 18 subfases lo heredarían sin verificar.

### D-9 — Lo que hereda la Fase 24 de la 23.1

Lo que la 23.1 dejó pendiente para la Fase 24 se toma en la subfase de cada pantalla, no acá:

- los diez avisos con `rounded-md` escritos en las páginas;
- la densidad de cada pantalla;
- `outlineButtonClass` aplicado pantalla por pantalla.

La 24.1 solo cambia lo que comparten todas.

*Recomendación: así.*

### D-10 — Despliegue a producción

- (a) con la CI del SHA exacto en verde, el usuario autoriza y el despliegue sigue el [README de producción](../../deploy/production/README.md), §Desplegar. No hay migraciones ni cambios en `app.env`. Para volver atrás, el SHA que corre hoy (`0d3c852`, según el [HANDOFF](../../HANDOFF.md));
- (b) no desplegar hasta tener también la 24.2.

*Recomendación: (a),* como en la 23.1.

### D-11 — Revisión

La 24.1 no abre ni cierra un gate y solo cambia la presentación. Pero es la base de 18 subfases.

- (a) autoevaluación declarada, con axe en los dos temas y a dos tamaños como evidencia externa al autor;
- (b) además, una revisión independiente de solo lectura antes de desplegar, contra este brief y contra los criterios v2.

*Recomendación: (b).* Un defecto de un patrón compartido se copia en todas las subfases que lo heredan, y en la 8.4 la autoevaluación no vio cuatro defectos ([CLAUDE.md](../../CLAUDE.md)). Si el usuario prefiere (a), se respeta la regla del Roadmap.

## Alcance incluido

1. Registrar la resolución de D-1 a D-11.
2. **Menú en grupos** según D-1 y D-2:
   - la estructura de grupos y la búsqueda de la sección activa por prefijo más largo (H-3) en `nav-links.ts`, con sus tests;
   - el panel, en `app-nav.tsx`;
   - la lista de destinos, en el `layout.tsx` autenticado, con cada destino condicionado como hoy (capacidad y rol) y los de H-4 según el rol que admite su página.
3. **«Más»** según D-3, en `mobile-nav.tsx`.
4. **Migas con grupo** según D-4, en `breadcrumbs.tsx` y `nav-links.ts`, con el test de la tabla de rutas, incluida una ruta desconocida y una subruta de destino directo.
5. **Foco** según D-5, en `globals.css`, en los tres bloques de tema.
6. **Insignias** según D-6: `StatusBadge` en `src/app/_components/` y la migración de las implementaciones de H-5.
7. **Barra inferior** según D-7, con la función pura y su test.
8. **Patrones** según D-8: «Más acciones», el encabezado de ficha, el resumen de errores y la barra de guardado, en `src/app/_components/`, aplicados en Información (la ficha de la entrada y `knowledge-form.tsx`).
9. **End-to-end**:
   - se actualizan los pasos de H-9;
   - `frame.spec.ts`:
     - a 1280 px, los grupos, abrir y cerrar con el teclado, lo recordado después de recargar, y el grupo actual abierto;
     - a 375 px, «Más» con los títulos de grupo, la barra ausente en un formulario y en el hilo;
     - un `viewer` sin Abastecimiento ni Usuarios;
     - una organización sin capacidades, sin los grupos vacíos;
   - `knowledge.spec.ts`: el resumen de errores con su enlace y el foco, la barra de guardado, y «Más acciones» con Escape y la devolución del foco;
   - axe en claro y en oscuro, a los dos tamaños, en el marco y en las pantallas de Información.
10. **Documentación**: [Screens.md](../product/Screens.md), §Reglas comunes, con una nota fechada que describe el marco nuevo, el foco y los patrones.
11. **Despliegue** según D-10.

## Archivos autorizados

- `src/app/(autenticado)/layout.tsx`.
- `src/app/_components/`:
  - existentes: `nav-links.ts` y su test, `app-nav.tsx`, `mobile-nav.tsx`, `breadcrumbs.tsx`, `detail-header.tsx`, `form-styles.ts`, `icons.tsx` y `disclosure.ts`;
  - nuevos, con sus tests de funciones puras: `status-badge.tsx`, `more-actions.tsx`, `error-summary.tsx` y `form-action-bar.tsx`.
- `src/app/globals.css`.
- Los archivos de las insignias de H-5, solo para reemplazar su marcado por `StatusBadge`.
- `src/app/(autenticado)/informacion/`: `[entryId]/page.tsx`, `[entryId]/entry-actions.tsx` y `knowledge-form.tsx`, y su `messages.ts` si hace falta un texto.
- `tests/e2e/`: los archivos de H-9 y `frame.spec.ts`.
- `docs/product/Screens.md` y este brief.

Tocar algo fuera de esta lista es un hallazgo de la revisión.

## Alcance excluido

- Todo lo que D-1 deja fuera o manda a otra subfase o fase.
- Cambios en `src/modules/`, en las consultas, en las migraciones, en los contratos, en los permisos o en lo que devuelve una acción (H-6).
- Cambios de color en los tokens, salvo `--focus` (D-5). Tampoco cambian la fuente ni el contenedor de cada página.
- Cambiar el tono de un estado (D-6) y el resto del rediseño de Información (24.10).
- Librerías nuevas y cambios en `package.json`. Los íconos que falten se copian de Lucide a `icons.tsx`, como en la 15.1.
- La pantalla de inicio de sesión y el cambio obligatorio de contraseña.

## Invariantes

- Hay una sola navegación «Principal» visible a la vez (brief-23.1, D-7).
- Un enlace del menú nunca lleva a una página que el rol no puede ver (H-4), y cada página sigue verificando la sesión, el rol y la capacidad por su cuenta.
- Sin JavaScript, toda la navegación queda visible y usable.
- Ningún estado depende solo del color: lleva nombre e ícono.

## Criterios de aceptación

- **AC-1**: a 1280 px, el panel muestra los grupos de D-1 en su orden, con los destinos que corresponden al rol y a las capacidades de la organización. Un grupo sin destinos no aparece.
- **AC-2**: los grupos se abren y se cierran con el mouse y con el teclado, con `aria-expanded`. El estado se recuerda al recargar. El grupo de la página actual está abierto, y su destino lleva la barra y `aria-current="page"`, también en una subruta de destino directo, como `/compras/recepciones/‹id›`.
- **AC-3**: las migas muestran «‹organización› / ‹grupo› / ‹sección›» en todas las pantallas autenticadas. La sección coincide con el destino activo.
- **AC-4**: a 375 px, «Más» lista los destinos restantes bajo su grupo, con al menos 44 px de alto. Escape lo cierra y devuelve el foco. Un `viewer` no ve Abastecimiento ni Usuarios. No hay desplazamiento horizontal.
- **AC-5**: la barra inferior no aparece en el hilo ni en las rutas de D-7, y sí en las demás. El último elemento de una pantalla larga no queda tapado.
- **AC-6**: el foco es violeta en claro y en oscuro, y axe no reporta violaciones en el marco ni en las pantallas de Información, en los dos temas y a 1280 y 375 px.
- **AC-7**: todas las insignias de H-5 usan `StatusBadge`, con nombre e ícono SVG, y conservan su tono.
- **AC-8**: en la ficha de una entrada, «Editar» o «Reactivar» es la acción primaria, y «Desactivar» está en «Más acciones», que se abre con el teclado, se cierra con Escape y devuelve el foco.
- **AC-9**: un envío rechazado del formulario de Información conserva lo escrito, muestra el resumen al comienzo con un enlace que lleva al campo, y lleva el foco al resumen. La barra de guardado no tapa el campo enfocado.
- **AC-10**: la CI pasa completa en el SHA que se despliega: lint, typecheck, unitarios, integración, end-to-end y las guardas.
- **AC-11**: desplegado en producción y recorrido por el usuario. Si se elige D-11 (b), con la revisión independiente antes.

## Condiciones de detención

- Si un cambio exige tocar `src/modules/`, una consulta, un permiso o lo que devuelve una acción: se detiene y se consulta.
- Si no se puede saber qué rol admite una página de H-4 sin cambiar código del módulo: ese destino queda fuera del menú y se informa.
- Si axe reporta una violación que no se resuelve sin apartarse de la v2: gana la accesibilidad, y la diferencia se informa.
- Antes de cada commit, del push y del despliegue: cada uno se autoriza en su turno.
- Si la 13.5.2-b arranca: se pausa en el último punto con la CI en verde.

## Riesgos

- **R-1**: el marco lo comparten todas las pantallas y casi todos los end-to-end. Se mitiga:
  - conservando los nombres accesibles («Principal», «Migas», «Más», «Tema» y «Salir»);
  - abriendo todos los grupos al empezar (D-2);
  - listando los pasos que cambian (H-9).
- **R-2**: los botones de los grupos suman tabulaciones antes del contenido. Se mitiga revisando los topes de los recorridos con teclado de H-9, como en la 23.1. Un enlace para saltar al contenido queda como mejora, si el usuario lo pide.
- **R-3**: la migración de las insignias toca once archivos de módulos distintos. Se mitiga con D-6 (a): solo cambia el marcado, no el tono ni el texto.
- **R-4**: `localStorage` puede no estar disponible (navegación privada o bloqueada). Se mitiga con el `try/catch` de D-2 y con todo abierto como valor por defecto.
