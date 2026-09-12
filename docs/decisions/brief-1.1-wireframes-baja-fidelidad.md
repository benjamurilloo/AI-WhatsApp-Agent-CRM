---
schema: task-brief.v1
task_id: 1.1
task_type: design
generated_at: 2026-09-12
---

# Brief: 1.1 — Wireframes de baja fidelidad de las 10 pantallas

## Objetivo

Dibujar un wireframe de baja fidelidad de cada una de las 10 pantallas de [Screens.md](../product/Screens.md), con cada dato anotado con su origen en [DataModel.md](../architecture/DataModel.md). El resultado debe permitir que el usuario apruebe la distribución de cada pantalla y que la 1.2 arme la matriz de trazabilidad sin volver a interpretar las pantallas.

## Ubicación en la Fase 1

- **Orden**: 1.3 (cerrada) → **1.1** → 1.2.
- **Necesario ahora**: layout, datos, acciones por rol y estados de cada pantalla.
- **Lo resuelve la 1.2**: matriz pantalla ↔ FR ↔ tabla ↔ índice ↔ métrica, y las correcciones a `DataModel.md` que salgan de las brechas que detecte esta subfase.
- **Mejora posterior, fuera del MVP de diseño**: alta fidelidad, identidad visual, prototipo navegable.

## Alcance incluido

- Un wireframe por pantalla, con variante de escritorio (≥ 1024 px) y variante móvil (< 640 px). Tablet no se dibuja: es una interpolación entre ambas.
- Por pantalla, además del dibujo:
  - **Tabla de datos**: cada dato visible con su origen, en una de tres formas:
    - `tabla.columna`;
    - `derivado: <regla>`, por ejemplo el estado de stock a partir de `min_stock` y `reorder_point`;
    - `BRECHA`, cuando no existe en el modelo.
  - **Acciones por rol**: qué ve y qué puede hacer `admin` y qué `viewer`.
  - **Estados**: carga, vacío, sin resultados (si hay filtros) y error, cada uno con un boceto mínimo o una descripción breve.
- Un índice de wireframes con el listado de brechas encontradas, que es la entrada de la 1.2.

## Alcance excluido

- Corregir `DataModel.md`, `FunctionalRequirements.md` o `Screens.md`. Una brecha se anota, no se arregla: el arreglo es de la 1.2.
- Matriz de trazabilidad completa y revisión de índices: son de la 1.2.
- Alta fidelidad, colores, tipografía, marca o sistema de diseño.
- Código, componentes, dependencias o herramientas instaladas.
- Servicios externos de diseño (Figma, Excalidraw en la nube u otros).
- Pantallas nuevas que no estén en `Screens.md`.

## Archivos o componentes autorizados

Lista cerrada:

- `docs/decisions/brief-1.1-wireframes-baja-fidelidad.md` (este archivo) y su fila en el índice de `docs/decisions/README.md`.
- `docs/product/wireframes/README.md`: índice, convenciones y listado de brechas.
- `docs/product/wireframes/01-inicio-de-sesion.md` a `docs/product/wireframes/10-usuarios-y-roles.md`: un archivo por pantalla, con la numeración y el nombre de `Screens.md`.
- `docs/product/Screens.md`: solo la línea de estado, para enlazar a los wireframes.
- `CHANGELOG.md` y `HANDOFF.md`, al cerrar la subfase.

## Fuentes de verdad

1. [Screens.md](../product/Screens.md): qué muestra, qué permite y qué oculta cada pantalla. Si un wireframe lo contradice, gana `Screens.md` y la diferencia se anota.
2. [DataModel.md](../architecture/DataModel.md): de dónde sale cada dato.
3. [brief-1.3](brief-1.3-decisiones-de-producto-abiertas.md): D-1 (teléfono), D-2 (vista previa), D-3 (pantalla 10) y D-5 (zona horaria).
4. [MetricsCatalog.md](../analytics/MetricsCatalog.md): tarjetas y gráfico del dashboard.

## Dependencias

La 1.3 está cerrada (commit `626acaf`), así que no queda ninguna decisión de producto abierta que afecte a las pantallas.

## Decisiones pendientes

Hay que resolverlas antes de dibujar. Cada una lleva una recomendación, que no es una resolución.

### W-1 — Formato de los wireframes

- **Opciones**:
  - (a) Markdown en el repositorio, con el layout en bloques de texto monoespaciado (ASCII) y tablas de anotación.
  - (b) HTML estático en el repositorio.
  - (c) Una herramienta externa (Figma, Excalidraw), con exportación a imagen.
- **Recomendación**: (a).
  - Se versiona y se revisa en un diff.
  - No necesita dependencias ni cuentas externas.
  - La baja fidelidad es justamente lo que conviene: obliga a discutir datos y distribución, no estética.
  - Las anotaciones de origen de cada dato, que son lo que consume la 1.2, quedan en el mismo archivo que el dibujo.
- **Consecuencia**:
  - (b) agrega fidelidad que nadie pidió.
  - (c) deja el entregable fuera del repositorio o como imagen binaria, que no se puede comparar línea a línea.

### W-2 — Variantes por pantalla

- **Opciones**:
  - (a) Escritorio y móvil para las 10.
  - (b) Solo escritorio, con una nota de cómo cambia en móvil.
- **Recomendación**: (a). `Screens.md` define un cambio de layout en móvil en casi todas las pantallas (tablas que pasan a tarjetas, formulario arriba e historial abajo), y ese cambio decide qué datos entran en una tarjeta. Una nota no alcanza para aprobarlo.

### Resolución

Resueltas por el usuario el **2026-09-12**, las dos según la recomendación. La respuesta se tomó como aprobación del brief.

| Decisión | Resolución |
|---|---|
| W-1 Formato | (a) Markdown en el repositorio, con layout ASCII y tablas de anotación |
| W-2 Variantes | (a) Escritorio y móvil para las 10 pantallas |

## Brechas ya detectadas al preparar este brief

Se listan para que la 1.1 las confirme en su wireframe y no las redescubra. No se corrigen acá.

- **Pantalla 5, saldo resultante por movimiento**: `inventory_movements` no tiene esa columna. Solo se obtiene recalculando la suma acumulada.
- **Pantallas 6 y 7, última interacción del cliente (fecha y canal)**: `clients` no tiene esa columna. Podría derivarse de `conversations.last_message_at`, pero no hay índice que lo sirva para ordenar la lista.
- **Pantalla 8, cantidad de mensajes**: no hay columna. Es un conteo por conversación.
- **Pantalla 8, filtro y orden por último mensaje**: el índice existente es `(organization_id, status, started_at desc)`, no por `last_message_at`.
- **Pantalla 10, activo o inactivo**: `users.is_active` es global. `organization_members` no tiene estado propio, así que desactivar a alguien en una organización lo desactivaría en todas.

## Invariantes

- Ningún wireframe muestra datos que `Screens.md` prohíbe:
  - el teléfono completo a un `viewer`;
  - vista previa de mensajes;
  - hashes, tokens o contraseñas;
  - la auditoría a un `viewer`.
- Ninguna acción aparece habilitada para un rol que no la tiene.
- No existe acción para editar ni borrar un movimiento de inventario.
- La dirección de un mensaje y los estados nunca se indican solo con posición o color: el wireframe muestra el texto que los identifica.
- Nada fuera del MVP: ventas, compras, proveedores, pagos, caja ni contabilidad.
- Sin Airtable ni referencias al repositorio del agente de WhatsApp.

## Criterios de aceptación

- **AC-1**: existen los 10 archivos de wireframe, uno por pantalla de `Screens.md`, con la misma numeración y nombre.
- **AC-2**: cada wireframe tiene variante de escritorio y variante móvil, según lo que se resuelva en W-2.
- **AC-3**: cada dato visible en cada wireframe figura en su tabla de datos con origen `tabla.columna`, `derivado: <regla>` o `BRECHA`. Ningún dato queda sin anotar.
- **AC-4**: cada wireframe separa lo que ve y hace `admin` de lo que ve y hace `viewer`, y es coherente con la sección "Usuario autorizado" de `Screens.md`.
- **AC-5**: cada wireframe cubre los estados de carga, vacío, sin resultados (si la pantalla tiene filtros) y error que define `Screens.md` para esa pantalla.
- **AC-6**: se cumplen todos los invariantes. Se verifica recorriendo cada archivo contra la lista de invariantes.
- **AC-7**: `docs/product/wireframes/README.md` enlaza los 10 wireframes y lista todas las brechas encontradas, con pantalla, dato y motivo. Incluye las cinco ya detectadas, confirmadas o descartadas con una razón.
- **AC-8**: los enlaces internos del repositorio siguen resolviendo.
- **AC-9**: el usuario aprueba los wireframes. Es el gate de salida de la subfase.

## Pruebas y evidencia requerida

No aplica evidencia ejecutable: es una subfase de diseño, sin código. La evidencia es documental:

- verificación de enlaces internos;
- contraste de cada AC contra los archivos entregados;
- recorrido de invariantes por pantalla.

La revisión es autoevaluación (`self_assessment: true`). Nivel resultante del proyecto: **diseñado**.

## Condiciones de detención

- Antes de dibujar, si W-1 y W-2 no están resueltas por el usuario.
- Si un dato de `Screens.md` no tiene origen claro y anotarlo como `BRECHA` no alcanza, porque la pantalla deja de tener sentido sin él: se detiene y se pregunta.
- Si un wireframe necesitaría contradecir `Screens.md` o una decisión de la 1.3 para ser usable.
- Antes de tocar un archivo fuera de la lista autorizada, incluido `DataModel.md`.
- Antes de commit, push o cambios de estado en Notion.
