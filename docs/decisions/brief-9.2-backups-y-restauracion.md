# Brief 9.2 — Backups y restauración

- **Contrato**: `task-brief.v1`
- **Tipo de tarea**: `runtime-validation`
- **Nivel de evidencia objetivo**: `isolated-runtime`
- **Nivel de validación alcanzable**: **validado en staging**, y solo para el **mecanismo**. Esta subfase no puede alcanzar *preparado para producción* y el motivo está en la sección de limitaciones: staging tiene datos sintéticos y un volumen que no se parece al real.
- **Orden**: después de la **9.1**, cerrada el 2026-09-22.
- **No abre ni cierra gate.** Los gates de la Fase 9 son la 9.1 (entrada) y la 9.4 (salida), según [Roadmap](../planning/Roadmap.md) §Fase 9. Por lo tanto la revisión independiente **no es obligatoria** acá. Se recomienda igual, por la regla que el mismo Roadmap fijó tras la 9.0.1: *las subfases que dejan guardas o tests como instrumento la llevan*. Esta deja un script y un runbook que son instrumentos de recuperación, y un instrumento de recuperación que no funciona no avisa hasta que hace falta.
- **Sin precondición bloqueante.** La 9.1 dejó el entorno persistente que esta subfase necesita.

## Objetivo

Que exista un backup automático **y que esté demostrado que se puede restaurar**. El entregable no es el archivo: es la restauración ejecutada y verificada por contenido.

Esto no es una distinción retórica. `SecurityModel` ya exige «restauración probada periódicamente… para verificar que el backup es realmente utilizable», y el modo de falla clásico de los backups es precisamente que el archivo existe, el cron corre en verde durante meses y nadie descubre que el dump está incompleto hasta el día en que hay que usarlo. **Un `pg_dump` que sale con código 0 no es evidencia de nada**, igual que en la 9.1 un `drizzle-kit migrate` salió con código 1 sin imprimir un solo error.

El segundo objetivo, asignado acá al descomponer la fase: **resolver la retención de `messages`**, que es la misma decisión sobre el ciclo de vida del dato. Resolver puede significar decidir un horizonte o decidir conservar indefinidamente con su condición de reapertura — pero **no** volver a diferirla sin decir nada, que es lo que viene pasando desde la 1.3.

## Lo que se verificó antes de escribir este brief

Leído contra el código y los documentos el 2026-09-22, no recordado de la sesión anterior.

### La obligación existe y está declarada incumplida

`SecurityModel.md:162` dice que el backup lógico diario rige «desde que exista un entorno persistente (staging en adelante)», y desde el 2026-09-22 se declara **incumplido**, porque el entorno existe y el backup no. La condición de disparo ya se cumplió. `Risks.md:33` remite la frecuencia y la prueba de restauración a esta subfase, y `Overview.md:121` dice explícitamente «frecuencia a definir en la subfase 9.2».

### Los roles de la base no son intercambiables, y eso condiciona quién hace el dump

| Rol | Qué puede | De dónde sale |
| --- | --- | --- |
| `crm_owner` | dueño de los objetos | aprovisionamiento 9.1 |
| `crm_app` | `SELECT`/`INSERT` en todo; `UPDATE`/`DELETE` solo donde corresponde; **nunca `DELETE`** en `audit_logs`, `inventory_movements` ni `messages` | `drizzle/0003`, `0005`, `0009`, `0012`, `0014` |
| `crm_staging_app` | rol con login, miembro de `crm_app` | aprovisionamiento 9.1 |

La aplicación se conecta con el tercero, a propósito. **El backup no puede correr con ese rol** sin comprobar antes que el dump sale completo: un `pg_dump` ejecutado por quien no es dueño puede omitir objetos sin fallar. Está registrado abajo como trampa, no como hecho: se mide, no se supone.

### Hay cuatro triggers que condicionan la restauración

`audit_logs_insert_only`, `inventory_movements_insert_only`, `messages_insert_only` y `ingestion_events_identity_immutable` (`drizzle/0003`, `0005`, `0012`). Ninguno bloquea `INSERT`, así que una restauración a una base **vacía** no los pelea. Una restauración sobre una base con datos sí, y por otro motivo: colisiones de clave primaria.

### `crm_app` es un objeto del servidor, no de la base

Es exactamente la trampa que hizo fallar la migración `0003` en la 9.1, con `drizzle-kit migrate` saliendo con código 1 y sin mensaje. Restaurar en un servidor donde ese rol no existe va a fallar en los `GRANT`. Acá se registra **antes** de que pase.

## Escala de severidad, fijada antes de empezar

Se adopta la D-2 de la 8.4, con la enmienda de disponibilidad, igual que hizo la 9.1:

- **Crítico**: pérdida de datos no recuperable, exposición de datos de la copia, o un backup que se cree válido y no lo sea.
- **Mayor**: debilita la recuperación sin hacerla imposible.
- **Menor**: documentación que no coincide con el código, sin consecuencia operativa.

## Decisiones

**Aprobadas el 2026-09-22 con las recomendaciones**: D-1 (b), D-2 conservar indefinidamente con condición de reapertura, D-3 diario + prueba mensual ejecutada.

### D-1 — Dónde vive la copia (**necesita tu decisión**)

Un backup que vive en el mismo disco que la base **no es un backup**: protege contra un `DROP TABLE`, no contra perder el droplet. Las opciones reales:

| Opción | Costo | Qué protege | Qué no |
| --- | --- | --- | --- |
| **(a) Solo en el droplet** | 0 | error humano, corrupción lógica | pérdida del droplet |
| **(b) Droplet + copia a tu máquina** (recomendada) | 0 | también pérdida del droplet | exige que tu máquina esté encendida; no es automático de verdad |
| **(c) Object storage** (DO Spaces / S3) | ~5 USD/mes | todo lo anterior, automático | nada relevante |
| **(d) Snapshots del droplet** | ~20 % del droplet | la máquina entera | **no** es backup lógico: no sirve para restaurar una tabla |

**Recomendación: (b) para la 9.2, con (c) registrada como requisito antes de producción.** El motivo es que lo que esta subfase tiene que demostrar es el **mecanismo**, y el mecanismo se demuestra igual con una copia manual verificada; pagar almacenamiento para datos sintéticos es gastar sin comprar evidencia. Lo que sí se registra, y no se deja implícito, es que **(b) no es automático**: si tu máquina no se prende, no hay copia externa ese día. Eso se declara como limitación, no se disfraza.

### D-2 — Retención de `messages` (**necesita tu decisión**)

Acá hay una contradicción real entre documentos y prefiero señalarla antes que resolverla en silencio:

- `DataModel.md:365` difiere la retención a la Fase 9 con un motivo explícito: **«en el MVP no hay tráfico ni volumen, así que decidirlo ahora sería decidirlo sin datos»**.
- El Roadmap la asigna a esta subfase.

**El motivo del diferimiento sigue intacto**: staging tiene datos sintéticos. Decidir hoy un horizonte de borrado sería decidirlo con exactamente la misma información que en la 1.3.

**Recomendación: decidir conservar indefinidamente, con condición de reapertura escrita**, y que la 9.2 entregue el *análisis* que hoy no existe: qué habría que tocar si mañana se decide un horizonte —`ADR 0013` y el trigger `messages_insert_only`—, y cuál es la condición que obliga a revisarlo (el primer tráfico real, o sea la 9.4). **No se agrega ninguna columna de expiración ni ningún mecanismo de borrado**: `CLAUDE.md` prohíbe los módulos especulativos, y `DataModel` ya dice que agregarla después es una migración aditiva.

Lo que esto **sí** cambia respecto de hoy: deja de estar «pendiente» y pasa a ser una decisión con fecha y con condición de reapertura. La diferencia entre diferir y decidir conservar es que la segunda se puede auditar.

### D-3 — Frecuencia (**necesita tu decisión**)

`Overview.md:121` la deja a esta subfase. **Recomendación: backup diario, prueba de restauración mensual y ejecutada de verdad**, no «documentada». En staging la prueba mensual es barata porque la base es chica; el número se revisa cuando haya volumen (9.3).

### D-4 — El dump corre con el rol dueño, no con el de la aplicación

Por lo dicho arriba. Y **se comprueba que el dump está completo**, no se asume: AC-4.

### D-5 — La restauración va siempre a una base nueva y vacía, y se borra al terminar

`SecurityModel.md:163` pide un entorno aislado, «no el mismo entorno del backup». Acá eso significa una base creada al vuelo, con nombre propio, que se destruye al final del ejercicio. Dejar viva una copia de la base es crear una segunda superficie con los mismos datos y ninguna de las defensas.

### D-6 — La verificación es por contenido y tiene control negativo

Comparar recuentos por tabla y contenido entre origen y restauración. Y **un control negativo ejecutado**: la verificación tiene que **fallar** contra un backup truncado. Sin eso, «la verificación pasó» no distingue un backup bueno de una verificación rota — que es el defecto que la 9.1 encontró cuatro veces en sus propios detectores.

## Alcance

1. Script de backup versionado, que corre con el rol dueño y produce un dump en formato `custom` (`pg_dump -Fc`), que es el que permite restaurar selectivamente.
2. Automatización con un *timer* de `systemd`, en la línea de la 9.1: la unidad se versiona en `deploy/staging/` y se compara con la desplegada.
3. Rotación de copias viejas, con su política escrita.
4. Copia fuera del droplet, según D-1.
5. **Ejercicio de restauración ejecutado**, a una base nueva y aislada, con la salida capturada en un archivo de evidencia.
6. Verificación por contenido con control negativo.
7. Runbook de restauración en `docs/runbooks/`, **escrito a partir del ejercicio ejecutado**, no de memoria. Incluye la trampa del rol `crm_app` inexistente en el servidor de destino.
8. Decisión de retención de `messages` registrada según D-2, con el análisis del trigger y su condición de reapertura.
9. `SecurityModel.md` deja de declarar el backup incumplido, con el nivel exacto alcanzado y sus límites.
10. Guarda que fije la configuración versionada del backup, como hizo la 9.1 con el proxy — **con una mutación ejecutada por cada forma sintáctica que diga cubrir**, según la regla que `EngineeringStandards.md` incorporó tras la 9.1.

## Fuera de alcance, explícitamente

- **Backups de producción.** No hay producción.
- **Réplicas, PITR y WAL archiving.** Son otra clase de solución y el monolito modular no los pide todavía ([ADR](README.md) si alguna vez se necesitan).
- **Borrado real de datos de un cliente.** Sigue siendo subfase propia, registrada en `Risks.md:38`.
- **Cualquier columna, tabla o módulo de expiración**, por D-2.
- **Cifrado del backup en reposo.** Se registra como requisito antes de producción: en staging el dump no tiene datos reales. Si se decide (c) en D-1, el cifrado entra con ella.
- **Restauración a un servicio gestionado.** Se registra la incógnita de si exigirá superusuario, que condiciona la elección de hosting de producción.

## Criterios de aceptación

| Id | Criterio | Cómo se evidencia |
| --- | --- | --- |
| **AC-1** | El script de backup corre y produce un archivo legible por `pg_restore -l` | salida capturada |
| **AC-2** | El backup se dispara **solo**, por timer, sin intervención | `systemctl list-timers` y el archivo aparecido tras un disparo real |
| **AC-3** | Una restauración a una base **nueva y vacía** completa sin error | salida cruda de `pg_restore` |
| **AC-4** | El dump está **completo**: la base restaurada tiene las mismas tablas y los mismos recuentos por tabla que el origen | comparación tabla por tabla, capturada |
| **AC-5** | La verificación de AC-4 **falla** contra un backup truncado | control negativo ejecutado |
| **AC-6** | La base de restauración se destruye al terminar y se comprueba que no existe | salida capturada |
| **AC-7** | La rotación borra las copias viejas y **no** borra las recientes | par ejecutado sobre archivos con fecha forzada |
| **AC-8** | Existe una copia fuera del droplet, según D-1, y se verifica que el archivo copiado es el mismo | suma de verificación en los dos extremos |
| **AC-9** | El runbook se ejecutó de punta a punta por alguien que sigue el texto, no por quien lo escribió de memoria | la corrida de AC-3 sale del runbook |
| **AC-10** | La decisión de retención está registrada con su condición de reapertura, y **no se agregó ningún mecanismo** de expiración | `git diff` sobre `drizzle/` y `src/` vacío de cambios de esquema |
| **AC-11** | La guarda del punto 10 detecta las regresiones que dice detectar | una mutación **ejecutada** por forma sintáctica, con el resultado antes y después |
| **AC-12** | Ningún secreto queda en el repositorio, en la salida ni en el nombre del archivo | revisión del script y de la evidencia |

## Condiciones de detención

Detener, registrar y elevar — no resolver por analogía:

1. **Si el dump con el rol elegido sale incompleto.** No se arregla otorgando privilegios hasta que pase: se entiende por qué y se decide.
2. **Si la restauración exige superusuario.** Cambia la elección de hosting de producción, que es una decisión tuya.
3. **Si resolver la retención exige tocar el ADR 0013.** Se eleva. Un ADR no se modifica dentro de una subfase que no lo tiene en su alcance.
4. **Si la copia externa exige un servicio pago no aprobado en D-1.**
5. **Si aparece la tentación de dejar viva la base restaurada** «por si sirve». Es una copia de datos sin defensas.
6. **Si el alcance empieza a incluir producción.**

## Lo que esta subfase **no** va a poder demostrar

Escrito antes de empezar, para que no se lea después como un descubrimiento:

- **Que la restauración funcione al volumen real.** Staging tiene datos sintéticos y pocos. El tiempo de restauración es la medición que importa en una emergencia y acá va a salir un número que no significa nada. **El ejercicio se vuelve a correr en la 9.3**, que es la subfase que mete volumen, y ahí el número sí vale.
- **Que los datos restaurados sean los datos reales.** No hay datos reales. Esto prueba el mecanismo.
- **Que el backup sobreviva a la pérdida del droplet**, salvo lo que cubra D-1, y con la limitación de que (b) depende de una máquina que puede estar apagada.
- **Que alguien sepa restaurar bajo presión.** Un runbook ejecutado una vez en calma no es un simulacro.

## Revisión independiente

La 9.2 **no abre ni cierra gate**, así que la revisión no era obligatoria. Se hizo igual, por lo que la 9.1 dejó medido: ninguna ronda de trabajo propio de este proyecto resultó limpia al ser revisada por alguien que no participó. La escala de severidad se fijó antes de mirar el código, como manda el protocolo.

Un agente con acceso de solo lectura revisó contra este brief y contra las reglas vigentes: **21 hallazgos, 7 mayores**. Los 21 se verificaron contra el código antes de aceptarse; los mayores se confirmaron **ejecutando** la mutación o leyendo el archivo citado. Ninguno fue rechazado por falso.

| Id | Hallazgo | Cómo se verificó | Corrección |
| --- | --- | --- | --- |
| **R-3** | La guarda de backup era ciega a `sort -r`, a `OnCalendar` mensual y a la ausencia de `set -euo pipefail` | tres mutaciones ejecutadas: las tres pasaban 20/20 | la guarda **simula** la tubería en vez de buscarla como texto; 42 casos y 10 mutaciones ejecutadas (AC-11 en la evidencia) |
| **R-1** | El runbook creaba `crm_app` pero no `crm_owner`, así que la recuperación en una máquina nueva fallaría — el único escenario donde la copia externa sirve | lectura del runbook contra la salida medida de `pg_restore` sin el rol | se crean los dos, con comprobación previa, y se declara que ese camino está **diseñado, no ejecutado** |
| **R-5** | El ejercicio recurrente restauraba con `--no-owner`, que el runbook prohíbe para una recuperación real: nunca ensayaba la restitución de dueño | lectura del script contra el trap 3 del runbook | se quitó el flag y se agregó una comprobación de dueño contra el origen |
| **R-6** | Nada disparaba el ejercicio mensual: el backup tenía timer y la comprobación que lo valida dependía de que alguien se acordara | `systemctl list-timers` no lista ninguna unidad de ejercicio | `crm-restore-check.service` y `.timer`, día 1 a las 04:30 UTC, después del backup |
| **R-4** | AC-11 no tenía evidencia de mutación, y la etiqueta «AC-11» se usaba para el diff contra el servidor en dos documentos | `grep -ci "mutaci"` sobre la evidencia devolvía 0 | sección AC-11 con las 10 mutaciones y su antes/después; las dos etiquetas corregidas |
| **R-9** | La evidencia presentaba como salida de `psql` dos cosas que imprimió un `echo` o que escribí yo (`ninguna`, `(ninguna fila)`), y anotaciones editoriales dentro de bloques sin marca `[transcrito]` | lectura contra el comando real | bloques marcados, comando real mostrado, y dicho explícitamente qué salió de dónde |
| **R-7, R-8** | `HANDOFF` decía «ocho guardas» contra nueve en disco, y afirmaba que **la 9.2 abre gate**, contradiciendo la primera línea de este brief | `ls tests/guards/*.test.ts \| wc -l`; `Roadmap.md` | ambas corregidas, y el recuento ahora dice con qué orden se comprueba |

**Tres cosas que esta revisión deja medidas, y que valen más que las correcciones:**

1. **R-9 es la tercera aparición del mismo defecto** (N-8 y T-5 en la 9.1) en el mismo tipo de documento. La regla «crudo y transcrito no son lo mismo» estaba escrita *en el encabezado de la evidencia que la violaba*. Escribir la regla en el documento no alcanza para cumplirla.
2. **R-3 es la quinta aparición del patrón del detector ciego**, y ocurrió el mismo día en que se escribió la regla de mutación. La regla decía «una mutación por forma sintáctica»; se ejecutaron mutaciones, pero no una por forma. Cumplir la letra de una regla propia no es cumplirla.
3. **R-1, R-5 y R-6 son la misma falla con tres caras**: el instrumento existía y no hacía lo que se esperaba de él el día que hiciera falta. Ninguno de los tres habría fallado en verde — habrían fallado en una emergencia, que es el único momento en que no se puede corregir.

**Criterio de cierre aplicado**, el mismo que la 9.1 fijó: se cierra cuando ningún hallazgo sea mayor ni toque un instrumento del que dependa un gate. Esta ronda **no lo cumplía** —cuatro de los siete mayores tocaban instrumentos de recuperación—, así que se corrigió antes de commitear en vez de registrar la deuda.
