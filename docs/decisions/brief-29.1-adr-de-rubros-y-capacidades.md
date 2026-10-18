---
schema: task-brief.v1
task_id: "29.1"
task_type: design
generated_at: 2026-10-18
---

# Brief 29.1 — ADR de rubros y capacidades

- **Contrato**: `task-brief.v1`
- **Tipo de tarea**: `design`. El resultado es un ADR y las enmiendas que ordene. No hay código, migraciones, dependencias ni cambios en la forma de ningún contrato.
- **Nivel de evidencia objetivo**: ninguno de ejecución.
- **Nivel de validación alcanzable**: diseñado.
- **Orden**: sería la primera subfase de una fase nueva, la **Fase 29 — Rubros: núcleo, capacidades y perfiles**. **La fase no está abierta**: la abre el usuario, con su proyecto en Notion. El número es provisional (D-16). Las subfases siguientes las fija el ADR (D-15).
- **Origen**: pedido del usuario del 2026-10-18. Va a **ofrecerle el CRM a un negocio de venta de iPhone**. El negocio **no está confirmado**, y no se sabe si será el de la 13.5.2-b. El usuario trabajó en el rubro y aporta lo que necesita: modelo, batería y color de cada equipo, la recepción de usados, las formas de pago y los técnicos. El servicio técnico **se terceriza**, como en la mayoría del rubro. El agente también tiene que cotizar equipos y usados.
- **No abre ni cierra un gate.** Fija el diseño que implementan las subfases siguientes. La revisión independiente se hace igual (D-17), como en la 19.1, la 20.1, la 21.1 y la 22.1.
- **Estado de este documento**: **aprobado el 2026-10-18** por el usuario, con las recomendaciones de D-1 a D-17. Ese día el usuario fijó también el orden: **la Fase 29 se abre después de cerrar la Fase 23 y antes de abrir la 24**. Precisa D-16, que la ubicaba después de las fases del rediseño.

  La fase se abrió el 2026-10-18, al pedir el usuario «continuamos acá la 29». En Notion se crearon el proyecto de la fase (`3fd702be6f4e81a4ac90d8769c33e506`, con la plantilla «Nuevo Proyecto» y sus cuatro bases inline) y su tarea espejo en el proyecto raíz (`3fd702be6f4e81599901c48727692488`). También las nueve subfases: la 29.1 (`3fd702be6f4e81a59a48cd669b965be9`) en «En proceso» y de la 29.2 a la 29.9 en «Esperando». Todo se releyó después de crearlo.

## Objetivo

Decidir con un ADR, el **0024**, **cómo el CRM sirve a rubros distintos sin dejar de ser uno solo**:

- qué es el núcleo, qué es una capacidad activable y qué es un perfil de rubro;
- cómo sabe el CRM qué capacidades tiene una organización;
- qué dato va en una columna tipada y qué dato va en un atributo definido por la organización;
- las capacidades que pide el primer rubro, la venta de iPhone: variantes, unidades serializadas, condición de usado, recepción de usados y permuta, cotización del dólar, servicio técnico tercerizado y garantía;
- qué lee y qué escribe el agente;
- el orden de las subfases y qué hace falta para abrir la fase.

El ADR **no crea tablas**. Las crean las subfases siguientes, y solo con la fase abierta.

## Lo que se verificó antes de escribir este brief

Releído el 2026-10-18 contra el código y los documentos de `main` (`5c1430b`). El árbol de trabajo tiene la implementación de la 23.3 sin commit. Este brief no la toca y va en su propio commit.

- **`CLAUDE.md`**: prohíbe las tablas vacías y los módulos especulativos («Evolucionar hacia un ERP significa un diseño que no impide extender, no implementar por adelantado»). Un ADR que diseña sin crear tablas no la contradice.
- **El ADR 0016**:
  - punto 2: «se planifica todo y se detalla solo la fase próxima», con el negocio real delante;
  - punto 3: una fase se abre antes de su gate solo por decisión explícita del usuario, registrada con fecha;
  - punto 5: el agente nunca registra un cobro, un pago ni un movimiento de caja.
- **El ADR 0014**: el agente consume contratos versionados, diseñados desde el modelo del CRM.
- **El ADR 0010**: un usuario pertenece a una sola organización. `organizations` tiene solo `id`, `name`, `timezone` y las fechas. **No hay dónde guardar qué capacidades tiene una organización.**
- **El ADR 0008 y DataModel §`inventories`**: el stock es **una cantidad por producto** (`quantity_on_hand` y `quantity_reserved`, `numeric(14, 3)`). Cada cambio del saldo físico va con su movimiento, y `stock-writes` fija quién escribe. Las funciones que escriben hoy son `applyStockChange`, `reserveStock`, `releaseStock`, `deliverStock`, `sellStock`, `restoreSaleStock`, `receiveStock` y `removeReceivedStock`.
- **DataModel §`products`**:
  - `condition` es un enum con solo `new` y `refurbished` (brief-11.1, D-3). **No existe el usado**;
  - marca y categoría son texto libre, sin tabla propia;
  - no hay variantes ni atributos.
- **El ADR 0019, punto 3**: el comprobante toma la moneda del **precio vigente del producto** de su primera línea, y **no hay tipos de cambio**: «entran sin fase, cuando el uso los pida» (l. 80). La alternativa del tipo de cambio cargado a mano se descartó porque «nadie lo pidió» (l. 135).
- **El ADR 0023, punto 2**: el proveedor es una ficha propia, **separada de los clientes**, y no se cruza con nada que lea el agente.
- **Roadmap §Fases 23 a 28, «Fuera del rediseño»**: **las variantes** están en la lista de lo que entra «solo con su propio ADR».
- **El brief-17.4, D-1**: descartó guardar la información del negocio en un `jsonb`, porque «los `CHECK` y el aislamiento dejan de vivir en la base».
- **El código**:
  - `src/modules/` tiene `analytics`, `audit`, `auth`, `cash`, `catalog`, `conversations`, `crm`, `ingestion`, `inventory`, `knowledge`, `numbering`, `orders`, `organizations`, `purchasing` y `sales`;
  - ningún módulo ni ninguna tabla nombra un número de serie, un IMEI, un atributo, una variante, un tipo de cambio o una reparación;
  - el agente lee por `src/app/api/read/v2/contract.ts`.
- **El repositorio del agente** no se leyó. Lo que el agente necesita se toma de lo que dijo el usuario, como contexto de negocio.

### Hallazgos

- **H-1. Un iPhone usado es una unidad, no una cantidad.** Dos «iPhone 13 128 GB azul» no son intercambiables si uno tiene 89 % de batería y el otro 76 %, y cada uno tiene su IMEI, su costo y, a menudo, su precio. El stock por cantidad no puede decir cuál se vendió. Cualquier diseño de unidades toca `inventory`, `orders`, `sales` y `purchasing`, que ya están en producción.
- **H-2. El precio de una unidad no es el del producto.** El ADR 0019, punto 3, copia en el comprobante el precio vigente del producto. Un usado se vende al precio de esa unidad. Hace falta una nota fechada en el 0019 o una decisión que la evite (D-6).
- **H-3. El rubro cotiza en dólares y cobra en pesos.** En la venta de iPhone el precio de lista suele estar en USD, y el cliente paga en ARS al cambio del día, o en USD. El ADR 0019 dice que no hay tipos de cambio. **Cambiar eso no es una nota: supera una decisión aceptada**, así que necesita su propio ADR (D-9).
- **H-4. Quien entrega un usado es un cliente, no un proveedor.** El ADR 0023 separa al proveedor de los clientes. La persona que deja su iPhone en parte de pago es un cliente identificado por su teléfono (ADR 0007). Una recepción de usados no puede ser una recepción de mercadería de `purchasing` sin romper esa separación (D-8).
- **H-5. El técnico sí es un proveedor.** El servicio técnico tercerizado le cobra al negocio por la reparación, como un proveedor. Encaja en la ficha del ADR 0023 (D-10).
- **H-6. La recepción de usados guarda datos personales.** El vendedor del usado deja su nombre y quizás su documento, y el negocio guarda el IMEI del equipo. El ADR decide qué se guarda, por qué y cómo se vacía (ADR 0015). **No se asume que una norma exija el documento**: si se afirma, se cita.
- **H-7. Un precio que da el agente compromete al negocio.** Una pre-cotización de un usado que da el agente sin ver el equipo puede leerse como una oferta. El ADR 0016, punto 5, no la prohíbe, porque no es un cobro, pero el ADR tiene que decir que es orientativa y quién fija el precio final (D-12).
- **H-8. Nada dice hoy qué capacidades tiene una organización** (ADR 0010; `organizations`). Mostrar u ocultar módulos por organización necesita un dato, y quién lo cambia: el `admin` del negocio o quien opera el CRM (D-3).
- **H-9. El negocio no está confirmado.** El ADR 0016, punto 2, pide detallar cada fase con el negocio delante. El ADR puede fijar la forma general, pero lo que depende de cómo opera el negocio va como **supuesto a confirmar**, y la fase no construye nada hasta que el usuario la abra (D-16).

## Decisiones

Cada una trae una recomendación. El usuario la aprueba, la cambia o la rechaza.

### D-1 — Qué decide el ADR y qué no

**Recomendada**:

- **Entran**:
  - las tres capas: el núcleo, las capacidades activables y los perfiles de rubro;
  - dónde vive qué capacidades tiene una organización y quién las cambia;
  - la regla de columna tipada o atributo definido;
  - las variantes, las unidades serializadas y la condición de usado;
  - la recepción de usados y la permuta;
  - si hace falta el tipo de cambio, y en qué ADR se decide;
  - el servicio técnico tercerizado y la garantía;
  - el agente, los roles y los datos personales;
  - el orden de las subfases y qué hace falta para abrir la fase.
- **No entran**:
  - el diseño del tipo de cambio, que va en su propio ADR (D-9);
  - un taller propio, con técnicos que sean usuarios del CRM: el rubro lo terceriza;
  - la consulta automática del IMEI en una base externa, como la de equipos denunciados de ENACOM, que sería un efecto externo: la verificación la hace una persona y el CRM registra que se hizo;
  - las listas de precios, los descuentos, la factura de ARCA y la contabilidad, que siguen sin fase;
  - un segundo rubro: el ADR deja la forma para que entre, pero no diseña ninguno más;
  - cambios en el repositorio del agente.

### D-2 — Las tres capas

- **(a) Recomendada**: **un núcleo, capacidades activables y perfiles de rubro.**
  - **El núcleo** es lo que ya existe y usa cualquier negocio: organizaciones, usuarios, clientes, conversaciones, catálogo, stock, pedidos, ventas, caja y compras. No cambia de forma por un rubro.
  - **Una capacidad** es código del monolito, con su módulo en `src/modules/`, sus tablas y sus fronteras (ADR 0002). Sirve a más de un rubro: las unidades serializadas sirven también a notebooks, consolas o motos. **Una capacidad desactivada no cambia ninguna conducta del núcleo**, y sus pantallas no aparecen.
  - **Un perfil de rubro** son **datos**, no código: las capacidades que activa, las definiciones de atributos, el checklist de recepción, la tabla de cotización de usados y los textos. El perfil de iPhone es el primero.
  - **Lo propio de un cliente** es configuración dentro de su organización: precios, recargos, días de garantía.
- (b) Un fork o una rama por cliente. Cada arreglo se aplica N veces.
- (c) Todo como atributos libres en `jsonb`, sin capacidades. Se pierden los `CHECK` y la búsqueda, y el agente no tiene un contrato estable (brief-17.4, D-1).
- (d) Un módulo por cliente («módulo de la tienda X»). Mezcla el rubro con el cliente, y el segundo negocio del mismo rubro no lo reutiliza.

### D-3 — Qué capacidades tiene una organización (H-8)

- **(a) Recomendada**: **una tabla de capacidades por organización**, con una fila por capacidad activada: la capacidad, de una lista cerrada en un enum, y la fecha.
  - **La activa quien opera el CRM**, con un script auditado, como hoy se crea una organización. No hay pantalla, y el `admin` del negocio no la cambia.
  - **Desactivar una capacidad con datos no se permite**: se deja activa o se resuelve con un ADR.
  - El marco lee las capacidades al armar el menú, y cada página de una capacidad responde 404 si la organización no la tiene, con la misma regla que la autorización por rol.
  - La crea la primera subfase de la fase, con una capacidad que la use. Nunca vacía.
- (b) Una columna de arreglo en `organizations`. Más simple, pero sin `CHECK` por valor ni fecha por capacidad.
- (c) Una variable de entorno o un archivo de configuración por despliegue. Hay un solo despliegue para todas las organizaciones.
- (d) Que el `admin` las active desde una pantalla. Le da al negocio un interruptor con efectos que no puede medir.

### D-4 — Columna tipada o atributo definido

- **(a) Recomendada**: **lo que el sistema usa para calcular, validar, identificar o buscar va en una columna tipada de su capacidad. Lo que solo se muestra o se filtra va en un atributo definido por la organización.**
  - **Ejemplos de columna**: el IMEI (único por organización), el estado de la unidad, su costo y su precio, la salud de la batería si la cotización la usa.
  - **Ejemplos de atributo**: si trae caja, el origen, el detalle de una marca.
  - **Un atributo tiene una definición** por organización: la clave, el nombre, el tipo (texto, número, sí o no, opción de una lista), las opciones y si es obligatorio. El perfil de rubro trae las definiciones.
  - **El valor se guarda tipado**: una fila por valor, con una columna por tipo y un `CHECK` de que hay exactamente una. El servicio valida el valor contra la definición.
  - **Un atributo que empieza a usarse en un cálculo pasa a columna**, con una migración y su brief.
- (b) Todos los atributos en un `jsonb` validado solo por el servicio. Es la alternativa que el brief-17.4 descartó.
- (c) Solo columnas, sin atributos definidos. Cada rubro nuevo pide una migración, aunque el dato solo se muestre.

### D-5 — Las variantes

- **(a) Recomendada**: **cada combinación sigue siendo un producto**, como hoy («iPhone 13 128 GB Azul», con su SKU), y **se agrupan por modelo**.
  - El modelo es un dato nuevo y opcional del producto, con sus atributos de variante (capacidad, color), definidos como en D-4.
  - La lista, la ficha y el agente pueden agrupar por modelo, y nada del núcleo cambia: pedidos, ventas y compras siguen apuntando a un producto.
  - Generar todas las combinaciones de una vez es una mejora de pantalla, que queda para después.
- (b) Una matriz de variantes con su propia tabla de stock y precio. Duplica el producto en todo el núcleo.
- (c) Sin variantes: el color y la capacidad van en el nombre. Es lo que hay hoy, y el agente no puede filtrar por color.

### D-6 — Las unidades serializadas (H-1, H-2)

- **(a) Recomendada**: **un producto se lleva por cantidad o por unidad**, y la unidad es el detalle del saldo, no un stock paralelo.
  - Un producto «por unidad» tiene **unidades**: el IMEI o número de serie, único por organización; el estado, de una lista cerrada (`in_review`, `available`, `reserved`, `sold`, `in_repair`, `written_off`); el costo de esa unidad; un precio propio opcional; la condición y el grado (D-7); la salud de la batería; y sus atributos.
  - **El saldo sigue en `inventories`**, con el ADR 0008 intacto, y en la misma transacción **se cumple que el saldo es igual a las unidades en stock**. Lo verifica un test, y una guarda fija quién escribe las unidades, como `stock-writes`.
  - **Una línea de un producto por unidad lleva la unidad**, con cantidad 1. El pedido reserva una unidad, la venta la vende, la anulación la devuelve y la recepción de mercadería la crea.
  - **El precio de la línea es el de la unidad si lo tiene, y si no, el del producto.** El ADR 0019, punto 3, recibe una nota fechada, y la moneda del comprobante sigue saliendo de la primera línea.
  - **El margen de una unidad es exacto**: su precio menos su costo. La Fase 25 lo tiene que tener en cuenta.
- (b) Un stock aparte para los productos por unidad, sin `inventories`. Obliga a reescribir pedidos, ventas y compras con dos caminos.
- (c) Un producto por unidad («iPhone 13 IMEI …»), sin tabla nueva. Llena el catálogo de productos de un solo uso, y el agente no puede agrupar.

### D-7 — La condición y el grado

- **(a) Recomendada**: **`product_condition` suma `used`**, y la unidad lleva un **grado** de una lista que define el perfil (por ejemplo A, B y C, o «como nuevo», «muy bueno», «bueno»).
  - La condición sigue siendo del producto: «iPhone 13 128 GB Azul usado» y «… nuevo» son productos distintos, con precios distintos.
  - El grado es de la unidad, porque cada usado tiene el suyo.
  - **El agente lee la condición nueva** con un cambio de contrato versionado (D-12).
- (b) La condición en la unidad, y no en el producto. Un mismo producto mezclaría nuevos y usados con un solo precio.

### D-8 — La recepción de usados y la permuta (H-4, H-6)

- **(a) Recomendada**: **una capacidad propia, con su módulo, separada de `purchasing`.**
  - **La recepción de un usado es un comprobante de solo inserción**, con número propio, **contra un cliente**: el equipo, el IMEI, el checklist del perfil con su resultado, si se verificó el IMEI y si se desvinculó la cuenta de iCloud, y el valor que el negocio le reconoce.
  - **Crea la unidad en `in_review`**, que pasa a `available` cuando una persona la revisa y le pone precio.
  - **El valor reconocido se usa de dos formas**:
    - **como parte de pago de una venta**: un medio de pago nuevo, «permuta», que se imputa como un cobro. Vive en `cash`, que depende del módulo nuevo para leer la recepción, como depende de `purchasing`;
    - **como compra pura**: el negocio le paga al cliente, con un pago que sale de la caja si es en efectivo.
  - **Se anula con otro comprobante**, solo si la unidad sigue en stock y no se vendió.
  - **Los datos personales** son los mínimos que el negocio necesite, confirmados con él (H-6, H-9). Se vacían como los de un cliente (ADR 0015).
- (b) La recepción de usados como una recepción de mercadería de `purchasing`, con el cliente como proveedor. Rompe la separación del ADR 0023, punto 2.
- (c) La permuta como un descuento en la venta. Pierde el costo de la unidad recibida, el IMEI y el checklist.

### D-9 — El tipo de cambio (H-3)

- **(a) Recomendada**: **el ADR 0024 dice que el rubro lo necesita, y lo decide un ADR propio, el 0025**, que supera en parte el punto 3 del 0019. La subfase de ese ADR va **antes** de la primera venta en dos monedas.
  - Lo que el 0024 adelanta, sin decidirlo: una cotización por organización y por par de monedas, **cargada a mano por un `admin`**, con historial de solo inserción; el comprobante guarda la cotización que usó; sin consultas a servicios externos.
- (b) Decidir el tipo de cambio dentro del 0024. Mezcla una decisión del núcleo con las del rubro.
- (c) Sin tipo de cambio: cada producto con dos precios, uno en USD y otro en ARS, que el `admin` actualiza a mano. Cuando el dólar se mueve, hay que reescribir todos los precios en pesos.

### D-10 — El servicio técnico tercerizado (H-5)

- **(a) Recomendada**: **una orden de servicio con un técnico que es un proveedor** del ADR 0023, marcado como técnico. Dos casos:
  - **una unidad propia**, por ejemplo un usado recibido que necesita batería: sale a reparar (`in_repair`), vuelve, y **lo que cobra el técnico suma al costo de la unidad**;
  - **el equipo de un cliente**: el negocio lo recibe, lo manda al técnico, le pasa el presupuesto al cliente, cobra la reparación y le paga al técnico. Guarda el equipo y el IMEI, pero **no es una unidad del stock**.
  - **Los estados** son una lista cerrada, como el pedido: recibido, enviado al técnico, presupuestado, aprobado o rechazado, reparado, entregado.
  - **El pago al técnico** es un pago a proveedor de la 22.6, sin cambios en `cash`.
  - **Qué caso va primero** lo decide la conversación con el negocio (H-9).
- (b) Solo el caso de la unidad propia. Es lo más simple, pero muchos negocios del rubro cobran reparaciones a clientes.
- (c) Un taller propio, con técnicos usuarios. El rubro lo terceriza (D-1).

### D-11 — La garantía

- **(a) Recomendada**: **la garantía de una unidad vendida se deriva**: la fecha de la venta más los días de garantía de la unidad, o del perfil si no los tiene. Sin tabla.
  - La ficha del cliente y la búsqueda por IMEI muestran si un equipo vendido sigue en garantía.
  - **El reclamo** (un equipo que vuelve) es una orden de servicio de D-10 marcada como garantía, sin cobro al cliente.
- (b) Una tabla de garantías con su estado. Guarda un dato que se deriva.

### D-12 — El agente (H-7)

**Recomendada**:

- **El agente sabe qué capacidades tiene la organización** por su contrato de lectura, y no ofrece lo que no existe.
- **Lee, por un contrato versionado nuevo** (ADR 0014):
  - los modelos con sus variantes, la condición, y las unidades disponibles con su grado, su batería, su precio y sus fotos. **Nunca el IMEI ni el costo**;
  - el precio en la moneda del producto y, si el ADR 0025 lo decide, en la otra moneda con la cotización del día.
- **Pre-cotiza un usado**: el agente manda el modelo, la capacidad, la batería y las respuestas del checklist, y **el CRM calcula un rango** con la tabla del perfil. El agente lo presenta **como orientativo**, y **el precio final lo fija una persona** al revisar el equipo. La regla del cálculo vive en el CRM, no en el agente.
- **Reserva una unidad** con el contrato del pedido pendiente de la 19.4, extendido para llevar la unidad.
- **Lee el estado de una reparación** del cliente con el que habla, por su teléfono.
- **No registra** recepciones de usados, órdenes de servicio, cobros ni pagos (ADR 0016, punto 5).
- Cada cambio de contrato va en su subfase, con su versión, y el agente se adapta en su repositorio después de publicado el contrato.

### D-13 — El perfil de rubro

- **(a) Recomendada**: **el perfil es una plantilla versionada en el repositorio** (como los seeds), que **se copia a la organización** al activarla: las definiciones de atributos, el checklist, la tabla de cotización de usados, los grados y los días de garantía.
  - Después de copiada, **la organización la ajusta**: un `admin` edita su tabla de cotización y sus días de garantía.
  - Cambiar la plantilla no cambia las organizaciones que ya la copiaron.
- (b) Plantillas en tablas globales, compartidas por todas las organizaciones. Rompe el aislamiento por organización y crea tablas sin dueño.
- (c) Sin plantilla: cada organización arranca vacía. El segundo negocio del rubro repite todo.

### D-14 — Roles y datos personales

**Recomendada**:

- **Un `admin`** no activa capacidades (D-3), pero configura el perfil de su organización, carga unidades, recibe usados, fija precios y opera las órdenes de servicio.
- **Un `viewer`** ve las unidades, sus atributos y las órdenes de servicio, **sin el costo** de la unidad ni lo reconocido por un usado (FR-PROD-21). El ADR verifica si algún total le deja inferir el costo, como el R-1 de la 22.1.
- **Los datos personales** de la recepción de usados y del equipo de un cliente en reparación siguen el runbook de datos de un cliente, que se amplía.

### D-15 — El orden de las subfases

**Recomendado**, sujeto a lo que se decida arriba y a lo que diga el negocio:

| Subfase | Crea |
|---|---|
| **29.1 — ADR de rubros y capacidades** | este ADR, sin tablas |
| **29.2 — Capacidades y variantes** | la tabla de capacidades, el modelo con sus atributos de variante, las definiciones de atributos y la plantilla del perfil de iPhone |
| **29.3 — Las unidades** | las unidades serializadas en el catálogo y el stock, la condición `used`, el grado y su paso por el pedido, la venta, la anulación y la recepción de mercadería |
| **29.4 — ADR del tipo de cambio** | el ADR 0025, sin tablas |
| **29.5 — El tipo de cambio** | la cotización y su uso en el comprobante, según el 0025 |
| **29.6 — La recepción de usados y la permuta** | el comprobante, el checklist, la unidad en revisión y el medio de pago «permuta» |
| **29.7 — El agente del rubro** | el contrato versionado nuevo: modelos, unidades y pre-cotización de usados |
| **29.8 — El servicio técnico** | la orden de servicio con el técnico, en el caso que el negocio use primero |
| **29.9 — La garantía** | la garantía derivada y el reclamo |

La 29.4 y la 29.5 pueden ir antes de la 29.3 si el negocio vende en dos monedas desde el primer día.

### D-16 — El número de la fase y cuándo se abre (H-9)

**Recomendada**:

- **La 29.1 se puede hacer con el negocio sin confirmar**: es diseño, no crea tablas, y deja escrito qué se le ofrece. Lo que dependa del negocio va como **supuesto a confirmar**, con la lista de preguntas para la reunión.
- **Desde la 29.2, la fase se abre con el negocio confirmado, o antes solo por decisión explícita del usuario registrada con fecha**, como el ADR 0016, punto 3, hizo con el ERP.
- **El número 29** es provisional: la fase va después de las del rediseño en el Roadmap, pero **no espera a que terminen**. Si el negocio se confirma, la fase del rediseño abierta se pausa, como dice el Roadmap para la 13.5.2-b.
- Si el negocio es el de la 13.5.2-b, la puesta en marcha sigue la 13.5.2-b, y esta fase va antes del tráfico real solo en lo que el negocio necesite para empezar.

### D-17 — Revisión independiente y cierre

**Recomendada**:

- **Revisión independiente**: sí, antes de pedir la aceptación, como en la 22.1. La hace un agente de solo lectura contra:
  - este brief y `CLAUDE.md`;
  - los ADR 0002, 0007, 0008, 0010, 0013, 0014, 0015, 0016, 0019, 0020, 0021, 0022 y 0023;
  - DataModel, Overview, Roadmap, Scope, FunctionalRequirements y el runbook de datos de un cliente;
  - `src/modules/catalog/`, `src/modules/inventory/`, `src/modules/orders/`, `src/modules/sales/`, `src/modules/cash/`, `src/modules/purchasing/`, `src/app/api/read/v2/` y las guardas de escrituras.
- **Cuándo cierra**: cuando el ADR esté aceptado o rechazado y estén escritas sus enmiendas, con fecha y conservando el texto anterior. Como mínimo:
  - **Roadmap**: la Fase 29 con sus subfases, y en «Fuera del rediseño» la nota de que las variantes pasan a esta fase;
  - **Scope**: el perímetro de la fase y lo que sigue fuera;
  - **DataModel**: una nota de diseño con lo que viene, sin tablas;
  - **Overview**: las capacidades como forma de extender el monolito;
  - **el ADR 0019**: la nota del precio de la unidad (D-6) y la referencia al 0025 (D-9);
  - **`docs/decisions/README.md`**: el ADR 0024 y este brief.

## Supuestos a confirmar con el negocio

Lo que el ADR deja como supuesto hasta la conversación con el negocio (H-9).

*Precisado el 2026-10-18 por el usuario*: él responde estas preguntas cuando el ADR las necesite, por su experiencia en el rubro y por lo que conoce de cómo trabaja este cliente. El ADR registra cada respuesta como **respuesta del usuario, con fecha**, distinta de una confirmación del negocio. Si el negocio, al confirmarse, opera distinto, la decisión afectada se revisa con una nota fechada.

1. Si vende nuevos, usados o los dos, y en qué proporción.
2. En qué moneda publica los precios y en cuál cobra; de dónde saca la cotización y cada cuánto la cambia.
3. Los medios de pago: efectivo en USD o ARS, transferencia, tarjeta con cuotas y recargo, USDT.
4. Cómo cotiza hoy un usado: con qué tabla y qué descuenta por batería, grado o piezas no originales.
5. Qué revisa al recibir un usado, y qué datos del vendedor guarda.
6. Si le cobra reparaciones a clientes o solo repara sus propios equipos, y con cuántos técnicos trabaja.
7. Cuántos días de garantía da, y si cambian según la condición.
8. Qué quiere que conteste el agente sin intervención de una persona.

### Respuestas del usuario (2026-10-18)

El usuario respondió las ocho preguntas el 2026-10-18. Están en el ADR 0024, §Contexto (R-1 a R-8), como respuestas del usuario y no como confirmación del negocio. Quedan sin respuesta cómo cotiza los usados el negocio, que por ahora usa valores de ejemplo (R-4), y el recargo de las cuotas (R-3).

**Un pedido nuevo, fuera de D-1 y D-15**: el agente tiene que **reservar un turno para visitar el local** (R-8). El ADR lo propone como capacidad genérica (`appointments`, punto 12, subfase 29.10). Entra **solo si el usuario lo acepta junto con el ADR**.

## Alcance incluido

- `docs/decisions/0024-rubros-y-capacidades.md`, nuevo, y este brief;
- con el ADR aceptado, las enmiendas de D-17;
- en el cierre: `CHANGELOG.md`, `HANDOFF.md` y la tarea de Notion, si la fase está abierta.

## Alcance excluido

- **Código, migraciones, tablas, dependencias y cambios en la forma de un contrato.**
- El diseño del tipo de cambio, que es del ADR 0025.
- Un segundo rubro.
- Un taller propio con técnicos usuarios.
- Consultas a servicios externos, como la base de IMEI de ENACOM.
- Las listas de precios, los descuentos, la factura de ARCA y la contabilidad.
- Cambios en el agente o en su repositorio, y avisos al agente.
- La implementación de la 23.3, que está en el árbol de trabajo y va en su propio commit.

## Fuentes de verdad

- `CLAUDE.md`.
- ADR 0002, 0007, 0008, 0010, 0013, 0014, 0015, 0016, 0019, 0020, 0021, 0022 y 0023.
- DataModel §Reglas de diseño, §`organizations`, §`products`, §`inventories`, §`inventory_movements`, §`order_lines`, §`sale_lines` y §«Explícitamente fuera de este modelo».
- Overview §Módulos y §Reglas de dependencia.
- Roadmap §Fases 23 a 28 y «Sin fase todavía»; Scope.
- FR-PROD-21; el runbook de datos de un cliente.
- `src/app/api/read/v2/contract.ts` y los módulos de §Lo que se verificó.

## Invariantes

1. **Ninguna tabla nueva** en esta subfase.
2. **El núcleo no cambia de conducta para una organización sin la capacidad**: lo que hoy funciona, sigue igual.
3. **El stock nunca queda negativo ni por debajo de lo reservado** (ADR 0008; ADR 0020, punto 5), y con unidades, el saldo es igual a las unidades en stock.
4. **Un comprobante emitido no se edita ni se borra**: se anula con otro (ADR 0016, punto 4).
5. **El dinero no pasa nunca por un `number`.**
6. **Aislamiento por organización**: ninguna plantilla, definición o capacidad se comparte entre organizaciones en la base.
7. **El agente no registra cobros, pagos ni movimientos de caja, ni lee costos ni IMEI** (ADR 0016, punto 5), y cada cambio de lo que lee va en un contrato versionado.
8. **Ninguna dependencia del repositorio del agente** y ningún efecto externo.

## Criterios de aceptación

- **AC-1**: el ADR 0024 responde de D-2 a D-16, cada una con la decisión, las alternativas descartadas con su motivo y las consecuencias.
- **AC-2**: el ADR fija las unidades serializadas sin un camino en el que el saldo y las unidades en stock difieran, y dice qué función escribe cada cosa y quién la llama (H-1).
- **AC-3**: el ADR fija el precio de una unidad en el comprobante con una nota al ADR 0019, sin enmendar su texto (H-2).
- **AC-4**: el ADR fija la recepción de usados sin hacer de un cliente un proveedor (H-4), con sus datos personales y su vaciado (H-6).
- **AC-5**: el ADR dice si hace falta el tipo de cambio y lo deja para el ADR 0025, sin decidirlo (H-3).
- **AC-6**: el ADR fija qué lee el agente y que la pre-cotización es orientativa, con el cálculo en el CRM (H-7).
- **AC-7**: el ADR fija las dependencias de cada módulo nuevo, sin ciclos y sin que el núcleo dependa de una capacidad, salvo `cash` en los medios de pago, como hoy con `purchasing`.
- **AC-8**: el ADR separa lo decidido de los supuestos a confirmar con el negocio (H-9).
- **AC-9**: hay una revisión independiente antes de pedir la aceptación, con cada hallazgo verificado contra el código o el documento citado.
- **AC-10**: con el ADR aceptado, las enmiendas están escritas, fechadas, conservan el texto anterior y no contradicen al ADR.
- **AC-11**: el usuario acepta o rechaza el ADR.

## Pruebas y evidencia requerida

No hay ejecución. La evidencia es documental: el ADR, la revisión independiente con sus hallazgos verificados y los diffs de las enmiendas.

## Condiciones de detención

Detenerse y avisar si:

- el ADR necesita crear una tabla, cambiar la forma de un contrato con el agente, o enmendar el texto de un ADR aceptado o una prohibición de `CLAUDE.md`. Una nota fechada no es enmendar el texto;
- una decisión obliga a `catalog`, `inventory`, `orders` o `sales` a depender de un módulo de una capacidad, o arma un ciclo;
- una decisión necesita una dependencia nueva o un servicio externo;
- una decisión depende de cómo opera el negocio y no se puede dejar como supuesto;
- hace falta tocar un archivo fuera del alcance.

Pedir autorización explícita, en su turno, **antes de**:

- crear el proyecto de la fase y sus tareas en Notion;
- cada commit y push;
- lanzar la revisión independiente si el usuario cambia una decisión que afecta su alcance;
- el cierre.
