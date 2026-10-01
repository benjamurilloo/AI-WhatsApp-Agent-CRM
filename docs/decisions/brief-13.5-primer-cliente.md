---
schema: task-brief.v1
task_id: "13.5"
task_type: integration
generated_at: 2026-10-01
---

# Brief: 13.5 — Primer cliente

**Estado: aprobado el 2026-10-01 por el usuario, con las recomendaciones de D-1 a D-11.** Eso fija: dos etapas, la 13.5.1 ahora y la 13.5.2 cuando el usuario la abra (D-1); el ensayo en staging (D-2); la carga por el dueño del negocio, decidible al conocerlo (D-3); las credenciales creadas por el usuario y la ingestión encendida después de H-4 (D-4); el script de H-4 y un primer mensaje controlado desde el teléfono del usuario (D-5); la observación del operador (D-6); 14 días de observación con reglas de decisión escritas antes (D-7); el gate de la fase como decisión aparte (D-8); dos revisiones independientes (D-9); lo legal como precondición decidida por el usuario (D-10); y el pedido al agente fuera del repositorio (D-11). La aprobación no autoriza ningún commit, ningún cambio en Notion ni ningún efecto sobre staging o producción: cada uno se autoriza en su turno. El usuario abrió la subfase el mismo día («Seguimos con la 13.5»), y antes de que se escribiera el brief respondió tres preguntas previas: el primer cliente **todavía no está confirmado**; su WhatsApp va a entrar por la **API oficial de Meta**, que todavía no está montada; y no sabe si el agente está listo para apuntar a producción.

- **Nivel de evidencia objetivo**: `deterministic` e `isolated-runtime` para la etapa 13.5.1 (el instrumento de H-4, el runbook ensayado en staging); `authenticated-end-to-end` para la 13.5.2, con el primer mensaje real de WhatsApp atravesando el agente y el CRM de producción.
- **Nivel de validación alcanzable**: con la 13.5.2 hecha, **preparado para producción para un solo negocio, detrás del modo de prueba**. Sacar el tráfico del modo de prueba es el gate de salida de la Fase 13, y lo decide el usuario aparte (D-8).
- **Orden**: quinta y última subfase de la Fase 13 ([Roadmap](../planning/Roadmap.md), §Fase 13). La 13.4 está cerrada desde el 2026-10-01.

## Objetivo

Que el primer negocio use el CRM con datos reales, con su WhatsApp atendido por el agente, sin que un dato personal quede donde no se decidió que quede. Y que todo lo que se puede preparar sin ese negocio esté hecho y probado antes de que llegue, para que su llegada no dependa de improvisar.

## Situación en la fase

La 13.1 dejó el entorno productivo, la 13.2 midió las consultas, la 13.3 puso la vigilancia y la 13.4 decidió la retención y el borrado. En producción hay una sola organización, la del operador, sin datos de clientes, y la ingestión y la lectura están apagadas.

### Obligaciones que toma

De la definición del Roadmap y de lo que dejaron otras subfases:

- **La carga de los datos del primer negocio por la UI del CRM** y su primer tráfico real, detrás del modo de prueba: la allowlist admite su credencial y ninguna otra (Roadmap).
- **H-4** (brief-13.4, I-1): verificar con el primer evento del agente por la API oficial que sus identificadores no lleven el teléfono, **antes de abrir el tráfico real**.
- **La capacidad por credencial con tráfico real** ([Risks](../planning/Risks.md), fila 24): el límite de 120 pedidos por minuto es una estimación.
- **La frecuencia de R-6** (brief-12.5): cuántos clientes reales entran con el teléfono como nombre.
- **La reevaluación de una herramienta de APM o tracing** (brief-13.3, D-6), con la distribución de `duration_ms` por ruta.
- **La frecuencia de detección de Uptime** (brief-13.3, AC-7): entre 4,5 y 9,5 minutos, aceptada para revisarse con tráfico real.
- **La observación de un operador real** (O-36; [Personas](../product/Personas.md)).
- **Cierra el gate**: lleva revisión independiente (Roadmap; `CLAUDE.md`).

## Hallazgos antes de diseñar

- **H-1. No hay cliente confirmado.** Respuesta del usuario del 2026-10-01. Nada de lo que necesita al negocio puede empezar: sus datos, su credencial, su tráfico, la observación del operador.
- **H-2. La API oficial no está montada, y H-4 depende de ella.** El agente funciona hoy con Evolution API, que no usa el `wamid` (brief-13.4, I-1). El primer evento con identificadores de la API oficial llega recién cuando esté montada.
- **H-3. No se sabe si el agente está listo para apuntar a producción.** En la 12.3.3 y la 12.5 el agente trabajó contra staging, en ventanas, con credenciales que se revocaron. Apuntar a producción, con la API oficial, es trabajo de su repositorio, y hay que pedirlo.
- **H-4. Un error de H-4 en producción no tiene vuelta atrás.** Si el primer evento trae el teléfono en su `event_id`, queda en `ingestion_events`, cuya identidad es inmutable, y ningún borrado lo saca (brief-13.4, Risks fila 44). Por eso la verificación no puede ser «mirar el primer evento de un cliente»: tiene que hacerse antes, con un teléfono cuyo dueño lo consienta.
- **H-5. Todo lo necesario para encender ya existe y está probado en staging**: `org:create` (13.1), las credenciales por alcance (`scripts/ingestion-credential.ts`), `INGESTION_ENABLED` y `READ_API_ENABLED` con sus allowlists, y `probar-ingestion` y `probar-api-lectura`. **No está probado en producción**, y el procedimiento está en el README de staging, no en uno de producción.
- **H-6. Un dato personal real tiene implicancias que el brief no puede resolver.** NonFunctionalRequirements dice que la política de retención «no afirma cumplimiento legal». Si hace falta un acuerdo con el negocio o un aviso a sus clientes es una decisión del usuario, no técnica (D-10).
- **H-7. [Environments](../development/Environments.md) quedó viejo**: su línea 17 justifica que ningún entorno no productivo reciba datos reales con que «el MVP no se conecta a tráfico productivo», lo que deja de ser cierto con esta subfase. La regla sigue; el motivo cambió.
- **Herencias de la 13.4 que no son de esta subfase**: alinear `/var/log/syslog` a 30 días (tarea en Notion) y comprobar después del 2026-10-30 que el journal venció.

## Decisiones requeridas

### D-1 — Cómo se ordena la subfase sin cliente confirmado

- **(A) Dos etapas: la 13.5.1 ahora y la 13.5.2 cuando el usuario la abra.** **Recomendada.** La 13.5.1 prepara todo lo que no necesita al negocio: el runbook, el instrumento de H-4, el ensayo, las mediciones y el pedido al agente. La 13.5.2 empieza solo con la decisión explícita del usuario, cuando haya cliente, API oficial y agente listo. Entre las dos, la subfase queda «En proceso» en Notion, en espera.
- **(B) Pausar toda la 13.5** hasta que haya cliente. Nada se prepara, y la llegada del cliente arranca de cero.

### D-2 — Dónde se ensaya el alta de un negocio

- **(a) En staging, con una organización sintética, siguiendo el runbook de producción al pie de la letra.** **Recomendada.** Staging es el entorno equivalente, sin datos reales, y se apaga al terminar, como en la 12.5. Prueba los comandos, no el entorno de producción.
- **(b) En producción, con una organización sintética.** Prueba el entorno real, pero deja en producción una organización que no es de nadie: la auditoría es de solo inserción y las métricas del operador la verían.
- **(c) Sin ensayo.** La primera corrida sería con el cliente.

### D-3 — Quién carga los datos del negocio

- **(a) El dueño del negocio, con su propia cuenta `admin`, acompañado por el operador.** **Recomendada.** Es lo que valida la UI con un usuario real (O-36), y los datos entran con su actor en la auditoría.
- **(b) El operador, en nombre del negocio.** Más rápido, pero la auditoría dice que los cargó el operador, y la UI no se prueba con quien la va a usar.

La decisión puede esperar a conocer al cliente: el runbook cubre las dos.

### D-4 — Cómo se enciende en producción

- **Recomendada**:
  - las credenciales las crea **el usuario en su terminal**, como en staging: los tokens nunca pasan por la conversación ni por el repositorio;
  - una credencial por alcance (`ingest`, `read`, `context`), y cada allowlist admite **solo** las del negocio;
  - **la ingestión se enciende recién después de H-4** (D-5); la lectura puede encenderse antes, porque no guarda nada del emisor;
  - encender o apagar es un cambio de `app.env` y un reinicio, cada uno autorizado en su turno, y apagar es la vuelta atrás.
- **Alternativa**: encender todo junto. Más simple, y pierde la barrera de H-4.

### D-5 — Cómo se verifica H-4

- **(a) Un instrumento y un primer mensaje controlado.** **Recomendada.**
  - En la 13.5.1, un script de solo lectura (`scripts/verificar-identificadores.ts`) que recorre los identificadores guardados de una organización (`ingestion_events.external_ref`, y las referencias de `conversations` y `messages`). Busca el teléfono de cada cliente, en claro y decodificado de base64, que es como lo lleva un `wamid` según su formato público. **Informa solo recuentos, nunca valores.** Con tests sobre identificadores sintéticos con la forma de un `wamid`, y una mutación por regla.
  - En la 13.5.2, **antes de cualquier cliente del negocio**: un solo mensaje real desde un teléfono cuyo dueño lo consiente (el del usuario), por la API oficial, con la ingestión encendida solo para esa prueba. El script tiene que dar cero. Si da otro número, se apaga la ingestión, se detiene y se eleva (condición de detención 2): ese evento queda guardado y no se puede borrar, y es el único.
- **(b) Mirar a mano el primer evento.** Obliga a leer el identificador, y si lleva un teléfono, ya pasó por la conversación.

### D-6 — La observación del operador real (O-36)

- **Recomendada**: una sesión en la que el operador del negocio usa el CRM para su trabajo real, con el usuario presente. Se anota qué hace, dónde duda y qué no encuentra. **Las notas no llevan datos del negocio ni de sus clientes**, y se contrastan con [Personas](../product/Personas.md).

### D-7 — La ventana de observación y lo que se mide

- **Recomendada: 14 días de tráfico real** antes de cerrar. En la 13.5.1 se escriben, y se prueban sobre logs de staging, los procedimientos y **las reglas de decisión, fijadas antes de ver los datos**:
  - **capacidad**: pedidos por minuto por credencial, el máximo y el percentil 99, contra el límite de 120;
  - **R-6**: cuántos clientes nuevos tienen el teléfono como nombre;
  - **latencia**: la distribución de `duration_ms` por ruta, con el procedimiento de la 13.3;
  - **APM**: se adopta una herramienta si en la ventana hay un turno lento o fallido que los logs no expliquen (el disparador de la 13.3);
  - **Uptime**: se revisa la frecuencia si hubo una caída que tardó más de lo aceptado en avisar.
- El usuario puede fijar otra duración.

### D-8 — Qué cierra la 13.5 y qué cierra la fase

- **Recomendada**: la 13.5 cierra con la ventana de D-7 cumplida, las mediciones registradas y la revisión independiente. **Sacar el tráfico del modo de prueba más allá del primer negocio** es el gate de salida de la Fase 13: es una decisión explícita del usuario, aparte, en el cierre de la fase.

### D-9 — Revisión independiente

- **Recomendada: dos.**
  - Una **al final de la 13.5.1**, acotada al instrumento de H-4 y al runbook: la 13.5.2 puede empezar semanas después, y se va a apoyar en ellos sin volver a mirarlos. La 8.4 y la 13.2 mostraron que un instrumento propio tiene agujeros que su autor no ve.
  - Otra **al final de la 13.5**, completa, que es la del gate.

### D-10 — Lo que no es técnico

- **El brief no lo resuelve**: si hace falta un acuerdo escrito con el negocio sobre los datos de sus clientes, o un aviso a esos clientes, y quién lo redacta. **Recomendación**: que sea una precondición de la 13.5.2, decidida por el usuario y registrada con su fecha, sin que el CRM afirme cumplimiento legal.

### D-11 — El pedido al agente

- **Recomendada**: un documento para el agente, escrito por el CRM y llevado por el usuario, fuera del repositorio, como en la 12.3.3 y la 12.5. Pide:
  - si puede apuntar a producción, y cuándo;
  - cómo arma `event_id` y los `external_ref` con la API oficial: con un hash con clave propia, según la guía de ingestion-v2;
  - el plan del primer mensaje controlado (D-5);
  - cómo guarda las credenciales de producción.

## Escala de severidad, fijada antes de empezar

- **Crítico**: un dato personal real en el repositorio, la conversación o un lugar no declarado; un token o secreto fuera de donde debe estar; la ingestión encendida para el negocio sin H-4 verificado; una credencial ajena admitida por la allowlist.
- **Mayor**: un paso del runbook que no se probó; una regla del instrumento de H-4 sin su mutación; una medición de D-7 sin su regla de decisión escrita antes; un documento que promete más de lo que se hizo.
- **Menor**: imprecisiones de redacción, recuentos que no cierran sin cambiar una conclusión, estado viejo en un documento.

## Alcance incluido

**Etapa 13.5.1 — preparación, sin el cliente**

1. `docs/runbooks/alta-de-un-negocio.md`, para producción:
   - crear la organización y su `admin`;
   - la carga de los datos por la UI, en las dos variantes de D-3;
   - crear las credenciales por alcance, encender cada superficie con su allowlist, comprobar que una credencial ajena se rechaza;
   - apagar y revocar como vuelta atrás, y qué registrar sin datos personales.
2. `scripts/verificar-identificadores.ts` (D-5), con su test de integración y una mutación por regla.
3. El ensayo del runbook en staging (D-2), con una organización sintética, `probar-ingestion` y `probar-api-lectura`, y todo apagado y revocado al terminar.
4. `docs/runbooks/observar-el-primer-negocio.md` (D-7): cada medición con su procedimiento y su regla de decisión, probado sobre los logs de staging del ensayo.
5. El pedido al agente (D-11), fuera del repositorio.
6. Documentos: Environments (H-7), Risks, el README de producción (enlace al runbook), HANDOFF, CHANGELOG y Roadmap.
7. La revisión independiente de la 13.5.1 (D-9).

**Etapa 13.5.2 — con el cliente** (empieza solo con la decisión explícita del usuario; cada efecto sobre producción, en su turno)

8. Las precondiciones, registradas con su fecha: cliente confirmado, API oficial montada, agente listo según su respuesta, y D-10 decidida.
9. El alta en producción según el runbook, y la carga de los datos por la UI.
10. H-4: el primer mensaje controlado y el script en cero (D-5).
11. El encendido para el negocio, con las allowlists, y la credencial ajena rechazada.
12. La ventana de D-7, con sus mediciones y decisiones.
13. La observación del operador (D-6).
14. La revisión independiente final y el cierre.

## Alcance excluido

- Sacar el tráfico del modo de prueba, o un segundo negocio (D-8).
- Datos del sistema legado: Fase 14.
- Cambiar los contratos de ingestión o de lectura. Si hace falta, se detiene.
- Trabajo en el repositorio del agente: se pide, no se hace.
- Asesoramiento legal (D-10).
- Alinear `/var/log/syslog` y comprobar el vencimiento del journal: tienen su tarea y su fecha.

## Archivos o componentes autorizados

- `docs/decisions/`: este brief, una evidencia nueva y el índice.
- `docs/runbooks/alta-de-un-negocio.md` y `docs/runbooks/observar-el-primer-negocio.md`, nuevos.
- `scripts/verificar-identificadores.ts` y `tests/integration/verificar-identificadores.test.ts`, nuevos.
- `deploy/production/README.md`, `docs/development/Environments.md`, `docs/planning/Risks.md`, `docs/planning/Roadmap.md`, `docs/product/Personas.md` (O-36), `CHANGELOG.md`, `HANDOFF.md`.
- `deploy/staging/README.md`, **solo** si el ensayo encuentra un error en él.
- En staging: una ventana para el ensayo, con una organización sintética, credenciales que crea el usuario y se revocan, y todo apagado al terminar.
- En producción, en la 13.5.2: lo que dice el runbook, cada paso en su turno.

## Invariantes

- **Ningún dato real del negocio ni de sus clientes, ningún teléfono real, `wamid` real ni IP entra al repositorio ni a la conversación.** El script de H-4 informa recuentos, nunca valores.
- **Ningún token ni secreto pasa por la conversación ni por el repositorio.** Las credenciales las crea el usuario en su terminal.
- **La allowlist admite solo las credenciales del negocio.** Toda otra se rechaza, y eso se comprueba.
- **La ingestión no se enciende para el negocio sin H-4 verificado.**
- **Cada efecto sobre staging o producción se autoriza en su turno.** Encender, apagar y revocar incluidos.
- **Staging no recibe datos reales**, tampoco en el ensayo.

## Criterios de aceptación

**Etapa 13.5.1**

- **AC-1.** El runbook de alta existe y cubre crear, cargar, encender, comprobar, apagar y revocar, con los comandos exactos y sin secretos.
- **AC-2 (D-5).** `verificar-identificadores` detecta el teléfono de un cliente en un identificador, en claro y decodificado de base64, y no da falsos positivos con identificadores sin teléfono. Informa solo recuentos. Hay tests de integración sobre identificadores sintéticos y una mutación por regla, ejecutada.
- **AC-3 (D-2).** El runbook se ensayó en staging al pie de la letra: organización sintética, credenciales, encendido, `probar-ingestion` y `probar-api-lectura` sin fallas, credencial ajena rechazada, y todo apagado y revocado al final. Cada paso que no funcionó tal como estaba escrito queda corregido y registrado.
- **AC-4 (D-7).** Cada medición tiene su procedimiento y su regla de decisión escritos, y el procedimiento corrió sobre los logs del ensayo.
- **AC-5 (D-11).** El pedido al agente está escrito y entregado al usuario.
- **AC-6.** Environments, Risks y el README de producción, actualizados; la suite completa y la CI del commit de la etapa, en verde, leída por `headSha`.
- **AC-7 (D-9).** Revisión independiente de la 13.5.1, con sus hallazgos verificados y resueltos o aceptados por el usuario.

**Etapa 13.5.2**

- **AC-8.** Las precondiciones están registradas con su fecha, incluida D-10.
- **AC-9.** El alta en producción siguió el runbook; los datos los cargó quien decidió D-3, por la UI.
- **AC-10 (D-5).** H-4 verificado con el primer mensaje controlado: el script en cero, antes de cualquier cliente del negocio.
- **AC-11.** Las superficies están encendidas solo para el negocio, y una credencial ajena se rechaza en producción.
- **AC-12 (D-7).** La ventana se cumplió, con cada medición y cada decisión registradas.
- **AC-13 (D-6).** La observación del operador está registrada y contrastada con Personas.
- **AC-14 (D-9).** Revisión independiente final, con sus hallazgos verificados y resueltos o aceptados por el usuario.

## Pruebas y evidencia requerida

Un archivo `evidencia-13.5-primer-cliente.md` con cada comando y su salida literal; un bloque transcrito se marca `[transcrito]`. Ningún teléfono, `wamid`, IP, token ni dato del negocio. Las salidas del script de H-4 en producción son recuentos. Todo lo que verifique el mismo agente que implementa se declara autoevaluación.

## Condiciones de detención

1. D-1 a D-11 sin resolver, o la 13.5.2 sin la decisión explícita del usuario.
2. **H-4 da distinto de cero** en el primer mensaje controlado: se apaga la ingestión y se eleva al usuario y al agente.
3. El agente no puede cumplir la guía de ingestion-v2, o hace falta cambiar un contrato.
4. Una medición muestra el límite de 120 pedidos por minuto alcanzado, o un turno que falla por capacidad: se decide antes de seguir.
5. Un dato personal aparece en un lugar no declarado (logs, journal, un archivo de evidencia).
6. Hace falta tocar un archivo fuera de la lista.

## Lo que esta subfase no va a poder demostrar

- **Más de un negocio a la vez.** Es uno solo, por diseño.
- **Que el 99,5 % se cumpla**: hace falta el mes de medición de la 13.3, que corre aparte.
- **Que el agente atienda bien**: el CRM mide lo suyo, no la calidad de las respuestas del agente.
- **Cumplimiento legal** (D-10).
