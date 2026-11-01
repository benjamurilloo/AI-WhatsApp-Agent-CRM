# Brief 24.5.2-b — Costo por unidad y margen

- **Esquema**: `task-brief.v1`
- **Tipo de tarea**: `implementation`
- **Fase**: 24 — Pantallas rediseñadas con lo que ya existe ([Roadmap](../planning/Roadmap.md) §Fases 23 a 28)
- **Subfase**: 24.5.2-b (Notion `40a702be6f4e816ba67dc792e609dd34`, en «Esperando»), nueva el 2026-10-31 de la división de la 24.5.2 ([brief-24.5.2](brief-24.5.2-unidades-panel-historial-y-filtros.md), D-1)
- **Lámina de la v2**: 13 (`05-productos/desktop/13-costos-margen-v2.png`), del lote [V2-05](../ui-redesign/v2/05-productos/README-v2-05.md)
- **Nivel de evidencia pedido**: `producer-consumer` (validado en integración)
- **Estado**: **aprobado el 2026-11-01 por el usuario, con las recomendaciones** («apruebo el brief con las recomendaciones»). Es decir, quedan tomadas así: D-1 las dos secciones nuevas; **D-2 sin selector de moneda**; **D-3 la base como etiqueta, no selector**; **D-4 el historial unificado queda fuera**; D-5 los nombres largos de los dos costos; D-6 el precio propio de la unidad si lo tiene, diciendo cuál; **D-7 la tarjeta no se renombra**; **D-8 no se agrega el aviso al `viewer`, y el punto heredado de la 24.5.2 se cierra con su motivo**; D-9 entra el enlace a la unidad existente; D-10 hay revisión independiente; D-11 se despliega después de ella. P-1 y P-2 siguen abiertos y no los decide esta subfase.

## Objetivo

Dar a `/productos/[id]/costos` la forma de la lámina 13: además del costo del producto que ya muestra desde la 18.2, **el costo de cada unidad con su margen estimado**, el promedio sobre las disponibles, y una tarjeta aparte para las existencias que quedan fuera del cálculo. Y el **valor de inventario por producto**: la suma de los costos registrados de sus disponibles, sin método de valuación.

Sin migraciones, sin tablas y sin contratos nuevos. Una lectura nueva en `inventory`, declarada y con su filtro por organización probado.

## Situación

La 24.5.2 cerró el 2026-11-01, desplegada en `0641393` y recorrida. Se partió en dos por decisión del usuario, y ésta es la otra mitad: el costo por unidad, el margen y el valor de inventario. El motivo de la división fue el tamaño — la 24.5.1 tenía un alcance comparable al de esta mitad sola y volvió R2 de la revisión independiente.

La pantalla de Costos **ya existe** desde la 18.2 y es **solo de `admin`**. Hoy tiene tres secciones: «Costo y margen» (el costo vigente del producto, su precio y el margen), «Fijar costo» (con el producto activo) e «Historial de costos» (paginado, con fecha, monto y autor).

## Hallazgos antes de diseñar

Verificados contra el código, las láminas y la documentación, no supuestos.

- **H-1 — Son dos costos distintos con nombres parecidos, y van a convivir en la misma pantalla.** El costo **del producto** es `product_costs`, de `catalog`, tabla de solo inserción cuya fila vigente es la última; el costo **de una unidad** es `stock_units.cost`, de `inventory`, que fija la recepción y puede subir con una reparación. La lámina 13 los muestra juntos: «Costo promedio USD 360» es el promedio de las tres disponibles, no el costo vigente del producto. Dos números a los que se puede llamar «el costo» en la misma pantalla. Ver D-5.

- **H-2 — El margen ya está implementado y es reutilizable tal cual.** `src/modules/catalog/margin.ts` tiene `computeMargin`, función **pura** en `bigint`, con sus tres motivos de «sin margen»: `no_price`, `no_cost` y `currency_mismatch`. Devuelve el monto, el porcentaje sobre el precio y el recargo sobre el costo, en décimas de punto y con el medio redondeado hacia afuera del cero (ADR 0019, punto 4). Tiene `margin.test.ts` desde la 18.2. **El margen por unidad es esta misma función con otras entradas**, no una fórmula nueva.

- **H-3 — La frontera de roles ya está donde tiene que estar, en el módulo y no en la presentación.** `listProductUnits` calcula `withCost = context.role === "admin"` y arma cada `ProductUnit` con `toProductUnit(row, withCost)`; el tipo documenta `cost: … | null` con «null para un viewer». La pestaña «Costos» no se le dibuja a un `viewer` (`product-sub-nav.tsx`) **y además** las dos lecturas del servicio le responden `FORBIDDEN`. La lectura nueva de esta subfase tiene que hacer lo mismo por su cuenta: no alcanza con que la pantalla sea de `admin`.

- **H-4 — El selector de moneda de la lámina contradice una decisión aceptada.** La lámina 13 pone un selector «Moneda» junto a la base de cálculo. Pero `computeMargin` devuelve `currency_mismatch` cuando el precio y el costo están en monedas distintas, y el comentario del módulo lo dice sin rodeos: «Sin precio, sin costo o con monedas distintas no hay margen: **no hay tipos de cambio**». Desde la 29.4 el proyecto **sí** tiene cotización, así que convertir es técnicamente posible. Pero la excepción está **acotada por escrito**: la nota del ADR 0025 sobre el ADR 0019 dice que «no hay tipos de cambio» deja de valer **para los movimientos de dinero** —un cobro, una devolución, un pago—, y el margen no es uno. Convertirlo lo haría depender de la cotización del día y dejaría de ser el número que el punto 5 define. Ver D-2.

- **H-5 — El historial de la lámina pide cuatro columnas que no existen.** La lámina muestra «Fecha · Unidad · Cambio (USD 355 → USD 360) · Usuario · Documento (REC-0081) · Motivo · Ver trazabilidad». `product_costs` guarda fecha, monto, moneda y autor: **no tiene unidad, ni documento, ni motivo, ni el valor anterior**. Un cambio de costo de una unidad vive en `audit_logs`, y `listEntityAuditLogs` **lee una entidad por llamada** — exactamente el límite que la 24.5.2 encontró con el motivo de la baja. Un historial unificado de N unidades cuesta N lecturas de auditoría. Ver D-4.

- **H-6 — El subtotal tiene que cubrir todas las disponibles, no la página.** La lista de unidades pagina de a 25 desde la 24.5.2. Si el subtotal se calculara sobre las filas dibujadas, un producto con 30 disponibles mostraría un «Costo total» que no es el total. Es el mismo defecto que la 24.5.1 evitó plegando las sumas por modelo **antes** del corte de página, dentro de `inventory` ([Overview](../architecture/Overview.md), §Composición entre módulos, viñeta de la 24.5.1). La lectura nueva agrega en SQL.

- **H-7 — Un producto por cantidad no tiene unidades, y el tipo ya lo impide.** `UnitStatusCountsResult` de la 24.5.1 está tipado para que la pantalla **no pueda** dibujar un cero donde no hay nada que contar (su I-2). La pantalla de costos tiene que seguir sirviendo a esos productos: con sus tres secciones de hoy y **sin** las dos nuevas, no con tablas vacías.

- **H-8 — Renombrar la tarjeta rompe tres aserciones en dos pantallas.** La lámina titula la tarjeta «Costos y margen»; la que existe se llama «Costo y margen», en singular. Ese nombre lo usa `tests/e2e/products.spec.ts` en `getByRole("region", …)` en las líneas 1267, 1294 y 1362, y **hay dos tarjetas distintas con el mismo nombre**: la del resumen del producto (`[productId]/page.tsx:515`, que gobierna la lámina 09, no la 13) y la de esta pantalla. Ver D-7. *Este hallazgo salió de aplicar en el brief la precaución que la 24.5.2 aprendió al cerrar: buscar en las pruebas **los textos que el cambio toca**, no solo los nombres de lo que se elimina.*

- **H-9 — «Margen» no está en el catálogo de métricas.** `docs/analytics/MetricsCatalog.md` no lo define. Los cuatro números de la lámina —precio, costo promedio, ganancia bruta estimada y margen bruto estimado— son estimaciones de pantalla gobernadas por el ADR 0019 y FR-PROD-21, no métricas de analítica con contrato. La lámina misma lo dice: «Estimación antes de gastos e impuestos · No es ganancia neta». Ver P-2.

- **H-10 — Lo que la 24.5.2 dejó anotado para acá choca con una decisión que ella misma tomó.** Su lista de herencia incluye «decirle al `viewer` por qué no ve el costo». Pero el panel de la unidad **decidió a propósito no dibujar el campo vacío**, con este comentario en el código: «No se dibuja el campo vacío para un `viewer`: un campo "Costo" en blanco ya informa que existe un costo». Agregar un aviso es revertir esa decisión, no completarla. Ver D-8.

- **H-11 — Una unidad puede tener precio propio.** Desde la 29.5.2 (D-8), `stock_units.price` existe y lo ven los dos roles; si es `null`, vale el del producto. La columna «Precio de referencia» de la lámina muestra USD 450 en las tres filas, que es el precio del producto. Hay que decir cuál se usó en cada fila. Ver D-6.

## Decisiones a tomar

Ninguna se da por tomada: cada una lleva una recomendación y el motivo.

**D-1. Qué entra en la pantalla.** **Recomendado**: conservar las tres secciones de hoy y agregar dos, como la lámina: **«Costo por unidad»** (tabla con unidad, estado, costo registrado, precio de referencia, ganancia estimada y margen, con fila de subtotal) y **«Otras existencias»** (las reservadas y en revisión con su costo registrado, y la leyenda de que quedan fuera del cálculo). Es lo que la tarea de Notion acordó y lo que el Roadmap enumera.

**D-2. El selector de moneda (H-4).** **Recomendado: no se implementa, y se declara como diferencia con la lámina.** Las monedas distintas siguen dando «sin margen», como fijan el punto 5 del ADR 0019 y la 18.2, y la excepción del ADR 0025 no alcanza al margen: está escrita solo para los movimientos de dinero. Convertir el margen con la cotización del día cambia qué significa el número y merece su propia decisión, no entrar de contrabando en una pantalla de rediseño. La alternativa —implementarlo— exige decidir qué cotización se usa, qué pasa cuando no hay una del día y cómo se declara que el número es convertido.

**D-3. El selector «Base de cálculo» (la lámina muestra «Disponibles (3)»).** **Recomendado: no es un selector, es una etiqueta.** La base ya está decidida: las disponibles. Un desplegable promete bases alternativas que nadie definió, y la tarjeta «Otras existencias» ya responde la pregunta que el selector invitaría a hacer. Se dibuja como texto, con la cantidad, y la leyenda «Excluidas del cálculo» en la otra tarjeta.

**D-4. El historial unificado con unidad, documento y motivo (H-5).** **Recomendado: queda fuera, y se declara.** El historial sigue siendo el del costo del producto, como hoy. Unificarlo con los cambios de costo por unidad cuesta una lectura de auditoría por unidad, que es el límite que la 24.5.2 ya midió, y pide decidir qué se hace con la paginación de dos fuentes de tamaños distintos. Si se quiere, es una subfase propia con su medición.

**D-5. Cómo se nombran los dos costos (H-1).** **Recomendado**: «Costo del producto» para el vigente de `product_costs` —que ya está en el subtítulo de la pantalla— y **«Costo promedio de las disponibles»** para el nuevo, nunca «Costo promedio» a secas. La lámina usa el nombre corto; acá el nombre largo evita que dos números distintos se lean como el mismo.

**D-6. El precio de referencia por unidad (H-11).** **Recomendado**: el precio propio de la unidad si lo tiene, y si no el precio vigente del producto, **diciendo cuál es** en la celda (por ejemplo «USD 450 · del producto»). Sin eso, dos filas con precios distintos parecen un error de datos.

**D-7. Renombrar la tarjeta a «Costos y margen» (H-8).** **Recomendado: no se renombra.** Es una letra de diferencia, rompe tres aserciones y obliga a distinguir dos tarjetas que hoy comparten nombre en dos pantallas distintas. Se declara como diferencia con la lámina.

**D-8. El aviso al `viewer` sobre el costo (H-10).** **Recomendado: no se agrega, y se cierra el punto heredado diciendo por qué.** Esta pantalla es de `admin` entera, así que el aviso no tendría dónde ir; y en el panel de la unidad, un texto que diga «no ves el costo» informa lo mismo que el campo vacío que la 24.5.2 decidió no dibujar. **Es una decisión del usuario, no mía**: la herencia pedía lo contrario.

**D-9. El enlace a la unidad existente cuando el IMEI está repetido.** **Recomendado: entra**, porque es la otra mejora real que la 24.5.2 identificó y es chica. Toca el formulario de alta de unidad, que está fuera de esta pantalla: por eso su archivo va en la lista cerrada desde el principio.

**D-10. La revisión independiente.** **Recomendada: sí.** Esta subfase toca el primer dato restringido por rol dentro de una entidad que los dos roles leen, y agrega una lectura que lo agrega. Una fuga a un `viewer` no se ve en la pantalla de un `admin`. Es el mismo motivo por el que la 18.2 la pidió.

**D-11. El despliegue.** **Recomendado: sí**, después de la revisión y con la CI del SHA exacto en `success`, según [deploy/production/README.md](../../deploy/production/README.md). Sin migraciones.

## Dependencias

- **Nada tiene que existir antes**: las dos lecturas de `catalog`, el módulo `margin` y la pantalla ya están.
- **Una dependencia hacia adelante que conviene saber**: el punto 5 del ADR 0019 dice que **la base del margen se revisa con la 13.5.2-b**, cuando se conozca la condición del negocio real frente al IVA; si es responsable inscripto, el margen pasa a montos netos. Esta subfase construye sobre la definición de hoy, a sabiendas. No la bloquea —el cambio sería en `computeMargin`, que es una función pura con sus pruebas, y esta pantalla la consume—, pero conviene que la decisión quede escrita acá y no se descubra después.

## Pendientes, que no decido yo

- **P-1 — La lámina 02, «Alta y edición de producto», sigue sin subfase asignada.** Viene arrastrándose desde la planificación de la 24.5. No entra acá; hace falta decidir a qué subfase va.
- **P-2 — Si «ganancia bruta estimada» y «margen bruto estimado» entran al catálogo de métricas (H-9).** **Mi lectura es que no**: son estimaciones de pantalla, no métricas con contrato, y el ADR 0019 ya las gobierna. Lo dejo señalado porque el catálogo es fuente de verdad de nivel 2 y un número que se parece a una métrica y no está en él es, como mínimo, una pregunta razonable.

## Alcance incluido

1. La tabla **«Costo por unidad»** de las disponibles del producto, con subtotal: cantidad de la base y **costo total** (el valor de inventario por producto).
2. La tarjeta **«Otras existencias»** con las reservadas y en revisión, su costo registrado y la leyenda de exclusión.
3. Los cuatro números de la cabecera: precio de venta, costo promedio de las disponibles, ganancia bruta estimada y margen bruto estimado, con la tira de la fórmula y la aclaración de que no es ganancia neta.
4. Una lectura nueva en `inventory` que agrega en SQL los costos por estado de un producto, con su filtro por organización y sin el costo para un `viewer`.
5. El enlace a la unidad existente cuando se intenta cargar un IMEI repetido (D-9).
6. Reflujo a 320 px sin desbordamiento, objetivos táctiles de 44 px **medidos**, y `axe` sin violaciones en claro y en oscuro.

## Alcance excluido

- **El total de la organización.** Es una suma sobre todos los productos: va a su propia subfase, con su medición (decisión del usuario del 2026-10-31).
- **Cualquier método de valuación** (FIFO, promedio ponderado móvil, costo de reposición). Es la suma de los costos registrados y nada más.
- **El historial unificado por unidad** con documento y motivo (D-4).
- **La conversión de monedas en el margen** (D-2).
- **Migraciones, tablas, columnas y contratos nuevos**, y cualquier cambio en las lecturas de servicio: el agente no ve costos ni márgenes, y eso no se toca.
- El enmascarado del IMEI, que sigue pidiendo un ADR.

## Archivos autorizados

Lista **cerrada**. Salirse de ella **se para y se pregunta, sin excepción por tamaño ni por evidencia de que el cambio esté confinado**.

| Archivo | Qué cambia |
| --- | --- |
| `src/app/(autenticado)/productos/[productId]/costos/page.tsx` | Las dos secciones nuevas y la composición |
| `src/app/(autenticado)/productos/[productId]/costos/cost-summary.tsx` | Los cuatro números y la tira de la fórmula |
| `src/app/(autenticado)/productos/[productId]/costos/messages.ts` | Los textos nuevos, incluida la leyenda de exclusión |
| `src/app/(autenticado)/productos/[productId]/costos/unit-costs.tsx` | **Nuevo.** La tabla por unidad y la tarjeta «Otras existencias» |
| `src/app/(autenticado)/productos/[productId]/costos/cost-data.ts` | **Nuevo.** La composición con su `catch` y la lectura inyectada, como la 24.5.2 dejó hecho en `list-data.ts` |
| `src/app/(autenticado)/productos/[productId]/costos/cost-data.test.ts` | **Nuevo.** Sus pruebas, incluida la del fallo forzado |
| `src/modules/inventory/units.ts` | La lectura nueva y su tipo |
| `src/modules/inventory/unit-repository.ts` | Su SQL, con el filtro por organización |
| `src/modules/inventory/index.ts` | Su exportación |
| `src/modules/inventory/units.test.ts` | Pruebas de la lectura nueva |
| `tests/integration/units.test.ts` | La lectura contra PostgreSQL real |
| `tests/integration/organization-isolation.test.ts` | El filtro por organización probado donde es observable |
| `tests/e2e/products.spec.ts` | **Listado desde el principio por H-8**: afirma sobre «Costo y margen» en dos pantallas |
| `tests/e2e/units.spec.ts` | El IMEI repetido con su enlace (D-9) |
| `src/app/(autenticado)/productos/[productId]/unidades/forms.tsx` | El enlace a la unidad existente (D-9) |
| `docs/architecture/Overview.md` | La composición nueva en §Composición entre módulos |
| `docs/product/Screens.md` | La pantalla de costos con sus secciones nuevas |
| `docs/architecture/TraceabilityMatrix.md` | FR-PROD-21 con las pruebas nuevas |
| `CHANGELOG.md`, `HANDOFF.md`, este brief | El cierre |

## Fuentes de verdad

1. El código y las migraciones (no hay ninguna nueva).
2. [DataModel.md](../architecture/DataModel.md) §`product_costs` y §`stock_units`; [MetricsCatalog.md](../analytics/MetricsCatalog.md).
3. [ADR 0019](0019-bases-de-los-comprobantes.md) puntos 4 y 5 (la base del margen); [brief-18.2](brief-18.2-costo-y-margen.md) D-1, D-2 y D-6; [SecurityModel.md](../architecture/SecurityModel.md) §lectura por rol (FR-PROD-21); [Overview.md](../architecture/Overview.md) §Composición entre módulos.
4. La lámina 13 para la forma. **Donde la lámina contradice una decisión aceptada, gana la decisión y la diferencia se declara** — es lo que pasa en D-2, D-3, D-4 y D-7.

## Invariantes

- **I-1 (FR-PROD-21).** Ni el costo ni el margen llegan nunca a un `viewer`, y el recorte vive **en el módulo**, no en la presentación. La lectura nueva devuelve `null` o `FORBIDDEN` a un `viewer` por su cuenta.
- **I-2.** Un valor que no se pudo leer se **anuncia**; nunca se dibuja como cero ni como vacío.
- **I-3.** Un costo desconocido se muestra como pendiente y **no se sustituye por cero** para calcular el promedio, la ganancia ni el margen. Una unidad sin costo no entra en la base, y la base dice cuántas quedaron afuera.
- **I-4.** Con precio cero, sin precio, sin costo, con monedas distintas o con base vacía, **el porcentaje no se calcula**: se dice por qué.
- **I-5.** Un margen negativo se presenta con **importe, texto e icono**, nunca solo con color.
- **I-6.** Ningún `JOIN` contra tablas de otro módulo. `catalog` no importa `inventory`; la pantalla compone en memoria.
- **I-7.** El subtotal y el promedio cubren **todas** las disponibles del producto, no la página.
- **I-8.** Ninguna migración, tabla ni columna nueva (67 migraciones, las mismas).
- **I-9.** Cada lectura nueva filtra por organización **en SQL**, probado llamando al repositorio con una organización ajena.

## Criterios de aceptación

- **AC-1.** `/productos/[id]/costos` muestra, para un producto con unidades, la tabla «Costo por unidad» de sus disponibles con unidad, estado, costo registrado, precio de referencia, ganancia estimada y margen.
- **AC-2.** La fila de subtotal dice la cantidad de la base y el **costo total** de las disponibles, calculado sobre todas y no sobre la página, probado con un producto de más de 25 disponibles.
- **AC-3.** La tarjeta «Otras existencias» lista las reservadas y en revisión con su costo registrado y declara que están excluidas del cálculo.
- **AC-4.** Los cuatro números de la cabecera coinciden con la tabla, y la tira de la fórmula muestra la aritmética con la aclaración de que es una estimación antes de gastos e impuestos.
- **AC-5.** Una unidad **sin costo** no entra en la base, se muestra como pendiente y la base dice cuántas quedaron afuera. Ningún número la cuenta como cero.
- **AC-6.** Con precio y costo en **monedas distintas** no hay margen, y se dice el motivo. Con precio ausente o cero tampoco, con su propio motivo.
- **AC-7.** Un margen negativo se ve con importe, texto e icono, y la prueba lo comprueba **sin** mirar el color.
- **AC-8.** Un producto **por cantidad** abre la pantalla con sus tres secciones de siempre y **sin** las dos nuevas; no aparece ninguna tabla vacía ni ningún cero inventado.
- **AC-9.** Un `viewer` no llega: no ve la pestaña, y la pantalla y la lectura nueva le responden como ya lo hacen las dos existentes. La prueba revisa **el documento que recibe el navegador** y comprueba que ningún importe de costo aparece en él.
- **AC-10.** La lectura nueva filtra por organización en SQL, probado llamando al repositorio con una organización ajena, y **borrar ese filtro hace fallar al menos una prueba** — la corrida de mutación se ejecuta y se registra con su resultado.
- **AC-11.** Una lectura que falla se anuncia y la pantalla sigue sirviendo lo demás; la rama es **alcanzable** y la prueba la fuerza sin mockear el módulo.
- **AC-12.** Cargar un IMEI ya existente ofrece **un enlace a esa unidad**, no solo el mensaje de error.
- **AC-13.** Reflujo a 320 px con desbordamiento **cero** medido contra `documentElement`, objetivos táctiles de 44 px **medidos** y `axe` sin violaciones en claro y en oscuro.
- **AC-14.** Ninguna migración nueva: 67 antes y después.
- **AC-15.** Comparación visual con la lámina 13, con **cada diferencia declarada una por una** y clasificada: decidida, preexistente, dato que el modelo no tiene, o mejora real diferida.
- **AC-16.** Revisión independiente (D-10) con sus hallazgos verificados contra el código antes de aceptarse.
- **AC-17.** CI en `success` sobre el SHA exacto que se despliega.
- **AC-18.** Recorrido del usuario sobre lo desplegado.

## Pruebas y evidencia requerida

Nivel pedido: **`producer-consumer`** — validado en integración.

- `deterministic`: las pruebas de `unit` y `guards`, incluidas las de la lectura nueva, las de `cost-data.ts` con su fallo forzado y la corrida de mutación de AC-10 con su resultado escrito.
- `producer-consumer`: el recorrido de la pantalla de costos contra el build de producción, con PostgreSQL real, para un producto con unidades, uno por cantidad, uno con una unidad sin costo y uno con margen negativo.
- Un seed con esos cuatro casos. **No se declara un nivel superior al alcanzado**: los mocks y los fixtures de forma asumida se declaran como tales.

## Riesgos

- **R-1 — Dos números que se llaman «costo».** Mitigación: D-5, los nombres largos.
- **R-2 — El promedio sobre una base que cambia sin avisar.** Si una unidad se vende entre dos cargas, el promedio cambia y parece un error. Mitigación: la base se dice siempre con su cantidad.
- **R-3 — La tabla por unidad con muchas unidades.** La de la 24.5.2 pagina de a 25 y aun así no entra a 1024 px. Ésta tiene seis columnas. Mitigación: decidir en la implementación si pagina o si se limita con un tope declarado; **si hace falta un tope, se dice en pantalla**, nunca se recorta en silencio.
- **R-4 — Volver a romper una prueba por un texto que cambia.** Mitigación: H-8 ya enumeró las aserciones afectadas y `products.spec.ts` está en la lista cerrada desde el principio.

## Condiciones de detención

Se para y se reporta, sin seguir, cuando:

1. **Un archivo quedaría fuera de la lista cerrada** — sin excepción por tamaño ni por confinamiento.
2. **Haría falta una migración, una tabla o una columna.**
3. **Aparece una contradicción entre la lámina y una decisión aceptada** distinta de las cuatro ya previstas (D-2, D-3, D-4 y D-7).
4. **Antes de cualquier commit, push o despliegue**, que el usuario autoriza en el turno.
5. **Antes de tocar `seeds/`** o cualquier dato de una base real.
