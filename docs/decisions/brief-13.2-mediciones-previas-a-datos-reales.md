---
schema: task-brief.v1
task_id: "13.2"
task_type: runtime-validation
generated_at: 2026-09-30
---

# Brief: 13.2 — Mediciones previas a exponer datos reales

**Estado: aprobado el 2026-09-30 por el usuario, con las recomendaciones de D-1 a D-7.** Eso fija: la medición en el droplet de producción, en una base aparte que se borra al terminar, con un ensayo previo en un contenedor (D-1); un segundo checkout, sin desplegar (D-2); la distribución de la 9.3 más precios, información del negocio y la conversación concentrada (D-3); el umbral recalibrado en esa máquina (D-4); los bordes de R-8 demostrados con tests antes de decidir cualquier cambio en `src/` (D-5); solo lo patológico se corrige, y una migración se consulta antes (D-6); revisión independiente al final (D-7). La aprobación no autoriza ningún efecto sobre un servidor: cada uno se autoriza en su turno.

- **Nivel de evidencia objetivo**: `deterministic` para la etapa local, e `isolated-runtime` para la medición, con datos sintéticos y sin tráfico real.
- **Nivel de validación alcanzable**: planes y tiempos **medidos con volumen sintético**. No es «preparado para producción»: faltan la 13.3 y la 13.4, y la distribución real de un negocio no se conoce hasta la 13.5.
- **Orden**: segunda subfase de la Fase 13 ([Roadmap](../planning/Roadmap.md), §Fase 13). No cierra ningún gate.

## Objetivo

Tener, antes de que entre el primer dato real, las mediciones que la integración va a citar: qué plan elige PostgreSQL para cada consulta del producto, con su salida cruda y su tiempo, en los casos desfavorables conocidos. Y cerrar con evidencia las dudas de concurrencia y de plan que las Fases 9 y 12 dejaron registradas sin medir.

## Situación en la fase

La 13.1 dejó el entorno productivo arriba, sin datos de clientes. La 13.2 no necesita tráfico real y no expone nada. Lo que mida lo usan la 13.3 (qué vigilar) y la 13.5 (qué esperar con el primer negocio).

### Obligaciones que toma

| Id | Qué pide | De dónde viene |
|---|---|---|
| O-2 | Si alguna consulta pasa al plan genérico de las sentencias preparadas, leyendo antes cómo las prepara el driver | [evaluación 10.1](evaluacion-10.1-mvp.md), §5 |
| O-39 | Lo que la 9.3 dio por medido sin medirlo: planes con salida cruda y tiempo para todo su alcance (R-3, R-4), el peor caso de la paginación profunda (R-6), el dashboard completo con la métrica 12 y el resultado de cada llamada (R-1, R-9), y la ventana del manifiesto de la 9.2 (R-10) | evaluación 10.1, §5 y §6 |
| AC-15 de la 12.3 | El plan de la consulta de la conversación vigente, con volumen, desde una organización grande y una chica | [brief-12.3](brief-12.3-contrato-de-ingestion-v2.md), §Cierre |
| R-8 de la 12.2 | El modo de bloqueo del cliente (`FOR UPDATE` contra `FOR NO KEY UPDATE`) y la candidata que un `admin` cierra en ese momento | [brief-12.2](brief-12.2-conversacion-vigente-y-derivacion.md), §Revisión independiente |
| H-3 de la 12.4 | El plan del historial de una conversación que concentra gran parte de los mensajes de su organización | [brief-12.4](brief-12.4-historial-y-memorias.md), H-3 y R-8 |
| Nota de la 9.3 | Revisar si la distribución de organizaciones elegida sigue siendo una hipótesis razonable | [brief-9.3](brief-9.3-datos-de-volumen-en-staging.md), §Lo que no va a poder demostrar |

## Hallazgos antes de diseñar

Todo lo de esta sección está leído o medido el 2026-09-30. Las lecturas del servidor fueron de solo lectura.

- **H-1. La aplicación no usa sentencias preparadas con nombre.** Un agente de solo lectura lo leyó en los paquetes instalados, y verifiqué sus citas:
  - `pg` 8.23.0, `lib/query.js:35-58`: una consulta se prepara con nombre solo si su configuración trae `name`. Con parámetros y sin `name`, usa la sentencia sin nombre; sin parámetros, el protocolo simple.
  - `drizzle-orm` 0.45.2, `node-postgres/session.js:21-23` y `pg-core/query-builders/select.js:797`: el nombre solo llega con `.prepare("nombre")`. Las consultas normales y `db.execute` pasan `name: undefined`.
  - En `src/`, `scripts/` y `seeds/` no hay ningún `.prepare(`.

  **Lo que eso no prueba**: que PostgreSQL planifique la sentencia sin nombre con los valores de cada ejecución es conducta del servidor. Es una **inferencia** hasta comprobarla por efecto. Tampoco se leyó si `plan_cache_mode` está cambiado en el servidor o en un rol.
- **H-2. Parte de O-39 ya está hecha en el instrumento, no en la medición.** La 11.0 corrigió `scripts/medir-caminos.ts`: llama a la métrica 12 (R-1) y registra el resultado de cada corrida (R-9). Nunca se volvió a correr con volumen. Lo que sigue sin hacer:
  - la salida cruda de `EXPLAIN` de cada consulta (R-3, R-4);
  - la última página: el script pide la página 100 de clientes y la 20 de productos (R-6);
  - la ventana del manifiesto (R-10).
- **H-3. El script no mide las consultas de la Fase 12.** No llama a la resolución de la conversación vigente (12.2) ni al historial de una conversación (12.4), que son dos de las obligaciones de esta subfase.
- **H-4. El seed de volumen no siembra lo que agregó la Fase 11.** `seeds/volume.ts` no toca `product_prices` ni `knowledge_entries`. Las lecturas del catálogo y de la información del negocio, medidas con ese seed, corren sin precios y sin entradas.
- **H-5. Ningún seed actual produce el caso de H-3 de la 12.4.** El seed reparte entre 1 y 12 mensajes por conversación. No hay una conversación que concentre una fracción grande de los mensajes de su organización.
- **H-6. Producción no tiene volumen y no puede recibirlo.** La base `crm_production` pesa 8.926 kB. «Ningún seed corre contra la base productiva» es un invariante de la 13.1, y los seeds rechazan ese nombre.
- **H-7. Staging sigue sin servir para tiempos.** Un núcleo y 961 MB ([brief-9.3](brief-9.3-datos-de-volumen-en-staging.md)), con otros parámetros de costo que producción (`effective_cache_size` 600 MB contra 1 GB) y sin la collation ICU `es`.
- **H-8. El droplet de producción tiene margen.** Un núcleo, 1.967 MB de RAM con 1.439 MB disponibles, y 44 GB libres en disco. No recibe tráfico.
- **H-9. El bloqueo de R-8 está en dos lugares.** `lockClientIdByPhoneE164` (`src/modules/crm/repository.ts:329`) toma `FOR UPDATE` sobre el cliente. La consulta de la vigente (`src/modules/conversations/repository.ts:476`) termina en `limit 1 for update`.

## Decisiones previas (las decide el usuario al aprobar)

### D-1 — Dónde se mide con volumen

- **(a) En el droplet de producción, en una base aparte.** Una base `crm_medicion_test` en el mismo PostgreSQL, con un rol propio, que se borra con `DROP DATABASE` al terminar. `crm_production` no se toca, y los seeds la siguen rechazando por nombre.
  - A favor: es la misma máquina, la misma versión, los mismos parámetros de costo y la misma collation. Por primera vez los tiempos significan algo para producción. Hoy no hay tráfico: es el momento más barato.
  - En contra: carga la máquina productiva durante la medición, y pone datos sintéticos en el servidor productivo, aunque en otra base.
- **(b) En staging**, recargando el volumen como en la 9.3. No toca producción. Los tiempos no transfieren (H-7) y los planes transfieren solo en parte, porque los parámetros de costo son otros.
- **(c) En un contenedor local** con la configuración de producción. No toca ningún servidor. La forma del plan transfiere; los tiempos, no.

**Recomendación: (a), con un ensayo previo en (c).** El ensayo prueba el instrumento antes de tocar el servidor. Condiciones de (a): el registro de sentencias se enciende solo en el rol de medición, nunca en los de producción; el backup diario no incluye la base de medición; y se comprueba que `/login` responde durante la carga.

### D-2 — Con qué código corre la medición en el droplet (solo si D-1 es (a))

- **(a) Un segundo checkout**, en `/var/lib/crm-production/medicion`, en el SHA de la etapa local. `/srv/crm-production` no cambia y no hay despliegue.
- **(b) Desplegar** el SHA de la etapa local a producción y medir desde `/srv/crm-production`.

**Recomendación: (a).** Medir no tiene por qué cambiar lo que corre en producción.

### D-3 — Qué datos se siembran

- **(a) La distribución de la 9.3** (una organización de 10.000, tres de 1.000 y dieciséis de 50), más lo que falta: precios e información del negocio (H-4) y una organización con el caso de la conversación concentrada (H-5).
- **(b) Una distribución nueva**, pensada desde el primer negocio.

**Recomendación: (a).** Permite comparar con la 9.3 y cubre los casos nuevos. La distribución sigue siendo una hipótesis: no hay uso real que la corrija hasta la 13.5, y se declara así.

### D-4 — Qué umbral vale

- **(a) Recalibrar en esta máquina**: reproducir la tanda de la 8.5 con una sola organización, obtener el factor y escalar los 200 / 400 ms. Es lo que se hizo en la 9.3 (D-3).
- **(b) Sin umbral de tiempo**: el veredicto es solo la forma del plan.

**Recomendación: (a).** Las dos reglas de la 9.3 siguen rigiendo: todo recorrido secuencial se registra aunque cumpla, y un plan que cambia de forma entre la organización grande y la chica se registra siempre. El umbral detecta patologías; no es una promesa de latencia.

### D-5 — R-8: qué se hace con los dos bordes de concurrencia

- **(a) Demostrarlos con tests y decidir después.** Un test con tres conexiones muestra si `FOR UPDATE` sobre el cliente hace esperar a una inserción que solo necesita la clave foránea. Otro muestra si cerrar la candidata en ese momento crea una segunda conversación. Con el resultado a la vista, el usuario decide si se cambia algo en `src/`.
- **(b) Cambiar a `FOR NO KEY UPDATE`** directamente, y volver a medir la mutación M1 de la 12.2.
- **(c) Dejarlos registrados** como bordes aceptados, sin test.

**Recomendación: (a).** Ningún cambio en `src/` se escribe sin consultarlo antes, con el test que lo justifica.

### D-6 — Qué se hace si un plan resulta patológico

**Recomendación: el criterio de la 8.5 y de la 9.3** (D-7): se corrige solo lo patológico, con el plan de antes y de después, y una migración de índice se consulta antes de escribirla. Un índice nuevo implica una migración en producción, que es otro turno y otra autorización.

### D-7 — Revisión independiente

La 13.2 no abre ni cierra un gate, así que la regla no la obliga. Pero la 9.3 tampoco cerraba uno, y sus números se citaron mal durante dos fases.

**Recomendación: sí, una revisión independiente de solo lectura** al final, contra este brief y la evidencia, antes de que la 13.5 cite algún número.

## Escala de severidad, fijada antes de empezar

- **Crítico**: un dato sintético en `crm_production`, un secreto o una IP en el repositorio, o la aplicación productiva caída por la medición.
- **Mayor**: un número o un plan afirmado sin su salida cruda; un plan medido sobre una consulta que no es la que corre la aplicación; una medición que no cubre el caso que dice cubrir.
- **Menor**: un recuento que no cierra, un comando no literal, una frase de estado vieja.

## Alcance incluido

**Etapa 13.2.1 — local**

1. Comprobar H-1 por efecto, contra PostgreSQL 18.6 en el contenedor de desarrollo.
2. Una guarda que falle si aparece en `src/` una sentencia preparada con nombre, con su caso de falla demostrado.
3. Extender `seeds/volume.ts` según D-3.
4. Extender `scripts/medir-caminos.ts`: la última página de cada listado, la conversación vigente, el historial, y la captura de la salida cruda de `EXPLAIN (ANALYZE, BUFFERS)` de la consulta que la aplicación corre, no de una copia.
5. Los tests de R-8 según D-5.
6. El ensayo completo en un contenedor con la configuración de producción.

**Etapa 13.2.2 — la medición** (según D-1)

7. Crear la base y el rol de medición, sembrar, medir desde la organización grande y desde una chica, y calibrar el umbral según D-4.
8. Medir la ventana del manifiesto: cuánto pasa entre el inicio del dump y la consulta de recuentos, con el volumen cargado.
9. Borrar la base y el rol de medición, y comprobar que `crm_production` quedó igual: mismos recuentos antes y después.
10. Actualizar `Risks.md` y los documentos que citan números de la 9.3.

## Alcance excluido

- Cualquier dato real, y cualquier escritura en `crm_production`.
- Encender la ingestión o la API de lectura en producción.
- Concurrencia de carga: ni usuarios simultáneos ni pruebas de estrés. R-8 se prueba con tres conexiones, de forma determinista.
- La observabilidad y las alertas (13.3), la retención y el borrado (13.4).
- Corregir un plan que no sea patológico, y cualquier índice no consultado (D-6).
- Cambiar `shared_buffers`, `work_mem` o los parámetros de costo de producción. Si la medición sugiere cambiarlos, se registra y se decide aparte.
- Las tres tareas sueltas de la 13.1 (`contrib`, `module-boundary`, `.gitattributes`).

## Archivos o componentes autorizados

- `seeds/volume.ts` y sus tests.
- `scripts/medir-caminos.ts`.
- `tests/guards/` (una guarda nueva) y `tests/integration/` (los tests de R-8 y del seed).
- `docs/decisions/` (este brief y una evidencia nueva), `docs/planning/Risks.md`, `docs/planning/Roadmap.md`, `docs/architecture/TraceabilityMatrix.md`, `docs/development/EngineeringStandards.md` (la lista de guardas), `CHANGELOG.md`, `HANDOFF.md`.
- `src/`: **nada**, salvo lo que el usuario apruebe por D-5 o D-6, archivo por archivo.
- En el droplet, solo con D-1 (a): la base y el rol de medición, y el directorio de D-2. Nada bajo `/srv/crm-production` ni `/etc/crm-production`.

## Fuentes de verdad

El código y las migraciones; [DataModel](../architecture/DataModel.md); la [evaluación 10.1](evaluacion-10.1-mvp.md), §5 y §6; los briefs 8.5, 9.3, 12.2, 12.3 y 12.4; el [ADR 0013](0013-rol-de-aplicacion-y-tablas-de-solo-insercion.md).

## Dependencias

La 13.1 cerrada. Docker Desktop en la máquina local. Para D-1 (a), el acceso `ssh crm-production`.

## Invariantes

- **Ningún dato sintético entra a `crm_production`**, y sus recuentos son iguales antes y después.
- **La aplicación productiva sigue respondiendo** durante la medición.
- **Ningún secreto ni IP pasa por la conversación ni por el repositorio.** La contraseña del rol de medición se genera en el servidor.
- **El registro de sentencias con parámetros no se enciende en ningún rol de producción**, y queda apagado al terminar, con su comprobación escrita (la lección de R-16 de la 9.3).
- **Cada efecto sobre un servidor se autoriza en su turno.**
- **El plan que se informa es el de la consulta que corre la aplicación.**
- **Los datos de la medición son sintéticos y se declaran así** en cada número.

## Criterios de aceptación

**Etapa 13.2.1**

- **AC-1 (O-2).** Está demostrado por efecto que las consultas de la aplicación no dejan sentencias preparadas con nombre en sus conexiones, con la salida cruda. `plan_cache_mode` está leído en el servidor donde se mide y en los roles.
- **AC-2.** Una guarda falla si `src/` usa una sentencia preparada con nombre. Su caso de falla está ejecutado, con el antes y el después.
- **AC-3.** El seed de volumen siembra precios, información del negocio y la conversación concentrada de D-3. Sigue siendo determinista e idempotente, con test, y las filas de la organización histórica no cambian.
- **AC-4.** `medir-caminos.ts` mide la última página de cada listado paginado, calculada a partir del total y no fijada a mano.
- **AC-5.** `medir-caminos.ts` mide la conversación vigente y el historial por los servicios reales.
- **AC-6.** El script captura la salida cruda de `EXPLAIN (ANALYZE, BUFFERS)` de cada consulta que emite, y un control negativo muestra que una consulta sin plan capturado hace fallar la corrida.
- **AC-7 (R-8).** Los dos bordes tienen su test, con el resultado escrito: si el `FOR UPDATE` hace esperar a la inserción, y si la candidata cerrada crea una segunda conversación. Lo que se haga después está decidido por el usuario y registrado.
- **AC-8.** El ensayo en el contenedor corrió entero, y la suite completa y la CI del commit de la etapa están en verde, leída por `headSha`.

**Etapa 13.2.2**

- **AC-9 (O-39, R-3 y R-4).** Cada consulta del alcance tiene su plan con salida cruda y tiempo, desde la organización grande y desde una chica. Todo recorrido secuencial está registrado, con el tamaño de la organización.
- **AC-10.** Toda consulta que cambia de forma de plan entre la grande y la chica está identificada y explicada.
- **AC-11 (R-6).** El peor caso de la paginación profunda está medido en la última página, con su plan.
- **AC-12 (R-1, R-9).** El dashboard completo, con la métrica 12, está medido con el resultado de cada llamada.
- **AC-13 (AC-15 de la 12.3).** El plan de la conversación vigente, con volumen, desde la grande y desde una chica.
- **AC-14 (H-3 de la 12.4).** El plan del historial de la conversación concentrada, con la proporción de mensajes declarada, y la decisión sobre el índice.
- **AC-15 (R-10).** La ventana del manifiesto está medida con volumen, en segundos.
- **AC-16.** El umbral de D-4 está calibrado, con su factor, y los parámetros de costo están registrados junto a los planes.
- **AC-17.** La base y el rol de medición no existen más, el registro de sentencias está apagado, y los recuentos de `crm_production` son iguales a los de antes. `/login` respondió `200` durante la carga.
- **AC-18.** `Risks.md` y los documentos que citaban números de la 9.3 dicen lo que se midió, sin redondear.

**Cierre**

- **AC-19.** Hubo revisión independiente según D-7, con sus hallazgos verificados y resueltos o aceptados por el usuario.

## Pruebas y evidencia requerida

Un archivo `evidencia-13.2-mediciones.md` con cada comando y su salida literal. Un bloque transcrito se marca `[transcrito]`. Todo lo que mida el mismo agente que implementa se declara autoevaluación.

## Condiciones de detención

1. D-1 a D-7 sin resolver.
2. AC-1 contradice a H-1: alguna consulta sí deja una sentencia con nombre. Se detiene y se replantea O-2.
3. Un seed o un script de medición intenta conectarse a `crm_production`.
4. La aplicación productiva deja de responder, o el disco o la memoria del droplet se acercan a su límite durante la carga.
5. Un plan patológico cuya corrección exige una migración: se consulta antes de escribirla (D-6).
6. Un test de R-8 muestra un defecto que pierde o duplica datos: se eleva antes de seguir.
7. Hace falta tocar un archivo fuera de la lista.

## Lo que esta subfase no va a poder demostrar

- **Que los planes con datos reales serán estos.** Dependen de la distribución real, que no se conoce.
- **Nada sobre carga concurrente.** Una llamada por vez, y tres conexiones en los tests de R-8.
- **Que el tiempo se sostiene con la aplicación atendiendo tráfico.** Se mide con la máquina ociosa.

## Decisiones durante la implementación (13.2.1)

Las tomé yo al implementar. Las tres primeras necesitaban la confirmación del usuario, porque el brief no las fijaba; **el usuario las confirmó el 2026-09-30**.

- **I-1. Los planes se capturan con `auto_explain`, no repitiendo la consulta.** El brief pedía «la salida cruda de `EXPLAIN (ANALYZE, BUFFERS)` de la consulta que la aplicación corre». `auto_explain` toma el plan de la ejecución real y lo devuelve a la conexión del script como un aviso, sin escribirlo en el log del servidor. La alternativa era capturar el texto y volver a correrlo con `EXPLAIN`, que no sirve para una escritura que depende de una fila creada en la misma transacción. **Consecuencia para la 13.2.2**: el superusuario del droplet tiene que precargar la biblioteca en el rol de medición y darle permiso para fijar cinco parámetros. Los dos cambios se borran con el rol.
- **I-2. La calibración y la medición usan dos cargas distintas de la misma base.** Primero la organización histórica sola, para calibrar el umbral contra la 8.5; después se borra la base y se carga la distribución de la medición. La causa: el seed no reescribe filas, así que una organización histórica ya cargada se quedaría sin referencias del emisor, y sin ellas la conversación vigente no tiene candidatas.
- **I-3. La base de medición le quita `CONNECT` a `PUBLIC`.** Las migraciones le dan privilegios a `crm_app`, que en el droplet es el rol de la aplicación productiva. Sin ese `REVOKE`, la aplicación podría conectarse a la base de medición. En el sentido contrario no hace falta nada: el rol de medición no es miembro de `crm_app` y recibe `permission denied` en las tablas de `crm_production`. Las dos cosas se ensayaron.
- **I-4. La guarda también mira `scripts/` y `seeds/`**, no solo `src/` como decía AC-2, y acota el `import` de `pg` a dos archivos. El script de medición usa el mismo pool que la aplicación.
- **I-5. La resolución de la conversación vigente se mide dentro de una transacción que se deshace.** Escribe, y sin eso cada corrida partiría de otro estado.
- **I-6. Los tests de R-8 van en un archivo nuevo**, `conversation-resolution-concurrency.test.ts`, y el de AC-1 en `prepared-statements.test.ts`. La lista autorizaba `tests/integration/`.

## Resultados — etapa 13.2.1, 2026-09-30

Las salidas crudas están en [evidencia-13.2-mediciones.md](evidencia-13.2-mediciones.md). **Autoevaluación**: lo midió el mismo agente que lo implementó.

| AC | Estado | Evidencia |
|---|---|---|
| AC-1 | cumplido en local; **falta leerlo en el servidor donde se mide** | Por efecto: siete repeticiones de lecturas y de una escritura no dejan ninguna sentencia en `pg_prepared_statements`, en ninguna conexión del pool. El control, una consulta con nombre, sí queda, y a la sexta ejecución usa el plan genérico. `plan_cache_mode` es `auto`. El script lo vuelve a comprobar en cada corrida |
| AC-2 | cumplido | Guarda nueva, 28 casos. Siete mutaciones sobre archivos reales, una por forma, las siete en rojo |
| AC-3 | cumplido | 15 tests de integración y 24 de la guarda de identidad. Cinco mutaciones, las cinco en rojo. Una sobrevivió la primera vez y obligó a agregar un caso de determinismo |
| AC-4 | cumplido | La última página se pide con el `pageCount` que devuelve la primera |
| AC-5 | cumplido | La vigente, por `resolveIngestedConversation`, con y sin candidata; el historial, por `listRecentMessagesForService`, con 20 y con 50 |
| AC-6 | cumplido | Los planes salen de `auto_explain` sobre la ejecución real (I-1). El control negativo, sin encenderlo, termina con salida 1 |
| AC-7 | cumplido | Cinco tests. El borde 1 se confirma: hay espera, sin pérdida. El borde 2 no ocurre: con dos candidatas, el mensaje va a la otra |
| AC-8 | cumplido en local; **falta la CI** | El ensayo corrió entero. Local, 2026-09-30: formato, lint y typecheck en verde; Vitest 1543 de 1543 (103 archivos: 921 de guardas y unitarios, 622 de integración); build y 100 de 100 end-to-end. La CI del commit de la etapa se lee por `headSha` |

**R-8, para decidir (D-5).** Lo que mostraron los tests:

- **El bloqueo del cliente.** Hoy, mientras se resuelve un mensaje de un cliente, otro evento que cree una conversación de ese mismo cliente espera a que termine. No se pierde ni se duplica nada. Cambiar `FOR UPDATE` por `FOR NO KEY UPDATE` en `lockClientIdByPhoneE164` quitaría esa espera, y seguiría serializando dos resoluciones del mismo cliente, que es para lo que está el bloqueo.
- **La candidata cerrada.** No hay defecto. No hace falta tocar nada.

**Recomendación: no cambiar nada ahora.** La espera dura lo que dura una resolución, que en el ensayo fueron milisegundos, y solo afecta a dos eventos simultáneos del mismo cliente. El cambio es de una línea, pero toca el bloqueo que evita abrir dos conversaciones, y habría que volver a correr la mutación M1 de la 12.2. Conviene decidirlo con los tiempos de la 13.2.2 a la vista.

**Decisión del usuario, 2026-09-30: no se cambia el bloqueo ahora.** Se vuelve a mirar con los tiempos de la 13.2.2. El borde 2 queda cerrado: no hay defecto.


## Resultados — etapa 13.2.2, 2026-09-30

La medición corrió en el droplet de producción, en cinco pasos que el usuario autorizó cada uno en su turno: la base y el rol, el segundo checkout, la calibración y la carga, la medición y la limpieza. Las salidas crudas están en [evidencia-13.2-mediciones.md](evidencia-13.2-mediciones.md) y los planes, en [planes-13.2/](planes-13.2/). **Autoevaluación**: midió y analizó el mismo agente que escribió el instrumento.

| AC | Estado | Evidencia |
|---|---|---|
| AC-1 | cumplido | Leído en el servidor donde se midió: 0 sentencias preparadas con nombre en las 10 conexiones del pool, desde las tres organizaciones y en la calibración. `plan_cache_mode` es `auto` y no está fijado por rol ni por base |
| AC-8 | cumplido | CI del commit `803571e` en `success`, leída por `headSha` (run 36726314512) |
| AC-9 | cumplido | 118 consultas desde la grande, 116 desde la chica y 118 desde la concentrada, con su plan y su tiempo. Los recorridos secuenciales están todos en una tabla: `organizations` en las tres, y `products`, `clients` y `conversations` solo desde la grande. Las 19 líneas de más de 3000 caracteres se versionaron recortadas; 8 son la condición de índice de un nodo, que pierde su lista de identificadores |
| AC-10 | cumplido | 28 consultas cambian de forma contra la chica y 18 contra la concentrada, en siete clases, todas explicadas por el tamaño |
| AC-11 | cumplido | Última página de seis listados desde la grande. El peor caso es `listProductStock`: 552,5 ms, lo mismo que su primera página |
| AC-12 | cumplido | Las 11 llamadas en paralelo: 277,6 ms desde la grande, 43,2 ms desde la chica y 81,4 ms desde la concentrada. La métrica 12 devuelve `value` en las tres |
| AC-13 | cumplido | El mismo plan desde las tres: `Index Scan` por `conversations_organization_client_last_message_idx`. Con vigente: 1 fila, 3 buffers, entre 0,047 y 0,059 ms. Sin vigente: 0 filas, 2 buffers, entre 0,033 y 0,039 ms |
| AC-14 | cumplido | La conversación concentrada tiene 4.000 de 5.916 mensajes, el 68 %. El historial lee 51 filas para devolver 50, en 0,17 ms. **No hace falta un índice nuevo** |
| AC-15 | cumplido | 2,28, 2,48 y 2,62 s con una base de 78 MB. No se midió con escrituras concurrentes |
| AC-16 | cumplido | Factor de 1,40× a 5,96×, mediana 3,77×. Umbrales: 754 ms para la consulta y 1508 ms para el camino. Los parámetros de costo encabezan cada archivo de planes y de tiempos |
| AC-17 | cumplido | La base, el rol, sus permisos, `/etc/crm-medicion` y el segundo checkout no existen más. `log_statement = none` y ninguna biblioteca precargada. Los recuentos de `crm_production` son los de la línea de base. `/login` respondió `200` en las 26 muestras de la carga y en las 14 de la medición |
| AC-18 | cumplido en parte | `Risks.md`, filas de los planes y de la paginación profunda, y `TraceabilityMatrix.md`. `Roadmap.md`, `CHANGELOG.md` y `HANDOFF.md` se actualizan en el cierre. El comentario de la ventana del manifiesto en `deploy/staging/crm-backup.sh` y en `deploy/production/crm-backup.sh` se actualizó con autorización expresa del usuario: `deploy/` no estaba en la lista de archivos autorizados |
| AC-19 | **pendiente** | La revisión independiente de D-7 |

**Veredicto: ninguna consulta es patológica.** La más lenta tarda 91,0 ms en una ejecución contra 754 ms, y el camino más lento, 573,9 ms contra 1508 ms. D-6 no se activó, no hay migración que consultar y `src/` no se tocó.

**Lo que la medición no cubre**, declarado:

- No se midió desde una organización de 1.000 clientes: no se sabe a partir de qué proporción de la tabla PostgreSQL deja el índice.
- El umbral de 1508 ms es un detector más flojo que el de staging (916 ms). El veredicto descansa más en la forma de los planes.
- Las corridas son ruidosas: la aplicación productiva comparte el único núcleo. `listProductStock` fue de 391,1 a 665,7 ms en una tanda y llegó a 950,8 ms en la de calibración.
- La conversación vigente se midió con una candidata por cliente.
- La ventana del manifiesto es una duración, no una frecuencia de diferencias.

**Una observación fuera del veredicto**: `listProductStock` tarda más de medio segundo con 10.000 productos en esta máquina. Sus consultas suman unos 100 ms; el resto es la página armada en memoria. No depende de un índice y no es de esta subfase.

**Incidentes de la etapa**:

- El guion del paso 1 se cortó en la primera comprobación de aislamiento: el `permission denied` que se esperaba lo terminó, por `set -e` con `pipefail`. Todo lo que tenía que crear ya estaba creado. Las comprobaciones se completaron con un segundo guion de solo lectura.
- `npm ci` avisó que el `postinstall` de `esbuild` no corrió (E-3 de la Fase 12). No impidió nada.
- Una corrida local de las guardas dio una falla que no se repitió en las dos siguientes. No se capturó el nombre del test.

**R-8, con los tiempos a la vista (D-5).** La resolución de la conversación vigente tarda entre 7,4 y 8,4 ms en la máquina de producción, desde las tres organizaciones. Esa es la espera que el bloqueo del cliente le impone a otro evento simultáneo del mismo cliente. **Recomendación: no cambiar el bloqueo.** La decisión es del usuario.

## Revisión independiente (AC-19, D-7), 2026-09-30

La hizo un subagente que no participó del trabajo, con acceso de solo lectura, contra este brief, la evidencia, los tres archivos de planes y los instrumentos. No ejecutó nada. Declaró no haber leído a fondo `seeds/volume.ts` ni su test, así que **no opinó sobre AC-3**. Informó 14 hallazgos y 5 observaciones; cada uno se verificó contra el código o contra los planes antes de aceptarlo. Los 14 se confirmaron.

| Hallazgo | Severidad | Qué encontró | Qué se hizo |
|---|---|---|---|
| H-1 | bloqueante de proceso | `deploy/staging/crm-backup.sh` se modificó y `deploy/` no está en la lista de archivos autorizados (condición de detención 7) | **Revertido**, y elevado al usuario, que autorizó el cambio el 2026-09-30 (abajo) |
| H-2 | mayor | La guarda decía confinar a dos archivos la consulta con nombre armada en una variable, y no lo hacía: `Db` expone el pool como `$client`. Además, una llave antes de `name` cortaba el patrón, `set_config` no estaba cubierto y las migraciones no se miraban | **Corregido en la guarda**: `$client` solo puede usarse para cerrar el pool, salvo en dos archivos; el patrón llega hasta `name`; `set_config` y las migraciones de `drizzle/` están cubiertos. 41 casos. Tres mutaciones sobre archivos reales, las tres en rojo |
| H-3 | menor | La evidencia decía que ninguna línea de un nodo de plan se había recortado; 8 de las 19 son `Index Cond` | Corregido en la evidencia |
| H-4 | menor | Contra la concentrada cambian de forma 18 consultas, no 17; una de las tres «miradas a mano» sí difiere | Corregido en la evidencia, en este brief y en `Risks.md` |
| H-5 | menor | «El 67 % de la tabla» para `products` es la proporción de productos activos; la organización ocupa el 71 % | Corregido en la evidencia y en `Risks.md` |
| H-6 | menor | «La consulta más lenta, 91,0 ms» es una sola ejecución instrumentada | Declarado, con las otras tres ejecuciones de la misma consulta |
| H-7 | menor | «1 fila, 3 buffers» vale solo con una conversación vigente | Agregado el caso sin vigente |
| H-8 | menor | AC-18 marcado cumplido con `TraceabilityMatrix.md`, `Roadmap.md` y `HANDOFF.md` citando todavía la 9.3 | `TraceabilityMatrix.md` actualizado. AC-18 pasa a «cumplido en parte» hasta el cierre |
| H-9 | menor | `HANDOFF.md` y `CHANGELOG.md` sin la 13.2; el encabezado de `medir-caminos.ts` todavía instruía encender `log_min_duration_statement` en un rol | El encabezado del script, corregido. Los otros dos son del cierre |
| H-10 | menor | Los guiones de los cinco pasos y los del análisis no estaban en el repositorio | Versionados en [planes-13.2/guiones/](planes-13.2/guiones/) |
| H-11 | menor | La fila «página profunda» de la calibración compara páginas distintas | Declarado en la evidencia |
| H-12 | menor | El control de los planes exige un plan por camino, no uno por consulta | Declarado como límite. No se cambió el instrumento: la base de medición ya no existe |
| H-13 | menor | La comprobación de sentencias preparadas mira las conexiones vivas al final | Declarado como límite |
| H-14 | menor | El comentario de `crm-backup.sh` mezclaba dos definiciones de la ventana | Corregido al reescribirlo con la autorización del usuario: una sola definición, y dice que el número es de otro servidor |

Las cinco observaciones sobre los planes están en la evidencia, §«Lo que el análisis no había mencionado». Ninguna contradice el veredicto. Una merece decisión del usuario: `listProductStock` manda un parámetro por producto activo, y PostgreSQL admite 65.535 por sentencia.

**Lo que la revisión no cubrió**: AC-3, la ejecución de los tests, la CI y el estado del servidor después de la limpieza, que solo consta por la salida transcrita.

El revisor no otorgó ninguna autorización.

**Decisiones del usuario, 2026-09-30**, sobre la etapa 13.2.2 y la revisión:

1. **`deploy/`**: autorizó actualizar el comentario de la ventana del manifiesto en los dos scripts de backup. Solo el comentario.
2. **El límite de 65.535 parámetros**: se registra como riesgo en `Risks.md` y como tarea en «Esperando» en Notion. `src/` no se toca ahora.
3. **R-8**: no se cambia el bloqueo del cliente. La espera que impone es la duración de una resolución, entre 7,4 y 8,4 ms. R-8 queda cerrado.
4. Autorizó el commit y el push de la etapa.
