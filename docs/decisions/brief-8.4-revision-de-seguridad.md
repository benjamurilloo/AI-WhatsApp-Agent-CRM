---
schema: task-brief.v1
task_id: 8.4
task_type: audit
generated_at: 2026-09-18
---

# Brief: 8.4 — Revisión de seguridad

## Objetivo

Contrastar [SecurityModel](../architecture/SecurityModel.md) y su threat model **contra el código real**, afirmación por afirmación, y dejar cada una con un veredicto explícito y su evidencia. Lo que el documento promete y el código no hace es un hallazgo; lo que el código hace y el documento no dice, también.

Es una **autoevaluación**, no una revisión independiente: la hace el mismo agente que escribió casi todo lo que revisa. Ese límite se declara en el resultado y no se compensa con una redacción más segura.

## Ubicación en la Fase 8

- **Orden**: 8.1, 8.2 y 8.3 cerradas. Queda 8.5 (rendimiento de productos e inventario), independiente de esta.
- **Notion**: tarea "8.4 — Revisión de seguridad", descripción "M. Contrastar SecurityModel.md y el threat model con el código real. Revisión declarada como autoevaluación". Estado "Bandeja de Entrada", prioridad **Alta** (verificado el 2026-09-18).
- **Es el gate de salida de la fase**: el Roadmap pide "revisión de seguridad sin bloqueantes" y "sin hallazgos críticos abiertos; los no críticos quedan en `Risks.md` con su plan". Esta subfase produce ese veredicto.
- **Necesario ahora**: el veredicto por afirmación y la lista de hallazgos con severidad.
- **Requisito antes de producción, fuera de esta subfase**: todo lo que necesite TLS, proxy real o entorno persistente (HSTS, cookie `__Host-`, `TRUSTED_PROXY` con un proxy de verdad, backups, conexión con el rol `crm_app`). Se verifica en la Fase 9; acá solo se declara.
- **Mejora posterior**: revisión por un tercero, pentest, SAST/DAST.
- **Gate de entrada**: 8.3 cerrada, CI en verde en `cae7061` ([ejecución 35386198342](https://github.com/benjamurilloo/AI-WhatsApp-Agent-CRM/actions/runs/35386198342)). Verificado el 2026-09-18: `main` limpio.

## Hallazgos de la verificación previa (2026-09-18)

Ninguno de estos es todavía el resultado de la revisión: son lo que apareció al preparar el brief, y varios cambian el alcance.

1. **`SecurityModel.md` sigue diciendo "Estado: diseñado" en su línea 3**, cuando la mitad de sus secciones ya cita implementaciones validadas en integración (8.1, 8.2, 8.3, 6.5.3). `NonFunctionalRequirements.md` dice lo mismo. Es exactamente el tipo de línea de estado que envejece sin que nadie la lea como afirmación, y esta es la subfase que la tiene que corregir.
2. **El documento tiene del orden de 90 afirmaciones verificables** repartidas en 13 secciones, más las 6 filas del threat model. No es un documento que se "revise leyéndolo": sin una lista enumerada con veredicto por ítem, la revisión se convierte en una lectura que confirma lo que ya se cree. El formato del resultado es, en esta tarea, la mitad del trabajo.
3. **Hay dos obligaciones de la Fase 8 escritas en `SecurityModel` que ninguna subfase ejecutó todavía**:
   - línea 74: "**Rate limiting en ingestión** … La Fase 8 lo verifica", que el Roadmap confirma ("el rate limiting se implementa en la 3.3 y la 6.5.3 y aquí se verifica");
   - línea 26: la IP real del rate limit de login depende del proxy del despliegue y "**se verifica en la Fase 8 o 9**".

   La primera cae claramente acá. La segunda no se puede cerrar sin un proxy real (D-5).
4. **`TraceabilityMatrix.md` línea 46 asigna a la Fase 8 la "revisión de minimización" de FR-CLI-05** (qué datos personales se almacenan y se muestran). La 8.2 cubrió exportación y borrado, que es otra cosa: minimización es *qué se guarda*, no *qué se puede sacar*. Ninguna subfase la tomó.
5. **Dos obligaciones más de la Fase 8, en `Overview.md`, no son de seguridad y ninguna subfase las cubre**:
   - línea 110: "no hay APM ni tracing distribuido en el MVP … **se reevalúa en la Fase 8 con evidencia**". La fase se llama "Calidad, seguridad y **observabilidad**" y ninguna de las cinco subfases toca observabilidad;
   - líneas 42 y 49: los límites aceptados de composición en memoria de **la lista de miembros** (>500) y de **clientes por última interacción**, que también dicen "se revisa en la Fase 8". La 8.5 cubre solo productos e inventario.

   Es la misma forma del hallazgo que en el cierre de la 8.1 originó la 8.5, y se eleva igual: como decisión del usuario (D-6), no resuelta acá.
6. **`/api/health` no figura en `SecurityModel`.** Es un endpoint sin autenticación que responde `{status}` con 200 o 503 y `Cache-Control: no-store`. No expone datos ni versiones, pero revela si la base responde, y el modelo de seguridad no lo menciona en ninguna parte. Un inventario de superficie expuesta que no lo liste está incompleto.
7. **Contar no responde la pregunta.** Un recuento por módulo de funciones exportadas contra llamadas a `authorize(` da, por ejemplo, 14 contra 1 en `analytics` y 10 contra 1 en `inventory`. Eso **no** significa que falte autorización: hay funciones internas, helpers y funciones que reciben un contexto ya autorizado. Pero muestra que la afirmación "autorización server-side en cada caso de uso" no se puede verificar con un `grep`: exige enumerar los puntos de entrada reales —Server Actions, páginas y Route Handlers— y mirar cada uno. Es el trabajo caro de esta subfase y hay que presupuestarlo.
8. **Hay afirmaciones barridas que hoy no tienen ningún instrumento**: "todo repositorio recibe `organization_id` de la sesión" (SecurityModel 34, NFR §Seguridad) y "todo input de usuario se valida con un esquema explícito" (SecurityModel 73). Ambas son del tipo que una revisión confirma por lectura y un cambio futuro rompe en silencio. Si merecen una guarda permanente es la D-4.
9. **Lo que ya está verificado no se vuelve a verificar**, pero sí se comprueba que la cita sea cierta: la 8.1 (CSP, cabeceras, CSRF de Server Actions, ausencia de `dangerouslySetInnerHTML`), la 8.2 (logs en tres capas, minimización de datos de un cliente) y la 8.3 (dependencias) ya dejaron evidencia. La revisión las marca como verificadas **citando su evidencia**, no repitiéndola. Confirmado hoy: `dangerouslySetInnerHTML` sigue en cero en `src/`.
10. **El threat model tiene 6 filas y ninguna dice cómo se comprobó su mitigación.** Cinco tienen implementación citable; la fila de denegación de servicio ("abuso del login o de ingestión → rate limiting en ambos puntos") es justamente la del hallazgo 3.

## Alcance incluido

1. **Enumerar y versionar las afirmaciones** de `SecurityModel.md` con un identificador estable por sección, y darle a cada una un veredicto de un vocabulario cerrado (D-2) con su evidencia.
2. **Verificar contra el código real** lo que no tiene evidencia previa, priorizando por riesgo: autorización en cada punto de entrada, aislamiento por organización, validación de entradas y el rate limiting de los dos puntos.
3. **Revisar el threat model fila por fila**: qué mitiga hoy el código, con qué evidencia, y qué queda sin mitigar.
4. **Verificar el rate limiting de ingestión** (hallazgo 3), que es una obligación explícita de la Fase 8.
5. **Revisión de minimización de FR-CLI-05** (hallazgo 4): qué campos personales se almacenan y cuáles se muestran a cada rol.
6. **Inventario de la superficie expuesta**: rutas, Server Actions y Route Handlers, con su exigencia de autenticación y rol. Incluye `/api/health` (hallazgo 6).
7. **Lista de hallazgos con severidad**, y el veredicto del gate de salida de la fase.
8. Actualizar `SecurityModel.md` (incluida su línea de estado), `Risks.md` con los hallazgos no críticos y su plan, y `TraceabilityMatrix.md` en lo que esta revisión cierre.

## Alcance excluido

- **Corregir defectos de seguridad que la revisión encuentre**, salvo lo que D-3 autorice. Una revisión que arregla mientras mira deja de ser una revisión y se queda sin tiempo para la mitad del documento.
- **Cambiar decisiones de diseño aprobadas** (ADR 0010, 0012, 0013 y los briefs cerrados). Si la revisión encuentra una razón para revisarlas, es un hallazgo con su propia subfase.
- **Repetir la evidencia de 8.1, 8.2 y 8.3** (hallazgo 9).
- **Todo lo que exija TLS, proxy real o entorno persistente**: HSTS, cookie `__Host-` bajo TLS, backups y su restauración, gestor de secretos, conexión con el rol `crm_app`. Se declaran como no verificables acá.
- **Pentest, SAST, DAST, fuzzing y revisión por terceros.**
- **El rendimiento** (8.5) y la observabilidad/APM (hallazgo 5, pendiente de D-6).
- **Tocar `package.json`, `package-lock.json` o dependencias.**

## Archivos o componentes autorizados

Lista cerrada.

- `docs/architecture/SecurityModel.md`
- `docs/architecture/TraceabilityMatrix.md`
- `docs/planning/Risks.md`
- `docs/product/NonFunctionalRequirements.md` — solo su línea de estado y lo que la revisión contradiga.
- `docs/decisions/brief-8.4-revision-de-seguridad.md` — este archivo, donde vive la tabla de veredictos.
- **Si D-4 aprueba instrumento permanente**: `tests/guards/` y `tests/integration/`, archivos nuevos.
- **Si D-3 autoriza correcciones**: los archivos de `src/` que cada corrección aprobada exija, nombrados de a uno antes de tocarlos.

Con autorización explícita en el turno, al cerrar: `docs/decisions/README.md` y `CHANGELOG.md`.

**`src/` queda fuera por defecto.** Entra solo por D-3, corrección por corrección.

## Fuentes de verdad

1. El código y las migraciones de este repositorio.
2. [architecture/SecurityModel.md](../architecture/SecurityModel.md) como objeto de la revisión — no como evidencia de sí mismo.
3. [product/NonFunctionalRequirements.md](../product/NonFunctionalRequirements.md) §Seguridad y §Privacidad, [architecture/Overview.md](../architecture/Overview.md) §Reglas de dependencia y [architecture/TraceabilityMatrix.md](../architecture/TraceabilityMatrix.md).
4. [planning/Roadmap.md](../planning/Roadmap.md) (gate de salida de la Fase 8) y [planning/Risks.md](../planning/Risks.md).
5. Los ADR y briefs citados por cada afirmación, para comprobar que la cita dice lo que el documento afirma.

## Dependencias

- 8.1, 8.2 y 8.3 cerradas (gate verificado). Independiente de 8.5.
- Necesita PostgreSQL local para cualquier verificación que se ejecute.

## Decisiones pendientes

### D-1 — Qué entra en la revisión además de `SecurityModel`

La tarea dice "SecurityModel y el threat model". Los hallazgos 3, 4 y 5 muestran que hay obligaciones de la Fase 8 escritas en otros documentos.

- **(a) Literal**: solo `SecurityModel.md` y su threat model.
- **(b) Literal + las obligaciones de seguridad de otros documentos**: suma el rate limiting de ingestión (hallazgo 3) y la minimización de FR-CLI-05 (hallazgo 4), que son de seguridad y privacidad y están asignadas a esta fase por escrito.
- **(c) Todo lo que diga "Fase 8"**, incluida la observabilidad y los límites de composición en memoria.

**Recomendación: (b).** La (a) deja sin cerrar dos obligaciones que el propio modelo de seguridad se asignó, y que nadie más va a tomar. La (c) mete en una revisión de seguridad dos temas que no lo son y que necesitan medición, no lectura: terminarían hechos a medias. Lo de la (c) se resuelve en D-6.

Pendiente de resolución del usuario.

### D-2 — Vocabulario de veredictos y qué cuenta como hallazgo crítico

**El criterio de severidad se fija antes de mirar, no después.** Si se define al final, se ajusta —sin mala intención— al resultado que se encontró, y el gate de salida de la fase deja de significar algo.

Propuesta de veredicto por afirmación, vocabulario cerrado:

| Veredicto | Qué significa |
| --- | --- |
| `verificado` | El código lo hace y hay evidencia citable (test, guarda o medición con fecha). |
| `verificado-por-lectura` | Se comprobó leyendo el código, sin instrumento que lo fije. Vale como veredicto, pero se distingue del anterior. |
| `parcial` | Vale para algunos casos y no para todos, con el alcance escrito. |
| `no-verificable-aquí` | Necesita TLS, proxy o entorno persistente. Se declara y se difiere con destino. |
| `contradicho` | El código hace algo distinto de lo que el documento dice. Siempre es hallazgo. |
| `sin-implementar` | El documento describe algo que todavía no existe. |

Y la severidad:

- **Crítico (bloquea el gate de la fase)**: permite acceso o modificación de datos de otra organización; permite a un `viewer` una operación de `admin`; expone credenciales, tokens o contraseñas; o permite operar sin sesión válida algo que exige sesión.
- **Mayor**: debilita una defensa declarada sin abrir por sí solo un acceso indebido.
- **Menor**: documentación que no coincide con el código, sin consecuencia de seguridad.

**Recomendación: adoptarlo tal cual**, con una regla añadida: **un hallazgo crítico detiene la revisión y se reporta de inmediato** (condición de detención 2), en vez de anotarse y seguir.

Pendiente de confirmación.

### D-3 — Qué se corrige dentro de la 8.4

- **(a) Nada**: todo hallazgo se registra y su corrección es otra tarea.
- **(b) Solo documentación**: se corrige lo que el documento dice mal (incluida la línea de estado del hallazgo 1), y ningún archivo de `src/`.
- **(c) Documentación + defectos críticos**, con autorización explícita del usuario para cada uno.
- **(d) Todo lo que aparezca.**

**Recomendación: (c).** La (b) es lo correcto para el 95% de los casos y es el modo por defecto, pero dejar abierto un hallazgo **crítico** para "la próxima tarea" no tiene defensa: si aparece uno, se para, se reporta y el usuario decide si se arregla ahí mismo o se abre una subfase. La (d) convierte la revisión en implementación y garantiza que la segunda mitad del documento se revise con prisa.

Pendiente de confirmación.

### D-4 — Si la revisión deja instrumento permanente

El hallazgo 8 señala dos afirmaciones barridas sin instrumento. Una revisión es una foto: vale para el commit en que se hizo.

- **(a) No**: la 8.4 produce veredictos y hallazgos, sin tests nuevos.
- **(b) Un instrumento, el de la superficie expuesta**: una guarda que enumere Server Actions y Route Handlers y falle si aparece uno nuevo sin autorización declarada.
- **(c) Varios**: además, el filtro por `organization_id` y la validación de entradas.

**Recomendación: (b).** Es la afirmación con peor relación entre consecuencia y facilidad de romperse: una Server Action nueva sin `authorize` es un hallazgo crítico según D-2, y hoy nada lo detecta salvo que alguien lo mire. Las otras dos de la (c) son mucho más difíciles de expresar como guarda sin producir falsos positivos —el hallazgo 7 muestra por qué un recuento no sirve—, y una guarda que se desactiva por ruidosa es peor que ninguna. Se registran como hallazgo con su plan.

Pendiente de confirmación.

### D-5 — `TRUSTED_PROXY` y la IP real del rate limit de login

`SecurityModel` dice "se verifica en la Fase 8 o 9". Sin proxy real no hay nada que medir: la función pura que extrae la IP ya tiene tests unitarios, y lo que falta es el comportamiento del proxy del despliegue.

**Recomendación**: verificar acá **la parte que sí es verificable** —que sin `TRUSTED_PROXY=true` todas las peticiones comparten clave de IP, y que con él se toma la última entrada de `x-forwarded-for`, que es lo que ya está probado— y **mover explícitamente a la Fase 9 la verificación con un proxy real**, quitando el "o 9" que deja la obligación flotando entre dos fases. Una obligación que puede cumplirse en cualquiera de dos fases no se cumple en ninguna.

Pendiente de confirmación.

### D-6 — Las obligaciones de la Fase 8 que ninguna subfase cubre

Del hallazgo 5: la reevaluación de APM/tracing (`Overview` 110) y los límites de composición en memoria de miembros y de clientes por última interacción (`Overview` 42 y 49).

- **(a) Entran en la 8.4.** Ninguna es de seguridad; la de observabilidad es de criterio y las otras dos son de medición.
- **(b) Entran en la 8.5**, que ya va a medir con volumen. Encaja para los límites en memoria; no para la observabilidad.
- **(c) Subfase nueva 8.6**, como se hizo con la 8.5 en el cierre de la 8.1.
- **(d) Fase 9**, con la justificación escrita de por qué se mueven.

**Recomendación: (b) para los dos límites en memoria y (d) para la observabilidad.** Medir la lista de miembros y la de clientes cuesta poco cuando ya hay un seed de volumen y un procedimiento de `EXPLAIN` montado — es la misma tarea con dos consultas más, y la 8.5 es el único lugar donde eso es barato. La reevaluación de APM, en cambio, pide "evidencia" que no existe todavía: sin un entorno desplegado y sin tráfico, la respuesta sería la misma que hoy por falta de datos, no por criterio. Moverla a la Fase 9 con esa razón escrita es más honesto que resolverla por defecto acá.

Esto **amplía el alcance de la 8.5** y cambia el Roadmap, así que es decisión del usuario.

Pendiente de resolución del usuario.

## Invariantes

1. **La revisión es autoevaluación** y cada entregable lo dice.
2. **Ninguna afirmación queda sin veredicto.** "No se revisó" es un veredicto válido y visible; el silencio no.
3. **`SecurityModel` no es evidencia de sí mismo**: la evidencia es el código, un test o una medición con fecha.
4. **El criterio de severidad se fija antes de revisar** (D-2).
5. **Ningún nivel de validación sube** por esta revisión: revisar no valida. Lo que estaba validado localmente sigue estándolo.
6. **No se toca `src/`** salvo por D-3, corrección por corrección.
7. **Un hallazgo crítico se reporta de inmediato**, no al final.

## Criterios de aceptación

- **AC-1** — Cada afirmación de `SecurityModel.md` tiene identificador, veredicto del vocabulario de D-2 y evidencia citada. La tabla está completa: sin huecos y sin filas sin veredicto.
- **AC-2** — Las 6 filas del threat model tienen veredicto y evidencia, y la de denegación de servicio se apoya en la verificación del rate limiting de los dos puntos.
- **AC-3** — Existe el inventario de superficie expuesta (rutas, Server Actions, Route Handlers) con la autenticación y el rol que cada una exige, e incluye `/api/health`.
- **AC-4** — El rate limiting de ingestión queda verificado (hallazgo 3) y la línea "la Fase 8 lo verifica" queda reemplazada por el resultado.
- **AC-5** — La revisión de minimización de FR-CLI-05 está hecha y `TraceabilityMatrix` línea 46 queda cerrada o reasignada con razón escrita (D-1).
- **AC-6** — La lista de hallazgos tiene severidad según D-2; los no críticos están en `Risks.md` **con su plan**, como pide el Roadmap; los críticos, si los hubiera, están reportados y resueltos o con subfase abierta.
- **AC-7** — La línea de estado de `SecurityModel.md` y la de `NonFunctionalRequirements.md` dicen algo cierto (hallazgo 1).
- **AC-8** — El veredicto del gate de salida de la Fase 8 está escrito: con bloqueantes o sin bloqueantes, y con qué queda abierto.
- **AC-9** — Si D-4 aprueba instrumento, la guarda existe, corre en CI y tiene su caso que demuestra que falla.
- **AC-10** — La suite completa sigue pasando y ningún test existente se modificó.

## Pruebas y evidencia requerida

| Afirmación | Nivel | Dónde |
|---|---|---|
| Cada punto de entrada exige sesión y el rol que corresponde | `deterministic` para lo que ya tiene test; `verificado-por-lectura` para el resto, declarado como tal | tabla de veredictos + inventario de superficie |
| El rate limiting de ingestión limita de verdad | `deterministic` | tests existentes de la 6.5.3 citados, o uno nuevo si no cubren el límite |
| La minimización de FR-CLI-05 se cumple | `verificado-por-lectura` sobre el esquema y las lecturas por rol | tabla de campos personales almacenados y expuestos |
| La superficie expuesta no crece sin autorización | `deterministic` | guarda de D-4, con su caso de fallo |
| Lo verificado en 8.1/8.2/8.3 sigue vigente | cita, no repetición | referencias a sus briefs y tests |

**Nivel del proyecto alcanzable**: *validado localmente, más revisión de seguridad declarada como autoevaluación* — que es exactamente lo que el Roadmap fija para la Fase 8. Una revisión no sube ningún nivel: describe el que hay.

## Condiciones de detención

1. **D-1, D-2 y D-3 sin resolver**: no se empieza. El alcance, el criterio de severidad y el permiso de corregir determinan qué trabajo es este.
2. **Hallazgo crítico según D-2**: se para y se reporta de inmediato, con lo que se sabe y sin arreglarlo por iniciativa propia.
3. **Si una corrección necesita tocar `src/`** y no está autorizada nombrando el archivo: parar.
4. **Si la revisión contradice una decisión aprobada** (un ADR o un brief cerrado): se registra como hallazgo citando los dos documentos y se eleva. No se reescribe el documento aprobado.
5. **Si el volumen de afirmaciones no entra en la subfase**: parar y reportar hasta dónde se llegó, con la lista de lo no revisado. Una revisión parcial declarada es un resultado; una revisión que dice "todo bien" habiendo mirado la mitad, no.
6. **Antes de cualquier commit, push o cambio en Notion**, y antes de tocar `docs/decisions/README.md` o `CHANGELOG.md`.

---

## Resolución (2026-09-18)

El usuario aprobó las seis recomendaciones: **D-1 (b)**, **D-2** tal cual con la regla de detención, **D-3 (c)**, **D-4 (b)**, **D-5** verificar lo verificable y mover el resto a la Fase 9, **D-6** los dos límites en memoria a la 8.5 y la observabilidad a la Fase 9.

## Ejecución (2026-09-18)

**Esto es una autoevaluación.** La hizo el mismo agente que escribió el código y el documento que revisa. No sustituye una revisión independiente y no se presenta como tal.

### Veredicto del gate de salida de la Fase 8

**Sin bloqueantes.** Ningún hallazgo alcanza el umbral de crítico de la D-2: no se encontró acceso ni modificación de datos de otra organización, ni un camino por el que un `viewer` ejecute una operación de `admin`, ni credenciales expuestas, ni forma de operar sin sesión algo que la exija.

Quedan **tres hallazgos mayores** y tres menores, todos con su plan en [Risks](../planning/Risks.md).

### Superficie expuesta (AC-3)

20 puntos de entrada. Ninguno sin declarar.

| Punto de entrada | Cantidad | Exigencia | Cómo se resuelve |
| --- | --- | --- | --- |
| Páginas bajo `(autenticado)` | 13 | sesión + rol según la operación | `requireSession()` en la página; redirige a `/login` sin sesión y a `/cambiar-contrasena` con el flag |
| Páginas fuera del grupo | 2 (`/login`, `/cambiar-contrasena`) | previo a la sesión | `redirectIfAuthenticated` / `requirePendingPasswordChange` |
| Server Actions bajo `(autenticado)` | 15 | sesión | `requireSession()` antes de cualquier efecto, fuera del `try` porque `redirect` lanza |
| Server Actions del ingreso | 2 (`loginAction`, `changePasswordAction`) | previo a la sesión | límite de intentos; el cambio obligatorio solo actúa con `must_change_password` en `true` |
| Server Actions públicas | 2 (`logoutAction`, `setThemeAction`) | ninguna, a propósito | cerrar sesión sin sesión es idempotente; el tema es una cookie sin dato de negocio |
| Route Handlers | 2 (`/api/health`, `/api/ingestion/v1/events`) | ninguna de sesión | salud: solo `{status}`; ingestión: credencial de servicio, y una sesión válida **no** lo autentica |

El rol no lo exige el punto de entrada sino el módulo, con `authorize(context, { role })` dentro del caso de uso. Es lo que el modelo de seguridad dice y lo que hace el código.

### Por qué contar no servía (hallazgo previo 7, confirmado)

Las dos discrepancias que el recuento marcaba son **falsas alarmas**, y merecen quedar escritas para que nadie las vuelva a "descubrir":

- **`analytics`, 14 exportadas y 1 `authorize(`**: las doce métricas y `getMetricsPeriod` pasan por `withPeriod`, que autoriza en su primera línea. Las otras dos exportadas (`resolveMetricsPeriod`, `isIngestionUnavailable`) son funciones puras que no tocan la base.
- **`inventory`, 10 exportadas y 1 `authorize(`**: `adjustStock` autoriza con `role: "admin"`; las lecturas (`listProductStock`, `getProductStock`, `listStockMovements`) **delegan** en `catalog`, que autoriza y devuelve `FORBIDDEN` o `NOT_FOUND` antes de que `inventory` lea un saldo. El resto son funciones puras de composición y validación.

La autorización por delegación es correcta y es invisible para cualquier instrumento que cuente. Por eso la guarda de la D-4 verifica **declaración**, no mecanismo.

### Hallazgos

#### H-1 (mayor) — `findUserSummaries` lee usuarios sin filtro de organización

`SecurityModel` §Autorización y [NonFunctionalRequirements](../product/NonFunctionalRequirements.md) §Seguridad afirman que **todo** repositorio de datos recibe `organization_id` de la sesión y que "no existe una vía de acceso cross-organización". `src/modules/auth/repository.ts#findUserSummaries` es un `select` de `users` por `inArray(users.id, userIds)`, **sin `organization_id`**, que devuelve `id`, `name`, `email` e `isActive`.

No es explotable hoy: los cinco lugares que lo llaman (`catalog`, `crm`, `inventory`, `organizations` ×2) arman la lista de ids desde filas ya filtradas por organización. La garantía existe, pero **vive en cada llamador y no en el repositorio**, que es exactamente lo contrario de lo que el documento promete. Un llamador futuro que pase ids sin filtrar entrega nombre y email de usuarios de otra organización, y nada lo detendría.

Es `mayor` y no `crítico` porque no abre por sí solo ningún acceso indebido: hace falta escribir código nuevo y equivocado para llegar a él.

**Plan**: aceptar `auth` como excepción explícita y escrita —sus tablas son globales por diseño, un usuario se ata a una organización en `organization_members`— y corregir la afirmación barrida, que hoy es falsa tal como está redactada. Si además se quiere la defensa en el repositorio, es una tarea propia: cambiar la firma para que reciba la organización y filtrar por `organization_members`.

#### H-2 (mayor) — El límite de intentos por IP no tiene ninguna prueba

`SecurityModel` declara dos límites en el ingreso: 5 fallos por cuenta y **20 por IP** en 15 minutos. El de cuenta está probado (`tests/integration/auth-service.test.ts`: bloquea aun con la contraseña correcta, la ventana vence y un ingreso correcto limpia los fallos). El de IP **no tiene ni un test**: `IP_FAILURE_LIMIT` aparece una sola vez en todo el repositorio, en la línea que lo usa.

Es la única defensa declarada del ingreso sin evidencia. **Plan**: un caso de integración que agote la clave de IP con cuentas distintas, en la misma subfase que atienda H-3.

#### H-3 (mayor) — Sin proxy de confianza, el límite por IP es un bloqueo global del ingreso

Del código (`login`): la clave de IP es `sha256(ip ?? "sin-proxy")`, y `clientIpFromForwardedFor` devuelve `null` mientras `TRUSTED_PROXY` no sea `"true"` — que es la configuración de **todos los entornos actuales**. Es decir: **hoy todas las peticiones comparten una sola clave de IP**, así que 20 ingresos fallidos de cualquiera, en cualquier cuenta, dentro de 15 minutos dejan a **todos** los usuarios con `RATE_LIMITED` hasta que la ventana venza.

El mecanismo está documentado ("sin proxy de confianza todas las requests comparten una clave de IP"), pero **su consecuencia no está escrita en ninguna parte**, y es de otro orden que el mecanismo. Peor: la fila de denegación de servicio del threat model da "rate limiting en ambos puntos" como mitigación, cuando en esta configuración el límite del ingreso es también un **vector** de denegación de servicio, más barato de ejecutar que el que pretende frenar.

No es `crítico` según la D-2 —no da acceso a nada— pero es el hallazgo con más consecuencia práctica de esta revisión.

**Plan**: decidir en la misma tarea que H-2 entre desactivar el límite por IP mientras no haya proxy de confianza (la clave compartida no aporta defensa y sí un riesgo) o mantenerlo con un umbral mucho más alto. La decisión no es de esta subfase; el riesgo queda registrado con las dos opciones.

#### H-4 (menor) — Dos documentos decían "Estado: diseñado"

`SecurityModel.md` y `NonFunctionalRequirements.md` abrían con esa línea, cuando la mitad de sus secciones cita implementaciones validadas en integración desde la 3.x. Corregido en esta subfase, que la D-3 permite para documentación.

#### H-5 (menor) — `/api/health` no figuraba en el modelo de seguridad

Un endpoint sin autenticación que revela si la base responde. No expone datos, versiones ni detalles del error, y responde con `Cache-Control: no-store`. Agregado al inventario de superficie expuesta del documento, con su razón.

#### H-6 (menor) — Obligaciones de la Fase 8 que flotaban

- "El rate limiting … la Fase 8 lo verifica" → **verificado**; la línea se reemplaza por el resultado.
- "Se verifica en la Fase 8 **o** 9" para la IP real → una obligación que puede cumplirse en cualquiera de dos fases no se cumple en ninguna. Asignada a la Fase 9 (D-5).
- `TraceabilityMatrix` línea 46, minimización de FR-CLI-05 → **cerrada** por esta revisión.

### Rate limiting: verificado en los dos puntos (AC-4)

| Punto | Límite declarado | Evidencia | Veredicto |
| --- | --- | --- | --- |
| Ingreso, por cuenta | 5 / 15 min | `tests/integration/auth-service.test.ts`: bloquea aun con la contraseña correcta, la ventana vence, un ingreso correcto limpia los fallos, y los intentos guardan hashes y no el email ni la IP | `verificado` |
| Ingreso, por IP | 20 / 15 min | ninguna | **H-2**, `sin-verificar` |
| Ingestión, por credencial | 120 / min | `tests/integration/ingestion-http.test.ts` caso 9: el pedido excedente responde `429` con `Retry-After` calculado y `RATE_LIMITED`, no escribe nada, otra credencial de la misma organización no se ve afectada, y la ventana siguiente reinicia la cuenta | `verificado` |

### Minimización de FR-CLI-05 (AC-5)

`clients` almacena exactamente `display_name`, `phone_e164` (opcional) y `notes`, más `is_active` y las dos marcas de tiempo. **No hay** documento, dirección, correo, fecha de nacimiento ni ningún otro campo personal, ni declarado ni de hecho. El requisito se cumple en el almacenamiento, no solo en la pantalla.

Lo que un `viewer` recibe está acotado desde el servidor por el enmascarado de FR-CLI-06, que vive en `crm` y está probado desde la 5.2. Los otros datos personales del sistema son el cuerpo de los mensajes —necesario para operar, con su política de retención pendiente— y los usuarios del backoffice, que no son clientes.

`verificado-por-lectura` sobre el esquema y las lecturas por rol.

### Threat model, fila por fila (AC-2)

| Amenaza | Veredicto | Evidencia |
| --- | --- | --- |
| Suplantación | `verificado` | argon2id con los parámetros mínimos de OWASP y verificación contra un hash ficticio para un email inexistente; sesión server-side revocable que guarda el SHA-256 del token; límite por cuenta probado. Con la salvedad de H-2 en la mitad por IP |
| Manipulación de datos (cross-org) | `parcial` | Todos los repositorios de datos de negocio filtran por `organization_id`, probado en integración desde la 3.4 (otra organización da `NOT_FOUND`). La excepción es H-1, que no es de datos de negocio pero contradice la afirmación tal como está escrita |
| Repudio | `verificado` | `inventory_movements` y `audit_logs` de solo inserción con rol y trigger ([ADR 0013](0013-rol-de-aplicacion-y-tablas-de-solo-insercion.md)), con la limitación ya aceptada de que hoy la aplicación se conecta con el rol dueño |
| Divulgación de información | `verificado` | Las tres capas de evidencia de la 8.2, más el enmascarado del teléfono probado en la 5.2 |
| Denegación de servicio | `parcial`, **y el hallazgo H-3** | La ingestión está probada. El ingreso tiene la mitad probada, y en la configuración actual su límite por IP es también un vector de denegación de servicio |
| Elevación de privilegios | `verificado-por-lectura` | Los 20 puntos de entrada revisados uno por uno; `authorize(context, { role: "admin" })` en cada caso de uso de escritura sensible, probado en integración para productos, clientes, stock y miembros |

### Veredictos por sección de `SecurityModel` (AC-1)

| Sección | Afirmaciones | `verificado` | `verificado-por-lectura` | `parcial` / hallazgo | `no-verificable-aquí` |
| --- | --- | --- | --- | --- | --- |
| Autenticación | 18 | 13 | 2 | 2 (H-2, H-3) | 1 (cookie `__Host-` bajo TLS) |
| Autorización | 14 | 10 | 3 | 1 (H-1) | — |
| Autenticación de servicio | 7 | 6 | 1 | — | — |
| Protección de la aplicación web | 16 | 13 | 2 | — | 1 (HSTS) |
| Gestión de secretos | 3 | 1 | 1 | — | 1 (gestor del proveedor) |
| Política de logs | 8 | 8 | — | — | — |
| Auditoría | 6 | 5 | — | 1 (rol dueño, limitación ya aceptada) | — |
| Backups y restauración | 2 | — | — | — | 2 |
| Retención de datos | 7 | 6 | 1 | — | — |
| Threat model | 6 | 4 | 1 | 2 (H-1, H-3) | — |
| Revisión de dependencias | 6 | 6 | — | — | — |
| Separación de entornos | 2 | 1 | — | — | 1 (staging) |
| **Total** | **95** | **73** | **11** | **6** | **6** |

Qué sostiene cada veredicto: lo `verificado` cita el test, la guarda o la medición con fecha del brief correspondiente (3.3 a 3.7, 4.x, 5.2, 6.5.3, 8.1, 8.2 y 8.3); lo `verificado-por-lectura` se comprobó en el código en esta subfase y se distingue a propósito, porque nada lo fija; lo `no-verificable-aquí` necesita TLS, proxy real o entorno persistente y queda para la Fase 9.

### Instrumento permanente (D-4, AC-9)

`tests/guards/exposed-surface.test.ts`, nueva: cada Server Action exportada y cada Route Handler de `src/app` está declarado con su exigencia, y cada entrada declarada sigue existiendo. Lo que se declara sin sesión tiene que decir por qué, y nada bajo `(autenticado)` puede declararse público.

La guarda **no** comprueba que la exigencia declarada se cumpla, y su comentario de cabecera lo dice: eso se verificó leyendo, y reducirlo a un patrón de texto sería mentir, porque la autorización se delega o vive en un helper del mismo archivo. Su valor está en el diff: una acción nueva obliga a declararla, y declararla obliga a decidir.

**Evidencia de mutación**: agregar `export async function borrarTodoAction()` a un archivo de acciones existente hace fallar la guarda nombrando el archivo y la función. Límite conocido y heredado de las otras guardas: recorre `git ls-files`, así que un archivo **sin versionar** no lo ve.

### Lo que esta revisión no certifica

- **Que no existan defectos de seguridad.** Certifica que 95 afirmaciones del modelo se contrastaron contra el código y que los 20 puntos de entrada se revisaron uno por uno, con el veredicto de cada uno a la vista.
- **Revisión independiente**: es autoevaluación del mismo agente que escribió lo revisado.
- **Nada bajo TLS, proxy real o entorno persistente**: 6 afirmaciones quedan `no-verificable-aquí` con destino Fase 9.
- **Ningún nivel de validación subió** por esta revisión. Revisar no valida.

### Cierre (2026-09-18)

Con autorización explícita del usuario en el turno, además de los archivos de la lista cerrada:

- **`docs/architecture/Overview.md`** y **`docs/planning/Roadmap.md`**, para ejecutar la D-6: las dos listas compuestas en memoria entran en el alcance de la 8.5; la reevaluación de APM y tracing pasa a la Fase 9; y la decisión de hosting, que decía "Fase 8/9", queda en la 9.1. Con el mismo criterio de la D-5: una obligación que cabe en dos fases no se cumple en ninguna.
- **`docs/development/EngineeringStandards.md`**, porque su lista de guardas decía "Son cuatro" y la guarda nueva la volvía falsa **en el mismo commit** — el defecto H-4 que esta subfase vino a corregir. Ahora dice cinco y las enumera con fecha.
- `docs/decisions/README.md` y `CHANGELOG.md`.

**Estado**: guardas 62/62 (antes 49), unitarios 302/302, integración 390/390, lint y typecheck limpios. Ningún test existente modificado y `src/` sin tocar.

**Pendientes que esta subfase deja abiertos**, ninguno bloqueante:

| Qué | Dónde queda |
| --- | --- |
| H-1, H-2 y H-3, con su plan y su decisión pendiente | [Risks](../planning/Risks.md) |
| Las 6 afirmaciones `no-verificable-aquí` | Fase 9, nombradas en el resultado |
| La verificación de la IP real con un proxy | Fase 9 (D-5) |
| Las dos listas en memoria | Subfase 8.5 (D-6) |
| La reevaluación de APM y tracing | Fase 9 (D-6) |
