---
name: crm-write-discipline
description: Doctrina de escritura del CRM — idempotencia, transacciones, tablas insert-only, aislamiento por organización y salud del pool de pg. Usar al escribir o revisar cualquier código que inserte, actualice o ingiera datos: endpoints de ingestión, seeds, migraciones que muevan datos, repositorios de módulo, o al diseñar una tabla nueva. No aplica a consultas de solo lectura ni a código de UI sin escritura.
when_to_use: Cuando el cambio escribe en PostgreSQL — ingesta de eventos, upserts, seeds, tablas nuevas, triggers, o cuando aparece un bug de duplicados, de orden de filas o de fuga entre organizaciones.
---

# Disciplina de escritura del CRM

Reglas validadas en este proyecto, extraídas de incidentes reales. Cada una tiene su
nota en el vault (`Developer/Segundo Cerebro/20 Patterns` y `30 Problems and Solutions`).
No son preferencias de estilo: cada una se escribió después de que su ausencia costara
trabajo.

Esta skill **no autoriza** migraciones contra una base real, ni commits, ni despliegues.

## Cómo usarla

Al escribir o revisar una escritura, recorrer las secciones que aplican y declarar
cuáles se verificaron y cómo. No afirmar que una guarda funciona sin haber demostrado
que falla — ver la skill global `proving-guards-can-fail`.

## 1. Idempotencia

- **Hashear el evento normalizado, no el cuerpo crudo.** Dos entregas del mismo evento
  con distinto orden de claves, distinto espaciado o cabeceras añadidas producen cuerpos
  distintos y el mismo hecho. El hash se calcula sobre la forma normalizada.
- **Reservar y cerrar la clave de idempotencia en la misma transacción.** Reservar en una
  transacción y cerrar en otra deja una ventana donde un reintento ve la clave reservada
  pero no el efecto, y se bloquea o duplica.
- **Rechazar dentro de la transacción cuando el upsert ya escribió.** Si se detecta el
  conflicto después de confirmar, el rechazo llega tarde: la fila ya existe. La detección
  y el rechazo comparten transacción.
- **Cuidado con la configuración de supresión de errores reutilizada:** puede desactivar
  en silencio un guard de idempotencia. Si se reutiliza un bloque de configuración de
  lint o de manejo de errores, verificar que el guard sigue fallando ante el caso que
  debe detectar.

## 2. Tablas insert-only

- **Necesitan un rol no-propietario y un trigger.** Sin ambos, "insert-only" es una
  intención documentada, no una restricción. El propietario de la tabla puede actualizar
  y borrar; el trigger es lo que lo impide.
- **Los seeds idempotentes sobre tablas insert-only ancoran sus datos en la primera
  corrida.** No pueden corregir lo ya insertado. Si el seed cambia, hay que decidir
  explícitamente qué pasa con las filas que la corrida anterior fijó.

## 3. Orden y concurrencia

- **Sellar la fila con timestamp en el momento del insert cuando un lock define su
  orden.** Si el timestamp se asigna antes de tomar el lock, el orden de los timestamps
  y el orden real de escritura pueden diferir.
- **Probar que un row lock serializa escritores sosteniéndolo desde una tercera
  conexión.** Dos conexiones no alcanzan: hace falta una que sostenga el lock mientras
  las otras dos compiten, para observar la serialización en vez de asumirla.

## 4. Aislamiento por organización

- **Claves foráneas compuestas para forzar el aislamiento entre fila hija y fila madre.**
  Una FK simple a la fila hija permite que una hija de la organización A cuelgue de una
  madre de la organización B. La FK compuesta que incluye la columna de organización lo
  hace imposible a nivel de esquema, no de código.

## 5. Consultas que alimentan escrituras

- **Materializar un CTE cuyo subquery alimente más de un filtro.** Sin materializar, el
  planner puede reevaluarlo por filtro, con resultados inconsistentes entre filtros y
  coste multiplicado.

## 6. Salud del pool

- **Un pool de `pg` sin listener de `error` tira el proceso cuando la base reinicia.**
  El pool emite `error` en conexiones idle; sin listener, es una excepción no capturada.
  Todo pool lleva su listener.

## 7. Verificación mínima antes de declarar terminado

- Una corrida de mutación **tiene que cambiar lo que devuelve la consulta**. Si el test
  de escritura no lee después y compara, no probó la escritura.
- Las métricas se validan contra fixtures calculados a mano, incluyendo bordes de
  calendario (fin de mes, cambio de año, semanas partidas).
- Cada guarda del proyecto versiona su caso que falla. Ver `proving-guards-can-fail`.

## Qué no hace esta skill

- No decide el modelo de datos: eso vive en `docs/architecture/DataModel.md`.
- No autoriza ejecutar migraciones contra una base real.
- No sustituye el brief de la subfase ni sus criterios de aceptación.

## Origen

Vault `Developer/Segundo Cerebro`, notas del proyecto AI WhatsApp Agent CRM:
Hash the Normalized Event, Not the Raw Body · Reserve and Close an Idempotency Key in
the Same Transaction · Reject Inside the Transaction When an Upsert Already Wrote ·
Reused Error-Suppression Config Can Silently Disable an Idempotency Guard ·
Insert-Only Tables Need a Non-Owner Role and a Trigger · Idempotent Seeds Over
Insert-Only Tables Anchor Their Data on First Run · Timestamp Rows at Insert Time When
a Lock Defines Their Order · Prove a Row Lock Serializes Writers by Holding It From a
Third Connection · Composite Foreign Keys Enforce Tenant Isolation Between Child and
Parent Rows · Materialize a CTE Whose Subquery Feeds More Than One Filter · A pg Pool
Without an Error Listener Crashes the Process When the Database Restarts · A Mutation
Run Must Change What the Query Returns · Validate Metrics Against Hand-Computed
Fixtures With Calendar Edges.
