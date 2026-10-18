---
schema: task-brief.v1
task_id: "23.2"
task_type: implementation
generated_at: 2026-10-17
---

# Brief: 23.2 — Estados compartidos

**Estado: aprobado el 2026-10-17 por el usuario, con las recomendaciones de D-1 a D-8. Cerrado el 2026-10-18 (§Cierre).** La tarea 23.2 (`3fc702be6f4e812fa2c5d3a5c18bc807`) pasa a «En proceso». La aprobación no autoriza ningún commit, ninguna dependencia nueva ni el despliegue: cada uno se autoriza aparte, en el turno en que ocurre.

- **Nivel de evidencia objetivo**:
  - `deterministic`: los tests unitarios de los componentes nuevos, renderizados con `react-dom/server`;
  - `producer-consumer`: Playwright sobre `next start` contra PostgreSQL real, con axe en claro y en oscuro;
  - `isolated-runtime`: la versión desplegada en producción, recorrida por el usuario.
- **Nivel de validación alcanzable**: **validado en integración** para el vacío, el aviso y los cambios sin guardar; **validado localmente** para la carga y el error, que no tienen un end-to-end (D-4). Desplegado y recorrido. No certifica «preparado para producción», que sigue siendo el gate de la Fase 13.
- **Orden**: segunda subfase de la Fase 23 ([Roadmap](../planning/Roadmap.md), §Fases 23 a 28), después de la 23.1, cerrada el 2026-10-17. La 13.5.2-b conserva su prioridad.
- **No abre ni cierra gate.** Solo presentación y comportamiento del navegador.

## Objetivo

Que los cinco estados que comparten todas las pantallas (vacío, carga, error, aviso después de una acción y cambios sin guardar) se vean y se comporten como los mockups de [docs/ui-redesign/](../ui-redesign/manifest.md) (el sistema visual y los tableros de «Estados y flujos» de cada módulo), **sin cambiar ningún dato, consulta, contrato ni permiso**.

## Situación

La 23.1 dejó el marco y los estilos compartidos. Los mockups dibujan, en cada módulo, un tablero de estados: el vacío con un ícono en un círculo violeta, título, descripción y dos acciones; la búsqueda sin resultados con «Limpiar filtros»; un esqueleto de carga anunciado; un error que se puede reintentar; y la protección frente a cambios sin guardar en la ficha de Información.

## Hallazgos antes de diseñar

- **H-1. No hay estado de carga ni de error a nivel de ruta.** No existe ningún `loading.tsx`, `error.tsx`, `not-found.tsx` ni `global-error.tsx` en `src/app/`.
  - Mientras el servidor arma una página, el navegador sigue mostrando la anterior, sin señal.
  - Una excepción no prevista termina en la página genérica de Next, en inglés y sin el marco.
  - Una URL inexistente fuera de las rutas con id muestra el 404 genérico de Next.
- **H-2. Hay 18 suspensos.** Están en el dashboard (las tarjetas, con `LoadingCard`) y en la ficha del cliente: dos esqueletos propios y dos con el texto suelto «Cargando…».
- **H-3. El vacío ya está, con otra forma.**
  - Unas 18 listas principales (clientes, productos, pedidos, ventas, conversaciones, información, usuarios, etiquetas, las cinco de compras y las cinco de la caja) muestran una tarjeta con un solo texto.
  - El texto vive en constantes `NO_*_MESSAGE` («Todavía no hay clientes.»), y en algunas, junto con «sin resultados», con un enlace «Limpiar filtros».
  - Los vacíos **dentro** de una ficha («Este cliente no tiene pedidos.») son una línea dentro de su tarjeta. El mockup no los dibuja como un estado vacío grande.
  - Ocho pasos end-to-end buscan esos textos.
- **H-4. El aviso después de una acción ya existe.**
  - 24 lugares muestran un párrafo con `noticeClass` (verde, el texto solo): 21 pantallas que leen el aviso de la URL (`?aviso=`) y tres formularios de la conversación que lo muestran después de guardar.
  - Varias lo envuelven en un `role="status"`.
  - En las pantallas sobrevive a recargar, porque vive en la URL, y no se cierra solo, lo que cumple WCAG 2.2.1.
  - El mockup lo dibuja con un ícono de tilde.
- **H-5. Ningún formulario protege los cambios sin guardar.** Hay 27 formularios en `(autenticado)`.
  - La mayoría son cortos y de una acción: cobrar, anular, abrir la caja.
  - Cinco son fichas largas que se editan: cliente, producto, información, horario y proveedor.
  - Next no ofrece una forma de frenar la navegación entre rutas del App Router. Solo está `beforeunload` del navegador, que cubre recargar, cerrar la pestaña y salir a otro sitio.
- **H-6. Los tests unitarios corren en `node`, sin DOM** (`vitest.config.ts`, proyecto `unit`, solo `*.test.ts`). Un componente se puede probar renderizándolo a texto con `react-dom/server`, que ya está instalado, sin dependencias nuevas.
- **H-7. La importación por CSV no existe** (es la Fase 14). El vacío del mockup de Clientes ofrece «Importar CSV»: un botón sin destino no entra.

## Decisiones pendientes

### D-1 — Qué entra y dónde

| Estado | Destino recomendado | Motivo |
|---|---|---|
| Vacío y sin resultados de las listas principales (H-3) | **23.2**: el componente y su aplicación en las 18 listas | es el estado más visible y el cambio es mecánico |
| Vacíos dentro de una ficha | **Fase 24**, con cada pantalla | el mockup no los dibuja grandes |
| Carga de una ruta (H-1) | **23.2**: un `loading.tsx` genérico en `(autenticado)` | da señal en todas las pantallas a la vez |
| Esqueleto con la forma de cada pantalla | **Fase 24** | depende del diseño de cada una |
| Los «Cargando…» sueltos de la ficha del cliente (H-2) | **23.2** | el texto suelto no se anuncia |
| Error recuperable y página no encontrada (H-1) | **23.2** | hoy cae en la página genérica de Next |
| Aviso después de una acción (H-4) | **23.2**: un componente que reemplaza el párrafo en los 24 lugares | es mecánico y ya funciona |
| Cambios sin guardar (H-5) | **23.2**, en las cinco fichas | el mockup lo pide en Información, y las demás fichas son iguales |
| «Importar CSV» en el vacío | **Fase 14** | la función no existe (H-7) |
| Desconexión de WhatsApp y sincronización | **fuera** | lo excluye el [ADR 0014](0014-el-agente-de-whatsapp-como-consumidor-del-crm.md) (Roadmap, «Fuera del rediseño») |

*Recomendación: la tabla tal como está.*

### D-2 — El estado vacío

Un componente `EmptyState`, con el ícono de la sección en un círculo `primary-soft`, un título, una descripción y hasta dos acciones (la primaria y la de borde de la 23.1, `outlineButtonClass`).

- **Textos**:
  - (a) **el título es el `NO_*_MESSAGE` de hoy**, sin cambiar. La descripción y las acciones son nuevas. Los ocho pasos end-to-end siguen pasando y el texto conocido no cambia de golpe;
  - (b) los textos del mockup («Aún no hay clientes»): cambian las 18 constantes y los ocho pasos.

  *Recomendación: (a).*
- **Acciones**:
  - en el vacío, «Nuevo ‹x›» solo si el rol puede crear: el mismo criterio que el botón de la cabecera;
  - en el «sin resultados», «Limpiar filtros» con el borde violeta, que vuelve a la lista sin parámetros, y «Nuevo ‹x›» con la misma condición;
  - una lista de solo lectura (las de la caja que no se crean desde ahí) no lleva acción.
- **Semántica**: el título es un párrafo destacado, no un encabezado, para no romper la jerarquía de cada página; el ícono es decorativo.

### D-3 — La carga

- (a) **un `loading.tsx` en `(autenticado)`**, con un esqueleto genérico: la barra del título y cinco filas, dentro del marco. Lleva `role="status"` y el texto «Cargando…» para un lector de pantalla, con `aria-busy`. Con `prefers-reduced-motion`, sin animación. Los dos «Cargando…» sueltos de la ficha del cliente pasan a un esqueleto en línea con el mismo texto accesible;
- (b) un `loading.tsx` por sección, con la forma de cada lista: es el trabajo de la Fase 24 adelantado.

*Recomendación: (a).* El esqueleto genérico se reemplaza pantalla por pantalla en la Fase 24.

*Nota del 2026-10-17, durante la implementación (decisión del usuario)*: **(a) se descarta.** Con `loading.tsx`, cada pantalla autenticada llega por streaming, y sin JavaScript el contenido queda oculto detrás del esqueleto: los dos primeros casos «sin JavaScript» de la suite completa vencieron, y sin el archivo pasan en 4,0 y 2,9 s. El usuario eligió **una barra de progreso** en su lugar (`navigation-progress.tsx`): desde el clic en un enlace interno o el envío de un filtro GET hasta que cambia la URL, una barra fina arriba y «Cargando…» en una región `aria-live="polite"` sin rol. Con `role="status"`, la región vacía, que está siempre en el marco, sumaba un segundo «status» a cada pantalla y rompía los 13 casos que buscan el aviso con `getByRole("status")`. Sin JavaScript no aparece y todo funciona como antes. El esqueleto en línea de la ficha del cliente se conserva. Los esqueletos con la forma de cada pantalla siguen en la Fase 24, sin `loading.tsx` mientras haya casos sin JavaScript.

### D-4 — El error y la página no encontrada

- **`error.tsx` en `(autenticado)`**, dentro del marco:
  - un título («No pudimos cargar esta pantalla»), una explicación y dos acciones: «Reintentar» (`reset()` junto con `router.refresh()`) y «Ir al inicio»;
  - si Next da el `digest`, se muestra como «Código: …», el mismo identificador que queda en el log del servidor, para buscarlo;
  - **nunca muestra el mensaje de la excepción**: puede tener datos.
- **`not-found.tsx` en la raíz**, en castellano, con «Ir al inicio». Las rutas con id siguen con su `PageNotice` de hoy.
- **`global-error.tsx` mínimo**, para un error en el propio layout, sin el marco (no se puede usar) y con los estilos en línea.
- **Cómo se prueba**:
  - (a) **render unitario** de los tres componentes con `react-dom/server`: el texto, los botones y que el mensaje de la excepción no aparece. Además, una pasada a mano con una excepción provocada en local, que no se commitea. El end-to-end del 404 sí corre, con una URL inexistente;
  - (b) una ruta de prueba que lanza solo en el end-to-end: suma superficie expuesta en producción, y la guarda `exposed-surface` la rechazaría.

  *Recomendación: (a).* La carga y el error quedan **validados localmente**, no en integración, y así se declara.

### D-5 — El aviso después de una acción

- (a) **un componente `ActionNotice`** con el tilde, el texto de hoy y `role="status"`, que reemplaza `<p className={noticeClass}>` en los 24 lugares. Sin cierre automático (WCAG 2.2.1). Sin botón de cerrar: desaparece en la navegación siguiente, como hoy;
- (b) lo mismo, más un «Cerrar» que vuelve a la URL sin `?aviso=`;
- (c) una notificación flotante que se va sola: contradice WCAG 2.2.1 y no funciona sin JavaScript.

*Recomendación: (a).*

### D-6 — Los cambios sin guardar

Un hook `useUnsavedChanges(form)` en las cinco fichas de H-5 (alta y edición). Marca el formulario como modificado cuando un campo difiere de su valor inicial, y deja de estarlo al enviar.

- (a) **`beforeunload` y los enlaces internos**:
  - `beforeunload` cubre recargar, cerrar la pestaña y salir del sitio;
  - un clic en un enlace interno (el menú, las migas, «Volver a …») pregunta con `confirm`, con el texto «Tenés cambios sin guardar. ¿Salir igual?»;
  - el botón «Atrás» del navegador **no se cubre**: el App Router no lo permite sin interceptar el historial;
- (b) solo `beforeunload`;
- (c) ningún aviso.

*Recomendación: (a).* Sin JavaScript no hay aviso, como hoy.

*Nota del 2026-10-17, ajuste del recorrido en producción (decisión del usuario)*: el `confirm` del navegador se reemplaza por **un diálogo del sistema** (`unsaved-changes-dialog.tsx`), un `<dialog>` modal con los tokens: título «Tenés cambios sin guardar», texto «Si salís ahora, se pierden.» y dos botones, «Seguir editando», con el foco inicial, y «Salir sin guardar». Esc equivale a seguir editando. Al salir, se repite el clic en el enlace frenado, así navega el enlace de Next con su barra de progreso. Recargar o cerrar la pestaña sigue con el aviso del navegador: `beforeunload` no deja mostrar uno propio. El fondo del diálogo usa un token nuevo, `--overlay`, porque la paleta de Tailwind está vaciada (`--color-*: initial`) y `bg-black` no existe.

### D-7 — Despliegue a producción

- (a) como la 23.1: con la CI del SHA exacto en verde y la autorización del usuario, según el [README de producción](../../deploy/production/README.md), §Desplegar. Sin migraciones. Para volver atrás, `3873306`;
- (b) esperar a la 23.3.

*Recomendación: (a).*

### D-8 — Revisión

- (a) autoevaluación declarada, con axe en los dos temas sobre el vacío, el sin resultados, el aviso y el 404;
- (b) además, una revisión independiente de solo lectura.

*Recomendación: (a).* La subfase no abre ni cierra un gate.

## Alcance incluido

1. Registrar la resolución de D-1 a D-8.
2. **`EmptyState`** según D-2 en `src/app/_components/`, aplicado en las 18 listas principales de H-3, con su test unitario.
3. **Carga** según D-3: ~~`loading.tsx` en `(autenticado)` y un componente `Skeleton` compartido~~ la barra de progreso de la nota de D-3; los dos «Cargando…» de la ficha del cliente.
4. **Error** según D-4: `error.tsx` en `(autenticado)`, `not-found.tsx` y `global-error.tsx` en la raíz, con sus tests unitarios.
5. **`ActionNotice`** según D-5, en los 24 lugares de H-4.
6. **`useUnsavedChanges`** según D-6, en las fichas de cliente, producto, información, horario y proveedor.
7. **Íconos**: los que falten, copiados de Lucide en `icons.tsx`, como en la 23.1.
8. **End-to-end**:
   - un caso de vacío y de sin resultados con sus acciones y axe, en clientes, que es el molde;
   - los ocho pasos de H-3 siguen pasando sin cambios (D-2, a);
   - el aviso de una acción con su tilde y `role="status"`;
   - el 404 en castellano;
   - los cambios sin guardar: un enlace interno pregunta y «Cancelar» se queda; sin cambios, no pregunta; después de guardar, no pregunta.
9. **Documentación**: [Screens.md](../product/Screens.md), §Reglas comunes, con una nota fechada sobre los cinco estados.
10. **Despliegue** según D-7.

## Alcance excluido

- Todo lo que D-1 manda a la Fase 14 o a la 24, o deja fuera.
- Los textos de los `NO_*_MESSAGE` (D-2, a).
- Cambios en `src/modules/`, en las consultas, en las migraciones, en los contratos o en los permisos.
- Librerías nuevas y cambios en `package.json`.
- Los formularios cortos de una acción: cobrar, anular, abrir y cerrar la caja, etcétera (H-5).

## Criterios de aceptación

- **AC-1**: las 18 listas muestran el vacío y el sin resultados con el ícono, el título de hoy, una descripción y las acciones de D-2, según el rol.
- **AC-2**: mientras una pantalla carga, se ve el esqueleto, y un lector de pantalla anuncia «Cargando…». *Desde la nota de D-3*: se ve la barra de progreso, con el mismo anuncio, y sin JavaScript nada cambia.
- **AC-3**: una excepción no prevista muestra el error dentro del marco, con «Reintentar», «Ir al inicio» y el código, sin el mensaje de la excepción. Lo prueba el render unitario y una pasada a mano.
- **AC-4**: una URL inexistente muestra el 404 en castellano con «Ir al inicio».
- **AC-5**: el aviso después de una acción lleva el tilde y `role="status"` en los 24 lugares.
- **AC-6**: en las cinco fichas, con un cambio sin guardar, un enlace interno pregunta antes de salir y `beforeunload` está activo. Sin cambios, o después de guardar, no pregunta.
- **AC-7**: axe sin violaciones en el vacío, el sin resultados, el aviso y el 404, en claro y en oscuro, a 1280 y a 375 px.
- **AC-8**: la CI pasa completa en el SHA que se despliega.
- **AC-9**: desplegado en producción y recorrido por el usuario.

## Condiciones de detención

- Si un estado exige tocar `src/modules/`, una consulta o un permiso: se detiene y se consulta.
- Si `loading.tsx` cambia lo que un end-to-end espera de la navegación de forma que no se resuelve sin tocar el test: se informa antes de cambiarlo.
- Si axe reporta una violación que no se resuelve sin apartarse del mockup: gana la accesibilidad, y la diferencia se informa.
- Si la 13.5.2-b arranca: se pausa en el último punto con la CI en verde.

## Riesgos

- **R-1**: `loading.tsx` envuelve cada página en un suspenso. Puede cambiar el orden en que llegan las partes y afectar a un end-to-end que lee el cuerpo, como el caso 9 de `clients.spec.ts`, que ya está cerca de su límite de tiempo. Se mitiga corriendo la suite completa sola y mirando ese caso.
- **R-2**: el `confirm` de los cambios sin guardar es un diálogo del navegador: no se puede estilizar como el mockup. Un diálogo propio exige un foco atrapado y manejo de Escape, y no suma lo suficiente para esta subfase. *Nota del 2026-10-17*: el recorrido en producción mostró que sí sumaba; ver la nota de D-6. `<dialog>` con `showModal` atrapa el foco y maneja Esc de forma nativa.
- **R-3**: el error y la carga quedan validados localmente, no en integración (D-4). Una regresión en `error.tsx` solo la vería el render unitario.

## Cierre de la subfase 23.2, 2026-10-18

Cierra el 2026-10-18, después del recorrido del usuario en producción («Listo, ahora si esta bien»). Es autoevaluación declarada: ningún agente independiente revisó la entrega, porque la subfase no abre ni cierra un gate.

- **Dos decisiones del usuario durante la subfase**, con su nota fechada:
  - **D-3**: `loading.tsx` se descartó en la implementación. Sin JavaScript, el contenido que llega por streaming quedaba oculto detrás del esqueleto. La reemplaza la barra de progreso de `navigation-progress.tsx`;
  - **D-6 y R-2**: en el recorrido en producción, el `confirm` del navegador pasó a un diálogo del sistema (`unsaved-changes-dialog.tsx`).
- **AC-1, AC-2, AC-4 y AC-6 a AC-9 cumplidos.**
- **AC-3 cumplido**, con la pasada a mano del 2026-10-18:
  - un `throw` temporal en `/productos` se probó sobre `next start`, sin commit, y se revirtió y reconstruyó después;
  - mostró el error dentro del marco, con «Reintentar», «Ir al inicio» y el código `685634101`, sin el mensaje de la excepción en el HTML;
  - «Reintentar» volvió a fallar, como corresponde, e «Ir al inicio» salió del error.
- **AC-5 con un desvío declarado**: `ActionNotice` lleva el tilde, pero no un `role="status"` propio. Los 24 avisos ya están dentro de una región que anuncia, `role="status"` o `aria-live`, y un rol más las anidaría.
- **D-2 con un matiz**: los textos son «Crear el primero» en el vacío y «Limpiar filtros» en el sin resultados, que no repite «Nuevo».
- **Commits, CI y despliegues**:
  - `c25dbc4`, este brief con el cierre de la 23.1. CI 39075405511 `success`;
  - `0a0cc79`, la implementación. CI 39083707647 `success`, leída por el SHA completo. Desplegado el 2026-10-17 con `3873306` anotado para volver atrás;
  - `acdd402`, el diálogo del sistema. CI 39090775540 `success`, leída por el SHA completo. Desplegado el 2026-10-18 con `0a0cc79` anotado;
  - los dos despliegues siguieron [deploy/production/README.md](../../deploy/production/README.md) §Desplegar, **sin migración**. Después de cada uno, `/api/health` y `/login` con `200` y una dirección inexistente con `404` y la pantalla nueva. Después del segundo, el CSS publicado trae `--overlay` en claro y en oscuro.
- **Lo entregado**:
  - `EmptyState` en las 18 listas, con descripción y acciones según el rol (D-2);
  - `ActionNotice` en los 24 avisos (D-5);
  - `InlineSkeleton` en la ficha del cliente, y la barra de progreso en el marco, con «Cargando…» en una región `aria-live` sin rol (D-3). Con `role="status"`, la región vacía rompía los 13 end-to-end que buscan el aviso con `getByRole("status")`;
  - `error.tsx` en `(autenticado)`, `global-error.tsx` y `not-found.tsx`, sobre `error-panel.tsx` (D-4);
  - `useUnsavedChanges` y el diálogo del sistema en las fichas de cliente, producto, información, horario y proveedor (D-6), con un token nuevo, `--overlay`.
- **Batería**, sin nada en paralelo:
  - formato, lint, typecheck, build, 889 unitarios y 711 guardas;
  - end-to-end completo sobre `0a0cc79`: 228 de 231. Las tres fallas fueron intermitentes, cada una pasó en una de dos repeticiones:
    - el caso 9 de `clients.spec.ts`, el intermitente conocido;
    - el caso 8 de `dashboard.spec.ts`;
    - el caso 19.3 de `orders.spec.ts`, que se pasó de los 30 s sin un paso colgado;
  - después del diálogo, los end-to-end de las cinco fichas y del marco: 90 de 90, con axe con el diálogo abierto;
  - la integración no corrió en local: la subfase no toca `src/modules/`. La cubrió la CI.
- **Lo que no certifica**:
  - la barra de progreso no cubre el botón «Atrás» del navegador ni los envíos que guardan, que ya muestran su «Guardando…»;
  - el aviso al recargar o cerrar la pestaña sigue siendo el del navegador: `beforeunload` no deja mostrar uno propio;
  - no se comparó `orders` 19.3 contra `c25dbc4`, así que no se descarta del todo que la 23.2 lo haga más lento;
  - los esqueletos con la forma de cada pantalla quedan para la Fase 24, sin `loading.tsx` mientras haya casos sin JavaScript;
  - una revisión independiente: no se pidió.
- **Volver a `0a0cc79` o a `3873306` es limpio**: la subfase no tiene migración ni escribe datos.
- **Nivel**: validado en integración (end-to-end sobre `next start` con axe en claro y oscuro, a 1280 y 375 px), desplegado en producción y recorrido por el usuario. No es «preparado para producción».
