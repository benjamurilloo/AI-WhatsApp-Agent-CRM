---
schema: task-brief.v1
task_id: 3.5
task_type: implementation
generated_at: 2026-09-14
---

# Brief: 3.5 — Pantalla de inicio de sesión

## Objetivo

1. Implementar la **pantalla 1** ([Screens.md §1](../product/Screens.md#1-inicio-de-sesión), [wireframe 01](../product/wireframes/01-inicio-de-sesion.md)):
   - ingreso con errores que no revelan si la cuenta existe;
   - cambio obligatorio de contraseña;
   - cierre de sesión.
2. Hacer cumplir **FR-ORG-03** (sin sesión → login) y el bloqueo de **`must_change_password`** en toda ruta protegida.
3. Llevar la **cookie de sesión de punta a punta**, resolviendo su vencimiento frente a la renovación (D-5).
4. Montar la infraestructura que esta primera pantalla necesita y que nace con ella:
   - estilos;
   - verificación de accesibilidad;
   - log con `request_id`;
   - seed básico;
   - tests end-to-end en CI.
5. **Validar el login en integración** (UI ↔ servicio ↔ base), como exige el [Roadmap](../planning/Roadmap.md) para la Fase 3.

No incluye el dashboard (Fase 7), la gestión de usuarios (3.7) ni el marco común con navegación.

## Ubicación en la Fase 3

- **Orden previsto**: 3.1 a 3.4 y 3.6 (cerradas) → **3.5** → 3.7.
- **Criterio de la Fase 3 que cubre**: "el login, validado en integración (UI ↔ servicio ↔ base)".
- **Gates de entrada**, que se piden por separado de la aprobación del brief:
  1. autorización explícita para instalar las dependencias de desarrollo que resulten de D-2, D-3, D-7 y D-8;
  2. Docker Desktop con el contenedor en marcha.

  No hay migraciones.

## Hallazgos de la verificación previa (2026-09-14)

1. **Estado**: `main` limpio en `e47f6c2`, con la CI en verde (ejecución 34874905065).
2. **Notion**: la tarea 3.5 dice "Pantalla 1 de Screens.md, con errores que no revelan si la cuenta existe".
3. **Contradicción entre el wireframe y `auth`.** El paso de cambio obligatorio del wireframe 01 pide solo "nueva contraseña" y "repetir". En cambio, `auth.changePassword` exige `currentPassword`, y el usuario acaba de ingresar con la contraseña inicial. Se resuelve en D-4.
4. **Cookie y renovación.**
   - En Next.js 16.3 las cookies solo se escriben en Server Functions y Route Handlers, nunca durante el render de un Server Component (`cookies.md`, documentación local de `next`).
   - `validateSession` extiende `expires_at` en la base, pero un usuario que solo navega nunca reescribe la cookie: esta vence a los 7 días del ingreso aunque la sesión siga válida.
   - El ADR 0012 dice que el vencimiento de la cookie "coincide con `expires_at`".

   Se resuelve en D-5.
5. **Server Actions** (`server-actions.md`): corren como `POST`, comparan `Origin` con `Host` y rechazan si no coinciden. Si todas las mutaciones son Server Actions, no hace falta ningún Route Handler mutante, y la verificación de `Origin` en `src/shared/http/` sigue sin consumidor.
6. **`proxy`**, según su referencia y la guía de autenticación:
   - corre en Node por defecto y también sobre rutas precargadas;
   - la guía indica que solo lea la cookie, sin consultar la base;
   - la guía indica verificar la autorización dentro de cada Server Function.

   Se evalúa en D-6.
7. **`@node-rs/argon2`** figura en `server-external-packages.jsonc` de Next.js 16.3.5, así que queda fuera del bundle del servidor automáticamente. El build con una ruta que use `auth` está pendiente desde la 3.3.
8. **Estilos**: no hay ninguna solución instalada.
   - La guía de CSS de Next.js 16.3 recomienda Tailwind, con CSS Modules para lo que no cubra.
   - Registro npm (2026-09-14): `tailwindcss` y `@tailwindcss/postcss` 4.3.3.
   - Los breakpoints de Screens.md (640 y 1024 px) son exactamente `sm` y `lg` de Tailwind.
9. **Accesibilidad sin lint.** `eslint-plugin-jsx-a11y` 6.10.2 (última publicación en octubre de 2024) acepta ESLint hasta la 9, y el proyecto usa ESLint 10 (ADR 0011). Alternativas en el registro npm (2026-09-14):
   - `eslint-plugin-jsx-a11y-x` 0.2.0 acepta ESLint 10, pero tiene 4 versiones y un único mantenedor;
   - `@axe-core/playwright` 4.13.0 audita el DOM renderizado.
10. **Playwright no está instalado.** `@playwright/test` 1.63.0 coincide con lo fijado en EngineeringStandards y Next.js 16.3.5 lo acepta. En CI necesita instalar Chromium con sus dependencias del sistema. `.gitignore` ya excluye `test-results/` y `playwright-report/`.
11. **Seed.** No existe `seeds/`. Node 24.15 ejecuta TypeScript quitando los tipos, pero no resuelve el alias `@/`. `tsx` 4.23.13 está instalado solo como dependencia transitiva de `drizzle-kit` y `vite`, no declarado. Se resuelve en D-7.
12. **No hay destino después de ingresar**: `/` es un marcador de la 2.3 y el dashboard llega en la Fase 7. Se resuelve en D-6.
13. **Cookie `Secure` en los tests.** `next start` pone `NODE_ENV=production`, así que la cookie sale `Secure` y con nombre `__Host-crm_session` aunque el servidor escuche en `http://localhost`. Chromium trata `localhost` como contexto seguro; se verifica al implementar (condición de detención).
14. **`changePassword`** ya pone `must_change_password` en `false`, borra las sesiones del usuario y crea una nueva en una transacción (`replacePasswordAndSessions`).

## Alcance incluido

1. Registrar la resolución de D-1 a D-9 y la nota fechada en el ADR 0012 que corresponda a D-5.
2. **Dependencias de desarrollo** según D-2, D-3, D-7 y D-8, instaladas con `npm install -D` sin forzar nada.
3. **Estilos** según D-2: `postcss.config.mjs`, `src/app/globals.css` e import en `layout.tsx`.
4. **`auth`**, sin cambios de esquema:
   - `completeRequiredPasswordChange` según D-4;
   - el vencimiento de la cookie según D-5, expuesto en el resultado de `login` y de los cambios de contraseña;
   - interfaz pública actualizada.
5. **`src/shared/log/`** según D-9: log estructurado JSON y generación de `request_id`, sin PII.
6. **Rutas** según D-6:
   - `/login` (pantalla 1) con su Server Action;
   - `/cambiar-contrasena` con su Server Action;
   - `/` como página protegida provisional con la acción de cierre de sesión;
   - un helper de servidor que resuelve la sesión y redirige a `/login` o a `/cambiar-contrasena`;
   - componentes compartidos de la pantalla en `src/app/_components/`, por ejemplo el campo de contraseña con botón de mostrar.
7. **Comportamiento de la pantalla** (wireframe 01):
   - `UNAUTHENTICATED`, y un `VALIDATION_ERROR` por la política de contraseña en el ingreso → "Email o contraseña incorrectos.", con el foco en el mensaje;
   - email con formato inválido → mensaje asociado al campo con `aria-describedby`;
   - `RATE_LIMITED` → "Demasiados intentos. Probá de nuevo en N minutos.", con el botón deshabilitado hasta ese momento;
   - error inesperado → "No pudimos iniciar sesión. Código: `request_id`", con el error registrado en el log;
   - usuario autenticado sin membresía → se cierra esa sesión y se muestra el mensaje genérico;
   - botón deshabilitado con "Ingresando…" mientras responde el servidor;
   - `autocomplete` correcto en cada campo y resultados anunciados con `aria-live`;
   - una columna centrada en escritorio y a ancho completo en móvil.
8. **Seed básico** según D-7 (`seeds/basic.ts` y script `db:seed`): una organización, un `admin`, un `viewer` y un usuario con `must_change_password`, todos sintéticos e idempotentes. Se niega a correr contra una base que no sea de desarrollo, test o e2e.
9. **Tests de integración** contra PostgreSQL real:
   - `completeRequiredPasswordChange`:
     - cambia la contraseña, apaga el flag, revoca las demás sesiones y emite una nueva;
     - con el flag en `false` → `FORBIDDEN`;
     - con sesión inválida → `UNAUTHENTICATED`;
     - fuera de política → `VALIDATION_ERROR`;
     - la contraseña inicial deja de funcionar;
   - vencimiento de la cookie según D-5;
   - el seed es idempotente y se niega a correr contra una base no permitida.

   Los tests existentes siguen sin cambios; solo se agregan casos.
10. **Tests unitarios**: traducción de códigos de error a mensajes visibles, y un log sin contraseñas, tokens ni emails en claro.
11. **Tests end-to-end** según D-8, con Chromium sobre el build de producción y una base real sembrada:
    1. un ingreso correcto lleva a `/`, con cookie `HttpOnly`, `SameSite=Lax`, `Path=/` y vencimiento según D-5;
    2. contraseña incorrecta y email inexistente muestran el mismo mensaje, con el foco en él;
    3. un email inválido muestra el mensaje asociado al campo;
    4. el sexto intento fallido muestra el aviso de reintento con el botón deshabilitado;
    5. `/` sin sesión redirige a `/login` (FR-ORG-03);
    6. un usuario autenticado que abre `/login` va a `/`;
    7. `must_change_password`:
       - el ingreso lleva a `/cambiar-contrasena`, y `/` vuelve a ese paso;
       - contraseñas distintas o fuera de política muestran el error junto al campo;
       - un cambio válido lleva a `/`, y la contraseña inicial ya no sirve;
    8. el cierre de sesión lleva a `/login` y borra la cookie; volver a poner la cookie anterior en el navegador no recupera la sesión;
    9. el botón para mostrar la contraseña es accesible (`aria-pressed`) y la oculta por defecto;
    10. el ingreso se completa solo con teclado;
    11. `@axe-core/playwright` no encuentra violaciones WCAG 2.x A y AA en cada estado: formulario vacío, error, límite de intentos, cambio de contraseña y `/`;
    12. en un viewport móvil (375 px) el formulario ocupa una columna sin desplazamiento horizontal.
12. **CI**: pasos "Instalar Chromium de Playwright" y "Tests end-to-end" después del build.
13. **Documentación**:
    - EngineeringStandards: estilos, accesibilidad, Playwright instalado, `tsx` y pasos de CI;
    - SecurityModel: vencimiento de la cookie, cambio obligatorio y ausencia de `proxy`;
    - Environments: seed, base de e2e y comandos;
    - TestingStrategy: end-to-end implementado, y el caso de `must_change_password` cubierto;
    - RepositoryStructure: fila de la 3.5 y árbol;
    - Overview: log implementado;
    - `.env.example`: contraseña sintética del seed.

## Alcance excluido

- Dashboard (pantalla 2, Fase 7) y marco común con nombre de organización y navegación.
- Gestión de usuarios, contraseña inicial generada por el servidor y regla del último `admin` (3.7).
- `proxy`, `serverActions.allowedOrigins` y verificación de `Origin` en Route Handlers: no hay ninguno mutante.
- Recuperación de contraseña por email, "recordarme", 2FA, tema oscuro e internacionalización.
- Librería de componentes, `prettier-plugin-tailwindcss` y fuentes externas.
- Seed de volumen.
- Firefox, WebKit y regresión visual.
- Forzar un `INTERNAL` real en end-to-end: queda con test unitario del mensaje y del log.
- Cambios de esquema o migraciones.

## Archivos o componentes autorizados

Lista cerrada:

- `package.json` y `package-lock.json`: las dependencias de desarrollo resueltas y los scripts `test:e2e` y `db:seed`.
- `postcss.config.mjs`, `playwright.config.ts`.
- `src/app/`:
  - `layout.tsx`, `globals.css` y `page.tsx`;
  - `login/` y `cambiar-contrasena/`, con páginas, formularios, acciones y sus `*.test.ts`;
  - `_components/` y `_auth/` (helper de sesión y mensajes) con sus `*.test.ts`.
- `src/shared/log/`: `index.ts` y su test unitario.
- `src/modules/auth/`: `service.ts`, `repository.ts`, `index.ts` y `session-cookie.ts`, solo en lo que piden D-4 y D-5.
- `seeds/basic.ts`.
- `tests/integration/`: `auth-service.test.ts`, solo con casos nuevos; `seed.test.ts`; `test-database.ts`, solo para derivar también el nombre de la base de e2e.
- `tests/e2e/`: `global-setup.ts` y los `*.spec.ts`.
- `.github/workflows/ci.yml`: solo los dos pasos de end-to-end.
- `.env.example`: solo la contraseña sintética del seed.
- `docs/decisions/0012-mecanismo-de-sesion.md`: solo la nota fechada de D-5.
- EngineeringStandards, SecurityModel, Environments, TestingStrategy, RepositoryStructure y Overview, en lo indicado en el punto 13.
- Este brief y su fila en `docs/decisions/README.md`.
- `CHANGELOG.md` y `HANDOFF.md`, al cerrar la subfase.

## Fuentes de verdad

1. [Screens.md §1](../product/Screens.md#1-inicio-de-sesión), sus reglas comunes y el [wireframe 01](../product/wireframes/01-inicio-de-sesion.md).
2. [ADR 0012](0012-mecanismo-de-sesion.md) con su nota, y [SecurityModel.md](../architecture/SecurityModel.md).
3. [FunctionalRequirements.md](../product/FunctionalRequirements.md): FR-ORG-02 y FR-ORG-03.
4. [NonFunctionalRequirements.md](../product/NonFunctionalRequirements.md): accesibilidad y observabilidad.
5. [Overview.md](../architecture/Overview.md) y [RepositoryStructure.md](../architecture/RepositoryStructure.md).
6. [TestingStrategy.md](../development/TestingStrategy.md) y [Roadmap.md](../planning/Roadmap.md), Fase 3.
7. Documentación de Next.js 16.3.5 incluida en `node_modules/next/dist/docs/`: autenticación, `cookies`, `proxy`, Server Actions, CSS y Playwright.

## Dependencias

- 3.6 cerrada (commit `e47f6c2`, CI en verde).
- Contenedor de PostgreSQL en marcha para los tests de integración y end-to-end.

## Decisiones pendientes

Cada decisión trae una recomendación, no una resolución: la resuelve el usuario.

### D-1 — Una subfase o dos

- **Opciones**:
  - (a) **Una subfase**: estilos, accesibilidad, log, seed y end-to-end nacen con la pantalla de login, su primer consumidor.
  - (b) **Dividir**: primero la infraestructura de UI (estilos, Playwright en CI, log y seed) sobre una página de prueba, y después el login.
- **Recomendación**: (a).
  - Cada pieza de infraestructura solo se puede verificar sobre una pantalla real: axe necesita un DOM, el log un error, el seed un usuario que ingrese.
  - Con (b), la primera subfase certificaría una página que se descarta.
  - RepositoryStructure y la 3.4 (D-5) ya fijaron que estas ubicaciones "nacen con su primer consumidor".
  - Es la subfase más grande de la Fase 3, por eso la división queda planteada. Si al implementar aparece una responsabilidad independiente más, se detiene y se propone dividir.
- **Consecuencia**: con (b), habría que crear una tarea nueva en Notion, con autorización.

### D-2 — Solución de estilos

- **Opciones**:
  - (a) **Tailwind CSS 4.3** con `@tailwindcss/postcss`, más CSS Modules para lo que no cubra.
  - (b) **CSS Modules y CSS global**, sin dependencias.
  - (c) **Una librería de componentes** (por ejemplo, Radix o shadcn/ui).
- **Recomendación**: (a).
  - Es la opción que recomienda la guía de CSS de Next.js 16.3.
  - Sus breakpoints por defecto son los de Screens.md: 640 y 1024 px.
  - Para diez pantallas con tablas que pasan a tarjetas, las utilidades evitan duplicar CSS.
  - (b) no suma dependencias, pero obliga a mantener a mano los breakpoints y los estados de foco en cada archivo.
  - (c) trae más superficie de la que pide el MVP.
- **Consecuencia**: EngineeringStandards registra la elección; sin plugin de Prettier para ordenar clases.

### D-3 — Verificación de accesibilidad

- **Opciones**:
  - (a) **`@axe-core/playwright`** sobre cada estado de cada pantalla, más casos de teclado y foco en end-to-end, sin lint de accesibilidad.
  - (b) **(a) más `eslint-plugin-jsx-a11y-x` 0.2.0** en ESLint.
  - (c) **Volver a ESLint 9** para usar `eslint-plugin-jsx-a11y` 6.10: contradice el ADR 0011.
- **Recomendación**: (a).
  - axe audita el DOM renderizado, que es donde aparecen contraste, etiquetas, `aria-live` y roles.
  - El fork está en 0.x, con un solo mantenedor.
  - La revisión del lint se repite al abrir cada fase con pantallas y cuando `eslint-plugin-jsx-a11y` soporte ESLint 10.
- **Consecuencia**: la verificación de accesibilidad pasa a ser un caso obligatorio de cada test end-to-end de pantalla, en TestingStrategy.

### D-4 — Cambio obligatorio sin la contraseña actual

- **Opciones**:
  - (a) **Función nueva en `auth`**: `completeRequiredPasswordChange({ token, newPassword })`.
    - Valida la sesión por su cuenta.
    - Solo actúa si `must_change_password` sigue en `true` en la base; si no, devuelve `FORBIDDEN`.
    - Reutiliza la transacción que ya cambia la contraseña, apaga el flag, revoca las sesiones y emite una nueva.
  - (b) **Pedir otra vez la contraseña inicial** en el formulario, y corregir el wireframe.
  - (c) **Guardar en el cliente la contraseña recién ingresada** y reenviarla.
- **Recomendación**: (a).
  - La sesión recién emitida ya prueba la identidad, y el flag en la base impide usar la función una vez hecho el cambio.
  - (b) pide dos veces la misma contraseña de un solo uso.
  - (c) mantiene una contraseña en memoria del navegador.
- **Consecuencia**:
  - la interfaz de `auth` suma la función;
  - **limitación aceptada**: quien robe la sesión mientras el flag está en `true` puede definir la contraseña sin conocer la inicial. Esa sesión dura lo que tarda el primer ingreso, y la contraseña inicial es de un solo uso.

### D-5 — Vencimiento de la cookie frente a la renovación

- **Opciones**:
  - (a) **La cookie vence en el tope absoluto** (creación de la sesión + 30 días). La base sigue gobernando la ventana deslizante de 7 días, y la cookie no se reescribe al renovar. El ADR 0012 recibe una nota fechada.
  - (b) **Reescribir la cookie con `sessionExpiresAt` en cada Server Action.** Quien solo navega pierde la cookie a los 7 días de su última acción, aunque la sesión en la base siga viva.
  - (c) **Un Route Handler de refresco** que el cliente llama periódicamente: suma un endpoint mutante con verificación de `Origin` y JavaScript de sondeo.
- **Recomendación**: (a).
  - Una cookie que sobrevive a su sesión solo lleva un token que la base rechaza, y la revocación sigue siendo del servidor.
  - Evita cierres de sesión inesperados sin agregar superficie.
  - (b) deja un comportamiento que depende de si el usuario hizo o no alguna acción.
- **Consecuencias**:
  - nota fechada en el ADR 0012, que corrige "su vencimiento coincide con `expires_at`";
  - SecurityModel lo registra;
  - `sessionExpiresAt` del contexto queda sin consumidor en esta subfase.

### D-6 — Rutas, destino e implementación de las redirecciones

- **Opciones**:
  - (a) **`/login`, `/cambiar-contrasena` y `/` como página protegida provisional**, con el cierre de sesión, que la Fase 7 reemplaza por el dashboard. Cada página y cada acción resuelven la sesión en el servidor con un helper que redirige. **Sin `proxy`**.
  - (b) **(a) más un `proxy` optimista** que redirige a `/login` si falta la cookie.
  - (c) **Sin página protegida**: el login redirige a una ruta que todavía no existe.
- **Recomendación**: (a).
  - Sin una página protegida no se pueden probar FR-ORG-03, el bloqueo de `must_change_password` ni el cierre de sesión.
  - El ADR 0012 declara `proxy` opcional, y la guía de Next.js pide verificar igual en cada Server Function. Con una sola ruta protegida, `proxy` no ahorra nada y suma un lugar donde la cobertura puede quedar desactualizada.
  - (c) deja las redirecciones sin probar.
- **Consecuencia**: `proxy` se reevalúa cuando haya varias rutas protegidas (Fase 4).

### D-7 — Cómo se ejecuta el seed

- **Opciones**:
  - (a) **`tsx` declarado como dependencia de desarrollo**, en la versión que ya está en el lockfile (4.23.x), y `npm run db:seed` que ejecuta `seeds/basic.ts`. `tsx` resuelve el alias `@/` desde `tsconfig`, así que el seed usa `hashPassword` de `auth`. El setup de end-to-end reutiliza la misma función.
  - (b) **Solo en el setup de Playwright**: sin comando para desarrollo, donde nadie podría ingresar con `next dev` sin crear usuarios a mano.
  - (c) **SQL con un hash argon2 precalculado** de una contraseña sintética: duplica los parámetros del hash fuera de `auth`.
- **Recomendación**: (a).
  - No agrega un paquete nuevo al árbol: lo declara, así deja de depender de `drizzle-kit` y `vite`.
  - Un solo lugar define cómo se hashea.
- **Consecuencias**:
  - la contraseña sintética del seed va en `.env.example`, como las credenciales locales de PostgreSQL;
  - el seed se niega a correr si la base no termina en `_dev`, `_test` o `_e2e`.

### D-8 — Tests end-to-end y CI

- **Opciones**:
  - (a) **Playwright 1.63 con Chromium**, contra `next build` y `next start`, en una base propia `<nombre>_e2e`, recreada, migrada y sembrada por el setup de Playwright. En CI, dos pasos después del build.
  - (b) **(a) pero sobre la base `_test`** de los tests de integración.
  - (c) **Solo en local**, sin CI.
- **Recomendación**: (a).
  - La guía de Next.js recomienda probar sobre el build de producción.
  - Una base separada permite correr `npm run test` y `npm run test:e2e` sin que uno vacíe los datos del otro.
  - (c) deja el criterio de la Fase 3 sin verificación en cada push.
- **Consecuencia**: `test-database.ts` pasa a derivar también el nombre de la base de e2e. EngineeringStandards y Environments registran los pasos y comandos.

### D-9 — `request_id` y log

- **Opciones**:
  - (a) **`src/shared/log/` propio**:
    - JSON a la salida estándar con nivel, `request_id`, ruta, código de resultado y `user_id` si existe;
    - `request_id` generado con `crypto.randomUUID()` en cada Server Action o página que registra;
    - se muestra al usuario solo en errores inesperados;
    - nunca registra contraseñas, tokens, hashes ni emails en claro.
  - (b) **`request_id` generado en `proxy`** como cabecera: depende de un `proxy` que D-6 no crea.
  - (c) **Una librería de log** (por ejemplo, `pino`).
- **Recomendación**: (a).
  - Cubre la política de logs de SecurityModel sin dependencias.
  - Se puede reemplazar cuando la Fase 8 revise la observabilidad con evidencia.
- **Consecuencia**: Overview pasa el log a implementado.

## Invariantes

- No hay referencias a Airtable ni al repositorio del agente de WhatsApp.
- Toda mutación es una Server Action; no se crea ningún Route Handler que modifique datos.
- Cada página protegida y cada acción validan la sesión contra la base. Nada depende de ocultar UI.
- El ingreso no revela si el email existe: mismo mensaje, mismo código y ningún dato distinto en la respuesta.
- Contraseñas, tokens y hashes nunca aparecen en logs, URLs, mensajes ni estado del cliente más allá del formulario en curso.
- `organization_id` nunca sale del request.
- `src/app/` importa módulos solo por su interfaz pública y no ejecuta SQL.
- El comportamiento existente de `auth`, `organizations` y `audit` no cambia: sus tests siguen pasando sin modificaciones.
- Sin cambios de esquema ni migraciones.

## Criterios de aceptación

- **AC-1**: D-1 a D-9 tienen resolución del usuario con fecha, y el ADR 0012 tiene la nota de D-5.
- **AC-2**: `npm install -D` agrega exactamente las dependencias resueltas, sin dependencias pares insatisfechas ni avisos nuevos de `allowScripts`, y `npm ci` reproduce la instalación.
- **AC-3**: los casos de integración del punto 9 pasan contra la base real, y los tests existentes no cambiaron.
- **AC-4**: los 12 casos end-to-end del punto 11 pasan en local contra el build de producción y PostgreSQL real.
- **AC-5**: axe no informa violaciones WCAG 2.x A ni AA en ninguno de los estados del caso 11.
- **AC-6**: el caso 1 verifica en el navegador los atributos y el vencimiento de la cookie según D-5.
- **AC-7**: los tests unitarios de mensajes y de log pasan, e incluyen que el log no contiene la contraseña, el token ni el email usados.
- **AC-8**: `npm run build` pasa con páginas que importan `auth`, y el end-to-end ingresa con argon2 funcionando sobre `next start`.
- **AC-9**: la regla de frontera sigue en verde, y `src/app/` importa solo `@/modules/<modulo>` y `@/shared/*`.
- **AC-10**: con el contenedor detenido, `typecheck`, `lint`, `test:guards`, `test:unit` y `build` pasan.
- **AC-11**: CI en verde en el commit de la subfase, con el paso de end-to-end ejecutado, verificado con `gh run view`.
- **AC-12**: `git status` muestra solo archivos autorizados, los documentos del punto 13 reflejan las resoluciones y los enlaces internos resuelven.

## Pruebas y evidencia requerida

- **Evidencia `producer-consumer`**: Playwright con Chromium sobre `next start`, contra PostgreSQL 18.6 real sembrado. La UI, las Server Actions, `auth`, `organizations` y la base intervienen sin mocks.
- **Evidencia `deterministic`**:
  - salidas de `npm run test` y `npm run test:e2e`;
  - salidas de `typecheck`, `lint`, `test:guards`, `test:unit` y `build` con la base detenida.
- **Evidencia de CI**: ejecución en verde con los pasos de end-to-end.

**Nivel resultante esperado**:

- **validado en integración** (UI ↔ servicio ↔ base) para el ingreso, el cambio obligatorio de contraseña, el cierre de sesión, las redirecciones y la cookie;
- **validado localmente y en CI** para `completeRequiredPasswordChange`, el seed y el log.

**No se valida**:

- la cookie detrás de TLS y de un proxy real (Fases 8 y 9);
- un `INTERNAL` real de punta a punta;
- navegadores distintos de Chromium.

La revisión es una autoevaluación (`self_assessment: true`).

## Condiciones de detención

- Antes de `npm install -D` sin la autorización del gate 1, o si una dependencia exige otra versión de ESLint, TypeScript o Next.js, o un script de instalación.
- Si Chromium no acepta la cookie `Secure` con prefijo `__Host-` sobre `http://localhost` en `next start`.
- Si `@node-rs/argon2` falla en el build o en `next start`.
- Si Tailwind 4 no compila con Next.js 16.3 sin configuración adicional.
- Si alguna pantalla necesita un Route Handler mutante, un `proxy` o un cambio de esquema.
- Si una violación de axe exige una decisión de diseño no prevista.
- Si aparece una responsabilidad independiente más (D-1).
- Antes de commit, push o cambios en Notion.

## Resolución

Brief aprobado por el usuario el **2026-09-14**. D-1 a D-9 se resolvieron el mismo día, todas según la recomendación. El usuario autorizó instalar las dependencias de desarrollo (gate 1) y confirmó Docker en marcha (gate 2). Commit, push y el cambio de estado en Notion quedan para el cierre, con autorización propia.

| Decisión | Resolución |
|---|---|
| D-1 Alcance | Una subfase |
| D-2 Estilos | Tailwind CSS 4.3 con `@tailwindcss/postcss` |
| D-3 Accesibilidad | `@axe-core/playwright` en cada estado, más casos de teclado y foco; sin lint de accesibilidad |
| D-4 Cambio obligatorio | `completeRequiredPasswordChange({ token, newPassword })`, `FORBIDDEN` con el flag en `false` |
| D-5 Cookie | Vence en el tope absoluto (creación de la sesión + 30 días); nota fechada en el ADR 0012 |
| D-6 Rutas | `/login`, `/cambiar-contrasena` y `/` protegida provisional, con helper de servidor; sin `proxy` |
| D-7 Seed | `tsx` declarado y `npm run db:seed` |
| D-8 End-to-end | Playwright con Chromium sobre `next start`, base `<nombre>_e2e`, dos pasos de CI |
| D-9 Log | `src/shared/log/` propio, JSON sin PII |

### Ajustes durante la ejecución

- **Dependencias (AC-2)**: `npm install -D` agregó 18 paquetes sin avisos de dependencias pares ni de scripts de instalación. Los 4 avisos moderados de `npm audit` son los preexistentes de `drizzle-kit`.
- **Defecto del adaptador de cookie de la 3.3, detectado por el caso 8**: `deleteSessionCookie` borraba con `cookies().delete(nombre)`, sin `Secure` ni `Path=/`, y Chromium rechazaba ese borrado de una cookie `__Host-`. La sesión ya se borraba en la base, así que la cookie que quedaba no autenticaba. Ahora el borrado repite los atributos de la cookie. Se registra en la nota del ADR 0012. Toca `session-cookie.ts` fuera de D-4 y D-5, pero es necesario para el caso 8 del alcance.
- **`created_at` de la sesión lo fija `auth`**, en lugar del valor por defecto de la base, para que el vencimiento de la cookie sea exactamente `created_at` + 30 días (D-5). `replacePasswordAndSessions` recibe la condición del flag y devuelve si actualizó (D-4), así que un doble envío no puede cambiar la contraseña dos veces.
- **Condición de detención de la cookie `Secure` sobre `http://localhost`**: no se activó. El caso 1 verifica en Chromium `__Host-crm_session` con `Secure`, `HttpOnly`, `SameSite=Lax` y `Path=/`.
- **`@node-rs/argon2` en el build**: `next build` pasó con páginas que importan `auth`, y el end-to-end ingresa sobre `next start`. No hizo falta configuración.
- **Tailwind 4.3** compiló con `postcss.config.mjs` e `@import "tailwindcss"`, sin configuración adicional.
- **Espera del servidor en Playwright**: `webServer` espera `/login`, que sin cookie no consulta la base, porque el servidor puede arrancar antes de que el setup recree la base `_e2e`.
- **Detección de ejecución directa del seed**: `seeds/basic.ts` comprueba `process.argv[1]` en lugar de `import.meta`, para que Vitest y Playwright puedan importarlo sin ejecutarlo.
- **Primera corrida del end-to-end**: 5 casos fallaron por el helper del test, que esperaba el botón después de una redirección. Se corrigió el test, no la pantalla.

**Cerrada el 2026-09-14** con confirmación del usuario. CI en verde en el commit `49bfe74` ([ejecución 34881542804](https://github.com/benjamurilloo/AI-WhatsApp-Agent-CRM/actions/runs/34881542804)); entrada en [CHANGELOG.md](../../CHANGELOG.md).
