---
schema: task-brief.v1
task_id: 3.3
task_type: implementation
generated_at: 2026-09-13
---

# Brief: 3.3 — Autenticación

## Objetivo

Implementar en el módulo `auth` las operaciones de identidad del [ADR 0012](0012-mecanismo-de-sesion.md), probadas contra PostgreSQL real:

- **login**: con límite de intentos por cuenta y por IP;
- **sesiones**: crear, validar, renovar y revocar;
- **logout**;
- **cambio de contraseña**;
- **hash de contraseñas** con argon2id.

Además, la migración de `sessions` y de la tabla de intentos.

La subfase entrega la **interfaz pública del módulo** y el adaptador de cookie. No entrega pantallas ni Server Actions (3.5), ni el contexto autenticado con organización y rol, la restricción de `must_change_password` o la verificación de `Origin` (3.4).

## Ubicación en la Fase 3

- **Orden previsto**: 3.1 y 3.2 (cerradas) → **3.3** → 3.4 → 3.6 → 3.5 → 3.7.
- **Gates de entrada**, que se piden por separado de la aprobación del brief:
  1. autorización explícita para instalar las dependencias de D-1 y D-6;
  2. autorización explícita para aplicar migraciones contra la base local de Docker (desarrollo y test);
  3. Docker Desktop en marcha.

## Hallazgos de la verificación previa (2026-09-13)

1. **Contradicción entre el ADR 0012 y Overview.** Detectada al preparar este brief; la revisión de la 3.2 no la vio.
   - El ADR 0012 describe la validación como "una única consulta" que une `sessions`, `users` y `organization_members`.
   - [Overview.md](../architecture/Overview.md) establece que `auth` no depende de ningún módulo, que `organizations` depende de `auth`, y que "otro módulo no hace `JOIN` directo contra tablas ajenas fuera de `analytics`".
   - `organization_members` pertenece a `organizations`, así que ese `JOIN` desde `auth` viola la regla. La decisión de fondo (leer rol, organización y estado de la base en cada request) no se ve afectada; sí la forma de hacerlo. Se resuelve en D-2.
2. **`crypto.argon2` de Node figura como "Stability: 1 - Experimental"** en [nodejs.org/api/crypto.html](https://nodejs.org/api/crypto.html), consultado el 2026-09-13 mediante un resumen web. El resumen informó "Added in v19.0.0", un dato que no coincide con lo esperable y que no se toma como confiable ([EngineeringStandards](../development/EngineeringStandards.md) ya advierte sobre los resúmenes web de versiones). Además, devuelve el hash crudo, no una cadena PHC.
3. **Registro npm (2026-09-13)**:
   - `@node-rs/argon2` 2.2.1 (2026-09-10): binarios precompilados como dependencias opcionales por plataforma (incluidos `win32-x64-msvc` y `linux-x64-gnu`), sin script de instalación;
   - `argon2` 0.45.1: compila o descarga con un script `install` (`node-gyp-build`), el tipo de script que npm 11 marca como no cubierto por `allowScripts`;
   - `zod` 4.6.4 (2026-09-13) y `valibot` 1.5.0.
4. **OWASP Password Storage Cheat Sheet** (consultado el 2026-09-13): mínimo recomendado para argon2id `m=19456` (19 MiB), `t=2`, `p=1`. Sin límite máximo de largo definido. En local, esa configuración tardó 72 ms con el argon2 nativo.
5. **Next.js 16.3**:
   - `cookies().set` y `.delete` solo funcionan en Server Functions y Route Handlers (`cookies.md`);
   - no hay `request.ip`: la guía de actualización a la 15 remite a la plataforma de hosting. En un servidor propio, la IP solo llega por cabeceras del proxy (`x-forwarded-for`).
6. **No hay reglas de contraseña ni librería de validación decididas.** SecurityModel exige validar toda entrada "con un esquema explícito", y el wireframe 01 menciona "no cumplen el formato" sin definirlo.
7. **`identity-schema.test.ts` espera exactamente tres tablas en `public`.** Con la migración de esta subfase ese test tiene que actualizarse.

## Alcance incluido

1. Registrar la resolución de D-1 a D-7.
2. **Dependencias**, según D-1 y D-6, instaladas con `npm install` sin forzar nada.
3. **Esquema y migración** en `src/modules/auth/schema.ts` y `drizzle/0001_*`:
   - `sessions` según [DataModel.md](../architecture/DataModel.md);
   - la tabla de intentos de login según D-3.
   - `npm run db:migrate` en desarrollo; la base de test se migra sola.
4. **`src/modules/auth/password.ts`**:
   - hash y verificación argon2id con `m=19456`, `t=2`, `p=1`, en formato PHC;
   - verificación contra un hash ficticio cuando el email no existe, para no revelar su existencia por tiempo de respuesta;
   - política de largo según D-5.
5. **`src/modules/auth/repository.ts`**: acceso a `users`, `sessions` y la tabla de intentos. Nada de tablas de otros módulos.
6. **`src/modules/auth/service.ts`**, con resultados tipados que usan los códigos de la taxonomía de [Overview.md](../architecture/Overview.md) (`UNAUTHENTICATED`, `RATE_LIMITED` con segundos de espera, `VALIDATION_ERROR`):
   - `login(email, password, ip)`:
     - valida la entrada (D-6) y aplica el límite (D-3, D-4) antes de verificar la contraseña;
     - rechaza a usuarios inexistentes o inactivos con el mismo resultado que una contraseña incorrecta;
     - si el login es correcto, borra las sesiones expiradas del usuario y los intentos fallidos de la cuenta, crea una sesión nueva y devuelve el token;
   - `validateSession(token)`:
     - solo `sessions` con `users` (D-2);
     - rechaza token ausente, mal formado, inexistente, expirado, por encima del tope de 30 días o de un usuario inactivo, y borra la fila expirada;
     - renueva `expires_at` a mitad de ventana;
     - devuelve `userId` y `mustChangePassword`;
   - `logout(token)`: borra la fila;
   - `changePassword(userId, currentPassword, newPassword)`: verifica la contraseña actual, aplica la política, guarda el hash nuevo con `must_change_password = false`, revoca todas las sesiones del usuario y devuelve una nueva;
   - `revokeUserSessions(userId)`: para la 3.7.
7. **`src/modules/auth/session-cookie.ts`**:
   - leer, escribir y borrar la cookie con `next/headers`;
   - los atributos del ADR 0012 salen de una función pura: `HttpOnly`, `SameSite=Lax`, `Path=/`, sin `Domain`, `Secure` y nombre `__Host-crm_session` con TLS, `crm_session` sin TLS, vencimiento igual a `expires_at`;
   - la IP de la request según D-4.
8. **`src/modules/auth/index.ts`**: interfaz pública con el servicio, el adaptador de cookie y los tipos. Nada más se exporta.
9. **Tests de integración** en `tests/integration/auth-*.test.ts`, contra la base de test, llamando al servicio. Cada invariante se prueba intentando violarlo:
   - **hash**: formato PHC con los parámetros fijados; dos hashes de la misma contraseña difieren; una contraseña incorrecta no verifica;
   - **login correcto**: la fila de `sessions` tiene como `id` el SHA-256 del token, y ninguna fila contiene el token;
   - **login rechazado**: email inexistente, contraseña incorrecta y usuario inactivo dan el mismo resultado;
   - **sesión nueva en cada ingreso**: dos ingresos dan tokens distintos, y el login borra las sesiones expiradas del usuario;
   - **validación**:
     - rechaza token inexistente, manipulado o con otro formato;
     - rechaza y borra una sesión expirada o con más de 30 días desde `created_at`;
     - rechaza a un usuario desactivado sin revocación previa;
     - renueva a mitad de ventana y no antes;
   - **logout**: borra la fila, y el token deja de validar;
   - **cambio de contraseña**:
     - revoca las demás sesiones y devuelve una nueva;
     - la contraseña vieja deja de funcionar;
     - pone `must_change_password` en `false`;
     - actualiza `users.updated_at`, lo que cubre el pendiente del `$onUpdate` de la 3.1;
   - **límite por cuenta** (D-3):
     - al superar el umbral, el intento siguiente da `RATE_LIMITED` con segundos de espera, aunque la contraseña sea correcta;
     - vencida la ventana (simulada retrocediendo `attempted_at`), vuelve a permitir;
     - un email inexistente acumula igual que uno existente;
     - un login correcto limpia los fallos de la cuenta;
   - **límite por IP** (D-3): al superar el umbral con emails distintos, da `RATE_LIMITED`;
   - **validación de entrada**: email inválido y contraseña fuera de política dan `VALIDATION_ERROR` sin registrar intento;
   - **sin secretos en logs**: ninguna salida de `console` durante los tests contiene la contraseña ni el token.
10. **Tests unitarios** junto al código: atributos de la cookie según haya TLS, extracción de IP según D-4 y política de contraseña.
11. **Ajuste de `identity-schema.test.ts`**: la lista de tablas esperadas incluye las nuevas.
12. **Documentación**:
    - DataModel: `sessions` implementada y la tabla de intentos;
    - SecurityModel: política de contraseña y límites;
    - Environments: variable de D-4;
    - EngineeringStandards: hash y validación;
    - RepositoryStructure: archivos de `auth`;
    - ADR 0012 según D-2.

## Alcance excluido

- Server Actions, páginas, `proxy` y la pantalla de login y cambio de contraseña (3.5).
- Contexto autenticado con organización y rol, restricción de `must_change_password`, guards por rol, verificación de `Origin` y taxonomía de errores como tipo compartido (3.4).
- Auditoría de login o de cambio de contraseña (3.6), alta de usuarios, contraseña inicial y desactivación (3.7).
- Seed básico: sin pantalla de login no tiene uso; nace en la 3.5.
- Log estructurado con `request_id` (3.4). En esta subfase no se agrega logging nuevo.
- Recuperación de contraseña por email, "recordarme", 2FA y bloqueo permanente de cuentas.
- CAPTCHA, listas de contraseñas filtradas y medición de fuerza de la contraseña.
- Tests de tiempo de respuesta: la verificación contra un hash ficticio se implementa, pero no se mide por ser inestable en CI.
- Cualquier dependencia fuera de D-1 y D-6.

## Archivos o componentes autorizados

Lista cerrada:

- `package.json` y `package-lock.json`: solo las dependencias de D-1 y D-6. `node_modules/`.
- `src/modules/auth/`: `schema.ts`, `password.ts`, `repository.ts`, `service.ts`, `session-cookie.ts`, `index.ts` y sus `*.test.ts`.
- `drizzle/`: la migración `0001_*` y su `meta/`.
- `tests/integration/`: `auth-*.test.ts` nuevos y el ajuste de `identity-schema.test.ts` (punto 11).
- `.env.example`: la variable de D-4, sin secretos.
- `docs/decisions/brief-3.3-autenticacion.md` (este archivo) y su fila en `docs/decisions/README.md`.
- `docs/decisions/0012-mecanismo-de-sesion.md`, solo según D-2.
- `DataModel.md`, `SecurityModel.md`, `Environments.md`, `EngineeringStandards.md` y `RepositoryStructure.md`, en lo indicado en el punto 12.
- `CHANGELOG.md` y `HANDOFF.md`, al cerrar la subfase.
- Fuera del repositorio: las bases local de desarrollo y de test.

## Fuentes de verdad

1. [ADR 0012](0012-mecanismo-de-sesion.md), corregido según D-2, y [SecurityModel.md](../architecture/SecurityModel.md).
2. [Overview.md](../architecture/Overview.md) y [RepositoryStructure.md](../architecture/RepositoryStructure.md): dependencias entre módulos y forma interna.
3. [DataModel.md](../architecture/DataModel.md): `users` y `sessions`.
4. [TestingStrategy.md](../development/TestingStrategy.md): casos obligatorios de sesión.
5. [Wireframe 01](../product/wireframes/01-inicio-de-sesion.md) y [Screens.md §1](../product/Screens.md#1-inicio-de-sesión): mensajes genéricos y `RATE_LIMITED` con tiempo de espera.
6. OWASP Password Storage Cheat Sheet, documentación de Node y de Next.js 16.3, y el registro npm, consultados el 2026-09-13.

## Dependencias

- 3.2 cerrada (commit `3b68aa9`, CI en verde en la ejecución 34787944362).
- Autorizaciones de los gates 1 y 2, y Docker Desktop en marcha.

## Decisiones pendientes

Cada decisión trae una recomendación, no una resolución: la resuelve el usuario.

### D-1 — Implementación de argon2id

- **Opciones**:
  - (a) **`@node-rs/argon2` 2.2.x**: binarios precompilados sin script de instalación; genera y verifica cadenas PHC.
  - (b) **`crypto.argon2` nativo de Node**: sin dependencia, pero marcado **Experimental** en su documentación. Devuelve el hash crudo, así que habría que escribir a mano la codificación PHC y la comparación.
  - (c) **`argon2` 0.45.x**: maduro, pero instala con un script `install`, justo lo que npm 11 marca en CI con `allowScripts`.
- **Recomendación**: (a). Evita una API experimental en el punto más sensible del sistema y el riesgo de scripts de instalación. Con PHC, cambiar de parámetros o de implementación más adelante solo requiere re-hashear en el login.
- **Consecuencia**:
  - una dependencia nativa;
  - si CI no encuentra el binario de su plataforma, se aplica la condición de detención;
  - cuando `crypto.argon2` sea estable, migrar a nativo es un cambio interno de `password.ts`.

### D-2 — Validación sin `JOIN` entre módulos

- **Opciones**:
  - (a) **Dos consultas por interfaces públicas**:
    - `auth.validateSession` une solo `sessions` y `users`, que son tablas propias;
    - en la 3.4, `organizations` (que ya depende de `auth`) llama a esa función y resuelve la membresía con su propio repositorio.
    - El ADR 0012 recibe una nota fechada que corrige "una única consulta" por "una consulta por módulo", sin cambiar la decisión.
  - (b) **Una excepción en Overview** que permita a `auth` leer `organization_members`, como ya existe para `analytics`.
  - (c) **ADR nuevo que supere al 0012** solo por este detalle.
- **Recomendación**: (a).
  - La regla de Overview protege la frontera entre módulos, y una excepción para el camino más frecuente del sistema la debilita.
  - La decisión de fondo del ADR 0012 no cambia, así que un ADR nuevo es desproporcionado. La nota deja trazada la corrección, siguiendo la regla de documentar las contradicciones antes de decidir.
- **Consecuencia**:
  - dos consultas por request autenticado en vez de una, irrelevante con el volumen del MVP;
  - un usuario inactivo se rechaza ya en `auth`, y uno sin membresía en la 3.4.

### D-3 — Límite de intentos de login

- **Opciones**:
  - (a) **Tabla `login_attempts` en PostgreSQL**, propiedad de `auth`, que registra solo fallos:
    - columnas `id`, `scope` (enum `account`/`ip`), `key_hash` (SHA-256 del email normalizado o de la IP) y `attempted_at`, con índice `(scope, key_hash, attempted_at)`;
    - ventana deslizante de **15 minutos**: **5 fallos por cuenta** o **20 por IP** bloquean hasta que el fallo más viejo sale de la ventana;
    - un login correcto borra los fallos de la cuenta;
    - en cada intento se borran los registros vencidos de esa clave.
  - (b) **Contador en memoria del proceso**: se pierde al reiniciar, no funciona con más de una instancia y contradice el "sin estado en memoria compartido" de Overview.
  - (c) **Solo límite por cuenta**, dejando el de IP para la Fase 8.
- **Recomendación**: (a).
  - Cumple "por IP y por cuenta" de SecurityModel sin infraestructura nueva.
  - Guardar hashes evita tener emails e IPs en claro en la tabla.
  - Contar también los emails inexistentes impide averiguar qué cuentas existen.
- **Consecuencia**:
  - un atacante puede bloquear temporalmente la cuenta de otro usuario con 5 intentos cada 15 minutos. Es una limitación aceptada del MVP que se registra en SecurityModel;
  - la tabla no tiene `organization_id`, porque el intento es anterior a la autenticación.

### D-4 — Origen de la IP

- **Opciones**:
  - (a) **Variable `TRUSTED_PROXY`**:
    - en `true`, la IP es la última entrada de `x-forwarded-for`, la que agrega el proxy propio;
    - en `false` o ausente (desarrollo local, sin proxy), todas las requests comparten una única clave de IP.
  - (b) **Primera entrada de `x-forwarded-for`** siempre: la controla el cliente y es falsificable.
  - (c) **Sin límite por IP** hasta decidir el hosting (Fases 8 y 9).
- **Recomendación**: (a). Nunca confía en una cabecera que el cliente puede fabricar y deja el límite por IP funcionando en cuanto haya un proxy conocido. En local, la clave única no molesta: son 20 fallos en 15 minutos para toda la máquina.
- **Consecuencia**:
  - `.env.example` y Environments documentan `TRUSTED_PROXY`;
  - que la IP sea la correcta depende del proxy del despliegue, y se verifica en la Fase 8 o 9. Esta subfase no lo certifica.

### D-5 — Política de contraseña

- **Opciones**:
  - (a) **Entre 12 y 128 caracteres, sin reglas de composición**, sin recortar ni normalizar. El máximo acota el costo del hash ante entradas enormes.
  - (b) **Mínimo de 8 con mayúsculas, números y símbolos obligatorios**.
- **Recomendación**: (a). Largo mínimo sin reglas de composición es la práctica actual (NIST SP 800-63B), y las reglas de composición empujan a contraseñas predecibles.
- **Consecuencia**: la pantalla del cambio obligatorio (3.5) y el alta de usuarios (3.7) muestran esta regla. La contraseña inicial generada por el servidor (3.7) la cumple.

### D-6 — Validación de entradas

- **Opciones**:
  - (a) **`zod` 4.6.x**: esquemas declarativos con tipos derivados, reutilizables en todos los módulos.
  - (b) **`valibot` 1.5.x**: más liviano y modular; menos difundido.
  - (c) **Validadores escritos a mano** en cada servicio.
- **Recomendación**: (a). SecurityModel exige esquemas explícitos en toda entrada, y los módulos de las Fases 4 a 6 van a necesitar validar formularios con muchos campos. El tamaño del paquete no importa del lado del servidor, y es la librería más conocida para quien mantenga el proyecto.
- **Consecuencia**: `zod` pasa a ser la convención de validación de todos los módulos y se registra en EngineeringStandards.

### D-7 — Qué entrega la 3.3 sin pantalla

- **Opciones**:
  - (a) **Servicio y adaptador de cookie**:
    - el servicio se valida contra la base;
    - el adaptador queda en nivel implementado, con sus atributos probados como función pura;
    - las Server Actions y la prueba de punta a punta de la cookie llegan con la pantalla (3.5).
  - (b) **Además, una Server Action de login provisional** para probar la cookie ya en esta subfase.
- **Recomendación**: (a). Una acción provisional es código que la 3.5 reemplazaría, y sin pantalla solo se probaría con requests sintéticos. La cookie se valida en integración (UI ↔ servicio ↔ base) en la 3.5, como exige el Roadmap para el login.
- **Consecuencia**: el nivel de esta subfase es "validado localmente" para servicio, contraseñas y límites, e "implementado" para el manejo de la cookie.

## Resolución

Brief aprobado por el usuario el **2026-09-13**. D-1 a D-7 se resolvieron el mismo día, todas según la recomendación. El usuario autorizó explícitamente:

- instalar `@node-rs/argon2` 2.2.x y `zod` 4.6.x;
- aplicar migraciones contra la base local de Docker;
- pasar la tarea 3.3 a "En proceso" en Notion.

Docker Desktop, en marcha.

Subfase **cerrada el 2026-09-13** con confirmación del usuario. Nivel alcanzado: *validado localmente y en CI* para contraseñas, sesiones y límite de intentos, a nivel de servicio. El manejo de la cookie queda *implementado*. AC-1 a AC-10 están cumplidos; la CI del commit `b779592` quedó en verde en la ejecución 34792128446. Los 14 tests unitarios pasaron solo en local, porque `ci.yml` no corre el proyecto `unit`. La evidencia está en [CHANGELOG.md](../../CHANGELOG.md).

| Decisión | Resolución |
|---|---|
| D-1 argon2id | `@node-rs/argon2` 2.2.x con `m=19456`, `t=2`, `p=1` en formato PHC |
| D-2 Validación | Dos consultas por interfaces públicas; nota fechada en el ADR 0012 |
| D-3 Límite de intentos | Tabla `login_attempts` con hashes; ventana de 15 min, 5 fallos por cuenta, 20 por IP |
| D-4 IP | `TRUSTED_PROXY`: última entrada de `x-forwarded-for` con proxy; clave única sin proxy |
| D-5 Contraseña | 12 a 128 caracteres, sin reglas de composición |
| D-6 Validación de entradas | `zod` 4.6.x |
| D-7 Entrega | Servicio y adaptador de cookie; Server Actions en la 3.5 |

### Ajustes durante la ejecución

- **Tests de hash en el proyecto unitario**: los casos de formato PHC, sal y verificación están en `src/modules/auth/password.test.ts` y no en integración, porque no usan la base. El resto del punto 9 está en `tests/integration/auth-service.test.ts`.
- **`identity-schema.test.ts`**: además de la lista de tablas (punto 11), el caso "aplicar las migraciones otra vez no hace nada" esperaba 1 migración fija. Ahora compara contra las entradas de `drizzle/meta/_journal.json`, para no romperse con cada migración nueva.
- **Política de contraseña también en el login**: una contraseña fuera de 12 a 128 caracteres da `VALIDATION_ERROR` sin registrar intento. Toda contraseña guardada cumple la política, así que ningún usuario legítimo queda afuera.
- **Renovación y cookie**: `validateSession` extiende `expires_at` en la base y devuelve el vencimiento nuevo, pero en un Server Component no se puede reescribir la cookie. La cookie conserva el vencimiento del login hasta que una Server Action o un Route Handler la vuelva a escribir. Queda para la 3.4 y la 3.5.
- **Cambio de contraseña sin límite de intentos**: requiere una sesión válida y la contraseña actual. Un límite propio para ese caso no estaba en el alcance.
- **TLS**: `session-cookie.ts` considera que hay TLS cuando `NODE_ENV=production`. En `next start` sobre `http://localhost` los navegadores aceptan cookies `Secure` y `__Host-`, porque tratan `localhost` como contexto seguro.
- **`@node-rs/argon2` y el build de Next.js**: ninguna ruta importa `auth` todavía, así que `next build` no ejercitó el binario nativo dentro del bundle del servidor. Se verifica en la 3.5.
- **`npm ci`**: reprodujo la instalación (246 paquetes) sin avisos de `allowScripts` en local. `npm install` informó los mismos 4 avisos moderados de `npm audit` de antes, vía `drizzle-kit`.
- **Migraciones en desarrollo**: `db:migrate` corrió dos veces, con 2 migraciones registradas y 0 filas.

## Invariantes

- No hay referencias a Airtable ni al repositorio del agente de WhatsApp.
- `auth` no importa ningún otro módulo ni consulta tablas ajenas.
- Ni la base, ni los logs, ni los mensajes de error contienen el token de sesión ni la contraseña en claro.
- Un fallo de login no revela si el email existe: mismo resultado y verificación de hash también para emails inexistentes.
- El límite se evalúa antes de verificar la contraseña.
- Ninguna dependencia fuera de D-1 y D-6, y ninguna resuelta por la fuerza.
- `next build` sigue sin requerir la base.

## Criterios de aceptación

- **AC-1**: D-1 a D-7 tienen resolución del usuario con fecha.
- **AC-2**: `npm install` agrega exactamente las dependencias de D-1 y D-6, sin dependencias pares no satisfechas ni avisos nuevos de `allowScripts`. `npm ci` reproduce la instalación.
- **AC-3**:
  - `drizzle/0001_*` crea exactamente `sessions` y la tabla de D-3 con las columnas, claves, `ON DELETE` e índices de DataModel. La revisión contrasta el SQL.
  - `db:migrate` la aplica en desarrollo.
  - El paso de desfase de CI sigue en verde.
- **AC-4**: `npm run test` pasa con la base levantada e incluye cada caso del punto 9 y los unitarios del punto 10.
- **AC-5**: los casos de sesión de [TestingStrategy.md](../development/TestingStrategy.md) que corresponden a la 3.3 tienen test (logout, expiración, tope, token manipulado, hash sin token, cambio de contraseña, desactivado y sesión nueva por ingreso).
- **AC-6**: la regla de frontera sigue en verde y `src/modules/auth/` no importa nada de otros módulos.
- **AC-7**: con el contenedor detenido, `typecheck`, `lint`, `test:guards` y `build` pasan.
- **AC-8**: CI en verde en el commit de la subfase, verificado con `gh run view`, incluido el binario de D-1 en Linux.
- **AC-9**: `git status` muestra solo archivos autorizados, y ningún archivo versionado contiene secretos.
- **AC-10**: los documentos del punto 12 y el ADR 0012 reflejan las resoluciones, con la contradicción de D-2 documentada. Los enlaces internos resuelven.

## Pruebas y evidencia requerida

- **Evidencia `deterministic`** contra PostgreSQL 18.6 real en Docker: salidas de `npm ci`, `db:migrate`, `npm run test`, `typecheck`, `lint`, `test:guards` y `build` con la base detenida, y el SQL de la migración.
- **Evidencia de CI**: ejecución en verde del commit de la subfase.

**Nivel resultante esperado: validado localmente y en CI** para contraseñas, sesiones, límite de intentos y la tabla nueva, siempre a nivel de servicio. El manejo de la cookie queda **implementado** (D-7), y la IP detrás de un proxy real no se valida (D-4). Login y logout de punta a punta se validan en integración en la 3.5.

La revisión es una autoevaluación (`self_assessment: true`).

## Condiciones de detención

- **Antes de `npm install`** o de aplicar migraciones, si no hay autorización explícita, o si Docker Desktop no responde.
- Si `@node-rs/argon2` no trae binario para Windows x64 o Linux x64, requiere un script de instalación o falla en CI: se reporta sin cambiar de implementación por cuenta propia.
- Si el SQL generado difiere de DataModel o de D-3 en algo no resuelto.
- Si cumplir un caso obliga a que `auth` consulte tablas de otro módulo.
- Si hace falta una dependencia, archivo o carpeta fuera de la lista autorizada.
- Antes de commit, push o cambios en Notion.
