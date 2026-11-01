# Brief 24.5.2-b — Costo por unidad y margen

- **Esquema**: `task-brief.v1`
- **Tipo de tarea**: `implementation`
- **Fase**: 24 — Pantallas rediseñadas con lo que ya existe ([Roadmap](../planning/Roadmap.md) §Fases 23 a 28)
- **Subfase**: 24.5.2-b (Notion `40a702be6f4e816ba67dc792e609dd34`; en «Completado» desde el 2026-11-01, al cerrar), nueva el 2026-10-31 de la división de la 24.5.2 ([brief-24.5.2](brief-24.5.2-unidades-panel-historial-y-filtros.md), D-1)
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

- **H-6 — El subtotal tiene que cubrir todas las disponibles, no la página.** La lista de unidades pagina de a 25 desde la 24.5.2. Si el subtotal se calculara sobre las filas dibujadas, un producto con 30 disponibles mostraría un «Costo total» que no es el total. Es el mismo defecto que la 24.5.1 evitó plegando las sumas por modelo **antes** del corte de página, dentro de `inventory` ([Overview](../architecture/Overview.md), §Reglas de dependencia, viñeta de la 24.5.1). La lectura nueva agrega en SQL.

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
| `src/modules/catalog/index.ts` | **Ampliación autorizada el 2026-11-01** (primera tanda). Una línea: exportar `computeMargin`. El lint prohíbe `@/modules/catalog/margin` directo —«Importá solo la interfaz pública del módulo»— y rehacer la aritmética en la página sería una segunda definición del mismo redondeo |
| `src/app/(autenticado)/productos/[productId]/unidades/messages.ts` | **Ampliación autorizada el 2026-11-01** (primera tanda). El mensaje del IMEI repetido, para que acompañe al enlace a la unidad existente (D-9) |
| `docs/architecture/Overview.md` | La composición nueva en §Reglas de dependencia |
| `docs/product/Screens.md` | La pantalla de costos con sus secciones nuevas |
| `docs/architecture/TraceabilityMatrix.md` | FR-PROD-21 con las pruebas nuevas |
| `docs/product/FunctionalRequirements.md` | **Ampliación autorizada el 2026-11-01** (segunda tanda, tras la revisión independiente). FR-PROD-21 describía solo el margen **del producto**; se amplía para que nombre lo que esta subfase entrega. Sin esto, la matriz de trazabilidad colgaba las pruebas nuevas de un requisito que no las describe (NB-7) |
| `docs/planning/Roadmap.md` | **Ampliación autorizada el 2026-11-01** (segunda tanda). Decía que esta subfase «necesita su brief», aprobado el 2026-11-01 (NB-8). *Autorizado también el 2026-11-01*: citaba un «§Composición entre módulos» que en `Overview.md` se llama **§Reglas de dependencia** (NB-10) |
| `docs/decisions/brief-24.5.2-unidades-panel-historial-y-filtros.md` | **Ampliación autorizada el 2026-11-01** (segunda tanda). Tres afirmaciones en futuro sobre la 24.5.2-b que quedaron falsas (NB-8) |
| `CHANGELOG.md`, `HANDOFF.md`, este brief | El cierre |

## Fuentes de verdad

1. El código y las migraciones (no hay ninguna nueva).
2. [DataModel.md](../architecture/DataModel.md) §`product_costs` y §`stock_units`; [MetricsCatalog.md](../analytics/MetricsCatalog.md).
3. [ADR 0019](0019-bases-de-los-comprobantes.md) puntos 4 y 5 (la base del margen); [brief-18.2](brief-18.2-costo-y-margen.md) D-1, D-2 y D-6; [SecurityModel.md](../architecture/SecurityModel.md) §lectura por rol (FR-PROD-21); [Overview.md](../architecture/Overview.md) §Reglas de dependencia.
4. La lámina 13 para la forma. **Donde la lámina contradice una decisión aceptada, gana la decisión y la diferencia se declara** — es lo que pasa en D-2, D-3, D-4 y D-7.

## Invariantes

- **I-1 (FR-PROD-21).** Ni el costo ni el margen llegan nunca a un `viewer`, y el recorte vive **en el módulo**, no en la presentación. La lectura nueva devuelve `null` o `FORBIDDEN` a un `viewer` por su cuenta.
- **I-2.** Un valor que no se pudo leer se **anuncia**; nunca se dibuja como cero ni como vacío.
- **I-3.** Un costo desconocido se muestra como pendiente y **no se sustituye por cero** para calcular el promedio, la ganancia ni el margen. *Precisado el 2026-11-01 (D-12)*: el costo que puede faltar es el **del producto**; el de una unidad no puede faltar ni ser cero.
- **I-4.** Con precio cero, sin precio, sin costo, con monedas distintas o con base vacía, **el porcentaje no se calcula**: se dice por qué. *Ampliado el 2026-11-01 (D-13)*: «monedas distintas» incluye ahora **dos monedas dentro de la base**, no solo precio contra costo.
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
- **AC-5.** *Reinterpretado el 2026-11-01, al empezar a implementar, por decisión del usuario (D-12).* **Aplica al costo del producto, no al de la unidad**: cuando `product_costs` no tiene fila, la pantalla lo dice y ningún número lo cuenta como cero. Para la tabla por unidad **no hay estado «pendiente»**, porque `stock_units.cost` es `NOT NULL` con `CHECK (cost > 0)`: una unidad sin costo, o con costo cero, no puede existir. Decía: «Una unidad **sin costo** no entra en la base, se muestra como pendiente y la base dice cuántas quedaron afuera. Ningún número la cuenta como cero.»
- **AC-5-b.** *Nuevo el 2026-11-01 (D-13).* Con la base en **más de una moneda**, el subtotal lleva **una línea por moneda** y los cuatro números de la cabecera dicen que no se pueden calcular, con el motivo. Con una sola moneda se calculan como siempre. Las dos mitades tienen prueba.
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

## Decisiones tomadas durante la implementación

**D-12. AC-5 describía un estado imposible, y se reinterpreta.** *Decidido por el usuario el 2026-11-01, antes de escribir la pantalla.* `stock_units.cost` es `NOT NULL` con `CHECK (cost > 0)` (`schema.ts:208` y `stock_units_cost_positive`, de la migración `0056`), así que **una unidad sin costo no puede existir**. Implementar «se muestra como pendiente» habría dejado una rama que ningún camino alcanza — el mismo defecto que la revisión independiente encontró en la 24.5.1 (su B-3) y otra vez en la 24.5.2 (su B-2), las dos veces con la nota del vault a la vista. La regla **sí** vale para el costo del producto, que puede faltar, y esa mitad ya está en pantalla desde la 18.2. AC-5 queda reinterpretado y el texto viejo conservado.

**D-13. Dos unidades del mismo producto pueden tener el costo en monedas distintas.** *Decidido por el usuario el 2026-11-01; el brief no lo cubría.* La moneda del costo la fija cada recepción y el trigger de la migración `0059` solo impide que **cambie** después: nada obliga a que dos recepciones del mismo producto usen la misma. Con la base en dos monedas **no hay un total ni un promedio**. La pantalla muestra **una línea de subtotal por moneda** y dice que los cuatro números no se pueden calcular, con el motivo. Es la misma conducta que `computeMargin` ya tiene con `currency_mismatch`, y la coherente con D-2: no se convierte. Entra como **AC-5-b**, y la lectura nueva agrupa por estado **y moneda** desde el principio para que el caso no dependa de recordarlo.

**D-14. Las dos tablas nuevas pasan a tarjetas por debajo de `md`.** *Decidido en la implementación el 2026-11-01, a partir de una medición.* La primera corrida de `axe` a 320 px devolvió `scrollable-region-focusable` sobre los dos contenedores: seis columnas no entran en 320 px, el `overflow-x-auto` desplaza y el contenedor no se alcanza con el teclado. Se resolvió con el patrón que **esa misma pantalla ya usa** en el historial de costos —tabla desde `md`, lista de tarjetas debajo— y no agregando `tabIndex={0}`, que es el otro patrón del proyecto (`caja/cobros`): el recorrido de la 24.5.2 pidió explícitamente evitar el desplazamiento horizontal, y hacer foco en algo que desplaza lo conserva. El subtotal y los textos son los mismos en las dos presentaciones, de un solo componente.

**D-15. La tira de la fórmula lleva `× 100`.** La lámina escribe `(450 − 360) ÷ 450 × 100 = 20 %` y la primera implementación omitió el `× 100`, con lo que la línea afirmaba que una división que da `0,09` es igual a `9,0 %`. La tira existe para volver auditable el porcentaje: si la aritmética que muestra no cierra, no sirve para eso. Corregido.

**D-16. Lo que la revisión independiente dejó declarado y no corregido.** Tres cosas que el revisor levantó y que se aceptan como están, con su motivo escrito para que nadie las relea como defectos nuevos:

- **El «—» del costo en la tabla no lo alcanza ningún camino** (NB-2). `getProductUnitCosts` arma todas las filas con el costo presente, así que la celda vacía solo existe por el tipo `ProductUnit`, que admite `null` para un `viewer`. Se conserva por tipado, no por conducta, y queda dicho acá en lugar de solo en un comentario.
- **AC-6 e I-4 nombran «precio cero», que es un estado imposible** (NB-6). Lo impiden `product_prices_amount_positive`, `stock_units_price_positive` y `parseMoneyInput`; si llegara, `computeMargin` no devolvería un motivo sino que lanzaría. Es el mismo caso que D-12 y se declara igual, sin implementar una rama que nada alcanza.
- **AC-5-b no se implementó a la letra** (NB-5). El criterio dice que los cuatro números «dicen que no se pueden calcular»; la pantalla los reemplaza por un solo párrafo con el motivo, y con eso también desaparece el precio de venta, que sí se conoce. Dibujar una tarjeta sola, con las otras tres vacías, dice menos que la frase. Se acepta el ajuste y queda declarado.

## Observaciones de entorno

**O-1 — `forbidden-references.test.ts` vive al filo de su tiempo en esta máquina.** Medido el 2026-11-01, con el mismo árbol y sin tocar esa guarda:

| Cómo se corre | Tiempo de esa prueba | Resultado |
|---|---|---|
| Solo ese archivo | 18,2 s | **pasa**, sus 10 pruebas |
| `--project guards` | 33,3 s | **falla por timeout** (límite 30 s) |
| `--project unit --project guards` | 64,2 s | **falla por timeout** |

No es un hallazgo de contenido: el mensaje es `Test timed out in 30000ms`, no una referencia prohibida encontrada. La prueba lee **todos los archivos versionados** (`git ls-files`), y los archivos nuevos de esta subfase todavía no están versionados, así que no pueden haber alargado su lista — la causa es la contención de la máquina, no el cambio. La misma batería pasó en 18 s el 2026-11-01. En la CI, sobre Linux, no falla.

Queda **declarada y no corregida**: el archivo no está en la lista cerrada y subirle el timeout es un cambio propio, que además conviene decidir mirando por qué tarda tanto en lugar de tapar el síntoma.

**O-2 — Dos pruebas de punta a punta que no toca esta subfase quedan al filo de los 30 s en esta máquina.** Medido el 2026-11-01: `repairs-own-units.spec.ts:224` y `units.spec.ts:354` fallan por timeout con el límite por defecto y **pasan con 60 s**, en 33,7 s y 31,0 s. Una tercera, `repairs-own-units.spec.ts:385`, falló en la corrida completa y pasó al correrla sola: contención. El mensaje es `Test timeout`, sin localizador, y ninguna de las tres toca la pantalla de costos. Las dos primeras pasaron en la CI sobre el SHA `0641393`. Queda **declarada y no corregida**: `repairs-own-units.spec.ts` no está en la lista cerrada, y quien decide es la CI de AC-17.

**O-3 — El sistema interrumpió un `npm run build` por falta de memoria.** El 2026-11-01, con 373 MB libres de 7,8 GB y 2,4 GB en compresión de memoria. Es la misma causa de O-1 y O-2. Se retomó con Docker cerrado y 1,1 GB libres.

**O-4 — Un archivo de integración ajeno a esta subfase murió por una caída de worker.** El 2026-11-01, `tests/integration/erasure.test.ts` salió con `exit code 3221226505` (`0xC0000409` de Windows) durante `started state`: un cuelgue del proceso, no una aserción. La batería informó 1.880 de 1.894 y **113 de 114 archivos**. Corrido solo, el archivo **pasa: 25 de 25 en 12,6 s**. Es la misma clase de falla que la 24.5.2 ya registró en su cierre. Queda declarada: la batería local de esta subfase se sostiene en 1.880 + 25 verificadas por separado, y la CI es la que corre todo junto sobre Linux.

## Comparación visual con la lámina 13 (AC-15)

Hecha el 2026-11-01 contra `docs/ui-redesign/v2/05-productos/desktop/13-costos-margen-v2.png`, sobre el build de producción a 1440 px y a 320 px, con las capturas que adjunta la prueba `la pantalla de costos muestra el costo por unidad, su margen y las excluidas`. **Lo que coincide no se enumera**: coinciden las dos secciones nuevas, sus títulos de columna y su orden, los cuatro números, la tira de la fórmula con su aclaración, la fila de subtotal con su redacción y la leyenda de exclusión.

Cada diferencia, una por una:

| # | Diferencia | Clase |
|---|---|---|
| V-1 | No hay desplegable **«Base de cálculo»**: la base va como texto, «Base del cálculo: 4 unidades disponibles» | Decidida (D-3) |
| V-2 | No hay selector **«Moneda»** | Decidida (D-2) |
| V-3 | La tarjeta se llama **«Margen estimado sobre las disponibles»**, no «Costos y margen» | Decidida (D-5 y D-7) |
| V-4 | El historial sigue siendo el del costo **del producto**, sin las columnas Unidad, Cambio, Documento, Motivo ni «Ver trazabilidad» | Decidida (D-4) |
| V-5 | La leyenda dice «Excluidas del cálculo», no «del cálculo seleccionado» | Decidida (consecuencia de D-3: no hay cálculo seleccionable) |
| V-6 | La tira de la fórmula lleva el ícono `info`; la lámina dibuja una calculadora | Decidida: `icons.tsx` no la tiene y agregarla sería salirse de la lista cerrada por un adorno |
| V-7 | El ícono de «Margen bruto estimado» es `pieChart`; la lámina usa `%` | Decidida, por el mismo motivo que V-6 |
| V-8 | **«Otras existencias» va a lo ancho, debajo**; la lámina la pone en una columna a la derecha del resumen | **Decidida por el usuario el 2026-11-01: queda a lo ancho.** La pantalla es de una sola columna desde la 18.2 y las cinco secciones comparten ese ritmo; pasar una a dos columnas es un cambio de grilla de la pantalla entera, no de esta tarjeta |
| V-9 | Las unidades se identifican por su IMEI completo; la lámina muestra códigos cortos `U-0101` | Dato que el modelo no tiene: `stock_units` no tiene código corto |
| V-10 | Los importes se escriben `US$ 1.099,00`; la lámina escribe `USD 450` | Preexistente: `formatMoney` con `es-AR`, en toda la aplicación |
| V-11 | El estado es una insignia con ícono; la lámina usa un punto de color | Preexistente: `StatusBadge` del sistema de diseño, y el color no puede ser el único portador del dato |
| V-12 | No hay botón **«Actualizar costo»** en la cabecera de la tarjeta ni enlace «Ver historial de costos»: el formulario «Fijar costo» y el historial están más abajo, como secciones | Preexistente (18.2): D-1 conserva las tres secciones de hoy |
| V-13 | La cabecera del producto no tiene foto, grado, SKU ni «Editar producto» | Preexistente: eso lo gobierna la lámina 09, no ésta |
| V-14 | Falta la nota al pie **«No modifica costos de ventas cerradas»** | **Mejora real diferida.** Es cierta en el modelo —`product_costs` es de solo inserción y una venta guarda su propio costo—, pero es una afirmación sobre el comportamiento del sistema y merece decidirse, no copiarse de una lámina |
| V-15 | Por debajo de `md` las dos tablas se dibujan como tarjetas | Decidida (D-14). La lámina es de escritorio y no cubre ese ancho |

## Pruebas y evidencia requerida

Nivel pedido: **`producer-consumer`** — validado en integración.

- `deterministic`: las pruebas de `unit` y `guards`, incluidas las de la lectura nueva, las de `cost-data.ts` con su fallo forzado y la corrida de mutación de AC-10 con su resultado escrito.
- `producer-consumer`: el recorrido de la pantalla de costos contra el build de producción, con PostgreSQL real, para un producto con unidades, uno por cantidad, uno con margen negativo y uno con el costo en dos monedas. *El cuarto caso cambió el 2026-11-01*: el del brief original —una unidad sin costo— es un estado imposible (D-12), y lo reemplaza el de D-13.
- Un seed con esos cuatro casos. **No se declara un nivel superior al alcanzado**: los mocks y los fixtures de forma asumida se declaran como tales.

## Riesgos

- **R-1 — Dos números que se llaman «costo».** Mitigación: D-5, los nombres largos.
- **R-2 — El promedio sobre una base que cambia sin avisar.** Si una unidad se vende entre dos cargas, el promedio cambia y parece un error. Mitigación: la base se dice siempre con su cantidad. *Ampliado el 2026-11-01 por la revisión independiente (su NB-3)*: las tres lecturas salen en un `Promise.all`, **no en una sola foto**, así que una venta concurrente entre dos de ellas deja el subtotal y la tabla contando distinto. El proyecto tiene el mecanismo —`withSnapshot`, en `caja` y en `knowledge`— y no está en `inventory`; llevarlo ahí exige `inventory/repository.ts`, fuera de la lista cerrada. **Decisión del usuario del 2026-11-01: se declara y no se toca ahora**, por ser una ventana de milisegundos en una pantalla de solo lectura.
- **R-3 — La tabla por unidad con muchas unidades.** La de la 24.5.2 pagina de a 25 y aun así no entra a 1024 px. Ésta tiene seis columnas. Mitigación: decidir en la implementación si pagina o si se limita con un tope declarado; **si hace falta un tope, se dice en pantalla**, nunca se recorta en silencio.
- **R-4 — Volver a romper una prueba por un texto que cambia.** Mitigación: H-8 ya enumeró las aserciones afectadas y `products.spec.ts` está en la lista cerrada desde el principio.

## Revisión independiente (AC-16 y D-10)

Hecha el 2026-11-01 por un agente que no participó del trabajo, con acceso de solo lectura, contra este brief y contra las reglas vigentes. **Veredicto: R2**, con 4 bloqueantes, 13 no bloqueantes y 1 sospecha. El revisor no ejecutó nada: lo que exige correr quedó fuera de su alcance y lo declaró. Los cuatro bloqueantes **se verificaron contra el código antes de aceptarse**, y los cuatro eran reales.

| | Hallazgo | Resolución |
|---|---|---|
| **B-1** | Cinco guardas enumeran con `git ls-files` **sin `--others`** (`forbidden-references`, `exposed-surface`, `log-surface`, `service-read-entry-points` y `deployment-hostnames`), así que los tres archivos nuevos, sin versionar, **no los miró ninguna**: pasaron en verde sin leerlos | Los tres se registraron en el índice y la batería de guardas se volvió a correr: **899 pruebas, 31 archivos, en verde con los archivos nuevos a la vista** |
| **B-2** | El subtotal de las tarjetas iba en un `<p>` y `Subtotals` devuelve un `<ul>`: HTML inválido. El navegador cierra el `<p>`, la lista queda hermana y **pierde `md:hidden`**, duplicando el subtotal en escritorio | Corregido a `<div>` |
| **B-3** | El promedio se redondeaba a centésimos y no **a los decimales de la moneda**. El punto 4 del ADR 0019 pide las dos cosas, y el comentario afirmaba cumplirlo. En una moneda sin centavos el promedio caía en media unidad inexistente, y el margen se calculaba sobre un número que la pantalla no mostraba | Corregido con el mismo `step` que `convertMoney` ya usa, y con su prueba en CLP |
| **B-4** | En la tabla, el margen negativo iba con importe e ícono, pero `icons.tsx` emite todo con `aria-hidden`: para un lector de pantalla el único portador era el signo menos. I-5 y AC-7 piden **importe, texto e icono** | Texto accesible agregado en `MarginCell`, con `relative` para no repetir H-15, y con su aserción en la prueba |

**B-1 es el hallazgo que justifica esta revisión.** El mismo falso verde de `git ls-files` ya le había pasado al proyecto dos veces —[brief-11.1](brief-11.1-catalogo-comercial.md) y [brief-18.2](brief-18.2-costo-y-margen.md), donde también lo encontró la revisión independiente—, y esta subfase tenía el hecho **escrito** en O-1: usó «los archivos nuevos todavía no están versionados» para explicar un timeout, sin ver que por ese mismo motivo la guarda no había revisado nada. La autoevaluación tuvo el dato delante y sacó la conclusión contraria.

De los trece no bloqueantes: **cinco corregidos** (NB-1 rama inalcanzable, NB-11 un `id` que nombraba otra tarjeta, NB-12 el motivo repetido debajo de los totales a los que remite, NB-13 una aserción que no fijaba nada, y NB-4 la prueba del `viewer` sobre un producto por unidad); **cuatro resueltos con los tres archivos que el usuario autorizó** (NB-7 y las tres afirmaciones de NB-8); **tres declarados** en D-16 (NB-2, NB-5 y NB-6); **uno declarado** en R-2 (NB-3). NB-9 quedó corregido al cerrar: la tarea de Notion **ya estaba en «En proceso»**, así que lo desactualizado era la línea del brief, no Notion; hoy está en «Completado». NB-10, dos citas a un «§Reglas de dependencia» que en `Overview.md` se llama **§Reglas de dependencia**, quedó corregido en este brief.

**La sospecha S-1** —que el fixture de `organization-isolation.test.ts` chocara con un invariante de saldo— quedó descartada por la corrida: ese archivo pasa.

Una nota sobre el propio informe: la cita del precedente de B-1 apuntaba a `TraceabilityMatrix.md:71`, que es otro requisito. El precedente **existe** y está en los dos briefs citados arriba; la línea estaba mal. Se verificó antes de aceptar el hallazgo, que es para lo que sirve verificar.

## Despliegue

**`1e26d3a`, desplegado el 2026-11-01.** CI en `success` sobre ese SHA exacto (run 41323703896, 32 min), con el paso «Alcance del cambio» **sin recortar**. Sin migraciones: 67 antes y después (AC-14). Para volver atrás, `0641393`, anotado en `/var/lib/crm-production/despliegues` antes de desplegar.

Las siete verificaciones del runbook, pasadas:

| # | Verificación | Resultado |
|---|---|---|
| 1 | La configuración desplegada es la versionada | **18 de 18** archivos idénticos, y la tabla del runbook dice 18 |
| 2 | Un solo salto de proxy | Fila de segundos de antigüedad, **única** en la ventana de 15 minutos, clave igual al hash de la IP del operador y distinta de la constante `sin-proxy`. Control negativo por túnel SOCKS: **clave distinta**, igual al hash de la IP de salida del túnel |
| 3 | HSTS | Presente sobre HTTPS (`max-age=31536000; includeSubDomains`), ausente sobre HTTP, que responde `301` |
| 4 | Escucha solo en loopback | `127.0.0.1:3000` |
| 5 | El rol de la aplicación no es el dueño | `crm_app_login` contra `crm_owner`, sin privilegio de borrado sobre `audit_logs` y con lectura e inserción |
| 6 | Ingestión y API de lectura | `401` en los tres endpoints desde afuera |
| 7 | Ningún dato real | «Vixora» en 0, 0 y 0; las otras dos organizaciones son de demostración |

**La verificación 5 se hizo de otra forma que la del runbook.** El runbook pide intentar un `DELETE FROM audit_logs` y esperar `permission denied`. Acá se leyó el catálogo con `has_table_privilege`, que no ejecuta ninguna escritura y además dice las tres cosas de una vez: quién es el rol, quién el dueño y qué puede hacer. Queda **propuesto** como mejora del runbook, que no está en la lista cerrada de esta subfase.

Ni la IP ni su hash se versionan, ni acá ni en ningún otro lado: solo si coinciden y a qué hora es la fila.

## Condiciones de detención

Se para y se reporta, sin seguir, cuando:

1. **Un archivo quedaría fuera de la lista cerrada** — sin excepción por tamaño ni por confinamiento.
2. **Haría falta una migración, una tabla o una columna.**
3. **Aparece una contradicción entre la lámina y una decisión aceptada** distinta de las cuatro ya previstas (D-2, D-3, D-4 y D-7).
4. **Antes de cualquier commit, push o despliegue**, que el usuario autoriza en el turno.
5. **Antes de tocar `seeds/`** o cualquier dato de una base real.
