# Brief 11.4 — Piloto en staging

- **Contrato**: `task-brief.v1`
- **Tipo de tarea**: `runtime-validation`
- **Nivel de evidencia objetivo**:
  - `deterministic` para el seed del piloto y los instrumentos corregidos;
  - `isolated-runtime` en staging para el despliegue, las pantallas y la API de lectura;
  - `authenticated-end-to-end` para el recorrido del piloto, que hace una persona que ingresa con su usuario.
- **Nivel de validación alcanzable**: **validado en staging, sin datos reales**. Es el nivel que el Roadmap fija para la Fase 11. La API de lectura **no** llega a validado en integración: la usa un script sintético, no el agente, y se dice.
- **Orden**: última subfase de la Fase 11. Depende de la 11.1, la 11.2 y la 11.3, cerradas el 2026-09-24.
- **Cierra el gate de salida de la Fase 11.** La revisión independiente es **obligatoria** (`CLAUDE.md`; ExecutionProtocol, paso 4b).
- **Estado de este documento**: **aprobado el 2026-09-24**, con las doce decisiones resueltas por la recomendación (ver §Resolución).

## Objetivo

Que el backoffice completo, con el catálogo comercial, la información del negocio y la API de lectura, se use en staging con datos sintéticos con la forma de los del primer negocio, **sin cambiar nada mientras se lo observa**, y que lo observado quede registrado y triageado contra evidencia.

El resultado verificable tiene tres partes:

- staging corre el código de `main` con las migraciones `0016` a `0020`, y las comprobaciones posteriores al despliegue dan lo esperado;
- las 13 pantallas cargan con su contenido, y la API de lectura responde lo que dice su contrato, validado por el mismo validador de los tests;
- el usuario recorre el guion del piloto con las dos personas, y cada observación queda en `notas-piloto-11.4.md` con su severidad y su triage.

**Obligaciones que toma** ([brief-11.0](brief-11.0-instrumentos-antes-de-construir-encima.md), fila 11.4; [Roadmap](../planning/Roadmap.md) §Fase 11):

- **La condición escrita en la Fase 9**: el piloto como subfase propia, con datos sintéticos, antes de que el primer cliente cargue sus datos (13.5).
- **El criterio 4 de la Definición de Terminado del MVP**, «piloto en staging sin bloqueantes, con datos sintéticos», que la Fase 10 registró como incumplido por decisión.
- **O-36**: la validación de las personas contra el uso real, que venció en la Fase 9 sin cumplirse.
- **O-10**: decidir qué recorrido end-to-end hace falta contra staging.
- **De la 11.2**: N-5 (el `LC_CTYPE` de la base de staging) y D-8 (sumar las pantallas 5b, 11 y 12 a los dos instrumentos que recorren pantallas).
- **De la 11.0**: correr contra staging los instrumentos corregidos. La afirmación de las diez pantallas de la 9.3 no se volvió a medir desde que el instrumento se corrigió.

## Lo que se verificó antes de escribir este brief

Verificado el 2026-09-24. Nada de esta sección es supuesto.

- **Staging está vivo**: `curl -sI https://staging.vixoraai.app/login` respondió `200` (nginx 1.24.0).
- **Staging corre `c2edbb5`** (HANDOFF §0). Desde entonces, la 11.1 a la 11.3 agregaron cinco migraciones y código en `src/`. Ninguna se desplegó.
- **Las cinco migraciones**, leídas:
  - `0016`: tipo `product_condition`, tres columnas en `products` y la columna generada `search` con su GIN. Borra el índice `products_organization_name_unaccent_idx`. La columna generada reescribe `products`;
  - `0017`: `product_prices`, de solo inserción, con su trigger, su `GRANT` y el valor `price_change` en `audit_action`;
  - `0018` y `0019`: `knowledge_entries`, su GIN, el valor `knowledge_entry` en `audit_entity_type` y los privilegios de `crm_app`, sin `DELETE`;
  - `0020`: la columna `scope` de `ingestion_credentials`, con `ingest` por defecto.

  Las dos `ALTER TYPE … ADD VALUE` corren dentro de la transacción del lote y ninguna migración del lote usa el valor nuevo, que es lo que PostgreSQL exige. CI aplica las 21 migraciones en una sola transacción en cada corrida, con el mismo migrador (`scripts/migrar.ts`).
- **Qué datos tiene staging hoy**: una sola organización, «Organización de ejemplo», con 6 clientes, 10 conversaciones y **ningún producto**. La 9.3 cargó volumen y lo retiró al terminar (`evidencia-9.3-volumen.md`, «Estado de partida» y cierre).
- **La forma de los datos del primer negocio**, como contexto de negocio y nunca como dependencia técnica. El documento de brechas del usuario (repositorio del agente, rama `agent/brechas-crm-airtable`, `b75e484`) se leyó con `git show`, sin cambiar de rama. Dice:
  - los productos tienen nombre, descripción, marca, categoría y condición (nuevo o reacondicionado), con precio de venta y estado de inventario;
  - la información del negocio trata horarios, ubicación, medios de pago, envíos y demás, con categoría, vigencia y búsqueda por palabras.

  **No dice el rubro, el tamaño del catálogo ni la moneda.** Por eso D-2 se lo pregunta al usuario.
- **Los instrumentos que recorren pantallas**:
  - `scripts/recorrer-pantallas.ts` recorre las pantallas 2 a 10;
  - `tests/e2e/security-headers.spec.ts` recorre las pantallas 1, 2, 3, 6, 8 y 10.

  Ninguno de los dos cubre la 5b (precios), la 11 ni la 12 (información del negocio).
- **Las guardas de escritura** (`price-writes` y `stock-writes`) recorren solo `src/`. Un seed en `seeds/` no las dispara, igual que el seed de volumen.
- **Los seeds se niegan a correr** si el nombre de la base no termina en `_dev`, `_test`, `_e2e` o `_staging` (`assertSeedableDatabase`, `seeds/conversations.ts:294`).
- **Las personas** (`docs/product/Personas.md`) siguen en estado «diseñado»: `admin` y `viewer`, basadas en supuestos. `Risks.md` registra que la validación venció en la Fase 9.
- **La suite end-to-end vacía y siembra su propia base antes de cada caso** (`tests/e2e/global-setup.ts`). Por eso no se puede apuntar a la base de staging (O-10, D-7).

## Alcance incluido

Tres etapas (D-1).

### Etapa 11.4.1 — Preparación, en el repositorio

1. **Seed del piloto** (D-2 y D-3): `seeds/pilot.ts`, con la forma que el usuario apruebe en D-2:
   - una organización propia, «Organización del piloto», con un usuario `admin` y uno `viewer`;
   - productos con marca, categoría y condición; precios, algunos con historial; saldos que den los tres estados de stock; y algunos productos inactivos;
   - información del negocio con entradas vigentes, una programada, una vencida y una inactiva;
   - clientes, conversaciones y mensajes, para que el dashboard y las pantallas 6 a 9 tengan contenido.

   El seed es **determinista e idempotente**, se niega a correr fuera de las bases permitidas y usa correos `@example.com`. Lo corre `npm run db:seed:pilot`.
2. **Los instrumentos que recorren pantallas** (D-8, herencia D-8 de la 11.2):
   - `recorrer-pantallas.ts` suma la 5b, la 11 y la 12, cada una con su comprobación de contenido dentro de `main`;
   - `security-headers.spec.ts` suma las mismas tres.
3. **Prueba de la API de lectura contra un entorno desplegado** (D-6 y D-7): `scripts/probar-api-lectura.ts`. Pide cada ruta con una credencial que recibe por variable de entorno, y valida **toda** respuesta de éxito con los esquemas de `src/app/api/read/v1/contract.ts`. Comprueba además:
   - los rechazos: sin credencial da `401`, y con un id inexistente da `404`;
   - que no sale ninguna entrada no vigente ni ningún producto inactivo del seed.

   No escribe nada y no registra el token.
4. **Documentación**:
   - `Environments.md`: el seed del piloto;
   - `TestingStrategy.md`: la decisión de O-10;
   - `deploy/staging/README.md`: cómo encender y apagar la API de lectura en staging.

### Etapa 11.4.2 — Despliegue y verificación en staging

Cada paso de esta etapa **necesita la autorización del usuario en el turno** en que se ejecuta.

1. **Antes de tocar nada**: medir el `LC_CTYPE` de `crm_staging` (N-5, D-9) y sacar un backup con `crm-backup.service` (D-10). Se registra el archivo del backup.
2. **Desplegar `main`**, con el procedimiento de `deploy/staging/README.md`:
   - `git reset --hard origin/main`;
   - `npm ci`;
   - las migraciones `0016` a `0020` con `migrate.env`;
   - `build`;
   - reiniciar el servicio.
3. **Las comprobaciones posteriores al despliegue**, las cinco del README, con el `diff` de los nueve archivos. Además, `select * from __drizzle_migrations` confirma que las cinco quedaron aplicadas.
4. **Cargar el seed del piloto** con `seed.env`.
5. **Recorrer las 13 pantallas** con `recorrer-pantallas.ts`, con el usuario `admin` del piloto, y correr el control negativo (`CRM_CONTROL=1`). Sin el control, el cero no vale.
6. **Probar la API de lectura** (D-6):
   - crear una credencial `read` sintética de la organización del piloto;
   - encender `READ_API_ENABLED` con esa credencial en la allowlist;
   - correr `probar-api-lectura.ts`;
   - apagar la API y revocar la credencial.
7. **Registrar todo** en `evidencia-11.4-piloto.md`, con la salida cruda y lo que cada paso no mide.

### Etapa 11.4.3 — Ventana de observación y triage

1. **Arranque**: la ventana abre solo si la 11.4.2 terminó sin bloqueantes. No se arranca el reloj sobre algo roto.
2. **Durante la ventana** (D-5), el usuario recorre el guion del piloto (D-4) con los dos usuarios, `admin` y `viewer`:
   - cada observación se registra en `docs/decisions/notas-piloto-11.4.md`, con fecha, persona, pantalla y lo que pasó;
   - **no se implementa ningún cambio**, ni de código ni de configuración. La única excepción es un fallo que el usuario califique como bloqueante y decida atender, rompiendo la ventana de forma explícita;
   - las preguntas de las personas (O-36) se contestan en el mismo documento.
3. **Cierre de la ventana**: lo confirma el usuario, no la fecha.
4. **Triage**: cada nota se contrasta con evidencia (el log de la aplicación, la base, la auditoría) y recibe su severidad según la escala fijada en D-5 **antes** de mirar, y su destino: resuelta, a una subfase con nombre, o descartada con motivo. **Nada del triage se implementa en la 11.4.**
5. **Resultado de las personas**: `Personas.md` pasa de «diseñado» a lo que el piloto haya confirmado o refutado, con el límite declarado (D-4).
6. **Revisión independiente** (D-11) y cierre de la subfase y de la Fase 11 (D-12).

## Alcance excluido

- **Datos reales del negocio**, en cualquier forma. Entran en la 13.5 (decisión del usuario del 2026-09-23).
- **Implementar cualquier observación del piloto.** El triage asigna destinos; los cambios van por su brief.
- **Conectar el agente** o darle una credencial. La API de lectura no se declara validada en integración (12.3).
- **Dejar la API de lectura encendida** después de la prueba (D-6).
- **Correr la suite end-to-end contra staging** (D-7).
- **Medir rendimiento en staging**: los planes con salida cruda, la última página y la ventana del manifiesto son de la 13.2 (O-39). `medir-caminos.ts` no corre en staging en esta subfase.
- **Tocar la infraestructura de staging** más allá del despliegue y de las dos variables de la API de lectura: nginx, systemd, PostgreSQL y los timers de backup quedan como están. El `diff` lo comprueba.
- **El NUL en los formularios** (N-6 de la 11.2) y el caso intermitente de `conversations.spec.ts`: siguen sin destino fijo.
- **Retirar la «Organización de ejemplo»** de staging: se queda como está.
- **Sumar las pantallas nuevas a `Screens.md` o a los wireframes**: la 11.1 y la 11.2 ya las documentaron.

## Archivos autorizados

Crear o modificar solo estos. Tocar cualquier otro es una condición de detención.

**Etapa 11.4.1**:

- `seeds/pilot.ts` (nuevo)
- `package.json`: **solo** el script `db:seed:pilot`. Sin dependencias nuevas
- `tests/integration/pilot-seed.test.ts` (nuevo): la forma del seed, su idempotencia y que la API de lectura sobre esos datos respeta la vigencia y los inactivos
- `scripts/recorrer-pantallas.ts`: **solo** las pantallas 5b, 11 y 12
- `tests/e2e/security-headers.spec.ts`: **solo** las pantallas 5b, 11 y 12
- `scripts/probar-api-lectura.ts` (nuevo)
- `docs/development/Environments.md`, `docs/development/TestingStrategy.md` y `deploy/staging/README.md`

**Etapa 11.4.2**:

- `docs/decisions/evidencia-11.4-piloto.md` (nuevo)
- **En el servidor, con autorización en el turno**:
  - `/srv/crm-staging`, por el procedimiento de despliegue;
  - la base `crm_staging`: las migraciones, el seed y una credencial sintética;
  - `/etc/crm-staging/app.env`: **solo** `READ_API_ENABLED` y `READ_API_ALLOWED_CREDENTIALS`, que al terminar vuelven a quedar apagadas.

**Etapa 11.4.3**:

- `docs/decisions/notas-piloto-11.4.md` (nuevo)
- `docs/product/Personas.md` y `docs/planning/Risks.md`: **solo** el resultado de O-36

**Al cerrar**:

- este brief, `docs/decisions/README.md`, `CHANGELOG.md` y `HANDOFF.md`;
- `docs/planning/Roadmap.md`, **solo** para marcar la Fase 11 como cerrada y registrar el gate.

## Fuentes de verdad

- **El código y las migraciones**: `drizzle/0016` a `0020`, `seeds/`, `scripts/`, `src/app/api/read/v1/contract.ts`.
- **El procedimiento de staging**: `deploy/staging/README.md` y `docs/runbooks/restaurar-la-base.md`.
- **Las decisiones anteriores**:
  - la condición del piloto en el [Roadmap](../planning/Roadmap.md) §Fase 9, con la precisión del 2026-09-23, y §Fase 11;
  - la [evaluación 10.1](evaluacion-10.1-mvp.md): O-10 y O-36;
  - [brief-11.2](brief-11.2-informacion-del-negocio.md): N-5 y D-8;
  - [brief-11.3](brief-11.3-api-de-lectura.md) y [contracts/read-v1.md](../contracts/read-v1.md).
- **La metodología**: *Observation Window Before Iteration* y *Validation Levels and Evidence Discipline*, del vault.
- **Contexto de negocio, nunca dependencia técnica**: el documento de brechas del usuario, B-8 y B-9.

## Decisiones pendientes

Cada una trae una recomendación. El usuario puede aprobarlas en bloque o cambiar cualquiera. **D-2 necesita datos que solo el usuario tiene.**

### D-1 — Etapas

- **(a) Recomendada: tres etapas**:
  - la **11.4.1** cambia el repositorio y se valida localmente y en CI, con su commit;
  - la **11.4.2** cambia staging y no el código;
  - la **11.4.3** observa y no cambia nada.

  Separarlas es lo que permite que la ventana observe una versión fija: el código que se observa es el de la 11.4.1, desplegado en la 11.4.2.
- (b) Una sola etapa. Mezcla cambios de código con la observación, que es exactamente lo que la ventana prohíbe.

### D-2 — La forma de los datos sintéticos

El documento de brechas dice qué campos tiene el negocio, pero no su rubro, su tamaño ni su moneda. **Necesito que el usuario diga**:

1. **el rubro** y unas categorías y marcas típicas, inventadas o genéricas, **nunca las reales** si identifican al negocio;
2. **el tamaño aproximado** del catálogo;
3. **la moneda** y **la zona horaria**;
4. **los temas** de la información del negocio: por ejemplo horarios, ubicación, medios de pago, envíos, garantía y devoluciones.

- **(a) Recomendada, si el usuario no quiere precisarlo**:
  - un comercio de tecnología con productos nuevos y reacondicionados, que es lo que sugiere la condición del documento de brechas;
  - **60 productos** en 6 categorías y 8 marcas. Dos tercios son nuevos y un tercio reacondicionados. El 85 % tiene precio, y 10 de ellos con dos o tres precios de historial. Hay 5 inactivos y saldos que dan los tres estados de stock;
  - pesos argentinos (`ARS`) y `America/Argentina/Buenos_Aires`;
  - **15 entradas** de información, sobre horarios, ubicación, medios de pago, envíos, garantía y devoluciones, con una programada, una vencida y una inactiva;
  - **30 clientes y 40 conversaciones** con mensajes, en los tres estados, repartidos en los últimos 30 días.

  Es poco volumen a propósito: el piloto mide si el backoffice sirve, no cuánto aguanta. El volumen ya lo midió la 9.3, y lo vuelve a medir la 13.2.
- (b) El tamaño real del catálogo del negocio, con nombres inventados. Da una lista de productos más parecida a la que el operador va a manejar, a costa de un seed más largo.

### D-3 — Cómo llegan los datos a staging

- **(a) Recomendada: un seed versionado**, `seeds/pilot.ts`, con organización y usuarios propios:
  - no se mezcla con la «Organización de ejemplo», que sigue como está;
  - es determinista, así que el triage puede reproducir en desarrollo lo que el piloto vio en staging;
  - un test de integración fija su forma y su idempotencia.

  Los precios y los saldos se insertan con la misma disciplina del seed de volumen: cada saldo sale de su cadena de movimientos, y cada precio es una fila más de `product_prices`, sin actualizar ninguna.

  Lo que el guion pide hacer desde las pantallas —crear un producto, cambiar un precio, ajustar stock, editar una entrada— lo hace el usuario durante la ventana, sobre ese piso.
- (b) Cargar todo a mano desde las pantallas. Es lo más parecido al uso real, pero 60 precios y 15 entradas a mano convierten el piloto en una carga de datos, y no se puede reproducir.

### D-4 — El guion del piloto y las personas (O-36)

- **(a) Recomendada**: un guion de tareas por persona, en `notas-piloto-11.4.md`, escrito antes de abrir la ventana.
  - **`admin`**:
    - buscar un producto por una palabra de la marca y otra por el SKU;
    - crear un producto y cambiarle el precio dos veces, y mirar el historial;
    - ajustar stock hasta que quede bajo y después sin stock;
    - crear una entrada de información programada para mañana y desactivar una vigente;
    - cambiar el estado de una conversación;
    - crear un usuario `viewer`, desactivarlo y reactivarlo;
    - leer el dashboard del último mes.
  - **`viewer`**:
    - encontrar un producto y su precio;
    - encontrar a un cliente y sus conversaciones, con el teléfono enmascarado;
    - leer la información del negocio;
    - comprobar que no puede editar nada de lo anterior.
  - **Desde el lado del agente**: el usuario lee la salida de `probar-api-lectura.ts` para tres preguntas típicas de un cliente, por ejemplo «¿tienen un celular reacondicionado?» o «¿hacen envíos?». Anota si la respuesta le alcanzaría al agente para contestar. **Esto no es integración**: es el juicio del dueño del negocio sobre la forma del contrato.

  **Las preguntas de las personas**, una por supuesto de `Personas.md`:
  - ¿quién opera el backoffice en el negocio, y con qué rol?
  - ¿existe de verdad alguien con solo lectura?
  - ¿el `viewer` necesita ver el precio? ¿Y el teléfono sin enmascarar?
  - ¿quién cambia los precios y quién ajusta el stock?
  - ¿quién edita la información del negocio?

  **Límite declarado**: con datos sintéticos, y siendo el usuario quien hace de las dos personas, esto valida las personas **contra el conocimiento del dueño sobre su operación**, no contra la observación de un operador real. Se registra así en `Personas.md` y en `Risks.md`. La observación de un operador real queda para la 13.5, con datos reales.
- (b) Sin guion: uso libre durante la ventana. Es más natural, pero no garantiza que cada pantalla y cada rol se ejerciten, y deja las personas sin contestar.

### D-5 — La ventana y la escala de severidad

- **(a) Recomendada**:
  - **Duración**: sin fecha fija. La ventana cierra cuando el usuario completó el guion y confirma el cierre. Es un piloto guiado con datos sintéticos, no uso sostenido, y fingir lo contrario con un plazo sería inventar evidencia.
  - **Escala, fijada antes de mirar**, que es la lección de la 8.4:
    - **bloqueante**: una persona no puede completar una tarea del guion; un dato se pierde, se corrompe o se muestra a quien no debe; o la API devuelve algo que contradice su contrato;
    - **mayor**: la tarea se completa, pero con un error visible o un resultado equivocado que la persona puede no notar;
    - **menor**: la tarea se completa bien, pero con fricción, un texto confuso o un paso de más;
    - **observación**: una idea, un pedido o una diferencia con cómo se opera de verdad.
  - **El gate**: la Fase 11 cierra solo si, después del triage, **no queda ningún bloqueante abierto**. Un mayor abierto no bloquea el gate, pero necesita destino con nombre, y el usuario lo acepta explícitamente al cerrar.
  - **Romper la ventana**: solo por un bloqueante y solo si el usuario lo decide. En ese caso se registra, se corrige con su propio brief y la ventana se reabre desde el principio del guion.
- (b) Una ventana con fecha fija, por ejemplo siete días. Es la forma del vault para uso real sostenido, que acá no hay.

### D-6 — La API de lectura en staging

- **(a) Recomendada: encenderla solo para la prueba y apagarla al terminar.**
  - Se crea una credencial `read` sintética de la organización del piloto, con `source` `piloto-11-4`, y se pone su id en la allowlist.
  - Se corre `probar-api-lectura.ts` desde la máquina local contra `https://staging.vixoraai.app`: pasa por nginx, TLS y `proxy.ts`, igual que va a pasar el agente.
  - Se vuelve a correr durante la ventana cuando el usuario haga el paso «desde el lado del agente», y se apaga al cerrar.
  - La credencial se revoca, y el log la muestra revocada.

  Así, el contrato llega a **validado en staging** (`isolated-runtime`) con su validador en verde, que es lo que pide el gate, sin dejar abierta una superficie que nadie usa. El token nunca se versiona ni entra en la evidencia.
- (b) Dejarla encendida hasta la 12.3. Ahorra encenderla de nuevo, pero deja una superficie viva con una credencial que nadie vigila.
- (c) No encenderla en staging. El contrato quedaría con el validador en verde solo en CI, y el gate lo permite, pero se perdería la única prueba del borde real (nginx, TLS, `TRUSTED_PROXY`) antes de la 12.3.

### D-7 — Qué recorrido end-to-end hace falta contra staging (O-10)

- **(a) Recomendada: la suite de Playwright no corre contra staging.** El recorrido contra staging son tres cosas que no escriben datos de negocio:
  - `recorrer-pantallas.ts`, con su control negativo;
  - `probar-api-lectura.ts`;
  - el guion del piloto, que hace una persona.

  La suite vacía y siembra su base antes de cada caso, así que apuntarla a staging exige un túnel al PostgreSQL del droplet y una base aparte. En una máquina de 961 MB, eso compite con la aplicación, y lo que probaría (la aplicación sobre PostgreSQL 18 con `next start`) ya lo prueba CI. Se registra en `TestingStrategy.md`, con la condición de reapertura: **se reevalúa en la 13.1**, cuando exista producción y haga falta un smoke test del despliegue.
- (b) Una base `crm_staging_e2e` en el droplet y la suite corriendo contra ella por túnel. Más cobertura, pero con un costo de memoria y configuración que no compra nada que CI no dé.

### D-8 — Los instrumentos que recorren pantallas (herencia de la 11.2)

- **(a) Recomendada**: `recorrer-pantallas.ts` y `security-headers.spec.ts` suman la 5b, la 11 y la 12.
  - El recorrido llega a la 5b haciendo clic desde el detalle del producto y a la 12 desde la lista de la 11, sin ids escritos a mano. Es la regla que el propio script declara.
  - Cada una se comprueba con un elemento propio dentro de `main`, no con un rótulo del menú (R-7 de la 9.3).
  - **Mutación**: con la comprobación de contenido de la 11 cambiada a un texto que no existe, el recorrido local tiene que dar un problema de contenido en esa pantalla. Se restaura.
- (b) Solo el recorrido, no el spec de cabeceras. Las tres pantallas usan el mismo `proxy.ts`, pero entonces la afirmación «CSP en todas las pantallas» dejaría de ser cierta.

### D-9 — `LC_CTYPE` de staging (N-5 de la 11.2)

- **(a) Recomendada: medirlo antes de migrar, y parar si no es UTF-8.**
  - Se mide con `select datcollate, datctype from pg_database where datname = 'crm_staging'` y con `select lower('ÁÉÑ')`, que en una base UTF-8 da `áéñ`.
  - `lower()` fuera de ASCII depende del `LC_CTYPE`, y de `lower()` dependen el SKU único, el título único de las entradas y la búsqueda por palabras.
  - Si da `C` o `POSIX`, **es una condición de detención**. Corregirlo exige recrear la base con otra configuración regional, y eso es una decisión del usuario con su propio procedimiento.
- (b) Medirlo después de migrar. Si da mal, las migraciones ya crearon índices que dependen de él.

### D-10 — Despliegue, backup y vuelta atrás

- **(a) Recomendada**:
  - **Backup antes de migrar**: `sudo systemctl start crm-backup.service` y registrar el archivo que produjo. Es la vuelta atrás de las migraciones, que no tienen `down`. Restaurarlo sigue `restaurar-la-base.md`, que la 9.2 probó.
  - **Vuelta atrás del código**: `git reset --hard c2edbb5`, `build` y reiniciar. Solo sirve **antes** de migrar. Después de migrar, la vuelta atrás es restaurar el backup y después el código, en ese orden.
  - **Un fallo de migración** deja el lote sin aplicar, porque va en una sola transacción. Es una condición de detención: se registra el error con su SQLSTATE, que `migrar.ts` imprime, y no se reintenta sin entenderlo.
  - **Una comprobación posterior que falla** también es una condición de detención, en particular el `diff` de los nueve archivos y el salto único de proxy (H-3).
- (b) Sin backup previo: el timer diario ya hace uno. Pero ese puede tener hasta un día, y el seed del piloto no estaría en él. El backup manual cuesta segundos.

### D-11 — Revisión independiente

- **(a) Recomendada: una sola, obligatoria, después del triage y antes del cierre.**
  - La hace un agente que no participó, con acceso de solo lectura, contra este brief, `CLAUDE.md`, la evidencia, las notas y su triage.
  - Mira en particular:
    - que cada nota tenga severidad según la escala de D-5 y destino;
    - que ningún bloqueante haya quedado cerrado sin evidencia;
    - que los niveles de validación declarados no superen lo medido;
    - que los recuentos cierren.
  - Sus hallazgos se verifican contra el código y la evidencia antes de aceptarse.
- (b) Dos revisiones: una al terminar la 11.4.2, antes de abrir la ventana, y otra al cierre. La primera atraparía un despliegue mal verificado antes de gastar la ventana en él. Cuesta una revisión más.

### D-12 — El cierre de la Fase 11

- **(a) Recomendada**: el cierre de la 11.4 cierra también la Fase 11, en el mismo turno y con la autorización del usuario:
  - la entrada de la fase en `CHANGELOG.md`, con **Certifica** y **No certifica**;
  - el Roadmap, con el gate de salida y su evidencia;
  - Notion: la tarea 11.4 (`3e4702be6f4e81e48769d30dca0c70d7`), el proyecto de la Fase 11 y su tarea espejo, en «Completado».

  **La Fase 12 no se abre en ese turno**: su proyecto de Notion y el brief de la 12.1 son el paso siguiente, con su propia aprobación.
- (b) Cerrar la 11.4 y dejar la Fase 11 para un turno aparte. Solo agrega un paso: la 11.4 es la última subfase.

## Resolución — 2026-09-24

El usuario aprobó el brief **con las recomendaciones** de las doce decisiones: D-1 a D-12, cada una en su opción (a).

**D-2 queda con la forma recomendada**, porque el usuario no dio otra:

- un comercio de tecnología con productos nuevos y reacondicionados;
- 60 productos en 6 categorías y 8 marcas, todas inventadas;
- 15 entradas de información;
- 30 clientes y 40 conversaciones;
- `ARS` y `America/Argentina/Buenos_Aires`.

En el mismo turno autorizó el commit del brief y pasar la tarea 11.4 de Notion (`3e4702be6f4e81e48769d30dca0c70d7`) a «En proceso». **No autorizó push**, ningún paso de la 11.4.2 ni ningún cambio en staging.

## Invariantes

- Ninguna prohibición de `CLAUDE.md` cambia. `forbidden-references.test.ts` no se toca y sigue en verde.
- **Ningún dato real entra en staging.** Ningún nombre, teléfono, precio ni texto del seed sale de los datos del negocio.
- **Durante la ventana no cambia el código, la configuración ni el esquema de staging.** Si cambia, la ventana se reabre (D-5).
- Staging no queda con la API de lectura encendida ni con una credencial activa al cerrar (D-6).
- La configuración versionada de staging y la del servidor coinciden: el `diff` de los nueve archivos da cero.
- El token de la credencial no aparece en el repositorio, en la evidencia ni en el log.
- Ningún instrumento corre contra staging algo que escriba datos de negocio, salvo el seed del piloto, lo que el usuario hace desde las pantallas y la credencial de la prueba.
- Toda cifra de la evidencia es salida cruda o dice que no lo es.

## Criterios de aceptación

**Etapa 11.4.1**:

- **AC-1 (seed)**: `seeds/pilot.ts` crea la forma aprobada en D-2. Un test de integración comprueba:
  - los recuentos por clase;
  - los tres estados de stock;
  - los productos inactivos;
  - una entrada programada, una vencida y una inactiva;
  - que una segunda corrida no cambia nada;
  - que se niega a correr contra una base no permitida.

  Sobre esos datos, la API de lectura no devuelve ningún inactivo ni ninguna entrada no vigente.
- **AC-2 (instrumentos)**:
  - `recorrer-pantallas.ts` recorre 13 pantallas en local, sin problemas;
  - con la mutación de D-8 da un problema de contenido en la pantalla mutada;
  - `security-headers.spec.ts` cubre la 5b, la 11 y la 12 con cero violaciones de la CSP.
- **AC-3 (prueba de la API)**:
  - `probar-api-lectura.ts` corre en local contra `next start` con una credencial sintética, y valida toda respuesta de éxito con los esquemas del contrato;
  - con una mutación que agrega un campo a una respuesta, el script sale con un código distinto de 0;
  - el token no aparece en su salida.
- **AC-4 (CI)**: `format:check`, `lint`, `typecheck`, Vitest y el end-to-end completo, en verde en local y en CI, leída por `headSha` y `conclusion`.

**Etapa 11.4.2**:

- **AC-5 (N-5)**: el `LC_CTYPE` de `crm_staging` y el resultado de `lower('ÁÉÑ')` quedan en la evidencia, en crudo. Si no es UTF-8, la subfase se detuvo ahí.
- **AC-6 (despliegue)**:
  - el backup previo está registrado con su archivo y su tamaño;
  - `migrar.ts` imprimió `Migraciones aplicadas.`, y `__drizzle_migrations` tiene las cinco nuevas;
  - staging corre el commit de la 11.4.1, verificado con `git rev-parse HEAD` en el servidor.
- **AC-7 (comprobaciones posteriores)**: las cinco del README dan lo esperado, con su salida cruda: el `diff` de los nueve archivos, el salto único de proxy, HSTS, loopback y el rol que no es dueño.
- **AC-8 (pantallas)**:
  - `recorrer-pantallas.ts` contra staging recorre las 13 pantallas con **0 problemas**;
  - el control negativo detecta cada clase.

  Afirma que cargan con su contenido, no que sean usables. Eso es de la 11.4.3.
- **AC-9 (API en staging)**:
  - `probar-api-lectura.ts` contra staging valida toda respuesta con el contrato;
  - el log de staging tiene una línea por pedido, con `request_id`, `source` `piloto-11-4`, la ruta y la duración, sin el token ni `q`;
  - al terminar, la API responde `404`, porque está apagada, y la credencial figura revocada.

**Etapa 11.4.3**:

- **AC-10 (guion)**: `notas-piloto-11.4.md` tiene el guion escrito antes de abrir la ventana, y cada tarea de las dos personas está marcada como hecha, o no hecha con su motivo.
- **AC-11 (ventana)**:
  - entre la apertura y el cierre, staging no cambió de código ni de configuración: `git rev-parse HEAD` y el `diff` se repiten al cerrar y coinciden con los de la apertura;
  - el cierre lo confirma el usuario, con fecha.
- **AC-12 (triage)**: cada nota tiene severidad según la escala de D-5, la evidencia con que se contrastó y un destino. **Ningún bloqueante queda abierto.** Cada mayor tiene subfase con nombre y la aceptación explícita del usuario.
- **AC-13 (O-36)**:
  - las cinco preguntas de las personas están contestadas;
  - `Personas.md` refleja lo confirmado y lo refutado, con el límite de D-4;
  - la fila de `Risks.md` se cierra o se reescribe con fecha.
- **AC-14 (O-10)**: `TestingStrategy.md` registra la decisión de D-7 y su condición de reapertura.
- **AC-15 (revisión independiente)**: hecha según D-11. Cada hallazgo está verificado contra el código o la evidencia, y registrado en este brief con su resolución.
- **AC-16 (alcance)**: `git status` muestra solo archivos de la lista. `forbidden-references.test.ts`, `proxy.ts` y `eslint.config.mjs` no cambiaron.

## Pruebas y evidencia requerida

- **11.4.1**: `deterministic`. Comandos: `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build` y `npm run test:e2e`, más `recorrer-pantallas.ts` y `probar-api-lectura.ts` contra `next start` local. Cada mutación se aplica, se corre, se registra y se restaura.
- **11.4.2**: `isolated-runtime` en staging. Toda salida va cruda a `evidencia-11.4-piloto.md`, con la hora y el comando, y con lo que no mide.
- **11.4.3**: `authenticated-end-to-end`, hecho por una persona. La evidencia son las notas, fechadas, y el log y la auditoría de staging con que se contrastan.
- **Lo que no se certifica**, desde ahora:
  - validado en integración para la API de lectura (12.3);
  - rendimiento en staging (13.2);
  - uso real sostenido;
  - la validación de las personas contra un operador real (13.5).

## Condiciones de detención

- Antes de cada commit, push, merge o despliegue.
- **Antes de cada paso de la 11.4.2**: despliegue, migraciones, seed, cambios en `app.env` y creación de la credencial. Cada uno necesita autorización en el turno.
- Si el `LC_CTYPE` de `crm_staging` no es UTF-8 (D-9).
- Si una migración falla, o si una comprobación posterior al despliegue no da lo esperado (D-10).
- Si durante la ventana aparece un bloqueante: se registra y se pregunta al usuario si rompe la ventana. No se corrige nada sin su decisión.
- Si alguna tarea exige tocar un archivo fuera de la lista.
- Si D-2 no está contestada: el seed no se escribe con una forma inventada.
- Antes de instalar cualquier dependencia. Esta subfase no prevé ninguna.
- Antes de cambiar el estado en Notion sin que el usuario haya aprobado el brief o confirmado el cierre.

## Autorización de la ejecución — 2026-09-24

En el turno siguiente a la aprobación, el usuario autorizó **el push y cualquier paso sobre staging**, y pidió arrancar con la 11.4.1. Con eso quedan autorizados, en ese turno:

- el push del brief (`d3e9a38`) y el commit y el push de la 11.4.1;
- los pasos de la 11.4.2: el backup previo, el despliegue, las migraciones `0016` a `0020`, el seed del piloto, la credencial sintética y los cambios de `app.env` para encender y apagar la API de lectura.

Las condiciones de detención siguen en pie: un `LC_CTYPE` que no sea UTF-8, una migración que falla o una comprobación posterior que no da lo esperado detienen la subfase igual.

## Resultados — etapa 11.4.1, 2026-09-24 (autoevaluación)

### Lo que la implementación encontró que el brief no decía

- **El seed repone la organización y los usuarios, y eso cambia su `updated_at`.** El primer intento del caso de idempotencia comparaba la fila entera y falló solo en `organizations` y `organization_members`. Es la conducta buscada: la contraseña vuelve a ser la de `SEED_USER_PASSWORD`, como en el seed básico. La huella excluye `updated_at` **solo** en esas dos tablas; en las demás, que se insertan con `DO NOTHING`, compara la fila entera.
- **La primera versión del seed ponía todos los reacondicionados en dos categorías.** `index % 3` coincide con `index % 6` en las mismas posiciones. Se vio al leer el código antes de correrlo. Ahora rota con la vuelta, y el test exige reacondicionados en las seis categorías.
- **Una mutación puede medir el proceso equivocado.** La primera corrida de la mutación del AC-3 dio **0 fallas**. El `next start` anterior seguía escuchando en el puerto 3200 después de detener su tarea, y el nuevo, con la mutación, murió con `EADDRINUSE` sin que nada lo mostrara. Se detectó por el log del proceso nuevo y por `netstat`, se mató el viejo (PID 42252) y se repitió. Esa primera corrida **no cuenta**.
- **N-5, medido antes de la 11.4.2** porque es de solo lectura: `crm_staging` usa `C.UTF-8` como `LC_CTYPE` y `lower('ÁÉÑ')` da `áéñ`. **No detiene la subfase.** La *collation* también es `C.UTF-8`, no `en_US.utf8` como en las bases locales: el orden alfabético de staging es por código de carácter, así que un nombre que empieza con una letra acentuada queda después de la «z». Se registra como observación para el triage del piloto. Salida cruda en `evidencia-11.4-piloto.md`.

### Corridas locales

- **Seed**: `npm run db:seed:pilot`, dos veces seguidas, contra `crm_dev`. Las dos imprimieron `Seed del piloto aplicado: piloto-admin@example.com, piloto-lectura@example.com; 60 productos, 15 entradas, 30 clientes y 40 conversaciones.`
- **Prueba de la API** (`probar-api-lectura.ts`) contra `next start` en el puerto 3200, con una credencial `read` sintética de la organización del piloto:
  - 4 búsquedas de productos, el detalle, 3 rechazos y 4 lecturas de información;
  - **0 fallas**, con salida 0. El token aparece 0 veces en la salida (`grep -c`);
  - la credencial se revocó al terminar.
- **Recorrido** (`recorrer-pantallas.ts`) contra el mismo servidor, con `piloto-admin@example.com`: **13 pantallas, 0 problemas**, y la sesión cerrada al final.

### Corridas de mutación

Cada una se aplicó, se corrió, se registró y se restauró.

| Criterio | Mutación | Sin la mutación | Con la mutación |
|---|---|---|---|
| AC-2, recorrido | la comprobación de la pantalla 11 busca la columna «Vigencia inexistente» | 13 pantallas, 0 problemas | la 11 queda en **NO APARECIÓ**, «Problemas registrados: 1» y salida 1 |
| AC-3, prueba de la API | `toContractProduct` agrega `quantity_on_hand` a cada producto, con `build` nuevo | 0 fallas | **5 fallas**: las 4 búsquedas, fuera del contrato, y el detalle, que no tuvo producto que pedir. Salida 1. Medido contra el proceso nuevo (PID 35464), no contra el viejo (ver arriba) |

`scripts/recorrer-pantallas.ts` y `src/app/api/read/v1/contract.ts` quedaron como antes de cada mutación: `git diff` de `contract.ts`, vacío.

### Contraste por criterio (etapa 11.4.1)

- **AC-1 (seed)** — cumplido. `tests/integration/pilot-seed.test.ts`, 6 casos:
  - los recuentos de la forma aprobada, escritos a mano, contra la base;
  - seis categorías, ocho marcas y reacondicionados en las seis;
  - todo en `ARS`, y ningún saldo distinto del último `balance_after` de su cadena;
  - los tres estados de stock entre los activos;
  - una entrada programada, una vencida, una inactiva y 12 vigentes;
  - una segunda corrida, con otro día, que no cambia la huella ni pisa una entrada editada;
  - el rechazo de una base no permitida;
  - la API sobre esos datos: ningún inactivo en cuatro búsquedas, `404` para el detalle de uno inactivo, y 12 entradas sin ninguna de las tres no vigentes.
- **AC-2 (instrumentos)** — cumplido en lo que se corrió en local:
  - el recorrido de las 13 pantallas y su mutación, arriba;
  - `security-headers.spec.ts` suma la 5b, la 11 y la 12, en claro y en oscuro. El resultado va en §Cierre de la etapa.
- **AC-3 (prueba de la API)** — cumplido: contrato validado, mutación en rojo y el token fuera de la salida.
- **AC-4 (CI)** — en §Cierre de la etapa.

## Cierre de la etapa 11.4.1, 2026-09-25 (autoevaluación)

- **Vitest**: **1170 de 1170** en 90 archivos, contra PostgreSQL real de desarrollo. Son los 6 casos de `pilot-seed.test.ts` sobre los 1164 de la 11.3.
- **End-to-end en local: no hay una corrida completa limpia**, y se dice así:
  - la corrida completa dio **96 de 97** en **2,8 horas**, cuando lo normal son minutos. Falló el caso 3 de `knowledge.spec.ts`, que esta etapa no toca, por un timeout de 30 s en un `page.evaluate`;
  - la repetición de `knowledge.spec.ts` y `security-headers.spec.ts` dio 13 de 14 en 40 minutos. Falló el caso 3 de `security-headers.spec.ts` con **`net::ERR_NETWORK_IO_SUSPENDED`** al navegar a `/usuarios`: Windows suspendió la red a mitad de la corrida. Es la firma de la máquina entrando en reposo, y explica también las dos duraciones;
  - `security-headers.spec.ts` solo, con la máquina despierta: **5 de 5 en 23,5 s**, con el caso de las 13 pantallas en claro y en oscuro;
  - `knowledge.spec.ts` pasó entero en la repetición.

  Cada spec pasó en al menos una corrida, pero **no en la misma**. La corrida completa limpia es la de CI.
- `format:check`, `lint` y `typecheck`, limpios.
- **CI de `f241f62`** (run `36090109504`, leído por `headSha` y `conclusion`): **`success`**. Vitest **296 + 384 + 490 = 1170** en **13 + 46 + 31 = 90** archivos, igual que en local, y el end-to-end completo **97 de 97 en 3,3 min**. Es la corrida completa limpia que en local no se obtuvo. **AC-4 cumplido.**
- **Nivel**: validado localmente (`deterministic`). Nada de esta etapa se desplegó.

## Resultados — etapa 11.4.2, 2026-09-25 (autoevaluación)

La salida cruda de cada paso está en [evidencia-11.4-piloto.md](evidencia-11.4-piloto.md), §Etapa 11.4.2. Se ejecutó entre las 13:11 y las 13:22 UTC, después de leer el CI de `f241f62` en `success`.

- **AC-5** — cumplido: `C.UTF-8` y `lower('ÁÉÑ')` → `áéñ`.
- **AC-6** — cumplido:
  - backup `crm_staging-20260925T131120Z.dump`, de 55 997 bytes;
  - `Migraciones aplicadas.`, con `__drizzle_migrations` de 16 a 21;
  - HEAD `f241f62` en el servidor.
- **AC-7** — cumplido:
  - los nueve archivos sin diferencias;
  - un solo salto de proxy, con su control desde otra IP;
  - HSTS solo sobre HTTPS;
  - la aplicación solo en `127.0.0.1:3000`;
  - `permission denied` para el rol de la aplicación.
- **AC-8** — cumplido: 13 pantallas con el `admin` del piloto, **0 problemas**, y el control negativo detectó cada clase.
- **AC-9** — cumplido:
  - `probar-api-lectura.ts`, 0 fallas;
  - 12 pedidos y 12 líneas de log, sin el token, sin `q` y sin ids buscados;
  - al terminar, `404`, `app.env` igual byte a byte al previo, y la credencial `38bf78e9-…` revocada.
- **Seed del piloto**, con el rol de la aplicación: los recuentos de D-2 en la base, iguales tras una segunda corrida, y la organización de ejemplo intacta.

**Lo que la ejecución encontró que el brief no decía**: el procedimiento del README no corre tal como está escrito (**E-1**). `. /etc/crm-staging/migrate.env` da `Permission denied` al usuario del ssh, porque los archivos son `0600` de `root`. Ese primer intento no llegó a la base, así que no fue un fallo de migración ni la condición de detención de D-10. Se corrió con `sudo bash -c "… exec sudo -u benja --preserve-env=<variables> npm run …"`. La corrección del README no está en la lista de archivos de esta etapa. Va al triage con E-2 a E-4.

**Nivel**: el despliegue y las pantallas, validados en staging (`isolated-runtime`). La API de lectura, **validada localmente y en CI, más una corrida en staging**, y **no** validada en integración (ver H-1 abajo). La 11.4.2 terminó **sin bloqueantes**, así que la ventana de la 11.4.3 puede abrir (§Etapa 11.4.3, paso 1).

## Resultados — etapa 11.4.3, 2026-09-25 (autoevaluación)

El guion, las respuestas, el cierre de la ventana y el triage están en [notas-piloto-11.4.md](notas-piloto-11.4.md).

- **AC-10 (guion)** — cumplido. El guion se escribió antes de abrir la ventana, junto con el estado de apertura, tomado a las 13:32 UTC. La primera escritura del `admin` en la auditoría es de las 13:53:39. Las 12 tareas quedaron hechas:
  - A-1 a A-7 y V-1 a V-4, informadas por el usuario. La auditoría confirma las cinco tareas del `admin` que escriben;
  - G-1, leyendo la salida ya registrada.

  **Lo que no mide**: de V-1 a V-4 no hay evidencia independiente del relato del usuario, porque las lecturas no dejan auditoría. Se declara así (H-7).
- **AC-11 (ventana)** — cumplido:
  - los seis valores de apertura y cierre coinciden, con su salida cruda;
  - el servicio no se reinició;
  - el cierre lo confirmó el usuario el 2026-09-25: «Confirmo cierre».
- **AC-12 (triage)** — cumplido, **salvo la aceptación del mayor**:
  - 12 filas: 0 bloqueantes, 1 mayor, 1 menor y 10 observaciones. Cada una tiene severidad, contraste y destino;
  - **E-1, el único mayor, necesita que el usuario acepte explícitamente** su destino propuesto, la 12.1.
- **AC-13 (O-36)** — cumplido:
  - las cinco preguntas están contestadas, con las respuestas textuales;
  - `Personas.md` tiene §Resultado del piloto 11.4, con el límite de D-4;
  - en `Risks.md`, la fila del riesgo se reescribió con fecha, y la de la pregunta abierta quedó «hecha en parte», con el resto en la 13.5.
- **AC-14 (O-10)** — cumplido en la 11.4.1: `TestingStrategy.md`, §«Contra staging (O-10)».
- **AC-16 (alcance)**:
  - `git log d727990..HEAD` sobre `tests/guards/forbidden-references.test.ts`, `src/proxy.ts` y `eslint.config.mjs` sale vacío: no cambiaron;
  - los archivos que tocaron los tres commits y el trabajo sin commitear están en la lista;
  - hay tres desvíos de **etapa**, no de lista (H-12):
    - el brief registró resultados en cada etapa, aunque figura solo «al cerrar»;
    - `evidencia-11.4-piloto.md` se creó en la 11.4.1, con la medición N-5, que es el paso 1 de la 11.4.2 adelantado;
    - `docs/decisions/README.md` se tocó al aprobar el brief (`d3e9a38`), no al cerrar.

**Desvíos de D-6** (H-8):
- No se volvió a correr la prueba de la API durante la ventana, como preveía D-6. Encenderla habría cambiado `app.env` durante la ventana.
- Tampoco se cumplió «el log la muestra revocada». La revocación se ve en la base (`revoked_at`) y en la salida del comando, porque el log de la aplicación no registra revocaciones.

Ver notas, §Desde el lado del agente.

## Revisión independiente, 2026-09-25

La hizo un agente `independent-reviewer` que no participó del trabajo, con acceso de solo lectura, después del triage y antes del cierre (D-11).

- **Veredicto: R1**, con cambios menores. Ningún bloqueante.
- El revisor no pudo ejecutar `git`. Por eso AC-16 y los tres archivos protegidos se comprobaron después con `git log`; el resultado está en §Resultados — etapa 11.4.3.
- **Cada hallazgo se verificó contra la fuente antes de aceptarlo.** Ninguno otorga autorización.

| # | Severidad | Hallazgo | Verificación | Resolución |
| --- | --- | --- | --- | --- |
| H-1 | mayor | La evidencia y D-6 declaran la API «validada en staging». El Roadmap (§Fase 11, gate de salida) dice que, sin el agente, el contrato «queda en validado localmente y en CI, y se dice». Y en la escala de `CLAUDE.md`, «validado en staging» está por encima de «validado en integración» | **Aceptado.** D-6 (a) dice «el contrato llega a **validado en staging**», y el Roadmap dice lo contrario. Son dos fuentes del mismo rango | La evidencia y §Resultados — 11.4.2 pasan a lo que se midió: «validada localmente y en CI, más una corrida en staging; no validada en integración». **D-6 no se edita**, porque es texto aprobado. La discrepancia queda registrada acá, y **el cierre de la Fase 11 cita el nivel del Roadmap**. Decide el usuario al cerrar |
| H-2 | menor | El recuento del triage decía «11 filas… 9 observaciones», pero la tabla tiene 12 filas y 10 observaciones | Aceptado: N-7 está partida en 7a y 7b | Corregido en las notas |
| H-3 | menor | Seis destinos no eran ninguno de los tres que admite §Etapa 11.4.3, paso 4 | Aceptado | N-2 a N-5, N-7a y N-7b pasan a «descartada para las Fases 11 a 14», con motivo y condición de reapertura |
| H-4 | menor | El destino de E-1 le atribuye a la 12.1 un despliegue que el Roadmap no menciona | Aceptado en parte. El Roadmap le da a la 12.1 «las pruebas contra staging», así que va a desplegar, pero eso es una inferencia | El destino queda como **propuesto**, con la inferencia explícita y el README en la lista de archivos de la 12.1. El usuario lo acepta o lo cambia |
| H-5 | menor | Hay cifras de apertura, cierre y auditoría sin salida cruda y sin decir que no lo son. La salida de `create` que muestra la evidencia estaba procesada | Aceptado: el invariante lo exige | Se agregaron las salidas crudas de apertura, cierre y diffs de auditoría. La salida de `create` se declara procesada |
| H-6 | menor | El README que escribió la 11.4.1 dice que el token nunca va a un archivo, y pasó por uno local. Además, su sección de la API repite el patrón de E-1 | Aceptado: `deploy/staging/README.md:88` y `:92` | El desvío queda registrado en la evidencia. E-1 cubre ahora las tres secciones del README, incluida la de esta subfase |
| H-7 | observación | V-1 a V-4 dependen solo del relato del usuario | Aceptado. Ya estaba declarado | Registrado en AC-10 como «lo que no mide» |
| H-8 | observación | La ventana se apartó de D-6, que preveía volver a correr la prueba | Aceptado | Registrado como desvío |
| H-9 | observación | El triage de E-2 decía «el usuario no la notó», y el piloto nunca preguntó por el orden | Aceptado | Corregido: «el piloto no la midió» |
| H-10 | observación | N-1 llamaba «aditivo» a un campo nuevo, y `read-v1.md` (§Versionado) exige v2 para eso | Aceptado | Corregido: «requiere v2» |
| H-11 | observación | La evidencia dice «53 bytes», y el token tiene 52 caracteres | Aceptado: la diferencia es el salto de línea que agrega `sed` | Aclarado en la evidencia |
| H-12 | observación | Hay archivos tocados en una etapa distinta de la que los autorizaba | Aceptado y verificado con `git show --stat d3e9a38` | Registrado en AC-16 |

- **Personas.md**: el `admin` confirmado incluía «clientes», y ninguna pregunta trataba los clientes. Aceptado; se quitó.
- **`HANDOFF.md`** está desactualizado: dice que el brief de la 11.4 no existe y que staging corre `c2edbb5`. Aceptado. Se corrige al cerrar, que es cuando la lista de archivos lo autoriza.

## Cierre de la subfase 11.4 y de la Fase 11, 2026-09-25

Decisiones del usuario del 2026-09-25, en respuesta a las tres preguntas del cierre:

1. **E-1**: «Acepto». El único mayor del triage va a la **12.1**, con `deploy/staging/README.md` en su lista de archivos. AC-12 queda cumplido.
2. **Nivel del contrato de lectura (H-1)**: «Seguimos la recomendacion». Validado localmente y en CI, más una corrida en staging, y no validado en integración. Es el nivel que citan el `CHANGELOG` y el Roadmap. D-6 conserva su texto aprobado, y la discrepancia queda registrada en §Revisión independiente.
3. **Cierre**: «Confirmo cierre de 11.4 y fase 11». Autorizó en el mismo turno:
   - commit y push;
   - la actualización de los archivos de cierre;
   - Notion;
   - el Knowledge Capture.

**Estado final**: los AC-1 a AC-16 están cumplidos, con los desvíos registrados en §Resultados — etapa 11.4.3. El gate de salida de la Fase 11 está cumplido: el piloto terminó sin bloqueantes, y el contrato está publicado con su validador en verde. **La Fase 12 no se abre en este turno** (D-12).
