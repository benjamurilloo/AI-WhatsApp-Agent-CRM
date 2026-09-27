---
schema: task-brief.v1
task_id: "12.5"
task_type: integration
generated_at: 2026-09-27
---

# Brief: 12.5 — Turno completo en staging

**Estado: aprobado el 2026-09-27 por el usuario, con las recomendaciones de D-1 a D-11**: un guion de cinco turnos (D-1 A); sin pérdida demostrada con conciliación, una interrupción controlada y los dos `CONFLICT` (D-2 A); la cadena real del agente con entrada simulada y envío a un doble (D-3 A); tres credenciales creadas por el usuario (D-4 A); R-6 probada de punta a punta, con la frecuencia real para la 13.5 (D-5 A); despliegue de la `0024` con autorización en el momento (D-6 A); conciliación con un script versionado (D-7 A); capturas de lectura como fixtures (D-8 A); N-1 preguntada al agente (D-9 A); dos etapas, 12.5.1 y 12.5.2 (D-10); revisión independiente y cierre de la fase (D-11). **Se aprueba también** que la 12.5 tome la validación de la lectura con el agente (H-1, AC-9) y la corrección de read-v1.

## Objetivo

Que **el agente de WhatsApp complete turnos contra el CRM en staging**, detrás del modo de prueba y con datos sintéticos, **sin pérdida de mensajes**. Un turno completo incluye resolver el cliente, registrar el mensaje en la conversación vigente, leer el catálogo, la información del negocio y el historial, registrar las respuestas y, cuando corresponde, derivar. Es el **gate de salida de la Fase 12** (Roadmap, §Fase 12).

**Resultado verificable**: después de la corrida, cada mensaje que el agente procesó, entrante o saliente, está en la conversación correcta del CRM, una sola vez y en orden. Incluye los mensajes de un turno interrumpido a propósito (D-2). El log del CRM muestra, para cada turno, qué operaciones hizo y cuántos pedidos consumió. La conciliación la hace un script versionado, no una lectura a ojo.

## Situación en la fase

- **Necesario ahora (12.5)**:
  - el gate de salida de la fase;
  - lo que le pasaron la 12.3, la 12.4 y la 11.4:
    - las lecturas por turno y R-6 (AC-19 de la 12.3, por decisión del usuario);
    - el despliegue de la `0024` y la validación del historial con el agente (12.4);
    - la pregunta de la cantidad en stock (N-1 de la 11.4);
  - **la validación de la lectura de catálogo e información con el agente** (H-1, abajo).
- **Cierra la Fase 12**: su cierre es el de la fase, con revisión independiente obligatoria (CLAUDE.md, porque cierra un gate).
- **Antes de producción, no acá** (Fase 13): tráfico real, datos reales, la retención de `messages` (13.4), los planes con volumen (13.2, que ya tiene AC-15 de la 12.3, R-8 de la 12.2 y H-3 de la 12.4) y la protección de rama (13.1).
- **Depende de trabajo en el repositorio del agente** (Roadmap, §Reglas comunes: el corte del agente ocurre en su repositorio, con sus briefs). El CRM no toca ese repositorio ni su instancia. Por eso la subfase se parte en dos etapas (D-10): la del CRM puede avanzar sola, y la del recorrido espera a que el agente esté listo.

## Contexto de negocio

Leído del documento de brechas (repositorio del agente, rama `agent/brechas-crm-airtable`, commit `b75e484`, con `git show`), del informe de la 12.3.3 del agente y de su respuesta del 2026-09-27. Es **solo contexto**, nunca una dependencia técnica.

- **Hoy cada turno hace al menos seis operaciones** antes del orquestador: cliente, conversación, dos del mensaje, historial y memorias. Después vienen las tools de catálogo e información, y el registro (brechas, §2).
- **El agente está pausado** desde el 2026-09-16: se agotó la cuota de Airtable (brechas, §2). El usuario no paga Airtable mientras no haya un cliente real.
- **Lo que el agente cambia de su lado** (brechas, §5): reemplazar sus nodos de Airtable por llamadas al CRM, registrar las respuestas enviadas, manejar los errores del CRM, adaptar sus suites y guardar las credenciales fuera de archivos versionados. **Cada cambio lleva su brief allá.**
- **Lo que el agente ya tiene** (su informe de la 12.3.3):
  - un adaptador que traduce el turno a los cuatro eventos v2;
  - un emisor que clasifica cada respuesta del CRM;
  - los dos **sin cablear a su pipeline**.
- **Dos condiciones que el agente tiene que cumplir antes de la 12.5**, fijadas por el CRM al cerrar la 12.3:
  - **H-2 del agente**: su buffer consolida varios mensajes de WhatsApp en un turno y hoy emite **un** `conversation.resolved` por turno. Hace falta uno por mensaje real, o el historial de la 12.4 y las métricas 4, 6 y 9 salen mal;
  - **su ADR de emisión no bloqueante**: tiene que conciliarse con «sin pérdida de mensajes», que es el gate.
- **Memorias**: el agente las lee hoy, pero nadie las escribe (`memory_count: 0`). El CRM no las tiene (brief-12.4, D-1), así que en la 12.5 **el agente trabaja sin memorias, como hoy**. No hace falta decidir nada nuevo.

## Hallazgos antes de diseñar (paso 5 de la planificación)

Reabrí y busqué con `grep`:
- el Roadmap (§Fase 12 y §Reglas comunes);
- [IntegrationBoundaries](../architecture/IntegrationBoundaries.md);
- [read-v1](../contracts/read-v1.md) e [ingestion-v2](../contracts/ingestion-v2.md);
- [Risks](../planning/Risks.md);
- las [notas del piloto 11.4](notas-piloto-11.4.md);
- el cierre de la 12.3.

**H-1 — La validación de la lectura con el agente quedó sin hacer y sin traslado formal.**
- La 11.3 le pasó a la 12.3 «validar los dos contratos con el agente». Así lo dice [read-v1](../contracts/read-v1.md), línea 7: «Productos e información del negocio se validan con el agente en la 12.3».
- La 12.3 validó **solo la ingestión**: la 12.3.3 no hizo ninguna lectura.
- Su cierre sí dejó escrito que «la lectura sigue sin emisor real hasta la 12.5», en IntegrationBoundaries y en el HANDOFF. Pero ni el brief de la 12.3 ni una decisión del usuario lo trasladaron, y read-v1 sigue diciendo 12.3. Es el patrón *An Obligation Assigned to Two Phases Is Assigned to None*.
- **Propuesta**: la 12.5 la toma de forma explícita (AC-9), y read-v1 se corrige con una nota fechada. **Es parte de lo que se aprueba.**

**H-2 — R-6 no se puede confirmar con datos sintéticos.**
- R-6 pregunta si un emisor manda el teléfono como nombre. Eso es un hecho de los perfiles reales de WhatsApp.
- La Fase 12 trabaja solo con datos sintéticos (brief-12.1, D-2). Un turno sintético puede probar que **la defensa funciona de punta a punta**, pero no con qué frecuencia pasa.
- Lo decide D-5.

**H-3 — La correlación de los `429` de lectura sigue sin existir.**
- La lectura v1 valida la correlación **después** del límite, así que un `429` de lectura no la tiene (Risks, revisión de la 11.3, R-1). La 12.3 lo corrigió para la ingestión v2, y no para la lectura (brief-12.3, D-6: «la lectura v1 no cambia»).
- **No lo cambio en la 12.5**: arreglarlo es un cambio de contrato, y el turno no depende de eso. Si en la corrida hay algún `429` de lectura, se registra con la hora y la credencial, que el log sí tiene.

**Sin contradicción**:
- la 12.5 no agrega rutas, tablas ni campos: usa las superficies existentes;
- la única migración nueva en staging es la `0024`, que ya pasó la CI;
- la dependencia sigue siendo unidireccional: el agente llama al CRM, y el CRM nunca llama al agente.

## Decisiones previas (las decide el usuario al aprobar)

### D-1 — Qué turnos se recorren

- **(A) Un guion de cinco turnos sintéticos, cada uno con un propósito.** **Recomendada.**
  1. **Cliente nuevo, primer mensaje**:
     - `client.resolved` crea el cliente y `conversation.resolved` abre la conversación;
     - lee el catálogo, la información y el historial;
     - registra la respuesta en dos segmentos.
  2. **La misma conversación, un turno con dos mensajes seguidos del cliente**: prueba la condición H-2 del agente, dos `conversation.resolved` en un turno. El historial devuelve el turno 1, incluidas las respuestas del agente.
  3. **Un turno que deriva**: `conversation.escalated`, y la conversación pasa a `pending`.
  4. **Un turno interrumpido a propósito**, que es D-2.
  5. **Un cliente nuevo cuyo perfil trae el teléfono como nombre**, que es D-5.
- **(B) Un solo turno completo.** Más rápido, pero no prueba ni el turno consolidado, ni el historial con contenido, ni la pérdida.
- **(C) Turnos libres**, sin guion. Parecido al uso real, pero no se puede conciliar contra un esperado escrito antes.

### D-2 — Cómo se demuestra «sin pérdida de mensajes»

El criterio de la fase dice «ninguna pérdida ante `CONFLICT`, timeout o falla del emisor». Desde el CRM no se puede provocar un timeout a pedido. Sí se puede provocar una indisponibilidad.

- **(A) Conciliación, más una interrupción controlada, más los dos `CONFLICT` deliberados.** **Recomendada.**
  - **Conciliación**: cada mensaje que el agente procesó está en el CRM una sola vez, contado por `external_ref`.
  - **Interrupción**: durante el turno 4, la ingestión se apaga (`404`). Los eventos de ese turno tienen que llegar **después**, cuando se vuelve a encender, sin duplicados.
  - **Los dos `CONFLICT`**: `conversation_ref_taken` (una referencia propuesta que ya es de otra conversación) y `message_already_recorded` (el mismo mensaje con otro `event_id`), con la reacción que manda la guía del emisor. Así se cubre también lo que la 12.3.3 no probó: la referencia devuelta distinta de la propuesta.
- **(B) Solo la conciliación.** Prueba que no se perdió nada cuando todo anduvo bien, y nada más.
- **Condición de detención**: si el diseño del agente descarta los eventos ante una indisponibilidad, el gate **no se cumple**. Se detiene y se eleva; no se da por cumplido con la conciliación sola.

### D-3 — Qué parte del agente corre de verdad

- **(A) La cadena real del agente**: su entrada, su buffer, su orquestador con el modelo, sus tools y su registro. **Recomendada.**
  - **La entrada es simulada** en su gateway, con un teléfono sintético. **El envío por WhatsApp va a un doble**: ningún mensaje sale a un número real.
  - Nivel: **validado en integración** (`producer-consumer`), en staging.
- **(B) Un caller temporal, como en la 12.3.3.** No es un turno del agente, sino un guion que imita su salida. No alcanza para el gate.
- **(C) WhatsApp real con el teléfono de quien prueba.** Sería `authenticated-end-to-end`, pero mete datos personales reales en staging. Eso reabre D-2 de la 12.1 y la retención (R-3), y no lo recomiendo en la Fase 12.

### D-4 — Credenciales

- **(A) Tres credenciales de la organización del piloto**: `ingest`, `read` y `context`. **Recomendada.**
  - Cada una con su alcance, como fijaron la 11.3 y la 12.4. Las de `read` y `context` van juntas en la allowlist de la lectura.
  - **Las crea el usuario en su terminal**, y cada token va directo a su credencial en n8n, como en la 12.3.3. Ningún token pasa por la conversación con el asistente.
  - Al terminar, las tres se revocan y la ingestión y la lectura se apagan.
- **(B) Dos credenciales**, sumando el historial a `read`. Deshace D-6 de la 12.4 y no lo recomiendo.

### D-5 — R-6: el teléfono como nombre

- **(A) Probar la defensa de punta a punta y dejar la frecuencia para la 13.5.** **Recomendada.**
  - El turno 5 manda un perfil con el teléfono como nombre: la guarda del agente lo vuelve `null`, y el CRM crea «Sin nombre».
  - Una variante deliberada manda el teléfono **en formato local**, sin el código de país. Pasa las dos guardas: es el límite escrito en ingestion-v2.
  - Con eso **R-6 queda mitigada en la cadena, con el límite medido**. Cuánto pasa con perfiles reales se mide en la 13.5, que es la primera con datos reales.
- **(B) Además, cerrar el límite del formato local.** Comparar también contra el teléfono sin el código de país. Es un cambio del validador v2, con test y mutación, y lo haría en la etapa 12.5.1.
- **(C) Usar el perfil real de quien prueba.** Reabre D-2 de la 12.1. No lo recomiendo.

### D-6 — Despliegue a staging

- **(A) Desplegar `main` con la migración `0024`**, siguiendo el README, con un backup antes y las comprobaciones posteriores. **Recomendada.**
  - Es la segunda corrida real del README (E-1): si una línea falla, se corrige con lo que funcionó.
  - **Ejecutar la migración contra la base de staging necesita la autorización del usuario en el momento**, por CLAUDE.md.
- No hay alternativa razonable: sin la `0024` no existe la credencial `context`, y el historial no se puede leer.

### D-7 — Cómo concilia el CRM

- **(A) Un script versionado, `scripts/conciliar-turnos.ts`.** **Recomendada.**
  - Recibe el `source` y la ventana, y devuelve **solo conteos y referencias opacas**:
    - eventos por tipo y estado;
    - mensajes por conversación y dirección;
    - duplicados por `external_ref`;
    - la métrica 12 de la ventana.
  - **No devuelve teléfonos ni textos.**
  - **Lo corre el usuario**, porque el clasificador del modo automático no deja que el asistente lea la base de staging, y no se busca otro camino.
  - El asistente sí lee el log del servidor, que no tiene datos personales, y cuenta los pedidos por turno y por ruta usando la correlación.
- **(B) Consultas sueltas pegadas en el chat**, como en la 12.3.3. Sirven, pero no quedan versionadas ni se pueden repetir igual.

### D-8 — Fixtures de la lectura

- **(A) Capturar las respuestas de lectura que recibió el agente** y guardarlas como fixtures de read-v1 con `"shape": "captured"`, validadas con los esquemas estrictos en CI, como se hizo con la ingestión en la 12.3.3. **Recomendada.**
- **(B) No capturarlas**: read-v1 seguiría con forma asumida después del gate.

### D-9 — La cantidad en stock (N-1 de la 11.4)

- **(A) Preguntarle al agente** si sus tools necesitan la cantidad y registrar la respuesta. **Recomendada.**
  - Si la necesitan, es un **cambio de contrato de lectura** que va como subfase propia, con destino escrito. No entra en la 12.5.
  - Si no, N-1 se cierra.
- **(B) Agregarla ya.** Es un campo nuevo en una respuesta existente, que exige v2 del contrato de lectura (read-v1, §Versionado). No lo recomiendo sin la respuesta del agente.

### D-10 — Etapas

- **12.5.1 — Preparación del CRM** (`isolated-runtime`). **No depende del agente.**
  - el despliegue de D-6;
  - `scripts/conciliar-turnos.ts`, con sus tests;
  - `scripts/probar-api-lectura.ts` ampliado con el historial y una credencial `context`, corrido en staging;
  - el README con el encendido de la credencial `context`;
  - la corrección de read-v1 (H-1).
  - Termina con todo apagado.
- **12.5.2 — El recorrido con el agente** (`producer-consumer`). **Empieza cuando el agente informe que su lado está listo:**
  - un evento por mensaje real (H-2 del agente);
  - el emisor cableado;
  - las tools de lectura apuntando al CRM;
  - el filtro de tokens con `crm_ctx_`;
  - su ADR conciliado con «sin pérdida».

  Incluye la ventana, el guion de D-1, la conciliación, las capturas, la revisión independiente y el cierre de la fase.
- **Cada etapa empieza con la CI de la anterior en verde.**

### D-11 — Revisión independiente y cierre de la fase

- **Obligatoria**, al final de la 12.5.2 y antes del cierre. Es el gate de la fase (CLAUDE.md).
- **El cierre de la 12.5 es el cierre de la Fase 12**:
  - CHANGELOG de la fase;
  - HANDOFF;
  - Notion: el proyecto de la fase y su tarea espejo a «Completado»;
  - vault.

  Cada acción, con la autorización del usuario.

## Alcance incluido

**12.5.1**
- El despliegue de `main` a staging con la `0024` (D-6).
- `scripts/conciliar-turnos.ts` (D-7), con tests contra PostgreSQL real.
- `scripts/probar-api-lectura.ts`: el historial, con una credencial `context`.
- El README de staging: encender y apagar la lectura con `read` y `context`.
- read-v1: el estado corregido (H-1).

**12.5.2**
- Una o más ventanas de staging, con las tres credenciales (D-4).
- El guion de D-1, con la interrupción y los `CONFLICT` de D-2 y los casos de D-5.
- La conciliación, los pedidos por turno (lectura y escritura), los `429`, las capturas como fixtures (D-8) y la respuesta sobre N-1 (D-9).
- La revisión independiente y el cierre de la fase.

## Alcance excluido

- Todo cambio del lado del agente. Su repositorio y su instancia son de él (Roadmap, §Reglas comunes).
- Rutas, tablas o campos nuevos, y cualquier cambio de contrato. La única excepción posible es D-5 (B), si se elige.
- Memorias (brief-12.4, D-1).
- La correlación en los `429` de lectura (H-3).
- Tráfico real de WhatsApp y datos personales reales (D-3 y D-5).
- Producción, retención y planes con volumen (Fase 13).

## Archivos o componentes autorizados

**12.5.1**
- `scripts/conciliar-turnos.ts` (nuevo) y su test en `tests/integration/`
- `scripts/probar-api-lectura.ts`
- `deploy/staging/README.md`
- `docs/contracts/read-v1.md` (estado y evidencia)
- `docs/decisions/evidencia-12.5-turno-completo.md` (nueva)
- Staging: despliegue, migración `0024`, `app.env` para encender y apagar, con autorización en el momento.

**12.5.2**
- `tests/fixtures/read/v1/captured-*.json` y `src/app/api/read/v1/contract.test.ts` (su recorrido)
- `tests/fixtures/ingestion/v2/captured-*.json`, si aparecen formas nuevas
- `docs/planning/Risks.md` (pregunta 5, R-6 y N-1)
- `docs/analytics/MetricsCatalog.md`, solo notas de medición
- `docs/architecture/IntegrationBoundaries.md` (el gate de la lectura)

**Todas las etapas**
- Este brief, la evidencia, `docs/decisions/README.md`, `docs/planning/Roadmap.md`, `CHANGELOG.md` y `HANDOFF.md`.

**Si se elige D-5 (B)**: `src/modules/ingestion/contract-v2.ts`, `contract-v2.test.ts` y la línea de `client.display_name` de ingestion-v2.

Tocar cualquier otro archivo se detiene y se pide al usuario.

## Fuentes de verdad

- Roadmap §Fase 12: el gate de salida y los criterios de la fase.
- [ingestion-v2](../contracts/ingestion-v2.md) (guía del emisor) y [read-v1](../contracts/read-v1.md).
- [brief-12.3](brief-12.3-contrato-de-ingestion-v2.md) (§Cierre) y [brief-12.4](brief-12.4-historial-y-memorias.md) (§Cierre).
- [evidencia-12.3](evidencia-12.3-ingestion-v2.md) §12.3.3: cómo se abre y cierra una ventana.
- [MetricsCatalog](../analytics/MetricsCatalog.md) §12, con sus exclusiones.
- `deploy/staging/README.md`.

## Invariantes

- **Solo datos sintéticos**: teléfonos del rango `+54911555500xx` y textos inventados. Una captura con un dato personal real se descarta sin versionar, y se detiene.
- **Ningún token pasa por la conversación con el asistente**, ni entero ni en parte.
- **Todo termina apagado**: ingestión y lectura en `404`, y las tres credenciales revocadas. Se comprueba, no se supone.
- **La dirección no se invierte**: un problema de contrato vuelve al CRM como hallazgo y nunca se sortea del lado del agente (ADR 0014).
- **Ningún rechazo inesperado se corrige tocando el contrato** antes de registrarlo como hallazgo.
- **El CRM no llama al agente.**

## Criterios de aceptación

**12.5.1**
- **AC-1**: staging corre `main` con las migraciones `0000` a `0024`. Hubo backup antes, las comprobaciones posteriores se hicieron y el README quedó corregido con lo que funcionó (E-1).
- **AC-2**: `probar-api-lectura.ts` recorre en staging productos, información e historial, con una credencial `read` y otra `context`, y da 0 fallas contra los esquemas estrictos. La `read` recibe `403` en el historial, y la `context` recibe `403` en el catálogo.
- **AC-3**: `conciliar-turnos.ts` devuelve los conteos de D-7 sin teléfonos ni textos. Sus tests cubren un turno completo, un duplicado y un mensaje faltante, y una corrida de mutación prueba que detecta el faltante.
- **AC-4**: read-v1 corregido (H-1). La etapa termina con todo apagado y las credenciales de prueba revocadas.

**12.5.2**
- **AC-5**: se recorren los cinco turnos de D-1, con la cadena real del agente (D-3) y datos sintéticos.
- **AC-6**: **sin pérdida de mensajes**.
  - La conciliación da cada mensaje procesado por el agente una sola vez, en su conversación.
  - Los eventos del turno interrumpido llegan después de la reapertura, sin duplicados.
  - Los dos `CONFLICT` terminan con el mensaje guardado, según la guía.
- **AC-7**: el historial que lee el agente en el turno 2 trae el turno 1 completo, incluidas las respuestas del agente, en orden y con su autor.
- **AC-8**: los pedidos por turno quedan medidos por ruta en el log, tanto de lectura como de escritura, junto con los `429` observados. Quedan en Risks (pregunta 5).
- **AC-9**: la lectura de catálogo, información e historial queda validada con el agente como consumidor (H-1). Las capturas de respuestas son fixtures `"shape": "captured"` que pasan los esquemas estrictos en CI (D-8).
- **AC-10**: R-6 queda como decida D-5, y registrada en Risks.
- **AC-11**: la respuesta del agente sobre la cantidad en stock queda registrada, y N-1 queda cerrada o con destino (D-9).
- **AC-12**: la métrica 12 de la ventana coincide con el conteo a mano, con las exclusiones del catálogo. Las métricas del dashboard del día son coherentes con el guion.
- **AC-13**: todo termina apagado, las tres credenciales se revocan y se comprueba.

**Todas las etapas**
- **AC-14**: pasan lint, tipos, formato, unitarios, guardas, integración y end-to-end, y la CI queda en verde en cada commit.
- **AC-15**: la revisión independiente se hace antes del cierre (D-11). Cada hallazgo se verifica contra el código antes de aceptarse.
- **AC-16**: cada caso nuevo lleva en su nombre el requisito que prueba, o la salvedad de la 12.1 (R-3).

## Pruebas y evidencia requerida

- **12.5.1: `isolated-runtime`**, o sea validado en staging, con requests sintéticos a través del borde real. Por commit se corren `lint`, `typecheck`, formato, `test`, `build` y `test:e2e`, y se lee la CI por `headSha` y `conclusion`.
- **12.5.2: `producer-consumer`**, o sea **validado en integración, en staging**, con el agente como productor de la ingestión y consumidor de la lectura, y datos sintéticos.
  - **No** es `authenticated-end-to-end`: ningún mensaje real de WhatsApp.
  - **No** es producción.
- Cada corrida de mutación se registra con su salida, incluida la que no tenga efecto.
- La evidencia separa lo que vio el CRM (respuestas, log, filas, dashboard) de lo que solo consta en el agente.

## Condiciones de detención

- **El agente no está listo**: la 12.5.2 no empieza. La 12.5.1 puede cerrar sola, y la fase queda abierta.
- **Se detecta una pérdida de mensajes**, o el diseño del agente descarta eventos ante una indisponibilidad: el gate no se cumple. Se detiene y se eleva.
- **Un rechazo inesperado**: se registra como hallazgo antes de tocar nada.
- **Un dato personal real, o un token, en una captura o en el chat**: se descarta sin versionar, se rota la credencial si hace falta, y se detiene.
- **El clasificador del modo automático bloquea una acción**: no se busca otro camino. La corre el usuario o se le pregunta.
- **Hace falta tocar un archivo fuera de la lista**, o cambiar un contrato: se detiene y se pide al usuario.
- **El agente pide un cambio de contrato**: vuelve como hallazgo y lo decide el usuario. No se implementa dentro de la 12.5.

## Decisiones del usuario durante la implementación

**Respuesta del agente al pedido de la 12.5** (2026-09-27, fuera del repositorio, leída como insumo):
- de las cinco condiciones de entrada, **una está hecha** (el filtro de tokens), **una es chica** (un `conversation.resolved` por mensaje) y **tres son subfases con brief propio** allá (el emisor cableado, las tools de lectura y una cola durable con su ADR);
- **con su diseño de hoy, los eventos que no entran se descartan.** El gate «sin pérdida» no se cumple hasta que construyan esa cola;
- no dan fecha hasta tener las respuestas a sus H-5 y H-7;
- devolvieron tres hallazgos de contrato. Cada uno se verificó contra los documentos del CRM, y el usuario decidió los tres con las recomendaciones, el 2026-09-27.

- **H-5 del agente, el turno 4 no se podía cumplir.** La guía decía, para `401`, `403` y `404`, «no reenvía hasta corregir la configuración», y se leyó como «descarta».
  - **Decisión: aclarar la guía**, sin cambiar respuestas. Un error de configuración detiene el envío, no el evento: el emisor lo retiene, avisa y lo reenvía idéntico cuando se corrige. Vale para los tres códigos.
  - Se descartó responder `503` en el apagado de mantenimiento: es un cambio de respuesta que alcanza también a v1, y el `404` existe para que la ruta apagada no se vea.
  - `ingestion-v2.md` no estaba en la lista de la 12.5, y **lo autorizó el usuario**.
- **H-6 del agente, `GET /knowledge` exige todas las palabras**, y el agente pregunta en lenguaje natural.
  - **Decisión: la tool pide `/knowledge?limit=50` sin `q`**, que devuelve toda la información vigente, y filtra de su lado. Es un solo pedido, sin cambio de contrato.
  - **Disparador registrado**: si una organización supera las 50 entradas vigentes, o la calidad de las respuestas lo muestra, el CRM agrega búsqueda por «cualquier palabra», en una subfase propia.
  - **Se le avisa** que la búsqueda de productos tiene la misma semántica (`read-v1`, §Productos).
- **H-7 del agente, leer el historial obliga a esperar al CRM.**
  - **Recomendación del CRM**, porque la decisión es de la arquitectura del agente: emitir el entrante esperando la respuesta, con un tiempo máximo corto. Si responde, lee el historial del CRM; si no, deja el evento en la cola y responde con su historial propio.
  - Se desaconseja guardar la referencia del turno anterior: pasadas las 24 horas, el mensaje nuevo cae en otra conversación y la referencia guardada leería la vieja.
  - El turno 2 del guion sigue valiendo.
- **Los dos `CONFLICT` sin sembrar nada**:
  - `conversation_ref_taken`: el agente propone, para el cliente del turno 5, la referencia de la conversación de la 12.3.3 (`wa-conv-wamid-fict-p20260927182133-0001`), que es de otro cliente;
  - `message_already_recorded`: reenvía un mensaje del turno 1 con otro `event_id`.
  - **Enmendado el mismo día por H-8**, abajo: la primera salida no funciona.
- **La ventana: dos de 60 minutos.** La primera, con los turnos 1 a 3; la segunda, con la interrupción del turno 4, el turno 5 y los dos `CONFLICT`.
- **N-1 cerrada**: el agente no necesita la cantidad en stock. Coincide con lo que se decidió en las brechas (B-8). Adaptar su prompt de ventas al `stock_status` es trabajo de ellos.
- **El doble de WhatsApp tiene que devolver un id distinto por segmento.** Es precondición del agente, y `conciliar-turnos.ts` marca uno repetido como duplicado.

**Segunda respuesta del agente** (2026-09-27, fuera del repositorio): acepta H-5, H-6 y H-7 y se compromete con cuatro subfases propias, en orden: el turno por mensaje, la cola durable con su ADR, las tools de lectura y el cableado. La primera ventana va después de la cuarta, y las fechas las fija el usuario. Trae dos hallazgos, que se verificaron contra el código del CRM, y el usuario decidió los dos con las recomendaciones, el 2026-09-27:

- **H-8, la semilla del `409 conversation_ref_taken`.** El agente no elige la referencia que propone: la deriva del id del mensaje de WhatsApp (`wa-conv-` más ese id), sin un camino para cambiarla, y no quiere agregar uno solo para la prueba.
  - **Su motivo, corregido**: dice que con la referencia de la 12.3.3 el mensaje del turno 5 quedaría en la conversación vieja. No es así: el `external_ref` de un mensaje es único **por conversación** (`messages_organization_conversation_external_ref_unique`, migración `0011`), y el reenvío lo guardaría en la conversación nueva. Pero la organización quedaría con dos mensajes con el mismo `external_ref`, y `conciliar-turnos.ts` lo marcaría como duplicado. La conclusión sigue en pie por ese otro motivo.
  - **Decisión: sembrar la referencia por el contrato de ingestión**, sin código nuevo ni escrituras a mano en la base, como **primer paso de la segunda ventana**. Son un `client.resolved` y un `conversation.resolved` de un cliente sintético que no está en el guion (`+5491155550090`), con `source` `siembra-12-5-2`:
    - la referencia propuesta es `wa-conv-wamid-fict-t5-conflict-0001`, la que el agente va a proponer en el turno 5;
    - el mensaje lleva otro `external_ref`, `wa-msg-seed-h8-0001`. El CRM crea siempre la conversación con su primer mensaje, así que lo que se garantiza es que **no exista** `wa-msg-wamid-fict-t5-conflict-0001`, que es lo que el agente necesita.
  - La semilla no entra en la conciliación del agente, que filtra por `source`. **Sí suma un `conversation.resolved` a la métrica 12**, que es de toda la organización: el conteo a mano del AC-12 lo incluye.
  - Esto reemplaza la primera salida de «Los dos `CONFLICT` sin sembrar nada».
- **`message_already_recorded`** lo provoca un **llamador temporal**: el cuerpo exacto de un mensaje del turno 1 con otro `event_id`, como en la 12.3.3, porque el agente deriva también el `event_id` del id del mensaje. Se declara como prueba **del emisor y su clasificador**, no de la cadena real, y va fuera de la lista de esperados. No altera la conciliación: el CRM responde `409` y no guarda nada.
- **E-1 del agente**: su emisor clasificaba `conversation_ref_taken` como «reintentar con referencias nuevas», pero no tenía con qué generarlas. Lo arreglan en la subfase de la cola, con un sufijo de intento. No cambia el contrato: las referencias son opacas. El turno 5 es su primera prueba real (AC-3 de la 12.3, que allí quedó cumplido pero no discriminante).
- **El turno 4 llega junto y tarde.** Con H-7, si el entrante no entra, las salidas de ese turno tampoco, porque necesitan la referencia que devuelve `conversation.resolved`. La cola drena el turno entero, en orden, cuando la ingestión vuelve. `conciliar-turnos.ts` cuenta por el `created_at` del CRM y la conversación se elige por `sent_at`, así que no se rompe: **el `--hasta` de la conciliación se fija después de que la cola terminó de drenar**.
- **H-9, `/knowledge` sin total.** Sin total ni paginación, el consumidor no puede saber si la respuesta vino recortada a 50. El agente tratará 50 ítems exactos como posible recorte y lo registrará. **Decisión: anotarlo como límite conocido en `read-v1.md`**, sin cambiar el contrato. Lo cubre el disparador de H-6.

## Resultados — etapa 12.5.1

**Autoevaluación** (`self_assessment: true`), del 2026-09-27. Las salidas están en [evidencia-12.5](evidencia-12.5-turno-completo.md).

| AC | Resultado | Evidencia |
|---|---|---|
| AC-1 | cumplido | staging en `c530558` con `0000` a `0024`, backup previo y el despliegue funcionó tal como está en el README. Comprobaciones 1, 3 y 4 hechas por quien hizo el trabajo; la 2 y la 5, por el usuario. Dos hallazgos: E-3, la advertencia de npm 11.19 sobre los `postinstall` de esbuild, abierto; y E-4, la comprobación 2 del README, que no pedía el mínimo de 12 caracteres ni mostraba la hora de la fila, corregido |
| AC-2 | cumplido | 0 fallas en staging con `read` y `context`. Log sin tokens ni la referencia. Todo apagado y las dos credenciales revocadas |
| AC-3 | cumplido | `conciliar-turnos.ts`: 7 casos contra PostgreSQL real, M26 y M27 |
| AC-4 | cumplido | read-v1 corregido (H-1), y todo terminó apagado |
| AC-14 | cumplido en local y en la CI de `c530558` | 1379 de 1379, 100 de 100 end-to-end |
| AC-16 | cumplido | los casos nuevos llevan FR-API-07 |

**Nivel**: la lectura de las tres rutas queda **validada en staging** (`isolated-runtime`), con requests sintéticos. **No** con el agente.

**Estado de la 12.5.2**: **no empieza** hasta que el agente complete su lado: el turno por mensaje, la cola durable con su ADR, las tools de lectura y el cableado. La Fase 12 queda abierta.
