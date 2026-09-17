---
schema: task-brief.v1
task_id: 7.4
task_type: implementation
generated_at: 2026-09-17
---

# Brief: 7.4 — Dashboard (pantalla 2)

## Objetivo

Construir la pantalla 2 de [Screens.md §2](../product/Screens.md#2-dashboard) y del [wireframe 02](../product/wireframes/02-dashboard.md): las doce métricas del catálogo, con el selector de período, la zona horaria, el gráfico diario con su tabla alternativa y los tres estados de cada tarjeta bien diferenciados —valor, "Sin datos" y "No disponible"—, sin que ninguno se muestre como `0`.

Es la primera subfase de la Fase 7 que toca `src/app/`, y con ella se cierra la fase: los entregables FR-MET-01 a 03 quedan completos.

## Ubicación en la Fase 7

- **Orden previsto**: 7.1 → 7.2 → 7.3 → **7.4**.
- **Notion**: tarea "7.4 — Dashboard", descripción "M. Pantalla 2, con sin datos y no disponible bien diferenciados". Estado "Bandeja de Entrada" y prioridad media al escribir este brief (verificado el 2026-09-17).
- **Necesario ahora**: la pantalla, su período en la URL, los tres estados por tarjeta, el gráfico con tabla alternativa, el enlace del marco común y los end-to-end con accesibilidad, teclado y móvil.
- **Requisito antes de producción**, fuera de esta subfase: CSP y revisión de seguridad de la pantalla (Fase 8), rendimiento del dashboard con datos de staging (Fase 9).
- **Mejora posterior**: exportar las métricas, comparar períodos, elegir la zona horaria por pantalla (diferida sin fecha en Screens) y cualquier gráfico adicional.
- **Gates de entrada**:
  1. 7.3 cerrada, con la CI en verde en `a66d655` ([ejecución 35272618405](https://github.com/benjamurilloo/AI-WhatsApp-Agent-CRM/actions/runs/35272618405)) y el cierre `9f12977` también en verde ([ejecución 35273335664](https://github.com/benjamurilloo/AI-WhatsApp-Agent-CRM/actions/runs/35273335664)). Verificado el 2026-09-17.
  2. Las doce métricas expuestas por la interfaz pública de `analytics`. Verificado.
  3. Contenedor de PostgreSQL en marcha, y Chromium de Playwright instalado.

## Hallazgos de la verificación previa (2026-09-17)

1. **Estado**: `main` está limpio en `9f12977`, igual que `origin/main`. `analytics` exporta las doce métricas, `resolveMetricsPeriod` y los tipos de sus valores.
2. **La página `/` es provisional y ya estaba destinada a esta fase**: su comentario dice "Página protegida provisional (brief-3.5, D-6). La Fase 7 la reemplaza por el dashboard". Hoy muestra el título "AI WhatsApp Agent CRM" y "Sesión iniciada", y el marco común la enlaza como "Inicio". El wireframe, en cambio, dibuja "Dashboard" como primer enlace. Se resuelve en D-1.
3. **Tres aserciones end-to-end dependen de eso**, y son las únicas: `tests/e2e/users.spec.ts:129` y `:348` esperan un enlace "Inicio" en la navegación, y `tests/e2e/login.spec.ts:85` espera el encabezado "AI WhatsApp Agent CRM" en `/`. Las diez aserciones de `toHaveURL("/")` siguen siendo válidas si el dashboard vive en `/`.
4. **No hay biblioteca de gráficos** entre las dependencias (`next`, `react`, `drizzle-orm`, `pg`, `zod`, `@node-rs/argon2`), y agregar dependencias está fuera de alcance salvo que una decisión lo autorice. Se resuelve en D-4.
5. **No existe ningún `error.tsx` ni `loading.tsx`** en `src/app/`: los estados de carga se hicieron hasta ahora con `Suspense` dentro de la página (pantalla 7). Un `error.tsx` es por ruta, no por tarjeta, así que "el fallo de una métrica no rompe el resto" necesita tratarse tarjeta por tarjeta. Se resuelve en D-2.
6. **El enlace "Definición ›" del wireframe no tiene destino posible hoy**: apunta a la sección de la métrica en `MetricsCatalog.md`, que es un archivo del repositorio y no se sirve desde la aplicación. Se resuelve en D-3.
7. **`analytics` no expone la resolución del período con el reloj de la base**: `resolveMetricsPeriod` es pura y necesita el "hoy" de la organización, que sale de una función interna del repositorio. La pantalla necesita el período ya resuelto y la zona horaria para su encabezado ("Del 13/08/2026 al 11/09/2026", "Zona horaria: …"), así que le hace falta igual. Se resuelve en D-6.
8. **Las convenciones de período de la URL ya existen** en `filters.ts` de las pantallas 8 y 5, con atajos y "personalizado". Ahí el valor por defecto es "todas las fechas"; en métricas eso no existe: un período vacío significa los últimos 30 días completos, no "sin límite" (MetricsCatalog, convenciones). Se resuelve en D-5.
9. **Cada función de métrica autoriza y lee el reloj por su cuenta** (7.1, D-1). Con doce tarjetas eso son doce autorizaciones y doce lecturas de reloj por carga, además de las doce consultas. Es la consecuencia ya aceptada de una lectura por tarjeta; D-6 quita una de esas lecturas del camino crítico y le da a la página el período que muestra.
10. **La métrica 12 va a decir "No disponible" en todos los entornos de hoy**: la ingestión está apagada por defecto y no hay eventos. Es lo correcto (7.3, D-1), así que la pantalla tiene que verse bien en ese estado y el end-to-end lo afirma tal cual.
11. **Las formas de los valores no son uniformes**: la 3 devuelve `{ clients, withoutClient }`, la 6 y la 8 son `RatioMetric` en el nivel de arriba, la 9 tiene la mediana como `RatioMetric` dentro de una estructura con dos conteos, la 11 es un registro de tres estados y la 12 es `RatioMetric` con grupos. La pantalla necesita una forma común de presentar los estados sin aplanar esas diferencias.
12. **Observación fuera de alcance**, pendiente desde la 7.1: el bloque de ESLint de `analytics` no le prohíbe importar `next` ni `@/app/*`. Esta subfase no lo corrige, y conviene no crear el hábito inverso: la pantalla importa de `analytics`, nunca al revés.

## Alcance incluido

1. Registrar la resolución de D-1 a D-6.
2. **Pantalla 2**, en `src/app/(autenticado)/`:
   - las doce métricas del catálogo, en el orden del wireframe, con el nombre y el número de cada una;
   - el encabezado con el período activo resuelto, la zona horaria de la organización y la aclaración de que hoy no se incluye cuando corresponde;
   - el selector de período según D-5, con el período en la URL, y su aviso de período inválido;
   - los tres estados por tarjeta: valor, "Sin datos" y "No disponible", ninguno como `0`;
   - los datos que acompañan a un valor: "N sin cliente" en la 3, promedio y mediana en la 6, "N sin primera respuesta" en la 9, los tres estados de la 11 y la lista de grupos de la 12;
   - el gráfico diario de la métrica 10 según D-4, con su tabla de datos alternativa y la nota de que la serie diaria de "con actividad" no se suma;
   - la carga y el error por tarjeta según D-2;
   - el enlace a la definición de cada métrica según D-3;
   - el enlace del marco común según D-1.
3. **`src/modules/analytics/`**: solo lo que pida D-6 (la resolución del período expuesta en la interfaz pública) con sus tests unitarios. Ninguna consulta ni ningún valor de las doce métricas cambia.
4. **Tests unitarios** de las partes puras de la pantalla, en archivos vecinos, como en las pantallas anteriores: el parseo del período de la URL y sus enlaces, los textos de los estados y la geometría del gráfico.
5. **Tests end-to-end** en `tests/e2e/dashboard.spec.ts`, con datos insertados por SQL, cubriendo:
   - los valores de las doce métricas contra un fixture con su cálculo a mano, coherentes con lo que ya probaron la 7.1 a la 7.3;
   - los tres estados distinguidos en pantalla: una métrica con valor, una "Sin datos" y la 12 "No disponible";
   - el cambio de período por la URL y por el selector, incluido un período inválido;
   - el gráfico y su tabla alternativa, con un día en `0` explícito;
   - `viewer` ve lo mismo que `admin`, y ninguna respuesta —HTML ni RSC— contiene cuerpos de mensajes, teléfonos ni nombres de clientes;
   - accesibilidad con axe en modo claro y oscuro, recorrido por teclado y a 375 px sin desplazamiento horizontal, como el resto de las pantallas.
6. **Evidencia de mutación**, registrada en el brief. Cada cambio se prueba y se restaura:
   - mostrar `0` en lugar de "Sin datos": debe fallar el caso del denominador cero;
   - mostrar "Sin datos" en lugar de "No disponible" en la 12: debe fallar el caso que los distingue;
   - redondear el valor en el servicio en lugar de en la pantalla: debe fallar el valor esperado;
   - quitar la tabla alternativa del gráfico: debe fallar el caso de accesibilidad;
   - hacer que el error de una tarjeta rompa la página: debe fallar el caso de aislamiento de errores.
7. **Documentación**: Screens y el wireframe 02 con lo que resuelvan D-1 a D-5; RepositoryStructure con la fila de la 7.4; TestingStrategy con los casos; Overview si D-2 o D-6 cambian la interfaz de `analytics`; MetricsCatalog si la redacción de un estado cambia; TraceabilityMatrix en la vista de la pantalla 2.

## Alcance excluido

- Cambiar las fórmulas, los valores o los tests de las doce métricas. Si un valor de la pantalla no coincide con el del módulo, gana el módulo y se investiga la pantalla.
- Tablas de agregados, snapshots o caché ([ADR 0005](0005-metricas-desde-datos-transaccionales.md)). Nada de `revalidate` ni de memorización entre requests.
- Métricas nuevas, filtros nuevos (por canal, cliente o estado), comparación de períodos, exportación y cualquier valor editable (FR-MET-03).
- Migraciones, índices, seeds y cambios en otros módulos.
- Dependencias nuevas, salvo que D-4 lo resuelva de otro modo.
- Cambios en `eslint.config.mjs` (hallazgo 12).
- CSP, cabeceras de seguridad y auditoría de dependencias (Fase 8); medición del dashboard con datos de staging (Fase 9).
- Tocar los end-to-end existentes más allá de las tres aserciones del hallazgo 3.

## Archivos o componentes autorizados

Lista cerrada:

- `src/app/(autenticado)/page.tsx` y los archivos nuevos del dashboard en su carpeta, según D-1.
- `src/app/(autenticado)/layout.tsx`, solo el enlace del marco común.
- `src/app/_components/`, solo si una pieza del dashboard es genuinamente compartida.
- `src/modules/analytics/service.ts`, `index.ts` y `service.test.ts`, solo para D-6.
- `tests/e2e/dashboard.spec.ts` (nuevo), y las tres aserciones del hallazgo 3 en `tests/e2e/users.spec.ts` y `tests/e2e/login.spec.ts`.
- Agregados con autorización explícita del usuario durante la ejecución, fuera de la lista original: `playwright.config.ts` y `tests/e2e/dashboard-sin-ingestion.spec.ts`, para poder ejercitar "No disponible" en el navegador.
- Los documentos del punto 7.
- Este brief y su fila en [README.md](README.md).
- `CHANGELOG.md`, `HANDOFF.md` y las líneas de estado de `README.md` y `docs/README.md`, al cerrar.

## Fuentes de verdad

1. [Screens.md §2](../product/Screens.md#2-dashboard) y el [wireframe 02](../product/wireframes/02-dashboard.md): contenido, estados, responsive y accesibilidad.
2. [MetricsCatalog.md](../analytics/MetricsCatalog.md): definición de cada métrica, convenciones, "sin datos", "no disponible" y dónde se redondea.
3. FR-MET-01 a 03 en [FunctionalRequirements.md](../product/FunctionalRequirements.md).
4. [brief-7.1](brief-7.1-metricas-de-volumen.md), [brief-7.2](brief-7.2-metricas-de-respuesta-y-estado.md) y [brief-7.3](brief-7.3-metrica-de-errores-de-ingestion.md): forma de los valores, período, los tres estados y lo que cada métrica mide de verdad. Sus resoluciones se dan por vigentes.
5. Precedentes de UI: [brief-6.4](brief-6.4-ui-de-conversaciones.md) (pantallas de solo lectura, filtros en la URL, end-to-end con axe), [brief-5.3](brief-5.3-ui-de-clientes.md) (H-5 en HTML y RSC) y [brief-4.0](brief-4.0-diseno-visual-base.md) (tokens, modo claro y oscuro).
6. [Overview.md](../architecture/Overview.md) y [RepositoryStructure.md](../architecture/RepositoryStructure.md): frontera de `analytics` y estructura de `src/app/`.

## Dependencias

- 7.3 cerrada (verificado).
- 6.2 cerrada: los seeds de volumen existen, aunque el end-to-end usa sus propios datos por SQL (verificado).

## Resolución (2026-09-17)

El usuario aprobó el brief con D-1 a D-6 según la recomendación: (a) en las seis. También autorizó pasar la 7.4 a "En proceso" en Notion y agregar la fila del brief al índice de decisiones.

Queda registrado que `.claude/skills/` y el cambio de `.gitignore` que los acompaña son cambios ajenos del usuario, anteriores a esta subfase: no entran en su alcance ni en sus commits salvo pedido explícito.

## Decisiones pendientes

Cada decisión trae una recomendación, no una resolución: la resuelve el usuario.

### D-1 — Dónde vive el dashboard y cómo se llama en el marco común

- **Opciones**:
  - (a) **Reemplaza `/`**, y el enlace del marco común pasa de "Inicio" a "Dashboard".
  - (b) **Ruta nueva `/dashboard`**, y `/` redirige a ella.
  - (c) **Ruta nueva `/dashboard`**, y `/` sigue siendo la página provisional.
- **Recomendación**: (a).
  - Es lo que el código ya decía: la página provisional declara que la Fase 7 la reemplaza por el dashboard (brief-3.5, D-6), y el wireframe dibuja "Dashboard" como primer enlace, sin ningún "Inicio".
  - Deja una sola página de entrada después del ingreso, sin una redirección permanente que haya que mantener.
  - (c) deja dos pantallas de inicio y una página sin dueño.
- **Consecuencia**:
  - se tocan las tres aserciones del hallazgo 3: dos esperan el enlace "Inicio" y una el encabezado viejo. Es un cambio de texto en pruebas ajenas a esta pantalla, así que se declara como desvío autorizado y no se toca nada más de esos archivos;
  - las diez aserciones de `toHaveURL("/")` siguen valiendo tal cual.

### D-2 — Carga y error por tarjeta

- **Opciones**:
  - (a) **Una tarjeta, un componente servidor**: cada tarjeta pide su métrica, se envuelve en su propio `Suspense` con su esqueleto y atrapa su propio error para mostrar el estado de fallo con el código de la petición. Las demás siguen visibles.
  - (b) **Una sola lectura en la página** de las doce métricas, con un único estado de carga y un único estado de error.
  - (c) **Tarjetas del lado del cliente**, cada una pidiendo su métrica a un endpoint nuevo.
- **Recomendación**: (a).
  - Es literalmente lo que piden Screens y el wireframe: "cada tarjeta carga por separado, así una métrica lenta no bloquea a las demás", y el error de una no rompe el resto.
  - Encaja con la forma que ya tiene el proyecto: una función por tarjeta (7.1, D-1) y `Suspense` por sección, como en la pantalla 7. No necesita `error.tsx`, que es por ruta y no por tarjeta.
  - (c) agregaría endpoints y estado de cliente sin necesidad, y expondría las métricas por HTTP, que hoy no lo están.
- **Consecuencia**:
  - doce consultas en paralelo por carga, y dos tarjetas pueden diferir en un mensaje que llegue entre sus lecturas: es la consecuencia ya aceptada y documentada en el catálogo;
  - la página muestra el código de la petición en la tarjeta que falla, así que el error se registra con ese mismo identificador;
  - el streaming implica que el HTML inicial no trae los valores. Los end-to-end tienen que esperar cada tarjeta, como ya hacen con las secciones en `Suspense` de la pantalla 7.

### D-3 — El enlace "Definición ›"

- **Opciones**:
  - (a) **La definición en la propia tarjeta**, desplegable, con un texto corto versionado en la pantalla.
  - (b) **Enlace al archivo del catálogo en GitHub**.
  - (c) **Una página nueva de definiciones** dentro de la aplicación, con las doce.
- **Recomendación**: (a).
  - Funciona sin depender de un repositorio privado: un enlace a GitHub le pide al usuario una cuenta con acceso, y quien mire el dashboard no la tiene necesariamente.
  - Un desplegable nativo es accesible por teclado y no necesita ninguna dependencia.
  - Deja la aclaración al lado del número, que es donde importa: sobre todo en la 12, donde hay que decir que solo cuenta los eventos que el CRM aceptó procesar (brief-6.5.1, D-6), y en la 9, donde el valor sigue cambiando mientras llegan respuestas.
- **Consecuencia**:
  - el texto de la definición queda duplicado entre el catálogo y la pantalla, y puede desincronizarse. El catálogo sigue siendo la fuente de verdad: los textos viven en un solo archivo de la pantalla, cortos, y se registra el riesgo;
  - (c) queda disponible como mejora posterior si los textos crecen.

### D-4 — El gráfico de la métrica 10

- **Opciones**:
  - (a) **SVG propio generado en el servidor**, de barras, con la tabla de datos siempre presente y desplazamiento horizontal en móvil.
  - (b) **Una dependencia de gráficos**.
  - (c) **Solo la tabla de datos**, sin gráfico.
- **Recomendación**: (a).
  - El wireframe pide barras por día y una tabla alternativa; con 30 a 366 días es geometría simple, y la parte que calcula las coordenadas se prueba como función pura.
  - Evita una dependencia nueva y el peso de cliente que trae: la pantalla sigue siendo servidor.
  - (c) incumple el wireframe, y la tabla sola no muestra la forma de la serie, que es para lo que existe la métrica 10.
- **Consecuencia**:
  - con 366 días las barras quedan de menos de un píxel: el gráfico usa un ancho mínimo por día y desplazamiento horizontal, también en escritorio;
  - el selector de serie del wireframe (conversaciones o mensajes) se resuelve con el período en la URL, sin estado de cliente.

### D-5 — El selector de período

- **Opciones**:
  - (a) **Atajos y personalizado**, como las pantallas 5 y 8, pero sin "todas las fechas": "Últimos 30 días completos" por defecto, más 7 y 90 días y un rango personalizado con dos fechas. El período viaja en la URL.
  - (b) **Solo dos campos de fecha**, sin atajos.
- **Recomendación**: (a).
  - Repite un patrón que el usuario ya conoce de otras dos pantallas, y el wireframe dibuja un desplegable con el valor por defecto escrito.
  - "Todas las fechas" no puede existir acá: en métricas, un campo vacío no significa "sin límite" (MetricsCatalog), y el máximo es de 366 días.
  - El período en la URL hace que una vista se pueda compartir y sobreviva a recargar, como en las pantallas 3, 6 y 8.
- **Consecuencia**:
  - los atajos se calculan con "hoy" de la organización, que sale del reloj de la base, no del navegador;
  - un período inválido muestra el aviso arriba y marca el campo que falla, con los códigos que ya devuelve el servicio;
  - el rechazo de más de 366 días se muestra como texto, no como un error genérico.

### D-6 — Cómo se resuelve el período una sola vez para las doce tarjetas

- **Opciones**:
  - (a) **`analytics` expone la resolución del período**: una función que autoriza, lee la zona y el reloj de la base y devuelve el período resuelto o su rechazo. La página la llama una vez, muestra el encabezado y, si falla, no pide ninguna métrica.
  - (b) **La página pide las doce y usa el fallo de la primera** para mostrar el aviso.
- **Recomendación**: (a).
  - La pantalla necesita el período resuelto y la zona horaria para su encabezado, así que esa lectura existe de todos modos.
  - Un período inválido es un error de la entrada compartida, no de una métrica: con (b) las doce tarjetas muestran doce errores del mismo problema, y el usuario ve doce veces lo mismo.
  - Evita pedir doce consultas que se van a descartar.
- **Consecuencia**:
  - `analytics` gana una función pública que no es una métrica; queda registrada en Overview;
  - las tarjetas siguen resolviendo su propio período por dentro, así que hay dos lecturas del reloj por carga como mínimo. Si la carga cruza la medianoche local, el encabezado y una tarjeta podrían discrepar en un día: es un caso de un segundo por día, de la misma naturaleza que la falta de atomicidad ya aceptada entre tarjetas, y se registra como límite conocido en lugar de sincronizar el reloj entre las doce.

## Invariantes

- Ningún valor de métrica es editable, y nada se recalcula fuera de los datos transaccionales (FR-MET-03, ADR 0005).
- La pantalla no muestra cuerpos de mensajes, teléfonos ni nombres de clientes, ni en el HTML ni en las respuestas RSC.
- `0`, "Sin datos" y "No disponible" son tres cosas distintas en pantalla, y nunca se muestran una por otra.
- El redondeo es de la presentación: el servicio devuelve los valores sin redondear (7.1, D-3).
- El período se interpreta en la zona de la organización y se muestra junto con esa zona.
- La pantalla importa solo la interfaz pública de `analytics` y de `organizations`, nunca un repositorio ni un esquema.
- `admin` y `viewer` ven lo mismo; la sesión se verifica en la página, no en el layout.
- El gráfico tiene tabla alternativa y los estados de la métrica 11 se nombran con texto, no solo con color.
- Sin dependencias nuevas, migraciones, seeds ni cambios en otros módulos.

## Criterios de aceptación

- **AC-1**: D-1 a D-6 tienen resolución del usuario con fecha.
- **AC-2**: la pantalla muestra las doce métricas con sus valores correctos contra un fixture con el cálculo a mano, en el orden del wireframe, con el período y la zona horaria en el encabezado.
- **AC-3**: un test distingue en pantalla los tres estados entre sí: valor, "Sin datos" y "No disponible".
- **AC-4**: el error de una tarjeta deja visibles las demás, y un período inválido muestra un solo aviso y ninguna métrica.
- **AC-5**: el gráfico tiene su tabla de datos, con los días sin actividad en `0` explícito, y axe no encuentra violaciones WCAG 2.x A ni AA en claro ni en oscuro; el recorrido por teclado funciona y a 375 px no hay desplazamiento horizontal de página.
- **AC-6**: ni el HTML ni las respuestas RSC de `admin` o `viewer` contienen cuerpos de mensajes, teléfonos ni nombres de clientes.
- **AC-7**: las mutaciones del punto 6 quedan registradas: cada una hace fallar el caso previsto, o se registra como defensa redundante con su explicación.
- **AC-8**: `npm run test` pasa completo con los valores de la 7.1 a la 7.3 intactos, `npm run test:e2e` pasa con los casos nuevos, y con el contenedor detenido pasan `typecheck`, `lint`, `format:check`, `test:guards`, `test:unit` y `build`, sin migraciones nuevas.
- **AC-9**: la CI queda en verde en el commit de la subfase, verificada con `gh run view` incluidos sus pasos, y `git status` muestra solo archivos autorizados.

## Pruebas y evidencia requerida

- **`deterministic`**: `npm run test`, para las partes puras de la pantalla y lo que agregue D-6.
- **`producer-consumer`**: `npm run test:e2e`, con la pantalla contra el servicio y la base real.
- **Mutación**: los cinco casos del punto 6.
- **CI**: ejecución en verde.

**Nivel resultante esperado**: **validado en integración** para la pantalla 2, con datos sintéticos. Las doce métricas siguen en **validado localmente y en CI**: esta subfase no eleva su nivel.

**No se valida**:

- el rendimiento del dashboard con volumen ni con varias organizaciones (Fase 9);
- la pantalla con datos reales: no hay emisor conectado, y la métrica 12 va a mostrar "No disponible";
- CSP, cabeceras ni el resto de la revisión de seguridad (Fase 8);
- la exactitud de las métricas, que ya quedó certificada en la 7.1 a la 7.3 y acá solo se comprueba de punta a punta.

La revisión es una autoevaluación (`self_assessment: true`).

## Condiciones de detención

- Si una tarjeta necesita un dato que ninguna de las doce métricas devuelve, o un cambio en una consulta de `analytics`.
- Si el valor que muestra la pantalla no coincide con el del módulo: se investiga la pantalla y se consulta; no se ajusta el módulo para que coincida.
- Si "cada tarjeta carga por separado" resulta imposible sin endpoints nuevos o sin una dependencia.
- Si el gráfico accesible no se puede hacer sin una dependencia.
- Si axe encuentra una violación que exige cambiar los tokens visuales de la 4.0.
- Si hace falta tocar un end-to-end existente más allá de las tres aserciones del hallazgo 3, o cambiar un valor esperado de la 7.1 a la 7.3.
- Si aparece la necesidad de tocar otro módulo, los seeds, una migración o `eslint.config.mjs`.
- Antes de cualquier commit, push o cambio en Notion.

## Ejecución (2026-09-17)

### Lo que se implementó

- **Pantalla 2 en `/`** (D-1), con la página provisional reemplazada y el enlace del marco común renombrado a "Dashboard". Sus piezas viven en `src/app/(autenticado)/_dashboard/`: el período de la URL, los textos de los estados, las definiciones, el formato de los valores, la geometría del gráfico, la tarjeta y una tarjeta por métrica.
- **Una tarjeta, un componente servidor** (D-2): cada una pide su métrica dentro de su propio `Suspense`, y si la consulta falla registra el error en el log y muestra su código en la tarjeta, sin afectar a las otras once.
- **La definición de cada métrica en un desplegable** (D-3), con los doce textos en un solo archivo para que compararlos con el catálogo sea una sola lectura. La de la métrica 12 aclara que solo cuenta los eventos que el CRM aceptó procesar.
- **Gráfico diario en SVG generado en el servidor** (D-4), con la tabla de datos siempre disponible, el ancho creciendo con los días y la serie en la URL. La geometría es una función pura.
- **Selector de período con atajos de 7, 30 y 90 días y rango personalizado** (D-5), sin "todas las fechas".
- **`getMetricsPeriod` en `analytics`** (D-6): resuelve el período compartido sin leer tablas de datos. La pantalla lo llama una vez para el encabezado y, cuando el período no es el de defecto, una segunda vez con las fechas del atajo, porque los atajos necesitan el "hoy" del reloj de la base.

### Un estado que el tipo obligó a cubrir

`RatioMetric` tiene tres casos desde la 7.3, así que las métricas 6, 8 y 9 —que nunca devuelven "no disponible"— igual tenían que tratarlo: el compilador lo pidió. Quedó resuelto con un componente único para los dos estados sin valor, cuyo texto sale de una función pura. Era la consecuencia que anticipaba D-2 de la 7.3, y aparece acá como error de compilación, no como un caso olvidado en pantalla.

### El estado "No disponible" necesitó un segundo servidor de end-to-end

El servidor de end-to-end arranca con `INGESTION_ENABLED=true` y su allowlist, que fijó la 6.5.3 (D-6) para el spec de ingestión. Con la ingestión encendida, la métrica 12 sin eventos es "Sin datos", que es lo correcto, así que "No disponible" no era alcanzable ahí. Se avisó al usuario, que **autorizó tocar `playwright.config.ts`**, fuera de la lista original de archivos de este brief.

La configuración ahora levanta dos servidores sobre la misma base `_e2e` y define dos proyectos: el principal, que ignora el spec nuevo, y `chromium-sin-ingestion`, en el puerto 3101 y con la ingestión apagada, que solo corre `tests/e2e/dashboard-sin-ingestion.spec.ts`. Sus dos casos cubren la regla de D-1 de la 7.3 de punta a punta:

- sin ingestión configurada y sin eventos, la tarjeta dice "No disponible", no dice "Sin datos" ni `0,0 %`, y el resto de la pantalla sigue calculando;
- con eventos registrados muestra su valor, aunque el endpoint esté apagado.

Los tres estados quedan además cubiertos por el unitario de `metricStateText`, por los casos de integración de la 7.3 y por el caso 3 del spec principal, que comprueba la confusión más probable: con la ingestión configurada y sin eventos, "Sin datos" y no "No disponible".

### Evidencia de mutación

Cada mutación se aplicó sola, se reconstruyó la aplicación cuando el cambio era de pantalla, se corrieron los tests que correspondían y se restauró el archivo.

| Mutación | Qué falló |
|---|---|
| Mostrar `0` en lugar del texto del estado | 2 casos end-to-end: el dashboard vacío y el que distingue `0` de "Sin datos" |
| Devolver "Sin datos" donde corresponde "No disponible" | el unitario de `metricStateText` que los distingue |
| Redondear el porcentaje en el servicio en lugar de en la pantalla | 2 casos de integración de la 7.3 y el caso end-to-end del valor de la métrica 12 |
| Quitar la tabla de datos del gráfico | el caso del gráfico diario, que no encuentra la alternativa accesible |
| Dejar que el error de una tarjeta salga de ella | el caso del fallo aislado: sin el `try`/`catch`, la tarjeta desaparece en lugar de mostrar su error |

Las cinco hicieron fallar los casos previstos; ninguna resultó una defensa redundante.

### Verificaciones

- `npm run test`: **707 de 707**, con los valores de la 7.1 a la 7.3 intactos.
- `npm run test:e2e`: **76 de 76**, incluidos los 9 casos nuevos de la pantalla 2 y los 2 del proyecto sin ingestión.
  - La primera corrida completa marcó un fallo en el caso 1 de `clients.spec.ts`, un spec que esta subfase no toca, con la máquina cargada: esa corrida tardó 20,6 minutos. El caso pasa aislado y la corrida siguiente de la suite completa dio 74 de 74 en 3,9 minutos. Queda registrado como intermitente por carga, no reproducido.
- Con el contenedor detenido: `typecheck`, `lint`, `format:check`, `test:guards` (30) y `test:unit` (300) pasan, y `db:generate` no produce migraciones.

### Nivel de validación alcanzado

**Validado en integración** (`producer-consumer`) para la pantalla 2, con datos sintéticos, incluidos los tres estados de una tarjeta. Las doce métricas siguen en **validado localmente y en CI**: esta subfase no eleva su nivel. Falta la verificación de la CI, que necesita autorización para commit y push.

### Pendientes registrados

- El build de end-to-end ahora levanta dos servidores, así que `npm run test:e2e` tarda un poco más y el puerto 3101 queda tomado durante la corrida.
- Los textos de las definiciones están duplicados respecto del catálogo, que sigue siendo la fuente de verdad (D-3).
- El bloque de ESLint de `analytics` no le prohíbe importar `next` ni `@/app/*` (hallazgo 12, fuera de alcance).
- `.claude/skills/` y el cambio de `.gitignore` que los acompaña son cambios del usuario anteriores a esta subfase: quedan sin commitear.

## Cierre (2026-09-17)

- Commit de la subfase: `d1f5c96`, con la CI en verde ([ejecución 35283074243](https://github.com/benjamurilloo/AI-WhatsApp-Agent-CRM/actions/runs/35283074243)) y todos sus pasos verificados con `gh run view`, end-to-end incluido.
- Los nueve criterios de aceptación se cumplen. AC-3 quedó completo en pantalla, incluido "No disponible", gracias al segundo servidor de end-to-end que el usuario autorizó durante la ejecución.
- Dos desvíos, los dos autorizados en el turno: las tres aserciones del hallazgo 3 y el par `playwright.config.ts` + `tests/e2e/dashboard-sin-ingestion.spec.ts`.
- Ninguna condición de detención se activó: ninguna tarjeta necesitó un dato que las métricas no devuelvan, no se tocó ninguna consulta de `analytics`, no hubo dependencias nuevas, migraciones ni cambios en otros módulos, y axe no encontró violaciones.
- Notion: la tarea 7.4 queda en "Completado", y con ella **la Fase 7 cerrada**.
- Siguiente fase: **Fase 8 — Calidad, seguridad y observabilidad**, que verifica CSP, CSRF y XSS, los logs sin datos personales, la auditoría de dependencias y el modelo de seguridad contra el código real.
