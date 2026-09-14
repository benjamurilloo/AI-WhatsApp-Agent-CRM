---
schema: task-brief.v1
task_id: 3.7
task_type: implementation
generated_at: 2026-09-14
---

# Brief: 3.7 — Gestión de usuarios y roles

## Objetivo

1. Implementar la **pantalla 10** ([Screens.md §10](../product/Screens.md#10-usuarios-y-roles), [wireframe 10](../product/wireframes/10-usuarios-y-roles.md)), solo para `admin`:
   - lista de miembros con nombre, email, rol y estado, filtros por rol y estado, y paginación de 25;
   - alta de usuario con contraseña inicial generada por el servidor y mostrada una sola vez;
   - cambio de rol, desactivación con confirmación y reactivación.
2. Cumplir **FR-ORG-02**:
   - el usuario creado debe definir su contraseña en el primer ingreso (ya implementado en la 3.5);
   - no se puede quitar el rol ni desactivar al último `admin` activo (`BUSINESS_RULE_VIOLATION`), tampoco con cambios concurrentes.
3. Ser el **primer productor real de FR-AUD-01**: alta, cambio de rol, desactivación y reactivación de un miembro, cada uno con su `audit_logs` en la misma transacción.
4. Montar el **marco común** mínimo que la pantalla 10 necesita: organización, usuario, navegación y salida.
5. Validar la pantalla **en integración** (UI ↔ servicio ↔ base) y la regla del último `admin` con un **test de concurrencia** contra PostgreSQL real.

Con esta subfase se completan las subfases de la Fase 3. El cierre de la fase es un paso aparte.

## Ubicación en la Fase 3

- **Orden previsto**: 3.1 a 3.6 (cerradas) → **3.7** → cierre de la Fase 3.
- **Notion**: "Alta de usuarios y cambio de rol según la decisión de 1.3, con el último admin protegido". La decisión es la D-3 de la [1.3](brief-1.3-decisiones-de-producto-abiertas.md): pantalla auditada, no script de administración.
- **Gates de entrada**:
  1. Docker Desktop con el contenedor en marcha.
  2. Sin dependencias nuevas ni migraciones previstas. Si alguna aparece, se detiene y se pide autorización.

## Hallazgos de la verificación previa (2026-09-14)

1. **Estado**: `main` limpio en `5dfce9d`, con la CI en verde (ejecución 34881986727).
2. **El ejemplo de contraseña inicial del wireframe 10 viola la política.** `k7Q-2mX-9vR` tiene 11 caracteres; la política exige entre 12 y 128 (brief-3.3, D-5). Se resuelve en D-5.
3. **Una transacción cruza tres módulos.** El alta escribe `users` (de `auth`), `organization_members` (de `organizations`) y `audit_logs` (de `audit`). Hoy todo el repositorio de `auth` usa `getDb()`, así que no puede participar de una transacción ajena. Lo mismo pasa con `revokeUserSessions`, que el ADR 0012 pide ejecutar al desactivar. Se resuelve en D-2.
4. **La lista combina datos de dos módulos sin `JOIN`.**
   - Nombre, email y `is_active` son de `users` (`auth`); rol y organización, de `organization_members`.
   - Overview prohíbe el `JOIN` entre módulos fuera de `analytics`.
   - Filtrar por estado, ordenar por nombre y paginar necesitan las dos tablas a la vez.

   Se resuelve en D-3.
5. **La regla del último `admin` no la puede garantizar una constraint**, porque depende de `organization_members.role` y de `users.is_active`, que son dos tablas de dos módulos. Contar y después escribir tiene una carrera: dos `admin` que se quitan el rol al mismo tiempo dejarían la organización sin ninguno. Se resuelve en D-4.
6. **`recordAudit` rechaza un `diff` sin cambios.** Guardar el mismo rol o desactivar a alguien ya inactivo tiene que ser una operación sin efecto y sin auditoría, no un error de auditoría.
7. **`getMember`** (3.4) ya resuelve `FORBIDDEN` para `viewer` y `NOT_FOUND` para un miembro de otra organización. Devuelve solo columnas de `organization_members`, y el brief-3.4 difirió a esta subfase el nombre y el email vía `auth`.
8. **Screens.md §10 solo menciona desactivar**, pero la tabla de acciones del wireframe 10 incluye reactivar, FR-AUD-01 habla de "cambio de estado" y el enum de auditoría ya tiene `reactivate`. Se resuelve en D-9.
9. **El wireframe 10 dibuja diálogos**: alta, contraseña inicial y edición, que en móvil ocupan la pantalla completa. Un diálogo modal accesible necesita gestionar el foco y su trampa. Se resuelve en D-6.
10. **El marco común solo está dibujado en el wireframe 02**, con enlaces a pantallas que no existen hasta las Fases 4 a 7. La 3.5 lo dejó fuera; la pantalla 10 es la primera que lo lleva. Se resuelve en D-7.
11. **`forbidden()` de Next.js 16.3 sigue siendo experimental** (`experimental.authInterrupts`); la 3.4 decidió no usarlo. El wireframe pide "No tenés permiso para ver esta página." para un `viewer`. Se resuelve en D-10.
12. **El email de `users` es único sin distinguir mayúsculas** (índice sobre `lower(email)`). Un alta concurrente con el mismo email pasa una verificación previa y choca con `23505`, que Overview exige traducir explícitamente a `CONFLICT`.
13. **Desactivar a un usuario** ya lo deja fuera en el request siguiente, porque `validateSession` rechaza `is_active = false`. El ADR 0012 pide además borrar sus sesiones.
14. **El índice `organization_members (organization_id)` ya existe** (3.1): no hacen falta migraciones.

## Alcance incluido

1. Registrar la resolución de D-1 a D-11.
2. **`auth`**, sin cambios de esquema y según D-2 y D-5:
   - funciones que reciben la transacción del llamador: crear usuario con contraseña inicial y `must_change_password = true`, cambiar `is_active` y borrar las sesiones de un usuario;
   - generación de la contraseña inicial con `node:crypto`;
   - lectura de nombre, email y estado por lista de ids, para la lista y el marco común;
   - email normalizado (`trim` y minúsculas) y nombre validado con `zod` (1 a 200 caracteres después de `trim`);
   - `23505` sobre el email traducido a `CONFLICT`;
   - los tests existentes de `auth` siguen sin cambios.
3. **`organizations`**, sin cambios de esquema:
   - `listMembers(context, filtros)`: solo `admin`, con filtros por rol (todos, `admin`, `viewer`) y estado (activos por defecto, inactivos, todos), orden por nombre y página de 25 (D-3);
   - `createMember(context, { name, email, role })`: devuelve la contraseña inicial una sola vez;
   - `changeMemberRole(context, memberId, role)`, `deactivateMember(context, memberId)` y `reactivateMember(context, memberId)`;
   - cada caso de uso que escribe abre la transacción, bloquea la organización, verifica la regla del último `admin` cuando corresponde (D-4), escribe y llama a `recordAudit(tx, …)` (D-8);
   - una operación sin cambio real devuelve éxito sin escribir ni auditar (hallazgo 6);
   - lectura del nombre de la organización para el marco común.
4. **Rutas** según D-6, D-7 y D-10:
   - grupo de rutas con el marco común para las páginas autenticadas; `/` pasa a ese grupo;
   - `/usuarios`: lista con filtros y página en la URL, tabla en escritorio y tarjetas en móvil, "(vos)" en el propio usuario y el estado "Sin resultados" con "Limpiar filtros";
   - `/usuarios/nuevo`: formulario y, tras crear, la contraseña inicial en la misma página con "Copiar" y "Entendido";
   - `/usuarios/[memberId]`: rol, desactivar con confirmación en un segundo paso, y reactivar;
   - un `viewer` recibe "No tenés permiso para ver esta página." sin datos, y no ve el enlace en la navegación;
   - un miembro inexistente o de otra organización muestra "No encontramos ese usuario.";
   - cada página y cada Server Action resuelven la sesión y la autorización en el servidor.
5. **Mensajes** derivados de la taxonomía:
   - `VALIDATION_ERROR` en el campo;
   - `CONFLICT`: "Ya existe un usuario con ese email.", en el campo email;
   - `BUSINESS_RULE_VIOLATION`: "No podés quitar ni desactivar al último admin de la organización.";
   - `INTERNAL` con `request_id`;
   - botón deshabilitado mientras guarda.
6. **Log**: los eventos de las acciones con `request_id`, ruta, código y `user_id` del actor. Nunca la contraseña inicial, el email ni el nombre.
7. **Tests de integración** contra PostgreSQL real (`tests/integration/members.test.ts`):
   - alta:
     - crea usuario, membresía y auditoría juntos;
     - el usuario queda con `must_change_password`, ingresa con la contraseña inicial y queda bloqueado hasta cambiarla;
     - un email repetido con otras mayúsculas da `CONFLICT` sin escribir nada;
     - dos altas concurrentes con el mismo email: una crea y la otra da `CONFLICT`, sin membresía ni auditoría huérfanas;
     - entrada inválida da `VALIDATION_ERROR`;
   - cambio de rol, desactivación y reactivación, con sus `diff` exactos en `audit_logs`; la desactivación borra las sesiones del usuario;
   - una operación sin cambio real no escribe auditoría;
   - regla del último `admin`:
     - quitar el rol o desactivar al único `admin` activo da `BUSINESS_RULE_VIOLATION` sin escribir nada;
     - un segundo `admin` inactivo no cuenta;
     - con dos `admin` activos que se quitan el rol al mismo tiempo, en dos conexiones, exactamente uno lo logra;
   - autorización:
     - `viewer` y un actor con `must_change_password` reciben `FORBIDDEN` en todos los casos de uso;
     - un miembro de otra organización da `NOT_FOUND` al leerlo, cambiarle el rol, desactivarlo o reactivarlo;
     - la lista nunca incluye miembros de otra organización;
   - lista: filtros, orden por nombre y páginas de 25, sin hashes en el resultado;
   - la contraseña inicial no aparece en `audit_logs`, en los logs ni en ninguna columna salvo como hash.
8. **Tests unitarios**:
   - generador de contraseña inicial: largo, alfabeto, cumplimiento de la política y dos llamadas distintas;
   - lectura de los filtros de la URL, con valores inválidos reemplazados por los de defecto;
   - traducción de códigos a mensajes.
9. **Tests end-to-end** (`tests/e2e/users.spec.ts`), con Chromium sobre `next start` y la base `_e2e`:
   1. un `admin` ve la lista con "(vos)", el marco común con su organización y la navegación;
   2. alta: la contraseña inicial se muestra una vez y no reaparece al recargar; con ella el usuario nuevo ingresa y va al cambio obligatorio;
   3. email repetido: mensaje en el campo;
   4. cambio de rol: se refleja en la lista y deja una fila en `audit_logs`;
   5. desactivar pide confirmación; después la sesión abierta de ese usuario, en otro contexto de navegador, vuelve a `/login`; reactivar lo habilita;
   6. último `admin`: el mensaje aparece y nada cambia;
   7. un `viewer`: sin enlace en la navegación, y `/usuarios` muestra el mensaje de permiso sin datos;
   8. el id de un miembro de otra organización en la URL muestra "No encontramos ese usuario.";
   9. filtros y página viven en la URL y sobreviven a recargar; con más de 25 miembros aparece la página 2;
   10. a 375 px la lista usa tarjetas sin desplazamiento horizontal;
   11. el alta se completa solo con teclado;
   12. `@axe-core/playwright` no encuentra violaciones WCAG 2.x A ni AA en: lista, sin resultados, alta con error, contraseña inicial, edición con confirmación, último `admin` y sin permiso.

   `tests/e2e/login.spec.ts` sigue pasando; solo cambia si el marco común modifica lo que verifica sobre `/`.
10. **Documentación**:
    - SecurityModel: gestión de miembros, contraseña inicial, regla del último `admin` y su bloqueo;
    - Overview: transacciones que cruzan módulos (D-2) y composición de la lista (D-3);
    - DataModel: dónde se aplica la regla del último `admin`;
    - TestingStrategy: casos de `organization_members` y del último `admin` cubiertos;
    - RepositoryStructure: fila de la 3.7 y árbol de `src/app/`;
    - wireframe 10: ejemplo de contraseña conforme a la política, y la nota de D-6 sobre páginas en lugar de diálogos;
    - Screens.md §10: reactivación, según D-9.

## Alcance excluido

- Editar nombre o email de un usuario, borrarlo físicamente o restablecerle la contraseña: ninguna pantalla lo pide.
- Invitación por email, recuperación de contraseña y reenvío de la contraseña inicial.
- Consulta del historial de auditoría (FR-AUD-02, pantallas 4 y 7).
- Enlaces del marco común a pantallas que no existen: Dashboard, Productos, Clientes y Conversaciones.
- `proxy`, varias organizaciones por usuario y selector de organización.
- Cambios de esquema, migraciones y dependencias nuevas.
- Seed de volumen: los tests de paginación insertan sus propios miembros.

## Archivos o componentes autorizados

Lista cerrada:

- `src/modules/auth/`: `service.ts`, `repository.ts`, `password.ts`, `index.ts` y sus tests unitarios, en lo que piden D-2, D-3 y D-5.
- `src/modules/organizations/`: `service.ts`, `repository.ts`, `index.ts` y sus tests unitarios.
- `src/app/`:
  - grupo de rutas autenticadas con su `layout.tsx` y el marco común; `page.tsx` de `/` movido a ese grupo;
  - `usuarios/`, `usuarios/nuevo/` y `usuarios/[memberId]/`, con páginas, formularios, acciones y sus `*.test.ts`;
  - `_auth/` y `_components/`, con sus `*.test.ts`.
- `tests/integration/members.test.ts`.
- `tests/e2e/users.spec.ts`; `tests/e2e/login.spec.ts` solo si el marco común cambia lo que verifica.
- Los documentos del punto 10.
- Este brief y su fila en `docs/decisions/README.md`.
- `CHANGELOG.md` y `HANDOFF.md`, al cerrar la subfase.

## Fuentes de verdad

1. [Screens.md §10](../product/Screens.md#10-usuarios-y-roles), sus reglas comunes, el [wireframe 10](../product/wireframes/10-usuarios-y-roles.md) y el marco común del [wireframe 02](../product/wireframes/02-dashboard.md).
2. [FunctionalRequirements.md](../product/FunctionalRequirements.md): FR-ORG-01, FR-ORG-02 y FR-AUD-01.
3. [DataModel.md](../architecture/DataModel.md): `users`, `organization_members` y `audit_logs`.
4. [Overview.md](../architecture/Overview.md): dependencias y taxonomía de errores; [SecurityModel.md](../architecture/SecurityModel.md).
5. [ADR 0010](0010-un-usuario-una-organizacion-en-el-mvp.md), [ADR 0012](0012-mecanismo-de-sesion.md) y [ADR 0013](0013-rol-de-aplicacion-y-tablas-de-solo-insercion.md).
6. [brief-3.4](brief-3.4-autorizacion-y-errores.md), [brief-3.6](brief-3.6-modulo-de-auditoria.md) y [brief-3.5](brief-3.5-pantalla-de-inicio-de-sesion.md).
7. [TestingStrategy.md](../development/TestingStrategy.md) y [TraceabilityMatrix.md](../architecture/TraceabilityMatrix.md).

## Dependencias

- 3.5 cerrada (commit `5dfce9d`, CI en verde).
- Contenedor de PostgreSQL en marcha.

## Decisiones pendientes

Cada decisión trae una recomendación, no una resolución: la resuelve el usuario.

### D-1 — Una subfase o dos

- **Opciones**:
  - (a) **Una subfase**: casos de uso, marco común y pantalla 10 juntos.
  - (b) **Dividir**: primero los casos de uso de `organizations` con la regla del último `admin` y la auditoría; después la pantalla y el marco común.
- **Recomendación**: (a).
  - Los casos de uso tienen un solo consumidor, la pantalla 10. Con (b), la primera parte se validaría solo a nivel de servicio.
  - La 3.5, de tamaño parecido, se cerró en una subfase sin desvíos de alcance.
  - Si al implementar aparece una responsabilidad independiente más, se detiene y se propone dividir.
- **Consecuencia**: con (b), hay que crear una tarea nueva en Notion, con autorización.

### D-2 — Transacción que cruza `auth`, `organizations` y `audit`

- **Opciones**:
  - (a) **`organizations` abre la transacción** y la pasa a funciones de `auth` que exigen `DbTransaction` (crear usuario, cambiar estado, borrar sesiones) y a `recordAudit`. Es el mismo patrón de la 3.6.
  - (b) **`auth` abre la transacción** y recibe un callback con el resto de las escrituras.
  - (c) **Escrituras separadas** con compensación ante fallos.
- **Recomendación**: (a).
  - El caso de uso y su regla de negocio son de `organizations`, que ya depende de `auth` y de `audit` según Overview.
  - Exigir el tipo de transacción hace que la escritura de `auth` no compile fuera de una.
  - (b) invierte el control; (c) deja estados parciales, que Overview prohíbe.
- **Consecuencia**: Overview registra que un caso de uso que cruza módulos abre la transacción en el módulo dueño de la regla.

### D-3 — Lista con datos de `auth` y `organizations`

- **Opciones**:
  - (a) **Composición en memoria**:
    - `organizations` lee todos los miembros de la organización (id, usuario, rol);
    - `auth` devuelve nombre, email y estado de esos usuarios en una consulta;
    - `organizations` filtra, ordena por nombre y pagina.
  - (b) **`JOIN` en `organizations`** con un ADR que agregue una segunda excepción a la regla de Overview.
  - (c) **Copiar nombre, email y estado en `organization_members`**: cambio de esquema y datos duplicados que hay que sincronizar.
- **Recomendación**: (a).
  - Una organización del MVP tiene decenas de usuarios, no miles: son dos consultas acotadas por el índice de organización.
  - No toca la frontera entre módulos ni el esquema.
  - **Límite aceptado**: el costo crece con la cantidad de miembros. Se revisa en la Fase 8 con datos de volumen, o antes si una organización supera los 500 miembros.
- **Consecuencia**: Overview y SecurityModel lo registran; el filtro por organización sigue en SQL.

### D-4 — Regla del último `admin` frente a la concurrencia

- **Opciones**:
  - (a) **Bloqueo de la organización**:
    - toda transacción que cambia el rol o el estado de un miembro empieza con `SELECT … FROM organizations WHERE id = $1 FOR UPDATE`;
    - después cuenta los `admin` activos dentro de la misma transacción: los ids vienen de `organizations` y el estado de `auth`;
    - si el cambio deja cero, `BUSINESS_RULE_VIOLATION` sin escribir nada.
  - (b) **Aislamiento `SERIALIZABLE`** con reintentos ante `40001`.
  - (c) **Trigger de base** que verifica la regla leyendo las dos tablas.
- **Recomendación**: (a).
  - Serializa solo los cambios de miembros de una misma organización, que son raros, y no afecta a otras organizaciones.
  - No necesita reintentos, y es fácil de probar con dos conexiones reales.
  - (b) agrega un bucle de reintentos a cada caso de uso; (c) lleva una regla de negocio a la base, cruzando dos módulos.
- **Definición**: "`admin` activo" es rol `admin` con `users.is_active = true`. La regla aplica a quitarle el rol a un `admin` activo y a desactivarlo. Reactivar o ascender nunca la viola.
- **Consecuencia**: el test de concurrencia es obligatorio y queda en TestingStrategy.

### D-5 — Contraseña inicial

- **Opciones**:
  - (a) **Generada por `auth`**:
    - 16 caracteres de un alfabeto de 32 sin símbolos ambiguos (sin `0`, `O`, `1`, `l`, `I`), elegidos con `crypto.randomInt`, lo que da 80 bits;
    - se muestra en 4 grupos separados por guion (19 caracteres, dentro de la política);
    - se guarda solo el hash argon2id, y se devuelve una única vez en el resultado del alta.
  - (b) **La escribe el `admin`** en el formulario.
- **Recomendación**: (a).
  - El wireframe y Screens.md piden "generada por el servidor".
  - (b) invita a reutilizar contraseñas conocidas.
- **Consecuencias**:
  - el wireframe 10 corrige su ejemplo, que viola la política;
  - **excepción declarada** al invariante de la 3.5: la contraseña inicial viaja una vez en el estado de la Server Action al navegador del `admin`. No va a la URL, a logs, a la auditoría ni a almacenamiento del cliente;
  - "Copiar" usa la API del portapapeles del navegador, sin dependencias.

### D-6 — Diálogos o páginas

- **Opciones**:
  - (a) **Páginas**: `/usuarios`, `/usuarios/nuevo` y `/usuarios/[memberId]`. La confirmación de desactivar es un segundo paso en la misma página, y la contraseña inicial se muestra en `/usuarios/nuevo` tras crear.
  - (b) **Diálogos modales** sobre la lista, con el elemento nativo `<dialog>`.
- **Recomendación**: (a).
  - En móvil el wireframe ya pide pantalla completa.
  - Cada estado tiene URL y se prueba sin gestionar trampas de foco.
  - Funciona sin JavaScript, salvo "Copiar".
  - El wireframe es de baja fidelidad: sus diálogos marcan contenido y acciones, no la mecánica.
- **Consecuencia**: el wireframe 10 recibe una nota que remite a esta decisión.

### D-7 — Marco común

- **Opciones**:
  - (a) **Marco mínimo** en un `layout.tsx` del grupo de rutas autenticadas:
    - muestra nombre de la organización, nombre y rol del usuario, y "Salir";
    - navegación solo a rutas existentes: "Inicio" y, para `admin`, "Usuarios";
    - el layout solo muestra datos; cada página sigue verificando la sesión;
    - la resolución de la sesión se memoriza por request con `cache` de React.
  - (b) **Sin marco**: `/usuarios` con un enlace de vuelta a `/`.
- **Recomendación**: (a).
  - El wireframe 10 lo lleva, y Screens.md pide mostrar el nombre de la organización.
  - Los enlaces a pantallas futuras se agregan con cada fase, no antes.
  - La guía de Next.js advierte que un layout no se vuelve a ejecutar en cada navegación: por eso no es una verificación de acceso.
- **Consecuencia**: el cierre de sesión pasa de `/` al marco.

### D-8 — Contenido de la auditoría de miembros

- **Opciones**:
  - (a) **Sin datos personales en el `diff`**. Entidad `organization_member` con `entity_id` igual al id de la membresía:
    - `create`: `after = { userId, role, isActive: true }`;
    - `role_change`: `{ role }`;
    - `deactivate` y `reactivate`: `{ isActive }`.
  - (b) **Incluir nombre y email** en `create`.
- **Recomendación**: (a).
  - Nombre y email siguen en `users`: la futura consulta del historial los resuelve por id.
  - Evita copiar datos personales en una tabla de solo inserción, que no se puede corregir.
  - `must_change_password` y la contraseña no se auditan.
- **Consecuencia**: DataModel registra la forma.

### D-9 — Reactivación

- **Opciones**:
  - (a) **Incluirla**: un miembro inactivo puede reactivarse, con auditoría `reactivate`. Conserva su contraseña; ninguna pantalla la restablece.
  - (b) **Solo desactivar**, como dice Screens.md.
- **Recomendación**: (a).
  - La tabla de acciones del wireframe 10 la incluye, FR-AUD-01 audita "cambio de estado" y el enum ya tiene `reactivate`.
  - Sin ella, una desactivación por error deja una cuenta inutilizable: su email queda tomado y no hay borrado.
- **Consecuencia**: Screens.md §10 suma la reactivación.

### D-10 — `viewer` que entra a `/usuarios`

- **Opciones**:
  - (a) **Mensaje en la página**: "No tenés permiso para ver esta página.", sin datos, con respuesta HTTP 200. Las Server Actions devuelven `FORBIDDEN`.
  - (b) **`forbidden()` experimental** de Next.js 16.3, con 403 real.
  - (c) **Redirigir a `/`**.
- **Recomendación**: (a).
  - La 3.4 descartó las API experimentales, y el wireframe pide el mensaje.
  - (c) oculta por qué no se ve la página.
  - **Límite aceptado**: el código HTTP no es 403. La protección está en que no se entregan datos, y un test lo verifica.
- **Consecuencia**: se reevalúa si `authInterrupts` deja de ser experimental.

### D-11 — Cambios sobre uno mismo

- **Opciones**:
  - (a) **Permitidos bajo la regla del último `admin`**. Si el actor se quita el rol, pasa a `viewer` desde el request siguiente y vuelve a `/`. Si se desactiva, sus sesiones se borran y vuelve a `/login`.
  - (b) **Prohibidos**: un `admin` no puede cambiar su propio rol ni desactivarse.
- **Recomendación**: (a).
  - El wireframe muestra "Editar" en la fila "(vos)" y el mensaje del último `admin` sobre el propio usuario.
  - La regla del último `admin` ya impide dejar la organización sin administración.
- **Consecuencia**: la desactivación de uno mismo pide la misma confirmación y lo avisa en el texto.

## Invariantes

- No hay referencias a Airtable ni al repositorio del agente de WhatsApp.
- Ningún `JOIN` entre tablas de módulos distintos; `organization_id` sale siempre del contexto autenticado.
- Todo cambio de miembro y su `audit_logs` persisten o se revierten juntos.
- Nunca queda una organización sin `admin` activo, tampoco con cambios concurrentes.
- La contraseña inicial solo existe en claro en la respuesta del alta: nunca en logs, auditoría, URL o almacenamiento.
- Un `viewer` no recibe datos de miembros por ninguna vía: página, acción o respuesta.
- Toda mutación es una Server Action que verifica sesión, `must_change_password`, rol y organización en el servidor.
- `src/app/` importa módulos solo por su interfaz pública; los componentes de cliente no importan `@/modules/*`.
- Sin cambios de esquema, migraciones ni dependencias nuevas.
- Los tests existentes siguen pasando sin modificaciones, salvo lo previsto para `login.spec.ts`.

## Criterios de aceptación

- **AC-1**: D-1 a D-11 tienen resolución del usuario con fecha.
- **AC-2**: los casos de integración del punto 7 pasan contra PostgreSQL real, incluido el de concurrencia, y los tests existentes no cambiaron.
- **AC-3**: los 12 casos end-to-end del punto 9 pasan en local sobre `next start`, y `login.spec.ts` sigue pasando.
- **AC-4**: axe no informa violaciones WCAG 2.x A ni AA en los estados del caso 12.
- **AC-5**: cada cambio de miembro deja exactamente un registro de auditoría con el `diff` de D-8, y ninguno cuando no hay cambio.
- **AC-6**: la contraseña inicial cumple la política y no aparece en `audit_logs`, logs, URL ni en el HTML de una recarga posterior.
- **AC-7**: los tests unitarios del punto 8 pasan.
- **AC-8**: la regla de frontera sigue en verde, y no hay `JOIN` entre módulos, verificado con `grep` sobre los repositorios.
- **AC-9**: con el contenedor detenido, `typecheck`, `lint`, `format:check`, `test:guards`, `test:unit` y `build` pasan, y `db:generate` no produce migraciones.
- **AC-10**: CI en verde en el commit de la subfase, con el end-to-end ejecutado, verificado con `gh run view`.
- **AC-11**: `git status` muestra solo archivos autorizados, los documentos del punto 10 reflejan las resoluciones y los enlaces internos resuelven.

## Pruebas y evidencia requerida

- **Evidencia `producer-consumer`**: Playwright con Chromium sobre `next start` contra PostgreSQL 18.6 real. La UI, las Server Actions, `organizations`, `auth`, `audit` y la base intervienen sin mocks.
- **Evidencia `deterministic`**:
  - salidas de `npm run test` y `npm run test:e2e`;
  - verificaciones con la base detenida;
  - el test de concurrencia con dos conexiones reales.
- **Evidencia de CI**: ejecución en verde con los pasos de end-to-end.

**Nivel resultante esperado**:

- **validado en integración** para la pantalla 10 y el marco común;
- **validado localmente y en CI** para los casos de uso de miembros, la regla del último `admin` con concurrencia y la auditoría de miembros.

**No se valida**:

- rendimiento de la lista con cientos de miembros (D-3);
- navegadores distintos de Chromium;
- la aplicación conectada con el rol `crm_app` (Fases 8 y 9).

La revisión es una autoevaluación (`self_assessment: true`).

## Condiciones de detención

- Si algún caso de uso necesita un `JOIN` entre módulos, un cambio de esquema, una migración o una dependencia nueva.
- Si el bloqueo de D-4 no serializa los cambios en el test de concurrencia.
- Si `recordAudit` necesita otra forma de `diff` que la de la 3.6.
- Si alguna pantalla necesita un Route Handler mutante, `proxy` o una API experimental de Next.js.
- Si una violación de axe exige una decisión de diseño no prevista.
- Si aparece una responsabilidad independiente más (D-1).
- Antes de commit, push o cambios en Notion.

## Resolución

Brief aprobado por el usuario el **2026-09-14**. D-1 a D-11 se resolvieron el mismo día, todas según la recomendación. El usuario confirmó Docker en marcha; no hay dependencias nuevas ni migraciones. Commit, push y el cambio de estado en Notion quedan para el cierre, con autorización propia.

| Decisión | Resolución |
|---|---|
| D-1 Alcance | Una subfase |
| D-2 Transacción entre módulos | `organizations` abre la transacción; `auth` y `audit` reciben `DbTransaction` |
| D-3 Lista | Composición en memoria sin `JOIN`; revisión en la Fase 8 o con más de 500 miembros |
| D-4 Último `admin` | `SELECT … FOR UPDATE` sobre la organización y conteo dentro de la transacción, con test de concurrencia |
| D-5 Contraseña inicial | Generada por `auth`: 16 caracteres de un alfabeto de 32 en 4 grupos, solo el hash persiste |
| D-6 Diálogos o páginas | Páginas `/usuarios`, `/usuarios/nuevo` y `/usuarios/[memberId]` |
| D-7 Marco común | Mínimo, en el `layout.tsx` del grupo autenticado |
| D-8 Auditoría | `diff` sin datos personales, entidad `organization_member` |
| D-9 Reactivación | Incluida |
| D-10 `viewer` | Mensaje de permiso sin datos, HTTP 200 |
| D-11 Cambios sobre uno mismo | Permitidos bajo la regla del último `admin` |

### Ajustes durante la ejecución

- **El actor se vuelve a verificar dentro del bloqueo**: además de la regla del último `admin`, cada escritura comprueba con la organización bloqueada que el actor siga siendo `admin` activo. Cubre un contexto resuelto antes de que otro `admin` le quitara el rol, y tiene su test de integración. No cambia ninguna decisión.
- **`getMember` devuelve además nombre, email, estado e `isSelf`**, lo que el brief-3.4 había diferido a esta subfase. Los tests de la 3.4 usan `toMatchObject` y siguen sin cambios.
- **`login.spec.ts`**: el cierre de sesión pasó al marco común con el texto "Salir" del wireframe 02. Los casos 7 y 8 buscan "Salir" en lugar de "Cerrar sesión"; es el cambio que preveía el alcance.
- **`src/app/page.tsx` pasó a `src/app/(autenticado)/page.tsx`**. La guarda de referencias prohibidas lee los archivos del índice de Git, así que el borrado se registró en el índice con `git rm --cached`, sin commit. También hubo que borrar `.next/dev/`, que conservaba tipos generados de la ruta anterior y hacía fallar el build.
- **Tests unitarios**: `initial-password.test.ts` es un archivo nuevo en `auth`, y `organizations/service.test.ts` suma bloques nuevos sin tocar los casos existentes.
- **Botón "Copiar"**: el caso 2 del end-to-end verifica el contenido del portapapeles con los permisos de Chromium que concede Playwright.
