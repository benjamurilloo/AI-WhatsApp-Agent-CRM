---
schema: task-brief.v1
task_id: 24.5.1-b
task_type: implementation
generated_at: 2026-11-01
---

# Brief 24.5.1-b — Anchos que dependen del contenedor, no de la ventana

- **Estado**: **aprobado el 2026-11-01 por el usuario, con las recomendaciones** («apruebo el brief
  con las recomendaciones»). Quedan tomadas así: **D-1 la subfase es la 24.5.1-b**; **D-2 el selector
  se arregla en los dos llamadores, no en `selectClass`**; **D-3 consulta de contenedor con umbral
  `@md` (448 px)**; **D-4 dos columnas iguales sin mover tarjetas**; **D-5 hay revisión
  independiente**; **D-6 la tabla de unidades no se toca y la frase vencida se corrige**. P-1, P-2 y
  P-3 siguen abiertos y no los decide esta subfase.
- **Origen**: tres defectos que encontró el usuario recorriendo pantallas **ya cerradas** de la
  24.5.1, el 2026-11-01, después del cierre de la 24.5.2-b. No los encontró ninguna prueba, ninguna
  autoevaluación ni la revisión independiente de la 24.5.1.
- **Tamaño**: chica. Cuatro archivos de código, tres de ellos de una o dos líneas.

## Objetivo

Que el ancho de las listas de definición y de los selectores se decida por **el ancho real de su
contenedor** y no por el de la ventana, y que el resumen del producto use las dos columnas iguales
de la lámina 09. Corrige los tres defectos observados y la causa común que los produce.

Sin datos nuevos, sin lecturas nuevas, sin migraciones. Es un cambio de presentación.

## Situación: tres síntomas, una sola causa

El usuario reportó tres cosas, en dos capturas:

| # | Lo que se ve | Dónde |
|---|---|---|
| S-1 | Las tarjetas del resumen «están muy separadas» y hay **espacios vacíos** que podrían evitarse | `/productos/[id]` (lámina 09) |
| S-2 | Las tarjetas de la columna derecha **parten las palabras**: «Sin cost / o», «US$ 399, / 00», «Por unid / ad, con / IMEI» | `/productos/[id]` (lámina 09) |
| S-3 | El selector de moneda **es más grande que la tarjeta** «Fijar precio» y queda fuera visualmente | `/productos/[id]/precios` (lámina 12) |

Los tres salen del mismo error: **un punto de quiebre de ventana decidiendo una medida dentro de una
columna de grilla**. En un diseño de una sola columna no se nota; en cuanto la tarjeta entra en una
columna angosta, se rompe.

### La aritmética, hecha sobre el código

El contenedor de página es `max-w-6xl px-4 lg:px-8` (`page.tsx`, `<main>`), la grilla es
`lg:grid-cols-3 gap-6` y la tarjeta es `p-5 sm:p-6` (`section-card.tsx:27`):

| Paso | A 1440 px de ventana | En la ventana de la captura (1082 px) |
|---|---|---|
| Ancho de contenido | 1152 − 64 = **1088** | 1082 − 288 (panel lateral) − 64 = **730** |
| Columna angosta (1 de 3, dos huecos de 24) | (1088 − 48) / 3 = **346,7** | (730 − 48) / 3 = **227,3** |
| Dentro de la tarjeta (−48 de relleno) | **298,7** | **179,3** |
| Valor de la lista de definición (−128 de etiqueta −24 de hueco) | **146,7** | **27,3** |

**27 px para escribir «Sin costo».** Por eso se parte en «Sin cost / o»: `break-words` hace
exactamente lo que se le pidió cuando la palabra no entra. El síntoma S-2 queda explicado con un
número, no con una impresión.

Para S-3, el mismo cálculo al revés: el selector pide **384 px** fijos (`sm:w-96`) dentro de
**298,7** disponibles. Sobresale unos **85 px**, que es lo que se ve en la captura.

## Hallazgos antes de diseñar

- **H-1 — `selectClass` no tiene ancho y `inputClass` sí.** En `src/app/_components/form-styles.ts`:
  `control` (línea 8) no declara ancho; `inputClass` (línea 18) agrega `w-full min-w-0`;
  `selectClass` (línea 49) agrega solo el anillo de foco. Un `<select>` sin ancho cae en
  `width:auto`, que el navegador resuelve por **la opción más larga**. La asimetría es de origen y
  es la que deja al selector expuesto a que cada llamador invente su ancho.

- **H-2 — Los dos llamadores inventaron el mismo ancho equivocado.**
  `productos/[productId]/precios/price-form.tsx:126` y `productos/[productId]/costos/cost-form.tsx:126`
  son la misma línea copiada: `` className={`${selectClass} sm:w-96`} ``. Hoy solo se nota en
  precios, porque en costos esa tarjeta va a lo ancho; es el mismo defecto esperando que alguien
  mueva la tarjeta a una columna.

- **H-3 — `DetailList` decide dos columnas con un punto de quiebre de ventana.**
  `src/app/_components/detail-list.tsx:17` usa `sm:grid-cols-[minmax(8rem,auto)_1fr]`: a partir de
  **640 px de ventana**, dos columnas, mida lo que mida el contenedor. Lo usan **siete pantallas**,
  y en tres de ellas cae dentro de la columna angosta de una grilla de tres:
  - `productos/[productId]/page.tsx` (tarjetas Precio, Costo y margen, Stock);
  - `pedidos/[orderId]/page.tsx:314` y `:355` (tarjetas Cliente y Estado; las líneas 313 y 354 son
    sus `SectionCard`: la cita estaba corrida en uno y lo marcó la revisión independiente, NB-5);
  - `ventas/[saleId]/page.tsx:367`.
  Las otras cuatro —`compras/proveedores/[supplierId]`, `informacion/[entryId]`, `usuarios/[memberId]`
  y `productos/[productId]/costos/cost-summary.tsx`— lo usan en tarjetas anchas y hoy se ven bien.

- **H-4 — La lámina 09 dibuja dos columnas iguales; la implementación usa dos tercios y un tercio.**
  Verificado en `docs/ui-redesign/v2/05-productos/desktop/09-ficha-producto-resumen-v2.png`: la fila
  de contenido son dos tarjetas del mismo ancho («Inventario por estado» y «Datos del producto») y
  debajo, franjas a todo lo ancho. La implementación, de `f3a37f1` (24.5.1), usa `lg:grid-cols-3`
  con la columna principal en `lg:col-span-2`.
  **La diferencia 13 de la comparación visual de la 24.5.1** ([brief-24.5.1](brief-24.5.1-productos-catalogo-y-ficha.md),
  línea 313) declaró que la columna derecha **conserva** Imagen, Precio, Costo y margen y Stock,
  que la v2 no dibuja. Eso declara **el contenido** de esa columna, no **su ancho**. El ancho nunca
  se declaró como diferencia, así que corregirlo no reabre ninguna decisión aprobada: la acerca a
  la lámina.

- **H-5 — Tailwind 4.3.3 trae consultas de contenedor y el proyecto no las usa en ninguna parte.**
  Verificado: cero ocurrencias de `@container` en `src/`. `docs/product/Screens.md:14` fija el
  responsive **por ventana** (escritorio desde 1024, tablet 640–1023, móvil por debajo de 640) y no
  dice nada sobre contenedores. No hay contradicción —una cosa es la pantalla y la otra una tarjeta
  adentro—, pero sí un vacío: si esta subfase introduce la primera consulta de contenedor del
  proyecto, la convención se escribe, o la próxima pantalla vuelve a elegir `sm:` por costumbre.

- **H-6 — Una afirmación vencida en un documento de nivel 3, que conviene corregir acá.**
  [brief-24.5.2](brief-24.5.2-unidades-panel-historial-y-filtros.md), línea 521, dice que el
  desplazamiento horizontal de la tabla de unidades a 1440 px **«sigue pendiente, sin subfase»**.
  La medición de **esa misma subfase**, tres secciones más abajo (línea 654), dice que con las
  acciones dentro del menú «···» y sin las columnas Origen y Alta la tabla **entra** a 1440 y a
  1280 px. Verificado en el código: `unidades/page.tsx` importa `MoreActions` (línea 53) y la tabla
  tiene siete encabezados, no nueve. **La frase está vencida**: quedó escrita al cerrar la 24.5.2-b
  mirando el estado anterior al segundo despliegue de la 24.5.2. No hay nada que arreglar en la
  tabla; hay una frase que corregir.

## Decisiones a tomar, con mi recomendación

- **D-1 — Numeración y nombre.** **Recomiendo `24.5.1-b`**: los tres defectos son de pantallas de la
  24.5.1 (láminas 09 y 12), y el sufijo `-b` ya es la convención del proyecto para un desprendimiento
  de una subfase (24.5.2-b). La alternativa, abrir una «24.5.4 Ajustes visuales», mezclaría en una
  bolsa cosas sin relación entre sí; acá los tres defectos comparten causa.

- **D-2 — Dónde se arregla el selector.** **Recomiendo arreglarlo en los dos llamadores**
  (`w-full sm:max-w-96` en lugar de `sm:w-96`), **no en `selectClass`**. Agregar `w-full` a
  `selectClass` tocaría **106 usos en 39 archivos** de un solo golpe, y hay selectores que hoy se
  dimensionan por contenido **a propósito**: los tres filtros de `productos/page.tsx` usan
  `max-w-48`. Ensanchar todos los selectores del sistema no es un ajuste visual, es un rediseño de
  formularios, y no entra en una subfase chica. Queda anotado como candidato propio.

- **D-3 — El umbral de `DetailList`.** **Recomiendo una consulta de contenedor con umbral `@md`
  (448 px)**: un envoltorio con `@container` y `@md:grid-cols-[minmax(8rem,auto)_1fr]` en lugar de
  `sm:`. Elijo 448 y no 384 (`@sm`) porque **reproduce casi exactamente la conducta de hoy** donde
  hoy funciona: una tarjeta a todo lo ancho con 640 px de ventana tiene unos 560 px útiles (dos
  columnas, igual que hoy), y con 500 px de ventana unos 420 (una columna, igual que hoy). Con 384
  habría tarjetas que pasarían a dos columnas en tablet, donde hoy van en una: un cambio que nadie
  pidió. Con 448, lo único que cambia es la columna angosta, que es lo que está roto.
  **Corregido el 2026-11-01 por el bloqueante B-1 de la revisión independiente**: el razonamiento de
  arriba era correcto en los dos anchos que miré —640 y 500— y **falso en el medio**. Una tarjeta a
  todo lo ancho mide la ventana menos 74 px, así que desde **522 px de ventana** el contenedor ya
  llegaba a 448 y armaba dos columnas donde antes iba en una: una franja de 118 px que toca seis
  pantallas que esta subfase no puede editar. La regla final exige **las dos condiciones a la vez**
  (`sm:@md:`): la ventana llega a 640 **y** el contenedor llega a 448. Debajo de 640 px nada cambia
  respecto de antes, y arriba de 640 hay dos columnas solo si el hueco da el ancho. Medido después
  del arreglo, sobre la tarjeta ancha de `/costos`: 640 px → contenedor 558 → dos pistas, como
  antes; 600 → 526 → una; 560 → 486 → una; 522 → 448 → una; 500 → 426 → una. La franja desapareció.

- **D-4 — El reparto de la ficha.** **Recomiendo dos columnas iguales (`lg:grid-cols-2`), sin mover
  ninguna tarjeta de columna.** Es lo que dibuja la lámina 09 y, además, ataca S-1 y S-2 juntos: la
  columna derecha pasa de 298,7 a unos 532 px útiles, con lo que el texto deja de envolverse, las
  tarjetas se achican de alto y el hueco al pie se reduce solo.
  **Mover tarjetas entre columnas para emparejar los altos queda explícitamente fuera**: cambia la
  arquitectura de información que el usuario ya recorrió y aprobó, y eso no se decide de paso en
  una corrección visual. Si después de medir el hueco sigue molestando, es una decisión suya con su
  propio turno.

- **D-5 — Revisión independiente.** **Recomiendo que sí, acotada.** CLAUDE.md la exige cuando la
  subfase abre o cierra un gate, y esta no lo hace: no sería una omisión saltarla. La recomiendo
  igual por un motivo concreto: el cambio toca **un componente compartido por siete pantallas**, y
  tres de ellas quedan fuera de la lista de archivos autorizados. Una revisión de solo lectura
  cuesta poco y mira justamente eso.

- **D-6 — Qué se hace con el desplazamiento de la tabla de unidades (H-6).** **Recomiendo no
  incluirlo como arreglo** —no hay nada roto— y sí **incluir la corrección de la frase vencida**,
  con su fecha y su motivo, sin borrar lo anterior, como ya se hizo con otras correcciones de este
  proyecto.

- **D-7 — El reparto de tarjetas entra, y D-4 queda enmendado.** *Decidido por el usuario el
  2026-11-01, durante la implementación* («dale, aplicá el reparto nuevo»), después de que la
  medición mostrara que **D-4 no alcanzaba**: con las dos columnas iguales el hueco a 1440 px pasó
  de 898 a **963 px**, es decir que empeoró. La causa, medida por tarjeta: **«Imagen» sola mide
  804 px, el 47 % de su columna, y su marco cuadrado crece con el ancho**, así que ensanchar la
  columna derecha la agrandó más de lo que achicó a las otras tres. Una diferencia de 963 px entre
  dos columnas no la arregla ningún reparto de anchos.
  El reparto nuevo es: **izquierda, Información básica e Imagen; derecha, Precio, Costo y margen,
  Stock, Logística y Ubicación**. Proyectado sobre los altos ya medidos —las dos columnas miden lo
  mismo, así que mover una tarjeta no le cambia el alto—, el hueco baja a **51 px a 1440, 187 a
  1280 y 266 a 1082**: entre 78 % y 94 % menos.
  Esto **enmienda la exclusión de D-4**, que decía que mover tarjetas quedaba fuera porque cambia
  la arquitectura de información. La exclusión cumplió su función: frenó la decisión hasta que
  hubo medición y hasta que la tomó el usuario, que es de quien era. El costo aceptado es que
  Logística y Ubicación pasan a la columna derecha, al lado de Precio y Stock.
  **Una consecuencia que el reparto arrastra y conviene decir**: en el teléfono las dos columnas se
  apilan, así que el orden de lectura cambia. Era Información básica, Logística, Ubicación, Imagen,
  Precio, Costo y margen, Stock; pasa a ser Información básica, Imagen, Precio, Costo y margen,
  Stock, Logística y Ubicación. Logística y Ubicación quedan al final, que es donde menos molestan
  —son peso, medidas, ubicación y estante, casi siempre vacíos—, pero es un cambio real para quien
  usa el teléfono y entra en el recorrido.
  La alternativa que se descartó: ponerle un tope a la tarjeta «Imagen» dejando todo en su lugar,
  que baja el hueco solo a unos 560 px a 1440 y exige tocar un archivo fuera de la lista cerrada.

## Alcance incluido

1. El ancho del selector de moneda en «Fijar precio» y en «Fijar costo» (D-2).
2. El umbral de `DetailList`, de ventana a contenedor (D-3).
3. Las dos columnas iguales del resumen del producto (D-4) y, desde el 2026-11-01, **el reparto de
   tarjetas entre las dos columnas** (D-7).
4. La medición del hueco al pie de la columna más corta, antes y después.
5. Una prueba de punta a punta que mida los tres puntos anteriores, en `tests/e2e/products.spec.ts`.
6. La comparación visual contra las láminas 09 y 12, con las diferencias numeradas.
7. La verificación —sin editar— de las otras cuatro pantallas que usan `DetailList`.
8. Las tres correcciones documentales: la frase vencida (H-6), la convención nueva (H-5) y la nota
   en la comparación visual de la 24.5.1 (H-4).

## Alcance excluido

- **Agregar ancho a `selectClass`** y, en general, tocar `form-styles.ts` (D-2).
- ~~**Mover tarjetas entre columnas** en el resumen del producto (D-4).~~ **Entró el 2026-11-01**,
  por decisión del usuario tomada con la medición delante (D-7). Lo que sigue fuera es **agregar,
  sacar o rediseñar una tarjeta**: solo cambia en qué columna va cada una.
- **Editar `pedidos/[orderId]`, `ventas/[saleId]`** y las otras pantallas que usan `DetailList`: se
  verifican, no se tocan.
- **La tabla de unidades** y cualquier otro ajuste de la 24.5.2 (D-6).
- **La lámina 02, «Alta y edición de producto»**, que sigue sin subfase asignada (P-1, heredado).
- Toda migración, tabla, columna, contrato o lectura nueva. Es la primera regla de la Fase 24.
- Cualquier cambio de texto, de permisos o de qué ve cada rol.

## Archivos autorizados (lista cerrada)

| # | Archivo | Qué se toca |
|---|---|---|
| 1 | `src/app/_components/detail-list.tsx` | El envoltorio `@container` y el umbral `@md` (D-3) |
| 2 | `src/app/(autenticado)/productos/[productId]/page.tsx` | `lg:grid-cols-3` → `lg:grid-cols-2` y las clases de columna (D-4) |
| 3 | `src/app/(autenticado)/productos/[productId]/precios/price-form.tsx` | Línea 126, el ancho del selector (D-2) |
| 4 | `src/app/(autenticado)/productos/[productId]/costos/cost-form.tsx` | Línea 126, lo mismo (D-2) |
| 5 | `tests/e2e/products.spec.ts` | La prueba de medición |
| 6 | `docs/decisions/brief-24.5.1-b-anchos-por-contenedor.md` | Este brief |
| 7 | `docs/decisions/brief-24.5.1-productos-catalogo-y-ficha.md` | Nota en la diferencia 13 (H-4) |
| 8 | `docs/decisions/brief-24.5.2-unidades-panel-historial-y-filtros.md` | La frase vencida de la línea 521 (H-6) |
| 9 | `docs/product/Screens.md` | La convención de anchos por contenedor (H-5) y las dos columnas del resumen |
| 10 | `docs/planning/Roadmap.md` | La fila de la subfase |
| 11 | `CHANGELOG.md` | La entrada del cierre |
| 12 | `HANDOFF.md` | **Agregado el 2026-11-01 por autorización del usuario** («Autorizo HANDOFF.md, corregilo»), a pedido de NB-3 de la revisión: el estado nuevo, y las dos afirmaciones que quedaron falsas —«no queda nada pendiente» y el desplazamiento de la tabla «sin revisar»— |

Tocar cualquier otro archivo es un hallazgo bloqueante en la revisión, no una mejora. Si hace falta
uno más, **se para y se pide la ampliación en el turno**.

## Fuentes de verdad

1. El código y lo que mide el navegador.
2. `docs/ui-redesign/v2/05-productos/desktop/09-ficha-producto-resumen-v2.png` y `12-precios-historial-v2.png`.
3. [brief-24.5.1](brief-24.5.1-productos-catalogo-y-ficha.md) (sus diferencias declaradas siguen en pie salvo la 13, que se anota), `docs/product/Screens.md`.
4. Las reglas de la Fase 24 en [Roadmap.md](../planning/Roadmap.md): sin migraciones, tablas ni contratos nuevos.

Ante conflicto entre la lámina y una diferencia ya declarada de la 24.5.1, **manda la diferencia
declarada**: fue una decisión aprobada. Lo que no esté declarado se acerca a la lámina.

## Dependencias

Ninguna nueva. Producción corre `1e26d3a` con las 67 migraciones de siempre.

## Pendientes, que no decide esta subfase

- **P-1 — La lámina 02 sigue sin subfase asignada.** Heredado de la 24.5.2-b.
- **P-2 — Si «ganancia bruta estimada» y «margen bruto estimado» entran al catálogo de métricas.**
  Heredado de la 24.5.2-b.
- **P-3 — Si `selectClass` debería traer su propio ancho** (D-2). Nuevo acá, no se decide acá.

## Invariantes

- Sin migraciones, tablas, columnas, contratos ni lecturas nuevas.
- **Lo que hoy anda sin JavaScript sigue andando sin JavaScript.**
- Ningún cambio de texto visible, de permisos ni de qué ve cada rol.
- Las clases nuevas salen de los tokens existentes: ni un color, ni un radio, ni una sombra nueva.
- Las cuatro pantallas que hoy usan `DetailList` en tarjetas anchas **se ven exactamente igual**.
- Las áreas táctiles conservan sus 44 px de lado donde ya los cumplían.

## Criterios de aceptación

| id | Criterio |
|---|---|
| **AC-1** | El selector de moneda de «Fijar precio» y el de «Fijar costo» **no sobresalen de su tarjeta**: medido en el navegador, el borde derecho del selector es menor o igual que el borde derecho del contenido de la tarjeta, a 1082, 1280, 1440 y 390 px de ventana |
| **AC-2** | Donde hay lugar, el selector **no pierde ancho**: a 1440 px mide los 384 px que pedía antes, o el ancho útil de la tarjeta si es menor |
| **AC-3** | En la ficha del producto, cada `<dl>` de la columna angosta resuelve **una sola pista** de grilla cuando su contenedor mide menos de 448 px, y dos cuando mide más. Medido con `getComputedStyle(dl).gridTemplateColumns`, no a ojo |
| **AC-4** | Las tarjetas Cliente y Estado de `pedidos/[orderId]` y la lateral de `ventas/[saleId]` quedan en una columna, sin palabras partidas, verificado con captura. **Ningún archivo de esas dos pantallas se edita** |
| **AC-5** | En tarjetas anchas la lista de definición **no cambia**: dos columnas a 640 px de ventana y una por debajo, igual que hoy, verificado en las cuatro pantallas que la usan así |
| **AC-6** | El resumen del producto usa **dos columnas de igual ancho** desde `lg`, como la lámina 09 |
| **AC-7** | El hueco al pie de la columna más corta del resumen **baja al menos a la mitad**, medido a 1082, 1280 y 1440 px, con los dos números —antes y después— escritos en el cierre |
| **AC-8** | A 320 px no hay desplazamiento horizontal del documento en las tres pantallas tocadas (`html.scrollWidth` = `innerWidth`) y **axe no reporta ninguna violación nueva** |
| **AC-9** | Las áreas táctiles siguen con 44 px de lado mínimo donde ya lo cumplían |
| **AC-10** | Comparación visual contra las láminas 09 y 12, con las diferencias numeradas; las ya declaradas por la 24.5.1 que esta subfase no cambia se citan y se mantienen |
| **AC-11** | Batería local completa en verde, y **CI en `success` sobre el SHA exacto que se despliega**. Un `cancelled` no es `success`, y un commit solo de documentación recorta la batería: no cuenta |
| **AC-12** | Revisión independiente de solo lectura contra este brief (D-5), con sus hallazgos verificados contra el código antes de aceptarse |
| **AC-13** | Recorrido del usuario sobre producción, anotado con su fecha |
| **AC-14** | La frase vencida de [brief-24.5.2](brief-24.5.2-unidades-panel-historial-y-filtros.md) línea 521 queda corregida con fecha y motivo, **sin borrar lo anterior** (H-6) |
| **AC-15** | `docs/product/Screens.md` anota la convención: **dentro de una columna, el ancho se decide por contenedor y no por ventana** (H-5) |

## Mediciones

Todas del 2026-11-01, en Chromium sobre el build de producción, con sesión real y PostgreSQL de
desarrollo. Ninguna es una estimación: cada número sale de `getBoundingClientRect` o de
`getComputedStyle`.

### El hueco al pie de la columna más corta del Resumen (AC-7)

| Ventana | Antes | Con dos columnas iguales (D-4) | Con el reparto (D-7) |
|---|---|---|---|
| 1440 px | 898 px | 963 px | **51 px** |
| 1280 px | 855 px | 819 px | **187 px** |
| 1082 px | 1189 px | 740 px | **266 px** |

**Cómo se midió el «antes»**: reponiendo sobre la misma página las declaraciones que emitían las
clases anteriores —tres columnas, la principal ocupando dos, la lateral en la tercera, y la regla
de ventana de la lista de definición—. Es una **reconstrucción**, no una corrida del build viejo, y
se declara como tal. Se calibra contra una medición real del build anterior: la captura que mandó
el usuario, tomada a 1082 px, donde el hueco mide unos 1345 px leídos sobre la imagen (±20). La
reconstrucción da 1189 para el mismo ancho; la diferencia es de datos, no de método —el producto
de la prueba no tiene atributos de variante ni movimientos, así que sus dos columnas son más
cortas—. Mismo orden de magnitud, misma conclusión.

La reconstrucción **dejó de ser válida** en cuanto D-7 movió las tarjetas: reproducir la grilla
vieja sobre el reparto nuevo describe una pantalla que nunca existió. Por eso se sacó de la prueba
y en su lugar quedó un **tope de 350 px** sobre el hueco, que es lo que sirve de acá en adelante:
si alguien agrega o mueve una tarjeta de este resumen, el equilibrio se rompe y la prueba lo dice.

### De qué está hecho cada columna, a 1440 px

```
izquierda: Información básica 355 · Imagen 804                                      = 1183
derecha:   Precio 198 · Costo y margen 286 · Stock 330 · Logística 162 · Ubicación 162 = 1234
```

**«Imagen» mide 804 px: más que las tres tarjetas que antes formaban la columna izquierda juntas.**
Su marco de «Sin imagen» es cuadrado, así que crece con el ancho de la columna: por eso igualar los
anchos agrandó el hueco en vez de cerrarlo, y por eso ninguna combinación de anchos lo resolvía.

### El selector de moneda (AC-1 y AC-2)

Entra en su tarjeta en `/precios` y en `/costos`, a 1440, 1280, 1082 y 390 px: su borde derecho
nunca pasa el borde interior de la tarjeta. Y ocupa lo disponible hasta el tope de 384 px — a
1440 px mide 297, que es el ancho útil de una tarjeta en una columna de un tercio. Antes pedía
384 px fijos ahí: **sobresalía unos 85**.

### Las listas de definición (AC-3, AC-4 y AC-5)

La regla —dos pistas si y solo si el contenedor llega a 448 px— se verifica en **siete anchos de
ventana** sobre el resumen y los costos del producto, y en cuatro sobre el pedido y la venta:

| Pantalla | Contenedor | Pistas |
|---|---|---|
| Pedido, tarjetas Cliente y Estado, a 1440 / 1280 / 1082 / 390 px | 297 / 254 / 188 / 316 px | 1 en los cuatro |
| Venta, tarjeta Cliente, a 1440 / 1280 / 1082 / 390 px | 297 / 254 / 188 / 345 px | 1 en los cuatro |

Antes, esas mismas tarjetas armaban **dos** columnas en contenedores de 188 a 297 px, que es el
defecto que el usuario vio en el producto. **Ningún archivo de pedidos ni de ventas se tocó**: lo
arregló el componente compartido.

## Observaciones, declaradas y no corregidas

**O-1 — `npm run lint` y `format:check` fallan por cosas ajenas a esta subfase, y la CI no las ve.**
Medido el 2026-11-01: `lint` devuelve **749 errores**, todos de `.claude/skills/impeccable/scripts/`,
que `.gitignore:49` excluye con `.claude/skills/*`; nunca llegan al repositorio ni a la CI.
`format:check` marca **17 archivos del módulo `service`** que están **en LF en el índice y en CRLF
en la copia de trabajo** (`git ls-files --eol` devuelve `i/lf w/crlf`), así que Prettier local los
ve mal formateados y el de la CI, sobre Linux, no. Los cinco archivos de esta subfase pasan lint y
formato. **No se tocó ninguno de los 17**: están fuera de la lista cerrada y arreglarlos es ruido
en el diff.

**La causa está identificada y tiene arreglo de una línea**: este repositorio tiene
`core.autocrlf = true` y **no tiene `.gitattributes`**, mientras Prettier usa su valor por omisión,
`endOfLine: "lf"`. Entonces todo archivo que Git *saca* al disco queda en CRLF y Prettier lo marca;
los que quedaron en LF son los que escribió la herramienta y Git todavía no tocó. Es decir: **no
son 17 archivos defectuosos, es cualquier archivo después de un `checkout`**, y el aviso
«LF will be replaced by CRLF» aparece también sobre los archivos de esta subfase. Versionar un
`.gitattributes` con `* text=auto eol=lf` lo cierra para siempre y es independiente de esta
subfase; queda **propuesto y sin hacer**, porque `.gitattributes` no está en la lista cerrada y
crear un archivo en la raíz del repositorio no es un ajuste visual.

**O-2 — «Guardar imagen» mide 40 px de alto, por debajo de los 44 de WCAG 2.2 (2.5.8).** Es
**anterior** a esta subfase: ninguno de los cinco controles cambia de tamaño con este cambio, que
no toca ni sus clases ni su tipografía. *Precisado el 2026-11-01 por NB-4 de la revisión*: decía
«a 390 px el resumen se dibuja igual que antes», y eso es falso — en el teléfono las columnas se
apilan y **el orden de lectura sí cambió** con D-7. Lo que no cambia son los altos de los
controles, que es de lo que habla esta observación.
Su formulario está fuera de la lista cerrada. Queda **fijado en la prueba**: el caso 27 declara los
cinco controles de menos de 44 px que hay hoy, de modo que aparezca uno más o se achique alguno, la
prueba falla. De los otros cuatro suele decirse que son «enlaces de texto en línea, que el criterio
exceptúa»; *anotado por NB-8*: la excepción «inline» del 2.5.8 habla de un destino **dentro de una
oración** o cuyo tamaño fija el interlineado del texto que lo rodea, y estos cuatro son enlaces
sueltos, cada uno en su propio párrafo. **La excepción es discutible**, no evidente. No cambia nada
de esta subfase —los cinco son anteriores— pero la justificación no es tan firme como sonaba.

**O-3 — A 1280 px la lista de «Información básica» pasa a una sola columna.** Consecuencia directa
del umbral de 448 px de D-3 combinado con las dos columnas iguales: a 1280 el contenedor mide
404 px. Medido: la tarjeta pasa de 355 a 547 px de alto. No está roto —es exactamente lo que D-3
pide— y de hecho **achica el hueco**, pero es un cambio visible en una pantalla común. Bajar el
umbral a 384 px lo evitaría, a cambio de que algunas tarjetas pasen a dos columnas en tablet, que
es lo que D-3 decidió evitar. **Se deja como está** y se informa en el recorrido.

**O-4 — La medición de pedidos y ventas se hizo con un instrumento temporal.** AC-4 pide verificar
dos pantallas cuyos archivos esta subfase no puede editar. Se escribió
`tests/e2e/medicion-temporal.spec.ts`, se corrió, se guardaron sus capturas fuera del repositorio y
**se borró**. No queda versionado, igual que el instrumento de capturas de la 24.5.2.

**O-5 — `/ventas/[saleId]` desborda 13 px a 390 px de ancho, por una causa distinta y anterior.**
Lo encontró el instrumento de O-4, que además de medir las listas pregunta qué elementos se salen.
Los culpables son **el `<article>` del comprobante y la tabla que lleva adentro**: el artículo mide
403 px en una ventana de 390. Es un ítem de grilla **sin `min-w-0`**, y un ítem de grilla tiene
`min-width: auto`, así que el ancho mínimo de la tabla lo estira por encima de su columna. No es la
confusión de ventana y contenedor de esta subfase: es otra, la de dar por hecho que un hijo de
grilla se encoge solo. **No se toca**: `ventas/[saleId]/page.tsx` está fuera de la lista cerrada.
El arreglo, cuando se decida, es una clase sobre ese artículo. Queda anotado y sin subfase.

**O-6 — Una prueba de rendimiento ajena falló por contención, con la máquina compartida.** El
2026-11-01, `tests/integration/supplier-payments.test.ts` falló en «un proveedor con 2.000
recepciones y 3.000 pagos… quedan bajo el umbral» mientras en la misma máquina corrían un `build` y
una tanda de Playwright que **yo mismo había dejado en paralelo**. Corrido solo, el archivo pasa
**28 de 28**. La batería quedó 1.893 de 1.894 en la corrida solapada y completa al reponer esa.
No es una regresión ni una observación sobre el proyecto: es un error de procedimiento mío, y la
lección es la de siempre con las pruebas que miden tiempo — no se las corre compitiendo por CPU.

## Revisión independiente (AC-12 y D-5)

Hecha el 2026-11-01 por un agente que no participó de la implementación, de solo lectura, contra
este brief y contra las reglas del proyecto. **Veredicto: R1**, con un bloqueante, nueve no
bloqueantes y cuatro criterios pendientes del cierre. El revisor declaró su propia limitación: **no
tenía Bash**, así que no corrió pruebas ni navegador y todo lo que exige medición lo marcó «no
verificable por lectura». La revisión **no autoriza nada**; sus hallazgos se verificaron contra el
código antes de aceptarse, y uno resultó falso.

### El bloqueante, verificado y corregido

**B-1 — El umbral de 448 px sí cambiaba el dibujo de seis pantallas que esta subfase no puede
editar, en la franja de 522 a 639 px de ventana.** Es real y es el hallazgo que justifica la
revisión entera. El invariante decía que las cuatro pantallas con tarjetas anchas «se ven
exactamente igual», y AC-5 decía «dos columnas a 640 px y una por debajo, igual que hoy»: **las dos
afirmaciones eran falsas** en esa franja.

Lo verifiqué midiendo antes de aceptarlo, no deduciendo: a **522 px de ventana el contenedor da
448 justos** y armaba dos pistas; a 500, 426 y una. La aritmética del revisor (contenedor = ventana
− 74, por `px-4`, el borde de la tarjeta y `p-5`) resultó exacta.

**Dos agravantes que el revisor señaló y que son ciertos.** Primero, **la condición de detención 3
de este brief** —«el umbral de D-3 cambie el dibujo de alguna de las seis pantallas que no se
editan»— tendría que haberse disparado y no se disparó. Segundo, **la prueba no podía verlo, por
dos motivos a la vez**: los siete anchos del caso 27 salteaban la franja justo por los dos extremos
(640 y 500), y la aserción derivaba lo esperado de la propia medición —`contenedor >= 448 ? 2 : 1`—
así que comprobaba la regla nueva y **nunca** el invariante «igual que hoy».

**Corregido**, y sin tener que pedirle al usuario que acepte una regresión: la regla pasa a exigir
**las dos condiciones a la vez**, `sm:@md:`. Debajo de 640 px de ventana nunca hay dos columnas
—idéntico a antes de esta subfase— y arriba de 640 las hay solo si el contenedor llega a 448. La
prueba ahora encierra el invariante en el valor esperado (`dosPistas(ventana, contenedor)`, con el
término de la ventana adentro) y mide **diez** anchos, con 600, 560 y 522 dentro de la franja.

### Los no bloqueantes

| id | Hallazgo | Qué se hizo |
|---|---|---|
| NB-1 | El tope de 350 px del hueco no detecta mover una tarjeta chica, y el comentario lo presentaba como total | **Corregido**: tope de 300 px y el comentario dice qué cubre y qué no |
| NB-2 | La misma afirmación vencida seguía viva en otra línea del mismo documento (`brief-24.5.2:619`) | **Corregido**, con la lección: la corrección anterior arregló una aparición y no buscó las demás |
| NB-3 | `HANDOFF.md` quedó contradiciendo la entrega | **Corregido** el 2026-11-01, con el archivo agregado a la lista cerrada por autorización del usuario en el turno |
| NB-4 | Contradicción interna: O-2 decía «se dibuja igual a 390 px» y D-7 dice que el orden de lectura cambió | **Corregido** el texto de O-2 |
| NB-5 | Dos citas de línea de H-3 corridas en uno | **Corregido** |
| NB-6 | «El tope de 384 px del selector no lo prueba nada» | **Falso, verificado**: ver abajo |
| NB-7 | Un filtro que, si se rompiera, dejaría las aserciones de `/costos` sobre una lista vacía | **Corregido**: la prueba exige que la lista no esté vacía en cada pantalla y cada ancho |
| NB-8 | La excepción «inline» de WCAG 2.5.8 es discutible para esos cuatro enlaces | **Aceptado** y anotado en O-2; no cambia nada de esta subfase |
| NB-9 | El medidor de AC-1 no restaba el borde de 1 px, así que toleraba 1 px de desborde | **Corregido** |

**NB-6 es el hallazgo falso, y conviene dejar escrito por qué.** El revisor afirmó que en las dos
pantallas el ancho útil ronda los 297 px, de modo que la aserción solo ejercitaría la rama del
ancho de la tarjeta y nunca el tope de 384. Verificado contra el código: en `/costos` la tarjeta
«Fijar costo» **va a lo ancho** (`costos/page.tsx:247-252`, un `SectionCard` con `className="mt-6"`
fuera de toda grilla), así que ahí el útil mide 1.038 px medidos y el selector queda en 384: **la
rama del tope sí se ejercita**. El revisor generalizó desde `/precios`, donde la tarjeta sí vive en
una columna de un tercio. Es exactamente el motivo por el que un hallazgo se verifica antes de
aceptarse.

Los cuatro criterios que el revisor marcó pendientes —AC-10 a AC-13— son del cierre, no defectos.
AC-10 se escribió después de esta revisión; AC-11, AC-12 y AC-13 dependen de la batería, de la
propia revisión y del despliegue.

## Comparación visual con las láminas 09 y 12 (AC-10)

Sobre las capturas que adjunta el caso 27, tomadas del build de producción a 1440, 1280 y 1082 px.
**Las diferencias que la 24.5.1 ya declaró para estas dos láminas siguen en pie y no se repiten
acá**: esta subfase no cambió ningún contenido, solo anchos y el reparto en columnas.

**Lámina 09 — Resumen**

| # | Diferencia | Estado |
|---|---|---|
| V-1 | La lámina dibuja **dos columnas iguales**; la implementación ahora también | **Resuelta** por esta subfase. Era lo que no se cumplía |
| V-2 | La lámina pone «Inventario por estado» a la izquierda y «Datos del producto» a la derecha; acá la izquierda lleva Información básica e Imagen | **Declarada**. Las tarjetas no son las mismas: la diferencia 13 de la 24.5.1 ya declaró que esta columna conserva Imagen, Precio, Costo y margen y Stock, que la v2 no dibuja. El reparto se eligió por altos medidos (D-7), no por parecido con la lámina |
| V-3 | La lámina no tiene tarjeta «Imagen» | **Declarada** por la 24.5.1 (su diferencia 13). Acá importa porque es la tarjeta que decide el equilibrio |
| V-4 | En la lámina las etiquetas de «Datos del producto» ocupan cerca de 230 px y los valores cerca de 360; acá, 128 y 332 a 1440 px | **Declarada**, menor. La proporción es parecida y la regla de dos columnas se cumple |

**Lámina 12 — Precios**

| # | Diferencia | Estado |
|---|---|---|
| V-5 | En la lámina **todos los campos del panel ocupan el ancho del panel**, el selector de moneda incluido | **Resuelta** por esta subfase: el selector pasa de 384 px fijos a ocupar su tarjeta. Era el defecto que reportó el usuario |
| V-6 | El panel de la lámina es algo más angosto en proporción (27 % contra 33 %) | **Declarada**, menor, y viene de que la página usa `max-w-6xl` |

## Pruebas y evidencia requerida

- **Nivel exigido: `authenticated-end-to-end`.** Las mediciones de AC-1 a AC-9 corren en Playwright
  con sesión real contra el PostgreSQL de desarrollo, sobre el build de producción. No son
  afirmaciones de inspección: cada una devuelve un número.
- Las capturas de AC-4, AC-5 y AC-10 se toman con `testInfo.outputPath` y se adjuntan, como en la
  24.5.2-b. **Si el instrumento que las toma no queda versionado, se dice y se deja el archivo en su
  estado exacto.**
- Los niveles no se infieren hacia arriba: hasta el despliegue esto es **validado localmente**, y
  solo pasa a **validado en staging** con el recorrido de AC-13.

## Riesgos

- **R-1 — `container-type: inline-size` convierte al envoltorio en bloque contenedor.** Un elemento
  con contención de tamaño es bloque contenedor de sus descendientes posicionados en absoluto. La
  24.5.2 ya se quemó con esto al revés (su H-15: unos `sr-only` posicionados escaparon de su
  contenedor y estiraron el documento a 1011 px). Acá el efecto esperado es el bueno —los confina—,
  pero **es un cambio de comportamiento, no una clase decorativa**, y por eso AC-8 lo mide en las
  tres pantallas.
- **R-2 — El componente llega más lejos que la lista de archivos.** Siete pantallas lo usan y solo
  una está autorizada a editarse. AC-4 y AC-5 cubren las otras seis por verificación.
- **R-3 — La columna principal se angosta de unos 693 a unos 532 px.** «Información básica», con sus
  once filas, puede crecer de alto y comerse parte de la ganancia de AC-7. Por eso AC-7 pide el
  número medido y no una impresión.
- **R-4 — Riesgo de alcance.** Tres defectos de la misma familia invitan a buscar el cuarto. Si
  aparece, **se anota y no se arregla acá**.

## Cierre

*Escrito el 2026-11-01, con la implementación terminada y sin commitear.*

**Nivel alcanzado: validado localmente y validado en integración** para las tres pantallas que
toca. **No** «validado en staging» ni «preparado para producción»: faltan la CI sobre el SHA, el
despliegue y el recorrido del usuario, y ninguno de esos niveles se infiere de los anteriores.

### Los quince criterios

| Criterio | Estado |
|---|---|
| AC-1, AC-2 | **Cumplidos**, medidos en cuatro anchos y en las dos pantallas |
| AC-3 | **Cumplido**, medido en diez anchos y dos pantallas con `getComputedStyle` |
| AC-4 | **Cumplido**: pedido y venta en una pista en los cuatro anchos, con capturas, y **sin editar ningún archivo suyo** |
| AC-5 | **Cumplido después de corregir B-1.** Era el criterio que la entrega incumplía |
| AC-6, AC-7 | **Cumplidos**: columnas iguales al píxel y hueco de 51, 187 y 266 px contra 898, 855 y 1.189 |
| AC-8 | **Cumplido**: desbordamiento cero a 320 px en las tres pantallas y axe sin violaciones en claro y en oscuro sobre las tres. `/costos` faltaba y lo marcó la revisión |
| AC-9 | **Cumplido**: los cinco controles de menos de 44 px quedan fijados; ninguno se achicó |
| AC-10 | **Cumplido**: seis diferencias numeradas contra las láminas 09 y 12, dos de ellas **resueltas** por esta subfase |
| AC-11 | **Cumplido**: batería local en verde y **CI en `success` sobre `64bf7f4`**, el SHA desplegado (run 41346525801, 24 min, sin recortar) |
| AC-12 | **Cumplido**: revisión independiente R1, un bloqueante real corregido, ocho no bloqueantes corregidos y uno falso |
| AC-13 | **Pendiente**: el recorrido del usuario |
| AC-14, AC-15 | **Cumplidos**, y AC-14 terminó corrigiendo **dos** afirmaciones vencidas, no una |

### La batería local

- `unit`: **1.294 de 1.294**. `guards`: **899 de 899**, con el archivo nuevo registrado en el índice
  desde que se creó, no al final.
- `integration`: **1.894 de 1.894**, contando una prueba de rendimiento ajena que falló por
  contención en la tanda solapada y pasa **28 de 28** corrida sola (O-6).
- `e2e`: **337 de 337 en 33 minutos**, la batería entera. Después de esa tanda se tocó **un solo
  archivo**, `tests/e2e/products.spec.ts`, para sumar axe sobre `/costos`; ese spec se volvió a
  correr entero: **27 de 27 en 3,4 minutos**. Se dice así y no «337 sobre el árbol final», que
  sería inferir.

### El despliegue (AC-11)

`64bf7f4` está en producción desde el **2026-11-01**, sin migraciones nuevas (67, las mismas), con
`1e26d3a` como vuelta atrás, anotado en `/var/lib/crm-production/despliegues`. La CI sobre ese SHA
exacto dio `success` (run 41346525801, 24 min) con los end-to-end de Chromium y el paso «Alcance
del cambio» **sin recortar**.

Las siete verificaciones del runbook pasaron: 18 de 18 archivos de configuración idénticos a los
versionados; un solo salto de proxy, con la fila de recién, **única** en la ventana de 15 minutos,
clave igual al `sha256` de la IP que llamó y distinta del `sha256('sin-proxy')`, y su control
negativo desde otra IP dando clave distinta; HSTS presente sobre HTTPS y ausente sobre HTTP; la
aplicación escuchando solo en `127.0.0.1:3000`; el rol `crm_app_login` distinto del dueño
`crm_owner`, con `INSERT=t`, `DELETE=f` y `UPDATE=f` sobre `audit_logs`; los tres endpoints en
`401` desde afuera; y la organización real en cero filas, con las dos de demostración con datos.
**Ni la IP ni su hash se versionan**: solo el veredicto y la hora de la fila.

Propio de esta subfase, porque el cambio es CSS y podía no llegar al navegador: la hoja de estilos
**servida por producción** trae `container-type:inline-size` y `@container (min-width:28rem)`, que
es el umbral de 448 px. Sin esa comprobación, «desplegado» solo diría que el proceso arrancó.

**Dos verificaciones se hicieron por un camino distinto del escrito, y el runbook quedó corregido
en los dos casos** —si no, la próxima persona vuelve a chocar con lo mismo—:

- La **verificación 5** pedía intentar un `DELETE FROM audit_logs` y esperar `permission denied`.
  Ahora lee el catálogo con `has_table_privilege`: prueba lo mismo, dice además el permiso de
  `UPDATE` y no manda una escritura destructiva contra la bitácora de auditoría, que es justo la
  tabla que el paso protege. Esta variante ya estaba **propuesta al cerrar la 24.5.2-b** y usada en
  ese despliegue, pero **el runbook se había quedado con el `DELETE`**: una mejora propuesta y no
  escrita no cambia nada, y es la segunda vez en el proyecto que una corrección se aplica en un
  lugar y no en la fuente.
- El **control negativo de la verificación 2** se hace con un túnel SOCKS. Acá el túnel quedó
  bloqueado del lado del operador, y el intento se mandó **desde el propio droplet contra el
  dominio público**, que sale a internet y vuelve a entrar por nginx. Queda escrito como variante
  válida, con la trampa dicha: contra `localhost:3000` no probaría nada, porque saltea nginx.

### Lo que esta subfase deja abierto

Todo declarado, nada corregido a escondidas: `/ventas/[saleId]` con 13 px de desbordamiento a
390 px (O-5), «Guardar imagen» con 40 px de alto (O-2), el `.gitattributes` que falta (O-1), si
`selectClass` debería traer su propio ancho (P-3), y los dos pendientes heredados, la lámina 02
sin subfase (P-1) y el margen en el catálogo de métricas (P-2).

### Lo que vale la pena recordar de esta subfase

**El mismo error de razonamiento, dos veces, con la medición desarmándolo las dos.** Primero el
diagnóstico: los tres defectos venían de decidir con el ancho de la ventana algo que depende del
contenedor. Después, al arreglarlo, **la corrección repitió la forma del error**: justifiqué el
umbral de 448 px mirando dos anchos de ventana, 640 y 500, y la franja que no miré —522 a 639—
era justamente donde rompía. Razonar sobre puntos sueltos en vez de sobre el rango completo es lo
que falló las dos veces.

**Una condición de detención que no se dispara no es una condición de detención.** El brief tenía
escrita, palabra por palabra, la condición que B-1 violaba. No se disparó porque la prueba no podía
verla: derivaba el valor esperado de la propia medición, así que comprobaba la regla nueva y nunca
el invariante. Una aserción que calcula lo que espera a partir de lo que mide **no puede fallar por
el motivo que importa**. La corrección fue meter el invariante adentro del valor esperado.

**Corregir una afirmación falsa exige buscar sus otras apariciones.** H-6 corrigió una frase vencida
en `brief-24.5.2`; la revisión encontró **la misma afirmación viva tres secciones más abajo**, en el
mismo archivo, y una tercera en `HANDOFF.md`. Una corrección puntual deja el documento tan
contradictorio como estaba.

## Condiciones de detención

Parar y reportar, sin seguir, cuando:

1. **Antes de cada commit, push, actualización de Notion y despliegue.** Cada uno necesita
   autorización explícita del usuario **en el turno**; una anterior no vale.
2. Haga falta **un archivo fuera de la lista cerrada**, por mínimo que sea el cambio.
3. El umbral de D-3 cambie el dibujo de **alguna de las seis pantallas que no se editan**.
4. Emparejar los altos del resumen exija **mover tarjetas entre columnas** (D-4). *Se cumplió el
   2026-11-01*: la medición mostró que hacía falta, se paró, se informó con los números y el
   usuario decidió aplicar el reparto (D-7). La condición hizo exactamente lo que tenía que hacer.
5. Aparezca un **cuarto defecto** de la misma causa en otra pantalla (R-4).
6. La comparación con la lámina pida **un dato que hoy no existe**: se declara y no se agrega.
