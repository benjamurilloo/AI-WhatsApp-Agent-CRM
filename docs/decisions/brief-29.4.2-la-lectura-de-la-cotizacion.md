---
schema: task-brief.v1
task_id: "29.4.2"
task_type: implementation
generated_at: 2026-10-19
---

# Brief 29.4.2 — La lectura de la cotización

- **Contrato**: `task-brief.v1`
- **Tipo de tarea**: `implementation`. Migración, código, una unidad de systemd, pruebas y despliegue.
- **Nivel de evidencia objetivo**:
  - `deterministic`: tests contra PostgreSQL, con el rol del lector;
  - `producer-consumer`: el lector ↔ las funciones ↔ la pantalla;
  - `isolated-runtime`: el lector corriendo en el servidor contra DolarAPI, con su unidad y su aviso de vida.
- **Nivel de validación alcanzable**:
  - validado localmente, en CI y en integración;
  - desplegado y en marcha en producción para la organización demo «iPhone Demo», con la alerta probada.
- **Orden**: la segunda de las tres subfases del tipo de cambio ([ADR 0025](0025-tipo-de-cambio.md), punto 13). En Notion, la tarea `3fd702be6f4e81d7afe8c50b7ce0ac20` está en «En proceso» desde el 2026-10-19.
- **No abre ni cierra un gate**. Pero es **el primer proceso del CRM con red y credencial de la base juntas** (ADR 0025, punto 9), y por eso lleva revisión independiente (D-13).
- **Estado de este documento**: **aprobado el 2026-10-19** por el usuario, con las recomendaciones de D-1 a D-13 (D-4 (a), D-5 (a) y D-12, paso 7 (a)).

## Objetivo

Que la cotización de una organización **se lea sola de DolarAPI, más su ajuste, cinco veces por día**, sin que una lectura dudosa reemplace a la vigente ni pase desapercibida:

- un proceso aparte de la aplicación, `crm-fx-reader`, con su timer;
- un rol de la base que **solo ejecuta dos funciones**, con su propia credencial;
- la fuente `dolarapi_blue` y el ajuste, que el `admin` elige y cambia desde la pantalla de la cotización;
- la falla cerrada, y la alerta por el aviso de vida;
- la guarda de hosts y el runbook.

Lo que la 29.4 dejó funcionando no cambia: la carga manual, el cobro en otra moneda y los totales de referencia.

## Lo que se verificó antes de escribir este brief

Releído el 2026-10-19 contra `main` (`02112dc`), en el código y en la API.

**La base**
- **`fx` nació solo con lo manual** (`0053`; `fx/schema.ts`):
  - `exchange_rate_source` es un enum con un solo valor, `manual`;
  - `exchange_rates.recorded_by` es `NOT NULL`;
  - no existen `adjustment`, `last_confirmed_at`, `source_rate` ni `source_observed_at`.
- **`exchange_rate_settings` es de solo inserción hoy**:
  - tiene el trigger `exchange_rate_settings_insert_only`, que rechaza `UPDATE` y `DELETE` también al dueño;
  - `crm_app` tiene solo `SELECT, INSERT` sobre ella (`0053`, al final). La migración ya anunciaba que la 29.4.2 suma el `UPDATE`.
- **`audit_logs` exige exactamente un actor**: un usuario o una credencial de servicio (`audit/schema.ts:130`). Una cotización automática no tiene ninguno.
- **Los roles**:
  - existen `crm_owner`, `crm_app` (`NOLOGIN`) y `crm_app_login`;
  - **el dueño no tiene `CREATEROLE`**, a propósito. Por eso `crm_app` se crea con el superusuario antes de migrar, y la `0003` lo crea solo si no existe (`deploy/production/README.md:156`).
- **Las migraciones pendientes corren en una sola transacción** (`scripts/migrar.ts:54`, `migrate` de Drizzle).

**El código**
- **La antigüedad se mide desde `recorded_at`** (`fx/service.ts`, `toCurrentRate`). No hay otra fecha.
- **La pantalla** (`caja/cotizacion/`): muestra la vigente, el formulario de carga y el historial. No muestra fuente, ajuste ni atribución, porque solo existe `manual`.

**El despliegue**
- **Cada trabajo programado avisa con `OnSuccess=crm-heartbeat@<trabajo>.service`**. `crm-heartbeat.sh` tiene una lista cerrada: `backup`, `offsite`, `restore-check` y `db-size`.
- **La unidad del aviso usa `DynamicUser=true`**, y systemd lee los secretos como `root` antes de soltar privilegios.
- **Ningún proceso del servidor tiene hoy red y credencial de la base juntas**. Los que tienen la base usan `IPAddressDeny=any`.
- **Los comandos de producción con secretos los corre el usuario**, con `read` y sin pasar valores a `sudo` (README, l. 178).

**La API y Node**
- **DolarAPI**, consultada una vez el 2026-10-19:
  - `GET https://dolarapi.com/v1/dolares/blue` responde `200` con `{"moneda":"USD","casa":"blue","nombre":"Blue","compra":1535,"venta":1555,"fechaActualizacion":"2026-10-19T12:57:00.000Z"}`;
  - **`venta` llega como entero**, sin decimales;
  - el servicio está detrás de **Cloudflare**, así que las IP del host cambian;
  - las condiciones de uso no cambiaron desde la 29.3: se permite usar las respuestas, hay que citar el servicio, y sugieren una consulta cada 3 horas por serie.
- **Node**: la máquina del operador tiene `v24.15.0`, y `engines` exige `>=24 <25`. **Node 24 ejecuta TypeScript quitando los tipos**, sin `tsx`.

### Hallazgos

- **H-1. Un valor nuevo de un enum no se puede usar en la misma transacción que lo agrega.**
  - PostgreSQL rechaza un `CHECK` o una función SQL que nombre `'dolarapi_blue'` en la transacción del `ALTER TYPE … ADD VALUE`.
  - Como las migraciones pendientes corren juntas (`migrar.ts:54`), separarlas en dos archivos no alcanza.
- **H-2. El límite del 10 %, como está escrito, traba el lector para siempre después de un salto real.**
  - El ADR compara cada lectura **contra la última automática**.
  - Si el blue sube un 12 % de verdad, la lectura falla y no guarda nada. La última automática sigue siendo la vieja, así que **la próxima falla igual, y todas las siguientes**.
  - Cargar una manual no lo destraba, porque no es automática. El ADR no da ninguna salida.
- **H-3. Al volver a la fuente automática, la manual puede quedar vigente sin límite.**
  - Un caso: la última automática es 1.555. El `admin` pasa a `manual`, carga 1.600 y después vuelve a `dolarapi_blue`.
  - Si DolarAPI sigue en 1.555, el valor «no cambió» contra la última automática. El lector solo confirma y no guarda nada.
  - La vigente sigue siendo la manual de 1.600, aunque la pantalla dice «fuente automática».
- **H-4. La configuración tiene que dejar de ser de solo inserción**, pero solo en tres columnas: la fuente y el ajuste, que cambia el `admin`, y `last_confirmed_at`, que cambia el lector. La organización y la otra moneda siguen fijas, y el borrado sigue prohibido.
- **H-5. Una cotización automática no tiene autor**: ni usuario ni credencial de servicio. `recorded_by` pasa a ser opcional, y la fila no se audita. Es de solo inserción y guarda de dónde salió, así que es su propio registro.
- **H-6. La antigüedad de la automática** se mide desde `last_confirmed_at` (ADR 0025, punto 4). Hoy todo se mide desde `recorded_at`, así que `getExchangeSetup` tiene que leer la configuración. Sin eso, una automática confirmada cada 3 horas se marcaría vieja al día siguiente de guardarse.
- **H-7. El filtro por IP no puede fijar el host** (ADR 0025, punto 9, R-M9). Cloudflare cambia las IP. La unidad sí puede negar las redes privadas, y entre ellas **`169.254.169.254`, el servicio de metadatos del droplet**, que el ADR no nombra.
- **H-8. Lo que se mide recién en el servidor**:
  - que el usuario efímero lea `/srv/crm-production/scripts/fx/` y `node_modules/pg`;
  - que `pg_hba` acepte al rol nuevo por `localhost` con contraseña;
  - la versión de Node instalada.

  No se puede verificar desde acá. Es una condición de detención si falla.

## Decisiones

Cada decisión trae opciones y una recomendación. Las dos que piden al usuario una elección real son **D-4 y D-5**: corrigen dos huecos del ADR (H-2 y H-3).

### D-1 — Qué entra y qué no

**Entra**:
- la migración `0054`;
- las dos funciones y el rol;
- el lector en `scripts/fx/`;
- la unidad y el timer;
- el trabajo `fx-reader` del aviso de vida;
- la pantalla con la fuente y el ajuste;
- las guardas, el runbook y el despliegue.

**No entra**:
- devoluciones y pagos a proveedores en otra moneda: son de la 29.4.3;
- un ajuste en porcentaje (ADR 0025, §Riesgos);
- otra fuente u otro par;
- una pantalla para el operador.

### D-2 — La migración `0054` (H-1, H-4, H-5)

**`exchange_rate_source`** suma el valor `dolarapi_blue`.

**`exchange_rate_settings`** suma tres columnas:
- **`adjustment`**: `numeric(14, 2) NOT NULL DEFAULT 0`;
- **`last_confirmed_at`**: `timestamptz`, opcional;
- **`source_changed_at`**: `timestamptz NOT NULL DEFAULT now()`, solo con D-5 (a).

**`exchange_rates`** suma `source_rate numeric(18, 6)`, `adjustment numeric(14, 2)` y `source_observed_at timestamptz`, y `recorded_by` pasa a ser opcional. Sus `CHECK`:
- **una manual** tiene `recorded_by` y no tiene las tres columnas de la fuente;
- **una automática** tiene las tres y no tiene `recorded_by`;
- **en una automática, `rate = source_rate + adjustment`**.

**Ningún `CHECK` nombra el valor nuevo** (H-1): se escriben contra `'manual'`, por ejemplo `(source = 'manual') = (recorded_by IS NOT NULL)`. Las funciones son `plpgsql`, que no valida el enum al crearse. Un test de integración corre la `0054` sobre una base en la `0053`, en una sola transacción, como en producción.

**El trigger de la configuración** se reemplaza por uno que:
- rechaza el `DELETE`;
- rechaza el `UPDATE` de `organization_id`, `quote_currency` y `created_at`.

`crm_app` recibe `UPDATE` sobre la tabla. Las cotizaciones siguen siendo de solo inserción.

**El rol `crm_fx_reader`**, `NOLOGIN`, se crea si no existe, como `crm_app` en la `0003`:
- en producción lo crea antes el superusuario (D-12);
- recibe `EXECUTE` solo sobre las dos funciones;
- **las dos funciones se revocan de `PUBLIC`**, así que tampoco las ejecuta `crm_app`.

### D-3 — Las dos funciones: la regla vive en la base

**Recomendación (a): la decisión entera la toma `fx_record_reading`, en SQL, dentro de una transacción.** Esa decisión es sumar, comparar, aplicar el límite e insertar o confirmar. El lector solo trae el valor y lo pasa como texto.

**`fx_reader_targets()`** devuelve el id de cada organización que cumpla todo esto:
- su fuente es `dolarapi_blue`;
- la otra moneda es `ARS`;
- la moneda principal es `USD`.

No devuelve nombres ni ningún otro dato.

**`fx_record_reading(organization_id uuid, venta text, observed_at timestamptz)`** hace, en orden:
1. bloquea la fila de la configuración con `FOR UPDATE`, para que no corra contra un cambio de ajuste del `admin`;
2. vuelve a comprobar que la organización cumple las condiciones de `fx_reader_targets`;
3. convierte `venta` a `numeric`, con a lo sumo seis decimales y mayor que cero;
4. calcula `rate = venta + adjustment`, y rechaza un resultado menor que 1;
5. compara contra la base de D-5 para saber si el valor cambió:
   - si no cambió, actualiza solo `last_confirmed_at`;
   - si cambió, aplica el límite de D-4 y, si pasa, inserta la fila nueva;
6. devuelve un resultado: `inserted`, `confirmed`, `rejected_large_change`, `rejected_below_one` o `not_a_target`.

**Por qué en la base**:
- el lector nunca suma ni compara, así que **ningún número pasa por `number`**, ni siquiera en TypeScript;
- la comprobación y la escritura son atómicas;
- **si la credencial se filtra**, el límite del 10 % lo sigue aplicando la función. El ADR daba ese riesgo por aceptado (punto 9). Así queda acotado: quien tenga la credencial puede mover la cotización un 10 % por llamada, no ponerle cualquier valor. Se puede ir corriendo de a 10 %, y eso lo verían el `admin` en el historial y la alerta. Se acepta.

**(b)**, la regla en TypeScript y solo la escritura en la base: deja el límite fuera de la frontera de la credencial. No se recomienda.

### D-4 — El 10 % después de un salto real (H-2): decide el usuario

- **(a) Recomendada: el límite del 10 % se mide contra la vigente**, y no contra la última automática.
  - «Cambió o no» se sigue midiendo contra la última automática, así que **la carga manual no se pisa mientras el valor no cambie** (R-M12 queda igual).
  - Ante un salto real, el `admin` ve la alerta y carga a mano un valor cercano. La próxima lectura queda dentro del 10 % de esa manual, pasa y vuelve a ser la vigente.
  - Es lo que el ADR ya hacía en la primera lectura («se compara contra la vigente manual si hay una»).
- **(b) Contra la última automática, como dice el ADR, más un botón «aceptar la lectura»** para el `admin`. Suma una acción, y el lector tendría que guardar la lectura rechazada para mostrarla. Más superficie para el mismo efecto.
- **(c) Como dice el ADR, sin salida**: después de un salto real, el lector queda trabado hasta que alguien toque la base. No se recomienda.

Con (a), el ADR 0025 recibe una nota fechada (punto 4) y su texto no cambia.

### D-5 — Volver a la fuente automática (H-3): decide el usuario

- **(a) Recomendada: la primera lectura después de volver a `dolarapi_blue` guarda siempre una fila**, aunque el valor no haya cambiado.
  - Para saberlo, la configuración guarda **`source_changed_at`**, que se actualiza cada vez que cambia la fuente.
  - La base de comparación es **la última automática guardada después de ese momento**. Si no hay ninguna, la lectura se trata como la primera: el límite contra la vigente, y se guarda.
  - Volver a la automática quiere decir «usá la fuente». La manual deja de ser la vigente en la próxima lectura, que llega como mucho en 3 horas, salvo de noche. La pantalla lo avisa al cambiar la fuente.
- **(b) Como dice el ADR**: la manual sigue vigente hasta que la fuente cambie de valor. La pantalla diría «automática» con una vigente manual, por un tiempo sin límite.

Con (a), el ADR 0025 recibe una nota fechada.

### D-6 — El lector (`scripts/fx/`)

- **Corre con Node 24 quitando los tipos**, sin `tsx`. Importa solo `pg` y sus propios archivos, **nunca `src/`** (ADR 0025, punto 9; guarda de D-10). Su conexión no usa `getDb()`.
- **La consulta**:
  - un `GET` a una URL fija, `https://dolarapi.com/v1/dolares/blue`, escrita en el código y no en una variable;
  - `redirect: "error"`, un timeout de 10 s y una respuesta de hasta 4 KB;
  - **sin reintentos**: la próxima corrida llega en 3 horas, y un reintento en un bucle es lo que DolarAPI pide evitar;
  - no manda cabeceras con datos del CRM.
- **La validación**, sobre el cuerpo leído como texto:
  - un esquema estricto con `zod`, que ya es dependencia: `moneda` es `"USD"`, `casa` es `"blue"` y `fechaActualizacion` es una fecha ISO;
  - **`venta` se toma del texto crudo** con una expresión que exige exactamente una aparición de un decimal positivo con a lo sumo seis decimales. Pasa a la función como texto (ADR 0025, punto 4, R-M6);
  - **la antigüedad de `fechaActualizacion` no se rechaza**: el blue no se mueve el fin de semana. Se guarda como `source_observed_at` y la pantalla la muestra.
- **Por organización**: llama a `fx_record_reading` y escribe una línea en el journal con el id, el resultado y el valor. **Nunca escribe la cadena de conexión ni la contraseña.**
- **Si DolarAPI no responde o no cumple el esquema**, no llama a ninguna función: nada cambia, y `last_confirmed_at` no avanza.
- **El código de salida** es distinto de cero si la consulta falló o si alguna organización quedó en `rejected_*`, aunque otras se hayan guardado (ADR 0025, punto 9). Así el aviso de vida no sale.
- **Sin organizaciones con fuente automática**, sale con 0 sin consultar a DolarAPI.

### D-7 — La unidad y el timer (H-7)

**`crm-fx-reader.service`**:
- `Type=oneshot` y `DynamicUser=true`;
- **`LoadCredential=fx-reader-db:/etc/crm-production/fx-reader-db`**: la contraseña la lee systemd como `root`, y el proceso la lee de `$CREDENTIALS_DIRECTORY`. No va en el entorno ni en los argumentos;
- el resto de la conexión es fijo en la unidad, sin secretos: el host, el puerto, la base y el usuario;
- `OnSuccess=crm-heartbeat@fx-reader.service`;
- `ProtectSystem=strict`, `ProtectHome`, `PrivateTmp`, `NoNewPrivileges`, y `RestrictAddressFamilies=AF_INET AF_INET6`;
- **`IPAddressDeny=`** las redes privadas, de enlace local y de loopback: `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.0.0/16`, `100.64.0.0/10` y sus equivalentes en IPv6;
- **`IPAddressAllow=localhost`**, para la base.

**`crm-fx-reader.timer`**:
- `OnCalendar=*-*-* 09,12,15,18,21:00:00 America/Argentina/Cordoba`;
- `RandomizedDelaySec=120`, para no caer en el minuto redondo;
- `Persistent=true`: si el servidor estuvo apagado, la lectura corre al arrancar.

### D-8 — El aviso de vida

- `crm-heartbeat.sh` suma `fx-reader` a su lista cerrada, con `HEARTBEAT_URL_FX_READER`.
- **El usuario crea el chequeo en Healthchecks.io**, con el horario de las cinco corridas en la zona de Córdoba y 1 h de gracia. El operador agrega la URL a `heartbeat.env` con `nano`, en su terminal, como en la 13.3.
- **La alerta suena** cuando:
  - DolarAPI no responde;
  - la respuesta no cumple el esquema;
  - una organización queda en `rejected_*`;
  - el lector ni siquiera corre.
- **Un día de alerta por el 10 % se resuelve con la carga manual**, con D-4 (a). El runbook de alertas suma la entrada `fx-reader`.

### D-9 — La pantalla de la cotización (H-6)

**Lo que muestra, a todos**:
- **la fuente y el ajuste**, y con la automática, el texto «Fuente: DolarApi (dolarapi.com) + ajuste de la organización» (ADR 0025, punto 4);
- **en la vigente automática**: el valor de la fuente, el ajuste, la fecha que dio la fuente y la última confirmación;
- **la antigüedad**: de una automática, desde `last_confirmed_at`; de una manual, desde `recorded_at`. Lo calcula `getExchangeSetup`, así que también lo ven las pantallas del cobro y de la caja;
- **el historial**, con la columna de la fuente. En una automática, «Automática» en lugar del autor;
- **el `viewer`** ve todo esto y no ve los formularios.

**Lo que hace el `admin`**:
- **cambia la fuente y el ajuste en un formulario aparte** de la carga. El cambio se audita como `update` de `exchange_rate_setting`, con el antes y el después.
  - El ajuste usa el tipo con signo de `fx`, en centésimos, sin `number`, y admite cero y negativos (ADR 0025, punto 3, R-M7).
  - **Un cambio de ajuste se aplica en la próxima lectura**, no al guardarlo. La pantalla lo dice.
- **Avisos en la pantalla**:
  - con la fuente automática, el formulario de carga avisa que la próxima lectura que cambie la pisa;
  - al volver a la automática, con D-5 (a), avisa que la próxima lectura reemplaza a la vigente.

### D-10 — El módulo y las guardas

- **`fx` suma a su servicio**:
  - leer la configuración con la fuente, el ajuste y las fechas;
  - cambiar la fuente y el ajuste.

  **Las dos funciones del lector no tienen equivalente en TypeScript dentro de `src/`**: la regla vive en la base (D-3).
- **Guarda nueva**: en `scripts/fx/`, la única URL absoluta es `https://dolarapi.com/v1/dolares/blue`, y no hay imports de `src/` ni de `@/`. `deployment-hostnames.test.ts` sigue cubriendo `src/` sin cambios.
- **Test de privilegios** contra la base:
  - `crm_fx_reader` no tiene ningún privilegio sobre ninguna tabla ni secuencia;
  - ejecuta solo las dos funciones;
  - `PUBLIC` y `crm_app` no las ejecutan;
  - las dos son `SECURITY DEFINER` con `search_path` fijo.
- **`heartbeat-urls.test.ts`** sigue igual. `fx-dependencies.test.ts` y `exposed-surface.test.ts` suman la acción nueva.
- **La tabla de archivos del README** suma las dos unidades. El `diff` de «Verificar después de desplegar» pasa de dieciséis archivos a dieciocho.

### D-11 — Roles

Como el ADR 0025, punto 11:
- el `admin` cambia la fuente y el ajuste;
- el `viewer` ve todo y no cambia nada;
- **el lector no es un usuario**: no inicia sesión en la aplicación y no aparece en la auditoría.

### D-12 — El despliegue y la demo

Cada paso pide la autorización del usuario en su turno. Los que llevan secretos los corre el usuario en su terminal.

1. **El superusuario crea `crm_fx_reader`** antes de migrar, como `crm_app` (README, l. 156). **Lo corre el operador**: es un comando sin secreto.
2. **El despliegue habitual**: la CI del SHA, anotar el anterior y migrar a 54 → 55.
3. **El rol con login y su credencial**: `crm_fx_reader_login`, miembro de `crm_fx_reader`, y el archivo `/etc/crm-production/fx-reader-db` en `0600` de `root`. **Lo corre el usuario**, porque genera la contraseña, con el mismo encadenado `&&` que el README usa para `crm_app_login`.
4. **El chequeo de Healthchecks.io y la URL**: los hace el usuario (D-8).
5. **Las unidades**: instalarlas, `systemd-analyze verify`, una corrida a mano y el aviso. Las corre el operador.
6. **«iPhone Demo»**: el usuario pasa la fuente a «DolarAPI» con el ajuste en 10 desde la pantalla. Se corre el lector a mano y se ve la fila nueva y su aviso.
7. **La alerta, provocada**:
   - **(a) Recomendada**: una corrida con el ajuste puesto a propósito en un valor que mueva más del 10 %. Sale `rejected_large_change`, sin aviso, y Healthchecks.io alerta al vencer. Después se vuelve el ajuste a 10. No toca la red ni los archivos del servidor.
   - **(b)** Cortar la red de la unidad con un drop-in temporal. Prueba la caída de DolarAPI, pero toca la configuración del servidor.
8. **«Demostración Vixora»** no tiene configuración, así que no es objetivo del lector. Se verifica por recuento.

**La vuelta atrás**, a `02112dc`:
- la `0054` es aditiva;
- el código anterior no lee las columnas nuevas, y **la fila automática no le rompe nada**: tiene `source` y `rate`, que es lo que lee;
- **el código anterior no conoce el valor `dolarapi_blue`**, así que el historial la mostraría con una etiqueta vacía. Se acepta para una vuelta atrás;
- antes de volver, se detiene el timer.

### D-13 — Pruebas, revisión y cierre

**Unitarios**:
- la extracción de `venta` del texto crudo: entero, con decimales, con siete decimales, negativo, con exponente, repetido o ausente;
- el esquema de la respuesta;
- el código de salida según los resultados.

**Integración**, contra PostgreSQL:
- `fx_record_reading` con `SET ROLE crm_fx_reader`:
  - insertar, confirmar y rechazar por el 10 % y por menor que 1;
  - D-4 y D-5, con sus casos;
  - una organización que no es objetivo;
- `crm_fx_reader` no lee ni escribe ninguna tabla directamente;
- la `0054` sobre una base en la `0053`, en una sola transacción;
- el cambio de fuente y de ajuste, con auditoría;
- la antigüedad desde `last_confirmed_at`;
- el lector entero contra una función `fetch` inyectada en el test. **El host real no se llama en la suite.**

**End-to-end**:
- la pantalla con la fuente automática;
- el cambio de ajuste;
- el `viewer` sin formularios.

**Antes del commit**: `npm run format:check` completo. La CI de la 29.4 falló por eso.

**Una corrida real contra DolarAPI**: la primera es la del servidor (D-12, paso 6). Desde la máquina del operador, el lector puede correr una vez contra la base de desarrollo, como prueba previa.

**La revisión independiente**: un agente que no participó, de solo lectura, contra este brief, el ADR 0025 y el código. Hace foco en las funciones `SECURITY DEFINER`, el rol, la unidad y la extracción del valor. Sus correcciones son autoevaluación.

**El cierre**: CHANGELOG, HANDOFF, Roadmap, README de decisiones, nota en el ADR 0025, Notion y Knowledge Capture.

## Alcance incluido

- La migración `0054`, con el rol, las dos funciones, las columnas y el trigger nuevo.
- `scripts/fx/`, con su comando en `package.json`.
- Las unidades `crm-fx-reader.service` y `crm-fx-reader.timer`.
- El trabajo `fx-reader` en `crm-heartbeat.sh`.
- El servicio de `fx` y la pantalla de la cotización.
- La guarda de hosts de `scripts/fx/` y el test de privilegios.
- El runbook de producción y el de alertas.
- El despliegue y la demo (D-12).

## Alcance excluido

- Devoluciones y pagos en otra moneda (29.4.3), y la permuta (29.7).
- Un ajuste en porcentaje, otra fuente, otro par o una segunda cotización.
- Leer la fuente desde la aplicación, o que el agente vea la cotización (29.8).
- Cambiar `read-v1` o `read-v2`.
- Staging: se despliega en producción sobre la organización demo, como la 29.2 y la 29.4.

## Invariantes

- **La aplicación web no sale a internet** (ADR 0025, punto 9).
- **El lector solo habla con `dolarapi.com`, solo con `GET`**, y no manda datos del CRM.
- **El rol del lector no lee ni escribe ninguna tabla.** Solo ejecuta dos funciones.
- **Una lectura dudosa nunca reemplaza a la vigente.** Si la lectura no cumple, no se guarda nada y la alerta suena.
- **Ningún valor de la cotización pasa por `number`**, ni en el lector ni en la pantalla.
- **Las cotizaciones siguen siendo de solo inserción.** La configuración nunca cambia de organización ni de moneda, y no se borra.
- **Sin moneda principal o sin fuente automática, todo sigue como en la 29.4.**
- **Ningún secreto** queda en el repositorio, en los argumentos de un proceso, en el journal ni en el log de `sudo`.

## Criterios de aceptación

- **AC-1**: la `0054` migra sobre la `0053` en una transacción, y el código de la 29.4 sigue pasando sus tests.
- **AC-2**: `fx_record_reading` inserta, confirma o rechaza según D-3, D-4 y D-5, probado con `SET ROLE crm_fx_reader`.
- **AC-3**: `crm_fx_reader` no tiene ningún privilegio sobre tablas. `PUBLIC` y `crm_app` no ejecutan las funciones.
- **AC-4**: el lector extrae `venta` del texto sin `number`. Sale distinto de cero ante cualquier falla y no escribe nada si la respuesta no cumple.
- **AC-5**: la guarda de `scripts/fx/` falla con otro host o con un import de `src/`.
- **AC-6**: el `admin` cambia la fuente y el ajuste con auditoría, y el `viewer` no puede.
- **AC-7**: la antigüedad de una automática se mide desde `last_confirmed_at` en la cotización, el cobro y la caja.
- **AC-8**: en producción, el timer está activo y una corrida real de «iPhone Demo» guarda `venta + 10` con su fuente.
- **AC-9**: el aviso de vida llega con una corrida buena. La alerta suena con una corrida rechazada, y se ve en Healthchecks.io.
- **AC-10**: «Demostración Vixora» queda intacta, y ningún secreto aparece en el journal ni en `auth.log`.

## Pruebas y evidencia requerida

D-13. La evidencia de producción va al §Cierre de este brief:
- los recuentos;
- el resultado de `systemctl list-timers`;
- las líneas del journal del lector, sin secretos;
- el aviso y la alerta.

## Condiciones de detención

Se detiene y se consulta al usuario si pasa cualquiera de estas cosas:

- La `0054` exige nombrar `dolarapi_blue` en la misma transacción y no hay forma de evitarlo sin partir el despliegue en dos.
- El usuario efímero no puede leer el código o `pg` en el servidor, o `pg_hba` no acepta al rol nuevo, y arreglarlo exige cambiar permisos o configuración del servidor fuera de lo que este brief nombra.
- Node 24 no ejecuta el lector sin `tsx` en el servidor.
- DolarAPI cambia su forma, su URL o sus condiciones de uso.
- Cualquier paso de producción que pida un secreto en la conversación.
- Una corrección de la revisión que cambie una decisión del ADR 0025 más allá de D-4 y D-5.

## Implementación: precisiones y desvíos (2026-10-19)

- **`scripts/fx/package.json`** con `"type": "module"`. Sin él, Node 24 corre el lector igual pero avisa en cada corrida que reinterpreta el archivo como ESM. Medido con `node scripts/fx/leer-cotizacion.ts` contra la base de test.
- **`tsconfig.json` suma `allowImportingTsExtensions`**: con los tipos quitados por Node, una importación relativa lleva `.ts`. `noEmit` ya estaba.
- **El lector importa `zod`** para el esquema, que ya era dependencia. `pg` lo importa solo `leer-cotizacion.ts`, que se suma a la lista de `named-prepared-statements.test.ts`.
- **Las pantallas que usan la cotización** (el cobro, la caja y los totales de referencia) muestran su fuente junto a la fecha: «18/10/2026 15:30, DolarAPI + ajuste» o «…, carga manual». La fecha es la de la última confirmación en una automática (H-6).
- **`exchange_rate_settings` sigue en la lista de solo inserción** de `audit.test.ts` a nivel de tabla: el `UPDATE` es por columna (P-1, B-1), y las columnas las prueba `fx-reader.test.ts`.
- **D-10, `fx-dependencies.test.ts`**: no tiene una lista de acciones, así que no había nada que sumar. La acción nueva se declara en `exposed-surface.test.ts`.
- **`rejected_too_large`**: un resultado nuevo de `fx_record_reading`, para el ajuste que haría desbordar `numeric(18, 6)` (B-7).

## P-1 — Revisión independiente (R1)

La hizo el 2026-10-19 un agente que no participó del trabajo, con acceso de solo lectura, contra este brief, el ADR 0025 y el código, sin ejecutar nada. **Veredicto: R1, con 9 hallazgos: 0 bloqueantes, 1 medio y 8 bajos.** Cada uno se verificó contra el código antes de aceptarlo. **Las correcciones son autoevaluación**, sin una segunda revisión.

| Hallazgo | Severidad | Resolución |
|---|---|---|
| M-1: faltaba el test de la `0054` sobre una base en la `0053`. La suite migra todo en una transacción, donde un `CHECK` con `'dolarapi_blue'` pasaría porque el enum nace en esa misma transacción | medio | corregido: `tests/integration/migration-0054.test.ts` migra una base propia hasta la `0053`, la confirma con datos de la 29.4, prueba el control (usar un valor nuevo en la misma transacción falla con `unsafe use of new value`) y después aplica la `0054` sola |
| B-1: `crm_app` tenía `UPDATE` sobre toda la configuración, y podía escribir `last_confirmed_at` y el id. H-4 decía tres columnas y D-2 decía la tabla | bajo | corregido según H-4: `GRANT UPDATE (source, adjustment)`, y el trigger también protege el id. `last_confirmed_at` lo escribe solo la función |
| B-2: el aviso de D-5 solo aparecía con JavaScript, y el aviso de después de guardar no lo repetía | bajo | corregido: con la fuente en manual el aviso se muestra siempre, y al pasar a la automática el aviso de después de guardar dice que la próxima lectura reemplaza a la vigente |
| B-3: el ADR 0025, punto 9, describía otra forma de `fx_reader_targets()` | bajo | nota fechada en el ADR |
| B-4: al runbook de alertas le faltaban salidas del lector | bajo | corregido: `rejected_invalid`, `rejected_too_large`, el error de la base, un resultado desconocido y el `network` que no es una caída |
| B-5: el README no daba el comando de la prueba de la alerta, y el bloque reutilizable cortaba antes de mostrar el resultado | bajo | corregido: el comando con `|| true`, como el de `db-size` |
| B-6: una clave `venta` escapada evadía la comprobación de una sola aparición | bajo | corregido: una respuesta con una barra invertida se rechaza, con su test |
| B-7: un ajuste cercano al máximo desbordaba la suma y daba un error en lugar de un rechazo | bajo | corregido: `rejected_too_large`, con su test |
| B-8: `.claude/settings.json` sin seguimiento | bajo | es la configuración local del entorno; no entra en ningún commit |

**De lo que el revisor dejó para el servidor** (H-8), se corrigió antes uno: la unidad suma `AF_UNIX` a `RestrictAddressFamilies`, porque la resolución de nombres de glibc puede hablar con systemd-resolved por un socket local. Lo demás se mide en el despliegue (D-12, paso 5):
- que Node ejecute el lector;
- que `pg_hba` acepte al rol por `localhost`, en IPv4 o IPv6;
- la salida a `dolarapi.com`, que recién prueba el paso 6.

## Pruebas locales antes del commit (2026-10-19)

- **Unitarios y guardas**: 1756 tests.
- **Integración** contra PostgreSQL: 86 archivos y 1598 tests en la suite completa. El archivo nuevo `migration-0054.test.ts` falló entero en esa corrida, sin llegar a su test: falló su preparación. Pasó solo y junto a otros archivos. Se le dieron timeouts explícitos y `TEMPLATE template0` al crear su base, y volvió a pasar solo. `fx-reader.test.ts`: 17 de 17.
- **End-to-end completo**: 246 de 252. Los 6 que fallaron no son de la cotización: `client-tags` 3, `clients` caso 9, `goods-receipt-voids`, `login` caso 11, `orders` brief-19.3 y `search` brief-23.3. Los 6 pasaron solos. `exchange.spec.ts`, con el caso nuevo de la fuente automática, pasó entero; su caso del cobro en pesos tuvo un timeout de 30 s en una corrida cargada y pasó solo, en 24,6 s.
- **El lector contra DolarAPI real**, con Node quitando los tipos, sobre la base de test y con un rol de login temporal miembro de `crm_fx_reader`, que se borró al terminar:
  - primera corrida: `DolarAPI: venta 1555, del 2026-10-19T16:57:00.000Z.` e `inserted.`, con salida 0. La fila quedó con `rate 1565.000000`, `source_rate 1555.000000` y `adjustment 10.00`;
  - segunda corrida: `confirmed.`, salida 0, sin una fila nueva.
- `tsc`, ESLint y `prettier --check` sin errores.
