# Brief 9.0.3 — La frontera de `analytics` en ESLint

- **Contrato**: `task-brief.v1`
- **Tipo de tarea**: `hardening`
- **Nivel de evidencia objetivo**: `deterministic`
- **Nivel de validación alcanzable**: **validado localmente**. La frontera se hace cumplir con ESLint y se comprueba con una guarda que aplica la configuración real; no hay nada en runtime que verificar.
- **Orden**: última subfase de la tarea madre **9.0**. Con ella cierra la 9.0 y se abre la 9.1, que tiene H-3 como precondición bloqueante y el hosting de staging (P-2) como decisión pendiente del usuario.

## Objetivo

Que el bloque de `analytics` en `eslint.config.mjs` diga lo que el diseño siempre quiso decir, y que la tabla de `RepositoryStructure.md` diga lo mismo que el bloque.

`analytics` es el único módulo de dominio con un permiso extra —puede importar `@/modules/*/schema` para leer entre dominios— y, por la forma en que ESLint reemplaza la configuración de una regla, ese bloque quedó **sin heredar** las prohibiciones que sí tienen los demás módulos de dominio.

## Lo que se verificó antes de escribir este brief

La 9.0.3 se descompuso con **tres** puntos. Al comprobarlos contra el código el 2026-09-21, quedó **uno**. Los otros dos se documentan acá porque cómo se cayeron importa más que el trabajo que ahorran.

**H-1. Sigue en pie: el bloque de `analytics` no prohíbe `next` ni `@/app/*`.**
`eslint.config.mjs:84-87` le aplica `moduleInternalsExceptSchema` y `leaveModuleRelative`, pero **no** `httpAndPresentation`, que sí tienen `catalog`, `crm`, `conversations` e `inventory` (`eslint.config.mjs:67-75`). Es el hallazgo 9 del [brief-7.1](brief-7.1-dashboard-de-metricas.md). Hoy `analytics` no importa ninguno de los dos, así que la corrección **no cambia ningún archivo de `src/`**: cierra una puerta abierta, no arregla un abuso.

**H-2. Sigue en pie, y es más específico de lo que decía el registro: el permiso de schema no distingue de quién.**
`moduleInternalsExceptSchema` permite `@/modules/*/schema`, cualquiera. Entre ellos `@/modules/auth/schema`, que exporta `users`. Ese es exactamente el agujero que la guarda `user-summaries-entry-point` de la 9.0.1 **declaró en su cabecera** como no cubierto: fija el punto de entrada contra el acceso literal a `getUserSummaries`, no contra leer la tabla por el esquema. Hoy `analytics` importa solo `@/modules/conversations/schema` y `@/modules/ingestion/schema`.

**H-3. Se cayó: el nombre del paso de guardas en `ci.yml` ya estaba arreglado.**
`.github/workflows/ci.yml:82-84` dice `Guardas del repositorio`, con un comentario arriba que explica por qué es genérico: «El detalle de cuáles son vive en `tests/guards/`, no en este nombre». Lo cambió `cae7061` (8.3), verificado con `git log -L 82,84`. Y eligió la forma que **no vuelve a envejecer**, que era el fondo del pendiente. El pendiente sobrevivió a su propia solución y llegó a figurar en el alcance de esta subfase. **Esta subfase no toca `ci.yml`.**

**H-4. Se cayó, y además era falso: el timeout de las guardas.**
El registro decía que ninguna guarda fija timeout y que corren con el default de 5 s de Vitest. `vitest.config.mts:34` fija `testTimeout: 30000` para el proyecto `guards`, y lo hace **desde `e820ca4`, la 2.5**, o sea desde que el proyecto existe. Lo cierto y lo falso venían pegados: ningún *archivo* de guarda fija timeout —verdad— y de ahí se concluyó el default, sin abrir la configuración del proyecto. Medido el 2026-09-21: 79/79 en 3,3 s, con el caso de `module-boundary` —el único que carga ESLint de verdad— en 1,5-1,6 s, **veinte veces por debajo del límite real**. Así que la corrida de 44 s que originó el pendiente **no pudo fallar por rozar un techo de 5 s**. La intermitencia sigue sin explicación y sigue registrada en `HANDOFF.md`; lo que se cae es la explicación. **Esta subfase no toca `vitest.config.mts`.**

**H-5. Dato que restringe la solución de H-2.** Tres `schema.ts` importan `@/modules/auth/schema` para su clave foránea a `users`: `audit`, `inventory` y `organizations`. La prohibición de leer `users` por el esquema **no puede ser general**: tiene que ser específica de `analytics`, o rompe tres módulos.

**H-6. Dato sobre el orden de los bloques.** El bloque de `src/modules/*/schema.ts` está **antes** del de `analytics` en el arreglo de configuración, así que para un hipotético `src/modules/analytics/schema.ts` gana el de `analytics`, que es el último que aplica. Hoy `analytics` no tiene `schema.ts` —no tiene tablas propias— pero conviene un caso que lo fije.

## Decisiones

**D-1. `analytics` pasa a tener prohibido `next`, `next/*` y `@/app/*`, igual que los demás módulos de dominio.**
Se le agrega `httpAndPresentation` a su bloque. No es una excepción nueva: es dejar de tener una sin haberla decidido. La razón es la misma que para los otros cuatro módulos y ya está escrita en `Overview.md`: el dominio no conoce HTTP ni presentación.

**D-2. El permiso de schema de `analytics` excluye `@/modules/auth/schema`.**
Se conserva la decisión aprobada —`analytics` puede leer `@/modules/*/schema` entre dominios, que es lo que le permite calcular métricas sin JOINs cruzados por servicio— y se le recorta **solo** el esquema de `auth`.

Por qué recortar ese y no pasar a una lista blanca de los dos que usa hoy: la lista blanca sería más estrecha, pero cambiaría una decisión de diseño ya aprobada y convertiría cada métrica nueva en una edición de la configuración de ESLint. El agujero declarado es concreto y nominal —`users`—, así que la corrección es nominal. Si más adelante se decide la lista blanca, es otra decisión, con su propio motivo.

**D-3. La tabla de `RepositoryStructure.md` se corrige en las dos filas que corresponden, no solo en una.**
La fila de `next`/`@/app/*` (línea 131) pasa a incluir `analytics`, y la fila de `analytics` (línea 130) dice que el permiso de schema excluye `auth`. La tabla y la configuración se escribieron espejadas y **se equivocaron igual**: el documento reflejaba fielmente un config incompleto, y por eso leerlo no delataba nada. Es la misma clase de defecto que la 9.0.2 resolvió definiendo la expresión una sola vez, pero acá no se puede generar una de la otra: la defensa es que la guarda aplica la configuración **real**, así que quien cambie el config sin la tabla al menos no puede cambiar la conducta sin tocar los casos.

**D-4. Cada fila nueva o corregida de la tabla tiene su caso en la guarda, en los dos sentidos.**
`module-boundary` ya aplica `eslint.config.mjs` de verdad sobre archivos virtuales. Los casos nuevos se agregan en pares —uno que debe estar prohibido y uno que debe seguir permitido—, porque un caso que solo comprueba la prohibición no detecta que la corrección se haya llevado puesto un permiso legítimo.

**D-5. Cada caso nuevo se comprueba por mutación antes de darse por bueno.**
Se quita la corrección del config y se confirma que el caso **falla**; se repone y se confirma que pasa. Se escribe qué mutación se usó. Esto no es ceremonia: en las últimas dos subfases aparecieron tres aserciones incapaces de fallar, y la diferencia entre encontrarlas y no encontrarlas fue siempre **ejecutar** la mutación en vez de suponer su resultado.

## Alcance incluido

- `eslint.config.mjs`: **solo** el bloque de `src/modules/analytics/**` (líneas 84-87) y, si D-2 lo necesita, una constante nueva junto a las existentes.
- `tests/guards/module-boundary.test.ts`: casos nuevos.
- `docs/architecture/RepositoryStructure.md`: las filas 130 y 131 de la tabla de frontera, y el recuento de casos de la guarda en la línea 135, que hoy dice 9.

## Alcance excluido

- **`ci.yml`**: nada que hacer (H-3). No se toca.
- **`vitest.config.mts`**: el timeout no se mueve (H-4). Cambiar un número sin saber qué pasó no es una corrección.
- **Las dos intermitencias sin causa** —la corrida de 44 s de las guardas y el caso end-to-end de `conversations` que se multiplicó por catorce— siguen registradas en `HANDOFF.md` sin subfase. Esta subfase **no las investiga**.
- **Los demás bloques de `eslint.config.mjs`**, incluida la fila general y la excepción de `schema.ts`. No se toca la excepción de prueba de `tests/integration/organization-isolation.test.ts`.
- **La lista blanca de schemas para `analytics`** (D-2). Queda como alternativa descartada con su motivo, no como pendiente.
- **Cualquier cambio en `src/`**: si la corrección obligara a editar un archivo de `analytics`, eso es un hallazgo, no trabajo de esta subfase (ver condiciones de detención).
- **RLS por organización** y todo lo de la 9.1 en adelante.

## Criterios de aceptación

- **AC-1**: un archivo de `src/modules/analytics/**` que importe `next`, `next/server` o `@/app/*` es rechazado por `no-restricted-imports`, con un caso por cada uno de los tres.
- **AC-2**: un archivo de `src/modules/analytics/**` que importe `@/modules/auth/schema` es rechazado.
- **AC-3**: sigue permitido para `analytics` importar `@/modules/conversations/schema`, `@/modules/ingestion/schema` y cualquier otro `@/modules/*/schema` que no sea `auth` — con el caso de `crm/schema` que ya existe intacto, y sin que su expectativa cambie.
- **AC-4**: sigue prohibido para `analytics` importar `repository.ts` o `service.ts` de otro módulo, y sigue permitido `@/modules/<modulo>` y `@/shared/...`.
- **AC-5**: los tres `schema.ts` que importan `@/modules/auth/schema` —`audit`, `inventory`, `organizations`— siguen sin violación, con un caso que lo fija.
- **AC-6**: `npm run lint` pasa sobre el repositorio sin cambiar ningún archivo de `src/`.
- **AC-7**: cada caso nuevo falla al quitar la corrección del config, con la mutación escrita en el resultado del brief.
- **AC-8**: la tabla de `RepositoryStructure.md` coincide con la configuración fila por fila, y su recuento de casos coincide con los casos de la guarda.
- **AC-9**: suite completa en verde con typecheck, lint y formato limpios, y el recuento de tests declarado.

## Condiciones de detención

1. **Si la corrección obligara a editar un archivo de `src/`**: significa que `analytics` sí estaba usando el permiso que se le quita, y eso convierte la subfase en un cambio de código con otro riesgo. Se detiene, se informa qué archivo y se eleva la decisión de alcance.
2. **Si `no-restricted-imports` no permitiera expresar D-2** con la forma de negación que ya usa `moduleInternalsExceptSchema`: se detiene y se informa, sin inventar una segunda regla ni agregar un plugin.
3. **Si al comprobar por mutación un caso no fallara**: es un caso vacuo. Se reescribe antes de seguir y se registra, como en la 9.0.2.
4. **Si apareciera una tercera vía por la que `analytics` pueda llegar a `users`** que ni la guarda de la 9.0.1 ni esta cubran: se registra como hallazgo con su alcance propio. No se amplía esta subfase por analogía.
5. **Si cerrar esto exigiera tocar `ci.yml` o `vitest.config.mts`**: no está autorizado y no está en el alcance. Se detiene y se informa.

## Qué no certifica esta subfase

- **Que `analytics` no pueda leer `users` por ninguna vía.** Cierra la vía del esquema, que es la que la guarda de la 9.0.1 declaró abierta. Una guarda de importaciones comprueba lo que está escrito en un `import`, no todo lo que un módulo puede alcanzar.
- **Nada en runtime.** La frontera es estática: la hace cumplir ESLint en local y en CI.
- **Nada sobre las dos intermitencias sin causa**, que quedan como estaban.

## Resultado (2026-09-21)

Implementada según el brief, con D-1 a D-5 en la forma aprobada. **Ningún archivo de `src/` cambió**, que era la predicción: `analytics` no estaba usando ninguno de los permisos que se le quitaron.

| Criterio | Estado | Evidencia |
| --- | --- | --- |
| AC-1 | cumplido | tres casos nuevos: `next`, `next/server` y `@/app/(autenticado)/_dashboard/period`, los tres rechazados |
| AC-2 | cumplido | `analytics/usuarios.ts` importando `@/modules/auth/schema` es rechazado |
| AC-3 | cumplido | `conversations/schema` e `ingestion/schema` siguen permitidos, y el caso preexistente de `crm/schema` quedó intacto, con su expectativa sin cambiar |
| AC-4 | cumplido | el caso preexistente de `crm/repository` sigue prohibido; `analytics/publico.ts` importando `@/modules/organizations` sigue permitido |
| AC-5 | cumplido | tres casos nuevos fijan que `audit`, `inventory` y `organizations` sigan declarando su clave foránea a `users` |
| AC-6 | cumplido | `npm run lint` limpio sobre el repositorio, `git status src/` vacío |
| AC-7 | cumplido | cinco mutaciones, abajo |
| AC-8 | cumplido | las dos filas corregidas y el recuento actualizado de 9 a 20 |
| AC-9 | cumplido | 797 tests (302 unitarios, **90** de guardas, 405 de integración) y 81 end-to-end; typecheck, lint y formato limpios |

### Las cinco mutaciones, ejecutadas y no supuestas

Cada caso nuevo tiene al menos una mutación que lo hace fallar. Se corrieron una por una sobre `eslint.config.mjs`, reponiendo el archivo entre cada una desde una copia:

| Mutación | Casos que fallan |
| --- | --- |
| M1: quitar `httpAndPresentation` del bloque de `analytics` | los 3 de `next`, `next/server` y `@/app/*` |
| M2: quitar `authSchema` del bloque de `analytics` | `analytics/usuarios.ts` y `analytics/schema.ts` |
| M3: ampliar `authSchema` a `@/modules/*/schema` | `conversations`, `ingestion` y el preexistente de `crm/schema` |
| M4: aplicar `authSchema` también al bloque de `src/modules/*/schema.ts` | los 3 de `audit`, `inventory` y `organizations` |
| M5: agregar `anyModule` al bloque de `analytics` | `analytics/publico.ts`, más los tres de schema |

M3, M4 y M5 son las que dan sentido a los casos que esperan «permitido»: sin ellas, un caso con `forbidden: false` pasa aunque la regla nueva se haya llevado puesto un permiso legítimo, que es la forma en que este tipo de corrección hace daño.

### Lo que se encontró de paso y **no** es de esta subfase

Al correr la suite end-to-end de cierre falló un caso, `clients.spec.ts` caso 9, con **la misma firma** que el caso de `conversations` que había fallado en el intento 1 de la CI de la 9.0.2 unas horas antes: «Target page, context or browser has been closed». Pasó en las dos corridas siguientes, 81/81.

Dos ocurrencias en un día, en casos distintos, **con algo concreto en común**: de los archivos de `tests/e2e/`, solo tres usan el patrón de escuchar `page.on("response")` y acumular `response.text()` de cada respuesta —`clients`, `conversations` y `dashboard`— y las dos fallas cayeron en ese patrón.

Hay además una **hipótesis, declarada como hipótesis**, que el propio código ya nombra: el comentario de `clients.spec.ts` dice que «una respuesta que la navegación corta (un prefetch o una sección en streaming) deja su lectura sin resolver». Si eso pasa, el `await Promise.all(pending)` no termina nunca, el test agota su presupuesto, Playwright cierra el contexto y el error aparece en la acción que estuviera corriendo — que es exactamente lo que se vio las dos veces, en dos acciones distintas. Y el `.catch(() => undefined)` que acompaña a cada lectura **no cubre eso**: atiende un rechazo, no una promesa que nunca se resuelve. Eso último es lectura de código, no especulación.

Lo que falta para convertir la hipótesis en diagnóstico: reproducirla. No se hizo acá porque no es el alcance de esta subfase. Queda registrado en `HANDOFF.md` **sin subfase asignada**, con el patrón identificado y los tres archivos que lo usan.

### Lo que esta subfase no certifica

- **Que `analytics` no pueda llegar a `users` por ninguna vía.** Cierra la del esquema, que es la que la guarda de la 9.0.1 declaró abierta. Una guarda de importaciones ve lo que dice un `import`.
- **Nada en runtime**: la frontera es estática.
- **Nada sobre las intermitencias end-to-end**, que quedan como hallazgo sin subfase.
