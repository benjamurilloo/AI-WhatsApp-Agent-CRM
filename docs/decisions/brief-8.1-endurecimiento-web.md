---
schema: task-brief.v1
task_id: 8.1
task_type: hardening
generated_at: 2026-09-18
---

# Brief: 8.1 — Endurecimiento web

## Objetivo

Que la aplicación emita una Content-Security-Policy restrictiva y el resto de las cabeceras de seguridad que hoy no emite, y que la protección CSRF que [SecurityModel.md](../architecture/SecurityModel.md) describe como diseñada quede demostrada con un test que falla si se la quita.

Es la primera subfase de la Fase 8 y la única que escribe código de protección: las otras tres verifican, documentan o tocan la CI. Con ella, la línea "Content-Security-Policy restrictiva" de SecurityModel §"Protección de la aplicación web" deja de ser diseño.

## Ubicación en la Fase 8

- **Orden previsto**: **8.1** → 8.2 → 8.4, con la 8.3 en paralelo ([Roadmap](../planning/Roadmap.md), "Trabajo paralelizable").
- **Notion**: tarea "8.1 — Endurecimiento web", descripción "M. CSP, CSRF en todas las mutaciones y cabeceras de seguridad". Estado "Bandeja de Entrada" y prioridad media al escribir este brief (verificado el 2026-09-18).
- **Necesario ahora**: la CSP, las cabeceras, la evidencia ejecutable del rechazo CSRF y la actualización de los documentos de arquitectura que esto cambia.
- **Requisito antes de producción**, fuera de esta subfase: HSTS y la cookie detrás de TLS y de un proxy real, que necesitan un entorno con TLS (Fase 9); `TRUSTED_PROXY` y la IP real del rate limit de login (Fase 8 o 9, Risks).
- **Mejora posterior**: endpoint de reporte de violaciones de CSP y su tablero; Subresource Integrity; CSP por ruta.
- **Gates de entrada**:
  1. Fases 3 a 7 cerradas. Verificado el 2026-09-18: `main` limpio en `fe6afb5`, igual que `origin/main`, con la CI en verde ([ejecución 35284001938](https://github.com/benjamurilloo/AI-WhatsApp-Agent-CRM/actions/runs/35284001938)).
  2. Las diez pantallas implementadas, que son la superficie que la CSP tiene que no romper.
  3. Contenedor de PostgreSQL en marcha y Chromium de Playwright instalado: la evidencia de esta subfase es end-to-end sobre `next start`.

## Hallazgos de la verificación previa (2026-09-18)

1. **Hoy no se emite ninguna cabecera de seguridad.** [next.config.ts](../../next.config.ts) tiene únicamente `agentRules: false` (brief-2.3); no hay `headers()`. La única mención a cabeceras en `src/` está en [session-cookie.ts](../../src/modules/auth/session-cookie.ts), que es la cookie de sesión.
2. **No existe `proxy.ts` ni `middleware.ts`**, ni en la raíz ni en `src/`. Es una decisión explícita ([brief-3.5](brief-3.5-pantalla-de-inicio-de-sesion.md), D-6): cada página y cada acción validan la sesión contra la base, y el proxy se reevalúa cuando haya varias rutas protegidas. Esta subfase es la primera razón concreta para reevaluarlo, y no por sesión sino por el nonce. Se resuelve en D-1.
3. **El HTML construido lleva scripts inline de Next.** En `.next/server/app/_global-error.html` aparecen `(self.__next_f=self.__next_f||[]).push([0])` y el push del payload RSC, además de un `<style>` inline. Una CSP con `script-src` sin `'unsafe-inline'` necesita un nonce por request, y un nonce por request necesita un proxy: es el mismo nudo del hallazgo 2. Se resuelve en D-1 y se mide en D-3.
4. **No hay `dangerouslySetInnerHTML` en `src/`.** Las dos únicas coincidencias de `<script` son la cadena `"<script>"` dentro de `messages.test.ts` de clientes y de usuarios, que prueban que un texto así no se muestra. Es decir: la defensa XSS de hoy es el escape automático de React, sin ninguna excepción que sanitizar, y la CSP entra como defensa en profundidad, no como parche de un agujero conocido.
5. **Los Route Handlers que existen son dos**, y ninguno muta datos con la sesión: [`/api/health`](../../src/app/api/health/route.ts) es un `GET` sin sesión, y [`/api/ingestion/v1/events`](../../src/app/api/ingestion/v1/events/route.ts) es un `POST` autenticado por credencial de servicio que deliberadamente no verifica `Origin` ([brief-6.5.3](brief-6.5.3-autenticacion-de-servicio-y-rate-limit.md), D-5). La regla de SecurityModel "todo Route Handler que modifique datos con la sesión verifica `Origin`" no tiene sujeto hoy: la 8.1 la verifica como ausencia, no la implementa.
6. **Las mutaciones de la UI son Server Actions.** Next.js 16.3 rechaza por sí mismo un `Origin` distinto del `Host`, y `serverActions.allowedOrigins` no está configurado, que es lo correcto. Pero **ningún test ejerce ese rechazo**: la protección CSRF del MVP descansa hoy en el comportamiento del framework sin evidencia propia. Se resuelve en D-5.
7. **`src/shared/http/` ya existe** desde la 6.5.3 con la lectura del cuerpo por bytes y la comprobación de `Content-Type`, y estaba prevista desde la 3.4 (D-5) justamente para la verificación de `Origin`. Es el lugar natural si D-5 decide escribir el helper — con la salvedad del hallazgo 5.
8. **No hay dominios de terceros que permitir.** Manrope se sirve local con `next/font/local` desde `_fonts/` (brief-4.0, D-3), el tema se resuelve en el servidor leyendo la cookie en [layout.tsx](../../src/app/layout.tsx) sin ningún script inline propio, y no hay biblioteca de gráficos ni CDN. Una CSP `default-src 'self'` no necesita excepciones de origen: todo lo inline que hay lo pone Next.
9. **`RepositoryStructure.md` no contempla un `proxy.ts`**: no aparece ni en su árbol ni en "Rutas y handlers". Si D-1 elige el proxy, el documento se actualiza en esta subfase. Queda registrado como discrepancia entre el diseño de la estructura y lo que la 8.1 puede necesitar, no resuelta acá.
10. **Playwright levanta dos servidores sobre `next start`** (puertos 3100 y 3101), así que las cabeceras se pueden afirmar sobre respuestas reales de producción, no sobre `next dev`.
11. **Discrepancia de alcance de la fase, fuera de esta subfase**: [Risks.md](../planning/Risks.md) asigna a la Fase 8 el `EXPLAIN` y el volumen de las consultas de productos e inventario (6.2, D-4), pero ninguna de las cuatro subfases de Notion lo cubre — la 8.1 es endurecimiento web, la 8.2 logs y privacidad, la 8.3 dependencias y la 8.4 la revisión de seguridad. Se eleva al usuario como pendiente de la Fase 8: o se le agrega una subfase, o se mueve a la Fase 9 en Risks. No se decide en este brief.

## Alcance incluido

1. Emisión de la Content-Security-Policy sobre las respuestas de documento de la aplicación, con el mecanismo que resuelva D-1 y el modo que resuelva D-3.
2. Emisión de las cabeceras de seguridad que resuelva D-2.
3. Evidencia ejecutable del rechazo CSRF de las Server Actions, y del hecho de que el endpoint de ingestión sigue sin CORS y sin `Origin` (D-5).
4. Un end-to-end que afirme las cabeceras sobre `next start` y que recorra las pantallas buscando violaciones de CSP en la consola del navegador (D-6).
5. Actualización de [SecurityModel.md](../architecture/SecurityModel.md) §"Protección de la aplicación web" con lo implementado, sus limitaciones aceptadas y lo que queda para la Fase 9, y de [RepositoryStructure.md](../architecture/RepositoryStructure.md) si D-1 crea un archivo que su árbol no contempla.

## Alcance excluido

- **Logs y privacidad** (8.2), **auditoría de dependencias en CI** (8.3) y **la revisión ítem por ítem de SecurityModel y del threat model** (8.4). Esta subfase actualiza solo la sección que ella misma cambia.
- **Reimplementar el rate limiting**: está hecho en la 3.3 y la 6.5.3 y la Fase 8 lo verifica, en la 8.4.
- **HSTS efectivo, TLS y la cookie detrás de un proxy real**: sin TLS en local no hay nada que demostrar (Fase 9).
- **`TRUSTED_PROXY` y la IP real** del límite de intentos de login.
- **Tocar el endpoint de ingestión**, su contrato, su credencial o su decisión de no verificar `Origin`.
- **Cambiar el aspecto o el comportamiento de cualquier pantalla.**
- **La frontera de `analytics` en ESLint** y **el nombre del paso de guardas en `ci.yml`**: cada uno necesita una subfase que autorice su archivo.
- **Dependencias nuevas**, de cualquier clase.
- **Un endpoint de reporte de violaciones de CSP**: no hay receptor, y crearlo sería un módulo especulativo.

## Archivos o componentes autorizados

Lista cerrada. Tocar algo fuera de acá es un hallazgo bloqueante en la revisión.

**Siempre:**

- `next.config.ts` — sin quitar `agentRules: false`.
- `tests/e2e/security-headers.spec.ts` — nuevo.
- `docs/architecture/SecurityModel.md`
- `docs/decisions/brief-8.1-endurecimiento-web.md` — este archivo, para registrar resolución, ejecución y cierre.

**Solo si la decisión indicada lo habilita:**

- `src/proxy.ts` — nuevo, solo si D-1 elige el nonce por request.
- `docs/architecture/RepositoryStructure.md` — solo si se crea `src/proxy.ts` (hallazgo 9).
- `src/app/layout.tsx` — solo si D-1 obliga a propagar el nonce desde el servidor; es un cambio de una línea o ninguno, y si resulta ser más, se detiene.
- `src/shared/http/` — solo si D-5 decide escribir el helper de `Origin` ahora.
- `tests/integration/security-headers.test.ts` — nuevo, solo si D-5 o D-6 lo eligen como lugar de la evidencia.

**Con autorización explícita del usuario en el turno, al cerrar:**

- `docs/decisions/README.md` (índice) y `CHANGELOG.md`.

## Fuentes de verdad

1. El código y las migraciones de este repositorio.
2. [architecture/SecurityModel.md](../architecture/SecurityModel.md) §"Protección de la aplicación web" y [product/NonFunctionalRequirements.md](../product/NonFunctionalRequirements.md) §Seguridad — lo que la Fase 8 verifica.
3. [ADR 0012](0012-mecanismo-de-sesion.md) (CSRF por `SameSite=Lax` más verificación de origen, sin tokens de doble envío) y [brief-6.5.3](brief-6.5.3-autenticacion-de-servicio-y-rate-limit.md), D-5 (por qué la ingestión no verifica `Origin`).
4. [brief-3.5](brief-3.5-pantalla-de-inicio-de-sesion.md), D-6 (por qué no hay proxy) y [architecture/RepositoryStructure.md](../architecture/RepositoryStructure.md).
5. [planning/Roadmap.md](../planning/Roadmap.md) (alcance y gates de la Fase 8) y [CLAUDE.md](../../CLAUDE.md) (vocabulario de validación y prohibiciones).

Si dos se contradicen, la discrepancia se escribe antes de decidir cuál corrige a cuál.

## Dependencias

- Fases 3 a 7 cerradas (gate de entrada, verificado).
- PostgreSQL local levantado, `npm run build` hecho antes de los end-to-end, y Chromium instalado.
- Nada de esta subfase depende de la 8.2, la 8.3 ni la 8.4.

## Resolución (2026-09-18)

El usuario leyó el brief y **aprobó las seis decisiones según la recomendación**: D-1 con `src/proxy.ts` y nonce por request; D-2 con la lista completa y HSTS diferido a la Fase 9; D-3 midiendo en report-only y entregando en enforce, con `'unsafe-inline'` aceptable solo en `style-src` si la medición lo obliga; D-4 sin excepciones de ruta; D-5 produciendo la evidencia sin escribir el helper de `Origin`; D-6 con un spec propio.

Las condiciones de detención siguen vigentes tal como están escritas: la aprobación resuelve las decisiones, no las levanta.

## Decisiones pendientes

Resueltas arriba. Se conservan con su texto original porque la revisión contrasta contra ellas.

Ninguna se resuelve implementando. Si el implementador llega a una de estas sin respuesta, se detiene.

### D-1 — Cómo se emite la CSP, y con qué fuerza

El nudo de toda la subfase. Next emite scripts inline (hallazgo 3), así que hay dos caminos y no un tercero:

- **(a) `headers()` en `next.config.ts`.** Cabecera estática, sin proxy, sin tocar el modelo de request. No puede llevar un nonce distinto por request, así que `script-src` necesita `'unsafe-inline'`. Una CSP con `'unsafe-inline'` en `script-src` casi no defiende contra XSS: sirve para `frame-ancestors`, `object-src`, `base-uri` y `form-action`, que igual valen, pero la línea de SecurityModel dice "restrictiva" y esto no lo es.
- **(b) `src/proxy.ts` con un nonce por request.** Es la forma documentada de Next para una CSP estricta: el proxy genera un nonce, lo pone en la cabecera y Next lo aplica a sus scripts. Cuesta un archivo que corre en todas las requests y revierte en parte la D-6 de la 3.5 — aunque no por lo que esa decisión descartaba, que era validar la sesión en el proxy. El nonce fuerza render dinámico, cosa que estas pantallas ya son porque leen la sesión en cada request.

**Recomendación: (b)**, con el proxy limitado a generar el nonce y escribir las cabeceras, sin tocar sesión, sin leer la base y sin redirigir. Si se elige (b), el `'unsafe-inline'` de `script-src` desaparece y el de `style-src` se decide por medición en D-3.

Pendiente de resolución del usuario.

### D-2 — Qué cabeceras se emiten además de la CSP

Candidatas, todas sin dependencias y sin efecto visible en las pantallas:

- `X-Content-Type-Options: nosniff`;
- `Referrer-Policy: same-origin`;
- `frame-ancestors 'none'` dentro de la propia CSP, en lugar de `X-Frame-Options`, que es el mecanismo viejo;
- `Permissions-Policy` negando cámara, micrófono y geolocalización, que la aplicación no usa;
- `Cross-Origin-Opener-Policy: same-origin`;
- **`Strict-Transport-Security`: se define acá pero no se emite todavía**, porque sin TLS no hace nada y en `http://localhost` solo puede confundir. Queda escrito en SecurityModel como requisito de la Fase 9.

**Recomendación**: todas las de la lista, con HSTS diferido tal como está escrito. Pendiente de confirmación.

### D-3 — Report-only antes de enforce, y qué pasa con `style-src`

Nadie sabe todavía qué violaciones produce la aplicación real, porque nunca corrió con una CSP. Dos preguntas:

1. ¿Se entrega la subfase en `Content-Security-Policy-Report-Only` o en enforce?
2. Si los `<style>` inline que Next inyecta no toman el nonce, ¿`style-src` lleva `'unsafe-inline'` o se detiene la entrega?

**Recomendación**: medir en report-only durante la implementación, recorriendo las diez pantallas y anotando cada violación con su origen, y **entregar en enforce**; una CSP report-only no protege nada y quedaría como deuda invisible. Sin `report-uri`: no hay receptor y crearlo está excluido. Sobre `style-src`: si la medición demuestra que los estilos inline de Next no admiten nonce, se acepta `'unsafe-inline'` **solo en `style-src`**, se declara como limitación aceptada en SecurityModel y se registra en Risks. Si hiciera falta también en `script-src`, eso es una condición de detención, no un ajuste.

Pendiente de confirmación.

### D-4 — Si las cabeceras cubren también `/api/*`

`/api/health` y `/api/ingestion/v1/events` devuelven JSON, no documentos: una CSP ahí no cambia nada en la práctica, pero excluirlas obliga a escribir una condición de ruta que hay que mantener.

**Recomendación**: emitir las cabeceras en todas las respuestas, sin excepciones por ruta, salvo que la medición muestre un efecto en el endpoint de ingestión — que no debería tenerlo, porque no lo consume un navegador. Lo que **no** cambia en ningún caso es el comportamiento del endpoint de ingestión: sigue sin CORS y sin verificar `Origin`.

Pendiente de confirmación.

### D-5 — Qué evidencia de CSRF se produce, y si se escribe el helper de `Origin` ahora

La protección existe (Next rechaza el `Origin` ajeno en Server Actions) pero no está demostrada (hallazgo 6). Y el helper de `Origin` previsto en la 3.4 (D-5) no tiene hoy ningún consumidor (hallazgo 5).

**Recomendación**: producir la evidencia y **no** escribir el helper. Un test que hace `POST` a una Server Action con un `Origin` ajeno y espera el rechazo, más la corrida de mutación que lo confirma; y un test que reafirme que el endpoint de ingestión no acepta una sesión válida como credencial, si el que ya existe de la 6.5.3 no lo cubre tal cual. Escribir el helper sin consumidor sería un módulo especulativo, que [CLAUDE.md](../../CLAUDE.md) prohíbe; se escribe con el primer Route Handler que use la sesión.

Pendiente de confirmación.

### D-6 — Dónde vive la evidencia

Opciones: un spec end-to-end propio; aserciones repartidas por los ocho specs existentes; o un test de integración que le pegue al servidor.

**Recomendación**: un spec propio, `tests/e2e/security-headers.spec.ts`, que afirme las cabeceras sobre una respuesta real y recorra las pantallas escuchando los eventos de violación de CSP de la consola. Repartir aserciones por los ocho specs existentes los ensucia y hace la corrida de mutación difícil de leer. Los specs existentes no se tocan; si alguno se rompe con la CSP, eso es un hallazgo, no un spec a ajustar.

Pendiente de confirmación.

## Invariantes

1. **El endpoint de ingestión no cambia**: ni su contrato, ni su credencial, ni su límite de tasa, ni su decisión de no verificar `Origin` (6.5.3, D-5). Sus tests siguen verdes sin tocarlos.
2. **Ninguna pantalla cambia de aspecto ni de comportamiento.** La 8.1 no toca `src/app/(autenticado)/`.
3. **Ningún spec existente se relaja para que pase con la CSP.** Si uno falla, se corrige la CSP o se detiene y se reporta.
4. **Sin dependencias nuevas.**
5. **`agentRules: false` no se quita** de `next.config.ts`.
6. **La CSP nunca habilita `'unsafe-eval'`.**
7. **El nonce, si existe, es distinto en cada request, no se registra en ningún log y no se reutiliza.**
8. **El proxy, si existe, no lee la base, no valida la sesión y no redirige**: la validación de sesión sigue en cada página y cada acción (brief-3.5, D-6).
9. **Ningún secreto ni dato personal entra en una cabecera.**

## Criterios de aceptación

- **AC-1** — Toda respuesta de documento HTML de la aplicación lleva `Content-Security-Policy` en el modo que fijó D-3, con `default-src 'self'`, sin `'unsafe-eval'`, con `frame-ancestors`, `base-uri` y `form-action` restringidos, y sin `'unsafe-inline'` en `script-src` salvo que D-1 haya resuelto (a) explícitamente.
- **AC-2** — Las cabeceras que fijó D-2 están presentes en las respuestas, verificadas sobre `next start`, no sobre `next dev`.
- **AC-3** — Las diez pantallas cargan sin ninguna violación de CSP en la consola del navegador, en tema claro y oscuro, incluido el dashboard con su gráfico y las pantallas con `Suspense` y carga incremental.
- **AC-4** — La suite completa sigue pasando: los 707 unitarios y de integración, y los 76 end-to-end, más los nuevos de esta subfase. Ningún test existente fue modificado para lograrlo.
- **AC-5** — Una Server Action invocada con un `Origin` ajeno es rechazada, demostrado por un test que falla si la protección se quita.
- **AC-6** — `/api/ingestion/v1/events` conserva exactamente su comportamiento: sin encabezados CORS, sin verificación de `Origin`, y una sesión válida sigue sin autenticarlo. Sus tests de la 6.5.3 pasan sin cambios.
- **AC-7** — [SecurityModel.md](../architecture/SecurityModel.md) §"Protección de la aplicación web" describe lo implementado con la ruta del archivo que lo emite, las limitaciones aceptadas (incluido `style-src` si aplicó) y lo que queda para la Fase 9 (HSTS y TLS). Si se creó `src/proxy.ts`, [RepositoryStructure.md](../architecture/RepositoryStructure.md) lo refleja en su árbol y en "Rutas y handlers".
- **AC-8** — Corrida de mutación: quitar la CSP, y por separado el nonce si existe, hace fallar al menos un test nombrado en el brief. Una mutación sin efecto se registra como tal y se prueba en otro punto.
- **AC-9** — El brief queda con su sección de ejecución: qué se implementó, las violaciones que la medición encontró y cómo se resolvió cada una, la evidencia de mutación y el nivel de validación alcanzado.

## Pruebas y evidencia requerida

| Afirmación | Nivel de evidencia | Dónde |
|---|---|---|
| Las cabeceras llegan al navegador y las pantallas no violan la CSP | `producer-consumer` | `tests/e2e/security-headers.spec.ts` sobre `next start` |
| Las diez pantallas siguen funcionando con la CSP puesta | `producer-consumer` | los ocho specs existentes, sin modificar |
| Una Server Action rechaza un `Origin` ajeno | `deterministic` | el test de D-5, con su corrida de mutación |
| El endpoint de ingestión no cambió | `deterministic` | los tests de la 6.5.3, sin modificar |

**Nivel del proyecto alcanzable con esta subfase**: *validado en integración* para el endurecimiento web. HSTS, TLS y la cookie detrás de un proxy real quedan en *diseñado* hasta la Fase 9, y así se declaran. No se reporta "preparado para producción" por esta subfase.

Una medición local de violaciones de CSP es medición, no validación: se declara como tal, con sus tablas en la sección de ejecución.

## Condiciones de detención

Parar y reportar, sin seguir:

1. **D-1 sin resolver**: no se escribe ni una línea de código antes de que el usuario elija el mecanismo.
2. **Si `script-src` necesita `'unsafe-inline'`** para que la aplicación funcione, habiendo elegido (b): se detiene con la evidencia de la medición. Aflojar `script-src` vacía la subfase de sentido y es una decisión del usuario, no un ajuste.
3. **Si una pantalla necesita cambiar** para cumplir la CSP: `src/app/(autenticado)/` no está autorizado. Se reporta qué pantalla, qué violación y qué haría falta.
4. **Si hace falta una dependencia nueva**: está excluido sin excepción.
5. **Si aparece un hallazgo de seguridad fuera de este alcance** (por ejemplo, algo que corresponda a la 8.2 o la 8.4): se registra y se eleva, no se arregla acá.
6. **Antes de cualquier commit, push o cambio en Notion**, y antes de tocar `docs/decisions/README.md` o `CHANGELOG.md`.
7. **Si la medición contradice un hallazgo de este brief**: se escribe la contradicción citando las dos fuentes antes de decidir.

## Ejecución (2026-09-18)

### Lo que se implementó

- **[`src/proxy.ts`](../../src/proxy.ts)** (nuevo): genera 16 bytes aleatorios por request, arma la política y la escribe en la cabecera del request —de donde Next la lee para nonce-ar sus scripts— y en la de la respuesta, más las cuatro cabeceras de D-2. Su `matcher` excluye solo los estáticos de Next. No valida sesión, no lee la base y no redirige.
- **[`tests/e2e/security-headers.spec.ts`](../../tests/e2e/security-headers.spec.ts)** (nuevo, 5 casos): las cabeceras sobre una respuesta real; el nonce distinto en cada respuesta; las diez pantallas sin violaciones de CSP en claro y oscuro; el rechazo de una Server Action con `Origin` ajeno sin escritura; y la ingestión sin CORS y sin aceptar la sesión.
- **[SecurityModel.md](../architecture/SecurityModel.md)** y **[RepositoryStructure.md](../architecture/RepositoryStructure.md)** actualizados.
- `next.config.ts` **no se tocó**: con el proxy no hizo falta, así que `agentRules: false` quedó como estaba.

### El mecanismo se verificó en el código instalado, no en la documentación

Next extrae el nonce de la cabecera `content-security-policy` **del request** (`getScriptNonceFromHeader`, con fallback de `script-src` a `default-src`), y en un `Origin` que no coincide con el host aborta la Server Action con **500** y `Invalid Server Actions request` (`action-handler.js`). Ambas cosas se leyeron en `node_modules/next` 16.3.5 antes de escribir el código y antes de fijar la aserción del test: son el contrato del que depende la subfase.

### La medición de D-3 corrigió una suposición del propio brief

El brief daba por probable que los `<style>` inline obligaran a `'unsafe-inline'` en `style-src`, y lo dejaba como limitación aceptable. La medición en report-only, con las diez pantallas en claro y oscuro, dio **cero violaciones**. Dos corridas lo precisaron:

| Política medida | Resultado | Qué demuestra |
|---|---|---|
| Política completa, report-only | 0 violaciones | La política estricta no rompe nada |
| `style-src 'none'` | 3 violaciones `style-src-elem` sobre el chunk `.css` | El colector de violaciones **sí** detecta cuando hay algo que detectar |
| `style-src 'self'` (sin nonce) | 0 violaciones | **No hay ningún `<style>` inline en las pantallas**: los estilos viajan en el chunk `.css` |

El `<style>` inline que el hallazgo 3 encontró en `.next/server/app/_global-error.html` es de la página de error de Next, no de la aplicación. El nonce se dejó igual en `style-src` porque cubre esa página sin costo, pero la razón está escrita en el código para que nadie lo lea como necesario. **`'unsafe-inline'` no hizo falta en ninguna directiva**, así que la limitación que el brief admitía no se usó.

### Evidencia de mutación

| Mutación | Efecto | Qué prueba |
|---|---|---|
| `style-src 'none'` | falla el caso 3 con 3 violaciones nombradas | El caso 3 no pasa por tener el colector roto |
| Quitar `'nonce-…'` de `script-src` | fallan los casos 1, 3 y 4 | El nonce es portante: sin él la aplicación no hidrata y ni siquiera se puede capturar una Server Action |
| `serverActions.allowedOrigins: ["sitio-atacante.example"]` | el caso 4 recibe **200** en vez de 500 | El caso 4 mide la guarda CSRF real, no un 500 accidental del reenvío |

Las tres tuvieron efecto; ninguna quedó como defensa doble.

### Un fallo propio que la suite completa encontró

El caso 5 pasaba aislado y fallaba en la suite completa: el `beforeEach` del spec nuevo hacía `DELETE` sobre `inventory_movements`, que es de solo inserción. Aislado no fallaba porque la tabla estaba vacía y el trigger es por fila; después de `products.spec.ts` sí tiene filas. Se corrigió usando `TRUNCATE`, que es la vía documentada (ADR 0013), en la misma sentencia que las tablas que la referencian (convención de la 6.1). Ningún spec ajeno se tocó.

### Verificaciones

- `npm run typecheck` y `npm run lint`: limpios.
- `npm run test`: **707 de 707**, 64 archivos.
- `npx playwright test`: **81 de 81** — los 76 existentes sin modificar, más los 5 nuevos. Ninguna pantalla necesitó cambios para cumplir la CSP, así que la condición de detención 3 no se activó.

### Nivel de validación alcanzado

**Validado en integración** (`producer-consumer`) para las cabeceras, la CSP y el rechazo CSRF: navegador Chromium real contra `next start` y PostgreSQL real, sin mocks. HSTS, TLS y la cookie detrás de un proxy real siguen en **diseñado** (Fase 9). No se reporta "preparado para producción".

### Pendientes registrados

- `Strict-Transport-Security` y la verificación con TLS: Fase 9.
- Endpoint de reporte de violaciones de CSP: fuera de alcance, sin receptor.
- El helper de `Origin` de `src/shared/http/` sigue sin escribirse, por no tener consumidor (D-5).
- El `EXPLAIN` con volumen de productos e inventario que Risks asigna a la Fase 8 sigue sin subfase (hallazgo 11): decisión del usuario, pendiente.

## Cierre (2026-09-18)

Cerrado con autorización del usuario, con D-1 a D-6 resueltas según la recomendación y **sin desvíos respecto del alcance autorizado**: los siete archivos tocados son exactamente los de la lista cerrada. `next.config.ts` estaba autorizado y no hizo falta tocarlo, así que quedó como estaba.

- **Commit**: `a5518ad` — "Endurecimiento web (8.1)".
- **CI en verde** en `a5518ad` ([ejecución 35356670129](https://github.com/benjamurilloo/AI-WhatsApp-Agent-CRM/actions/runs/35356670129)), con sus quince pasos, incluidos el desfase de migraciones, las guardas y el end-to-end con Chromium.
- **Ninguna condición de detención quedó activa.** La 2 y la 3 no se activaron porque la medición dio cero violaciones y ninguna pantalla necesitó cambios.
- **La limitación que el brief admitía —`'unsafe-inline'` en `style-src`— no se usó**: la medición demostró que no hacía falta.

### Resolución del hallazgo 11

El hallazgo se elevó al usuario como pendiente de la fase, fuera de esta subfase. **Decisión: se agrega una subfase 8.5**, en lugar de mover el ítem a la Fase 9.

Razón: la Fase 8 se llama "Calidad, seguridad y observabilidad" y su objetivo en el Roadmap es verificar los requisitos no funcionales contra el código real antes de staging; el rendimiento de los listados es un requisito no funcional ([NonFunctionalRequirements](../product/NonFunctionalRequirements.md), §Rendimiento), y [Risks](../planning/Risks.md) ya lo asignaba a la Fase 8. Lo que estaba incompleto era la lista de subfases, no la asignación. Se consideró y se descartó moverlo a la Fase 9 —donde igual se vuelve a medir con varias organizaciones— porque productos e inventario son la única área del sistema sin ninguna medición, ni siquiera local, y un índice faltante descubierto en staging cuesta más que descubierto antes.

Alcance previsto para la 8.5, angosto a propósito: extender el seed de volumen de la 6.2 a productos e inventario, correr `EXPLAIN` sobre las consultas de listado de las Fases 4 y 5 con sus planes registrados, y corregir solo lo patológico. Varias organizaciones, staging y cualquier objetivo de SLA quedan en la Fase 9. La 8.5 necesita su propio brief antes de tocar código.
