# Brief 11.0 — Instrumentos y herramienta antes de construir encima

- **Contrato**: `task-brief.v1`
- **Tipo de tarea**: `hardening`
- **Nivel de evidencia objetivo**: `deterministic` para las guardas, el seed y la migración; `isolated-runtime` **local** para los dos scripts de medición (contra `next start` y la base de desarrollo, no contra staging). El paso nuevo de la CI se prueba haciéndolo disparar (D-6).
- **Nivel de validación alcanzable**: **validado localmente y en CI**. Ningún instrumento de esta subfase se vuelve a correr contra staging acá: el primero en usarlos allá es el piloto (11.4).
- **Orden**: primera subfase de la Fase 11. Va **antes** que la 11.1, la 11.2, la 11.3 y la 11.4 ([Roadmap](../planning/Roadmap.md) §Fase 11: 11.0 → (11.1 ∥ 11.2) → 11.3 → 11.4).
- **No abre ni cierra gate.** El gate de entrada de la Fase 11 (Fase 10 cerrada) ya se cumplió el 2026-09-23, y el de salida lo cierra la 11.4. La revisión independiente **no es obligatoria**, pero se recomienda (D-7).
- **Estado de este documento**: **aprobado el 2026-09-23**, con las siete decisiones resueltas por la recomendación (ver §Resolución). En implementación.

## Cómo se organiza la Fase 11 en briefs

La Fase 10 se hizo con un solo brief porque no tocaba código. La Fase 11 sí toca código, así que sigue el patrón de las Fases 4 a 9: **un brief por subfase**, cada uno aprobado antes de implementar esa subfase. La partición, las dependencias y el gate ya están en el [Roadmap](../planning/Roadmap.md) §Fase 11, y no se repiten acá.

Para que ninguna obligación de la fase se pierda entre un brief y otro, este es el mapa completo, tomado de [brief-10](brief-10-evaluacion-del-mvp.md) §Resultados de la 10.3 y comparado fila por fila con el Roadmap:

| Subfase | Obligaciones heredadas | Preguntas y hallazgos |
|---|---|---|
| **11.0** (este brief) | O-8, O-21, O-40; registrar `cancel-in-progress` en `main` (R-2); la convención de etiquetar los FR (evaluación 10.1, §2) | — |
| 11.1 | O-17 (con su condición: que se autorice `globals.css`); precio en tabla de solo inserción, con moneda y el precio vigente derivado (brief-10, D-5) | — |
| 11.2 | — | — |
| 11.3 | R-1, piezas 1 y 2; comprobar O-22 y O-33 | pregunta 5 (límite de 120 por minuto); C-6 (nombrar al emisor sin tocar la guarda) |
| 11.4 | O-10, O-36 | — |

Recuento: 5 obligaciones «O-» de I-Lectura (O-8, O-10, O-21, O-36, O-40), las 5 con subfase; más O-17, R-1 (piezas 1 y 2), O-22, O-33, R-2 (registro), la convención de los FR, la pregunta 5 y C-6. **Nada de este mapa se decide en este brief salvo la fila de la 11.0.**

## Objetivo

Que los instrumentos que la Fase 11 va a reutilizar **fallen cuando deben fallar**, antes de que alguna subfase se apoye en su verde. Hoy hay cuatro que pasan en verde sin medir lo que dicen (O-40), una herramienta de migración que falla en silencio justo en la fase que va a desplegar migraciones nuevas a staging (O-8), y una CI que tira los artefactos que hacen falta para diagnosticar un end-to-end que falló (O-21).

El resultado verificable: **cada instrumento corregido tiene al menos una corrida en la que detecta el defecto que antes dejaba pasar**, con la salida capturada en este brief.

## Lo que se verificó antes de escribir este brief

Medido el 2026-09-23, solo leyendo:

- **CI del cierre de la Fase 10**: `a6ff509`, run 35922519340, `completed / success`, leída por `headSha` y `conclusion`. Staging responde `HTTP/1.1 200 OK` en `/login`.
- **Notion**: la búsqueda no devuelve ningún proyecto de la Fase 11 del CRM. Coincide con el HANDOFF: el proyecto y sus tareas se crean con autorización.
- **O-40, R-7 — contenido que coincide con el menú**: `scripts/recorrer-pantallas.ts` busca el texto esperado en **toda la página**. En las pantallas 2, 3, 6, 8 y 10, las expresiones esperadas (`/Dashboard/`, `/Productos/`, `/Clientes/`, `/Conversaciones/`, `/Usuarios/`) son rótulos de navegación de `src/app/(autenticado)/layout.tsx:21-26`, que aparecen en todas las pantallas. En la 7, `/Cliente|Teléfono/` coincide con el rótulo «Clientes». Son 6 de 9, lo mismo que encontró la revisión.
- **O-40, R-8 — control negativo**: el control solo exige `problemas.length >= 3` **en total** (`:152`). No exige una detección **por clase**, así que dos disparos de consola pasan por tres clases. Además, la clase «red» solo escucha `requestfailed` (`:100-105`). *Inferido, a verificar contra el paquete instalado*: en Playwright, `requestfailed` se dispara cuando la red falla, no cuando el servidor responde un 404 o un 500. Si se confirma, **el recorrido no puede detectar ninguna respuesta HTTP de error**, y eso explica por qué el 404 del control apareció como error de consola.
- **O-40, R-21**: el comentario de cabecera dice «Este recorrido **no escribe nada**», pero el recorrido ingresa por `/login`, y eso crea una sesión en la base.
- **O-40, R-1 y R-9 — dashboard en `medir-caminos.ts`**: la carga en paralelo (`:278-280`) llama a las diez funciones de `metricas` y **no** a `getIngestionErrors` (la métrica 12), aunque `analytics` la exporta. Además descarta lo que devuelve `Promise.all`, así que un `Failure` que responde en microsegundos pasa por una carga rápida.
- **O-40, R-12 — guarda de PostgreSQL de staging**: `parsear` (`tests/guards/staging-postgres-config.test.ts:36-52`) saltea toda línea sin `=` y compara las claves distinguiendo mayúsculas. PostgreSQL acepta `nombre valor` sin `=` y no distingue mayúsculas en los nombres de los parámetros *(a confirmar en la documentación de PostgreSQL 18 al implementar)*.
- **O-40, R-13 — mutaciones de la guarda de identidad del seed**: la evaluación 10.1 §6 lo dejó **no reproducido**. Este brief no lo da por cierto ni por falso (AC-6).
- **O-40, R-14 — idempotencia de `users` en el seed**: `seeds/volume.ts:307-310` hace `onConflictDoUpdate` con `set: values`, y `values` incluye `passwordHash`. Como argon2 usa sal aleatoria, cada corrida reescribe la fila con un hash nuevo.
- **O-40 — comentario de `deploy/staging/crm-backup.sh:76`**: dice «se vuelve a medir en la 9.3». La 9.3 no lo midió (R-10), y la medición de esa ventana está asignada a la 13.2 (O-39).
- **O-8 — `drizzle-kit migrate`**: `package.json:22` lo usa como `db:migrate`, y `deploy/staging/README.md:57,75` lo usa para migrar staging. Los tests **no lo usan**: `tests/integration/global-setup.ts` y `tests/e2e/global-setup.ts` migran con `migrate` de `drizzle-orm/node-postgres/migrator`. O sea que el camino que la CI prueba no es el mismo que se usa para desplegar.
- **O-21 — artefactos de Playwright**: `playwright.config.ts:32` tiene `trace: "retain-on-failure"`, pero `.github/workflows/ci.yml` no tiene ningún paso que suba `test-results/`. La traza se genera y se pierde con el runner.
- **R-2 — `cancel-in-progress`**: `ci.yml:9-11`, `concurrency` por rama con `cancel-in-progress: true`. `Risks.md:15` ya lo menciona dentro de la fila de protección de rama, pero no tiene fila propia.

## Alcance incluido

1. **`scripts/recorrer-pantallas.ts`** (R-7, R-8, R-21):
   - buscar el contenido esperado **dentro de `main`**, no en la página entera, y con una expresión propia de cada pantalla que no coincida con ningún rótulo de navegación;
   - agregar la detección de respuestas HTTP con estado ≥ 400 como una clase propia, además de `requestfailed`, si se confirma la inferencia de arriba;
   - reescribir el control negativo para que provoque **cada clase por separado** (consola, excepción, falla de red, respuesta HTTP de error y contenido ausente) y exija **al menos una detección en cada clase**, no una suma;
   - corregir la cabecera: el recorrido crea una sesión por ingreso. Si D-5 lo aprueba, además cierra la sesión al terminar.
2. **`scripts/medir-caminos.ts`** (R-1, R-9): sumar la métrica 12 a la carga del dashboard y a las mediciones sueltas, y hacer que un `Failure` en cualquier resultado, **también dentro de la carga en paralelo**, se informe como falla y no como tiempo.
3. **`tests/guards/staging-postgres-config.test.ts`** (R-12): que el parser acepte las formas sintácticas que acepta PostgreSQL, como mínimo `nombre = valor`, `nombre valor` y los nombres sin distinguir mayúsculas, con un caso por forma. Una línea que no entiende **hace fallar la guarda**; no se ignora.
4. **`tests/guards/volume-seed-identity.test.ts`** (R-13): intentar reproducir el hallazgo. Si se reproduce, corregir la guarda con una mutación real. Si no se reproduce, registrar el intento con su salida y dejarlo como «no reproducido», sin cambiar la guarda.
5. **`seeds/volume.ts`** (R-14): una segunda corrida del seed no reescribe `users` (D-3), con un caso de integración que lo pruebe.
6. **`deploy/staging/crm-backup.sh`** (O-40): corregir **solo el comentario** de la línea 76 para que diga lo que es cierto, que la ventana no se midió en la 9.3 y que su medición está asignada a la 13.2 (O-39). No cambia ninguna instrucción del script.
7. **Migraciones** (O-8):
   - reproducir el defecto primero, en la base **local** de desarrollo, con un rol sin `CREATEROLE`, y capturar la salida;
   - reemplazar `db:migrate` por un script propio que use el mismo migrador que los tests (D-2), imprima el error de PostgreSQL y salga con un código distinto de 0;
   - actualizar `deploy/staging/README.md` y `docs/development/Environments.md` para que digan el comando nuevo. **La causa de fondo —la migración `0003` crea un rol— no se toca**: es O-7, asignada a la 13.1.
8. **CI** (O-21): un paso que suba los artefactos de Playwright **solo cuando falla**, con la acción fijada por SHA como las demás y una retención corta (D-6).
9. **`cancel-in-progress`** (R-2): una fila propia en `docs/planning/Risks.md` que describa el efecto (un commit intermedio en `main` queda `cancelled` y sin resultado) **sin decidir qué hacer**, como pide el Roadmap. `ci.yml` no cambia su bloque `concurrency`.
10. **Convención de etiquetar los FR** (evaluación 10.1, §2): escribirla en `docs/development/EngineeringStandards.md`. Rige desde la 11.1 para todo requisito nuevo. Qué pasa con los FR del MVP que no tienen etiqueta lo decide D-4.

## Alcance excluido

- Volver a medir en staging o correr ahí cualquiera de los scripts: lo hace la 11.4. Las mediciones que la 9.3 no hizo (planes con salida cruda, la última página, la ventana del manifiesto) son de la 13.2 (O-39).
- La migración `0003` y `CREATEROLE` (O-7, O-27): son de la 13.1.
- Cambiar `cancel-in-progress` o decidir la protección de rama (R-2): se registra, no se decide.
- Las guardas que O-40 no nombra, y los findings R-11 y R-22, que quedaron no verificados en la 10.1 y no sostienen nada.
- Cualquier esquema, módulo, pantalla o endpoint de la 11.1 a la 11.3.
- El repositorio del agente, su n8n y Airtable, como en toda la fase.

## Archivos autorizados

Lista cerrada. Ampliarla requiere detenerse y pedir autorización.

- `scripts/recorrer-pantallas.ts`
- `scripts/medir-caminos.ts`
- `scripts/migrar.ts` (nuevo, si D-2 se aprueba así)
- `package.json`: **solo** la línea de `db:migrate`
- `tests/guards/staging-postgres-config.test.ts`
- `tests/guards/volume-seed-identity.test.ts`
- `seeds/volume.ts`: **solo** el upsert de `users`
- `tests/integration/volume-distribution.test.ts` o `tests/integration/conversations-seed.test.ts`, el que ya pruebe la segunda corrida del seed de volumen, para el caso de R-14
- `deploy/staging/crm-backup.sh`: **solo** el comentario de las líneas 72-76
- `deploy/staging/README.md`: el comando de migración, el aviso de la línea 57 y, si D-5 del backup lo pide, el estado del `diff`
- `.github/workflows/ci.yml`: **solo** el paso nuevo de artefactos
- `docs/development/Environments.md`, `docs/development/EngineeringStandards.md`, `docs/planning/Risks.md`
- Al cerrar: este brief, `docs/decisions/README.md`, `CHANGELOG.md`, `HANDOFF.md`

## Fuentes de verdad

[evaluación 10.1](evaluacion-10.1-mvp.md) §5 (O-8, O-21, O-40), §6 (R-7 a R-21 de la 9.3) y §R-2; [brief-10](brief-10-evaluacion-del-mvp.md) §Resultados de la 10.3; [Roadmap](../planning/Roadmap.md) §Fase 11; [brief-9.3](brief-9.3-datos-de-volumen-en-staging.md) y [evidencia-9.3](evidencia-9.3-volumen.md) para lo que los instrumentos debían medir; [ExecutionProtocol](../development/ExecutionProtocol.md).

## Decisiones pendientes

Cada una trae una recomendación. Las marcadas **(bloquea)** tienen que estar resueltas antes de empezar.

- **D-1 (bloquea) — Un brief por subfase.** La Fase 11 se hace con cinco briefs, uno por subfase y empezando por este, y no con un brief de fase como la 10. *Recomendación: sí.* Motivo: las subfases 11.1 a 11.3 diseñan esquemas y contratos, y cada uno necesita su propio brief aprobado antes de tocar código (`CLAUDE.md`).
- **D-2 (bloquea) — Con qué se migra.** (a) Un script propio con `migrate` de `drizzle-orm/node-postgres/migrator`, que es lo que ya usan los tests. `drizzle-kit` se sigue usando para `generate`. (b) Seguir con `drizzle-kit migrate` y envolverlo para que muestre el error. *Recomendación: (a).* Así el camino que prueba la CI es el mismo que se usa para desplegar, y no hace falta ninguna dependencia nueva. La causa del silencio se confirma leyendo `drizzle-kit` en `node_modules` antes de decidir, con el subagente `installed-source-verifier`, no se supone.
- **D-3 — El hash de `users` en el seed.** (a) Si el usuario ya existe, su `password_hash` no se toca. (b) El hash se deriva de forma determinista. *Recomendación: (a).* Es más simple y no debilita el hash. El costo: para cambiar la contraseña de los usuarios de volumen hay que borrarlos y volver a sembrar, y eso se documenta en la cabecera del seed.
- **D-4 — Los FR del MVP sin etiqueta.** (a) La convención rige solo para requisitos nuevos. (b) Además se etiquetan en esta subfase los 21 FR del MVP cuyo test no los nombra, usando los casos que la evaluación 10.1 §2 ya identificó. *Recomendación: (a).* La (b) toca decenas de archivos de test que esta subfase no necesita, y mezcla una limpieza con un endurecimiento. Si se quiere, se hace como subfase propia.
- **D-5 — Qué se despliega a staging desde esta subfase.** El único archivo desplegado que cambia es `crm-backup.sh`, y solo en un comentario. Pero `deploy/staging/README.md:25` dice que el `diff` de los nueve archivos da cero, y dejaría de ser cierto. (a) Copiar ese archivo a staging dentro de la 11.0, con autorización en el turno, y volver a correr el `diff`. (b) No desplegar, y anotar en el README que la diferencia se resuelve en el primer despliegue de la 11.1. *Recomendación: (a).* Es un efecto externo mínimo, y la 11.1 ya va a tener bastante con sus migraciones. Aparte: si el recorrido de pantallas cierra su sesión al terminar (R-21), deja de acumular sesiones en staging. *Recomendación: sí.*
- **D-6 — Cómo se prueba el paso de artefactos.** Un paso con `if: failure()` que nunca falló no demuestra nada. (a) Una rama temporal con un end-to-end que falla a propósito, `push`, ver el artefacto en la corrida y borrar la rama, todo con autorización en el turno. La rama dispara la CI por `pull_request` solo si se abre un PR, así que el workflow tendría que admitir también `push` a esa rama o hay que abrir un PR de borrador. (b) Dejarlo en *implementado* y probarlo la primera vez que falle de verdad. *Recomendación: (a), con PR de borrador*, así el workflow no cambia su disparador. La versión de `actions/upload-artifact` y su SHA se verifican en GitHub el día que se implementa, no se escriben de memoria.
- **D-7 — Revisión independiente.** No es obligatoria porque esta subfase no abre ni cierra un gate. *Recomendación: hacerla igual*, de solo lectura y contra este brief. El argumento es el propio objeto de la subfase: R-12 fue «la sexta guarda del proyecto que nace viendo una sola forma sintáctica», y en las seis la encontró una revisión independiente, no la autoevaluación.

## Invariantes

- Ninguna guarda se relaja para quedar en verde. En particular, `tests/guards/forbidden-references.test.ts` no se modifica.
- Cada instrumento corregido demuestra que puede fallar: una corrida con el defecto reintroducido, o con el control negativo, que falla, con la salida capturada (skill `proving-guards-can-fail`).
- `crm-backup.sh` sigue haciendo exactamente lo mismo: `git diff` sobre ese archivo muestra solo líneas de comentario, y `staging-backup-config.test.ts` sigue en verde sin modificarse.
- Los scripts de medición no escriben datos de negocio. La única escritura permitida es la sesión del ingreso, y queda declarada.
- Nada de esta subfase corre contra staging salvo lo que D-5 autorice.
- Sin dependencias npm nuevas.

## Criterios de aceptación

- **AC-1 (R-7)**: en `recorrer-pantallas.ts`, la comprobación de contenido de cada una de las nueve pantallas busca **dentro de `main`**, con una expresión que no coincide con ningún rótulo de `layout.tsx:21-26`. **Evidencia de mutación**: con la ruta de una pantalla apuntada a otra (por ejemplo, `/clientes` esperando el contenido de productos), el recorrido informa `NO APARECIÓ`. Corrido contra `next start` local con el seed.
- **AC-2 (R-8)**: el control negativo provoca cada clase por separado y exige al menos una detección **en cada una**. La salida muestra una línea por clase: consola, excepción, falla de red, respuesta HTTP de error y contenido. Con cualquiera de los oyentes desactivado, el control falla. La conducta de `requestfailed` frente a una respuesta 404 queda **verificada en el paquete instalado**, con archivo y versión citados, no supuesta.
- **AC-3 (R-21)**: la cabecera del recorrido dice que crea una sesión. Si D-5 lo aprueba, el recorrido la cierra al terminar.
- **AC-4 (R-1, R-9)**: `medir-caminos.ts` mide la métrica 12, suelta y dentro de la carga del dashboard. Un `Failure` en cualquier llamada, también dentro de `Promise.all`, se informa como falla y hace salir al script con código distinto de 0. **Evidencia**: una corrida local con un período inválido forzado muestra la falla en lugar de un tiempo.
- **AC-5 (R-12)**: la guarda de PostgreSQL de staging rechaza `effective_cache_size 4GB` (sin `=`) y `Effective_Cache_Size = 4GB` agregados al final del archivo, con un caso por forma. Una línea que el parser no reconoce la hace fallar. Las reglas de sintaxis se citan de la documentación de PostgreSQL 18.
- **AC-6 (R-13)**: el intento de reproducir la codificación aditiva queda registrado con su salida. Si se reproduce, la guarda la detecta, con evidencia de mutación. Si no, queda escrito «no reproducido» y la guarda no cambia.
- **AC-7 (R-14)**: una segunda corrida del seed de volumen no cambia ninguna fila de `users`. Un caso de integración lo prueba comparando `password_hash`, y se corre una vez con el upsert anterior para ver que falla.
- **AC-8 (O-40, backup)**: el comentario de `crm-backup.sh` ya no dice que la ventana se midió en la 9.3 y remite a la 13.2. El `git diff` del archivo muestra solo comentarios. Si D-5 es (a), el `diff` contra staging da cero en los nueve archivos, y se captura la salida.
- **AC-9 (O-8)**: la salida del defecto original queda capturada en este brief: `drizzle-kit migrate`, con un rol sin `CREATEROLE` en la base local, sale con código 1 y sin mensaje. Con el comando nuevo, el mismo caso imprime el error de PostgreSQL y sale con código distinto de 0. Contra una base vacía, migra hasta la `0014` y sale con 0. `Environments.md` y `deploy/staging/README.md` usan el comando nuevo.
- **AC-10 (O-21)**: cuando el paso end-to-end falla, la CI sube `test-results/` con la traza, con retención corta. Solo lo sube cuando falla, y la acción está fijada por SHA. **Evidencia**, según D-6: la corrida del PR de borrador con el artefacto descargable, y la rama borrada después.
- **AC-11 (R-2)**: `Risks.md` tiene una fila propia para `cancel-in-progress` en `main`, que describe el efecto sin tomar ninguna decisión, y el bloque `concurrency` de `ci.yml` no cambió.
- **AC-12 (convención de los FR)**: `EngineeringStandards.md` define la convención: todo requisito nuevo lleva su identificador en el nombre o el comentario del caso de test que lo prueba. Dice desde cuándo rige y qué se hace con los FR del MVP, según D-4.
- **AC-13**: suite completa en verde en local (guardas, unitarios, integración y end-to-end) y la CI del commit de cierre en verde, leída por `headSha` y `conclusion`. El recuento de guardas se informa midiéndolo con `ls tests/guards/*.test.ts | wc -l`, no copiándolo.
- **AC-14**: los archivos tocados coinciden con la lista autorizada, comprobado con `git diff --name-only`.

## Pruebas y evidencia requerida

- Nivel: `deterministic` para AC-5 a AC-7, AC-9, AC-11 y AC-12; `isolated-runtime` local para AC-1 a AC-4; corrida de CI real para AC-10.
- Comandos: `npm run lint`, `npm run typecheck`, `npm run format:check`, `npm run test:guards`, `npm run test:unit`, `npm run test:integration`, `npm run build`, `npm run test:e2e`, y los dos scripts contra `http://localhost:3000` con `next start`.
- Cada mutación se deshace antes del commit, y su salida se copia a §Resultados de este brief.
- Las salidas de las tandas se capturan a archivo y se filtran después, para no perder el nombre del caso que falla (HANDOFF §7).

## Condiciones de detención

- Antes de commit, push, merge, abrir un PR o crear una rama remota (incluida la de D-6).
- Antes de copiar cualquier archivo a staging o ejecutar cualquier cosa en el servidor (D-5).
- Antes de ejecutar migraciones contra una base que no sea la local de desarrollo, la de test o la de e2e.
- Antes de instalar dependencias npm.
- Si arreglar un instrumento exige tocar un archivo fuera de la lista, o modificar `forbidden-references.test.ts`.
- Si la reproducción de O-8 muestra una causa distinta del silencio de `drizzle-kit`, por ejemplo que el migrador de `drizzle-orm` también la oculte: se para y se replantea D-2.
- Si una corrección de O-40 cambia un número ya citado como evidencia de la 9.3: no se corrige ese número acá, se registra para la 13.2.
- Antes de crear o cambiar tareas en Notion si el usuario no lo autorizó en el turno.

## Resolución — 2026-09-23

El usuario aprobó el brief **con las recomendaciones** de las siete decisiones:

- **D-1**: un brief por subfase en toda la Fase 11.
- **D-2**: (a) un script propio con el migrador de `drizzle-orm`, previa lectura de `drizzle-kit` en `node_modules`.
- **D-3**: (a) si un usuario del seed ya existe, su `password_hash` no se toca.
- **D-4**: (a) la convención de los FR rige solo para requisitos nuevos.
- **D-5**: (a) copiar `crm-backup.sh` a staging dentro de la 11.0 y volver a correr el `diff`; el recorrido cierra su sesión al terminar. **La copia al servidor sigue necesitando autorización en el turno en que se haga**: aprobar la decisión no la autoriza.
- **D-6**: (a) con un PR de borrador que falla a propósito, y la rama borrada después. **El push y el PR siguen necesitando autorización en su turno.**
- **D-7**: se hace la revisión independiente, de solo lectura y contra este brief.

En el mismo turno, el usuario autorizó crear en Notion el proyecto de la Fase 11 (`3e4702be6f4e8101bc6eee2e388f6516`) con sus cinco tareas —11.0 `3e4702be6f4e81579347dd19cf5926e9`, 11.1 `3e4702be6f4e818a88bec2cb52103821`, 11.2 `3e4702be6f4e81f0bfe5d3d3c5274e27`, 11.3 `3e4702be6f4e8123b407cb8d477cb71d` y 11.4 `3e4702be6f4e81e48769d30dca0c70d7`—, registrar el brief y hacer su commit. No autorizó push.
