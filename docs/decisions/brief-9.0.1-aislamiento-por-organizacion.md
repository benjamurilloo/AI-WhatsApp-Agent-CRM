---
schema: task-brief.v1
task_id: 9.0.1
task_type: hardening
generated_at: 2026-09-21
---

# Brief: 9.0.1 — Aislamiento por organización en las escrituras y en la lectura de usuarios

## Objetivo

Cerrar **H-7** y **H-1** de la [8.4](brief-8.4-revision-de-seguridad.md): llevar el filtro por organización desde la disciplina del llamador hasta el propio acceso a datos, en las siete escrituras de datos de negocio que hoy filtran solo por id, y en la lectura de usuarios que hoy no filtra.

Se hace **antes de la 9.1** por un motivo concreto y no por prolijidad: los dos hallazgos son inalcanzables hoy porque existe un solo entorno con una sola organización real, y la 9.1 es exactamente la subfase que rompe ese supuesto. Corregirlos después de levantar staging es corregirlos cuando ya dejaron de ser teóricos.

## Ubicación en la Fase 9

- **Orden**: primera subfase de la Fase 9. Pertenece a la tarea madre **9.0**, junto a la 9.0.2 (`unaccent`) y la 9.0.3 (fronteras de módulo y nombres de CI).
- **Por qué está separada de la 9.0.2**: `unaccent` toca dos de estas mismas consultas, pero es otro concern. CLAUDE.md prohíbe mezclar módulos no relacionados en el mismo cambio, y mezclar un cambio de seguridad con uno de búsqueda haría que la revisión de la 9.0.1 tuviera que razonar sobre ambos.
- **Necesario ahora**: H-7 y H-1, con su evidencia.
- **Requisito antes de producción, fuera de esta subfase**: **H-3** (bloqueo global del ingreso sin proxy de confianza), que es precondición bloqueante de la 9.1 y se verifica allá, contra un proxy real que acá no existe.
- **Mejora posterior, explícitamente fuera**: Row-Level Security por organización. Sería la defensa estructural definitiva, exige que la aplicación se conecte con un rol sin `BYPASSRLS` —cosa que hoy no pasa ([ADR 0013](0013-rol-de-aplicacion-y-tablas-de-solo-insercion.md))— y merece su propio ADR. No se adelanta acá.
- **Gate de entrada**: Fase 8 cerrada. CI en verde en `10bec71` ([ejecución 35402663898](https://github.com/benjamurilloo/AI-WhatsApp-Agent-CRM/actions/runs/35402663898)).
- **Gate**: esta subfase **no abre ni cierra un gate**, así que el paso 4b del [ExecutionProtocol](../development/ExecutionProtocol.md) no la obliga a una revisión independiente. Se recomienda igual (D-6), porque su objeto es corregir hallazgos de seguridad y el precedente de la 8.4 es que la autoevaluación de un trabajo de seguridad falló de cuatro formas distintas.

## Hallazgos de la verificación previa (2026-09-21)

Verificado contra el código en `6215320`, no tomado de `Risks.md`.

1. **Las siete funciones de H-7 existen y son exactamente las siete descritas**, y cada una tiene **un solo llamador**:

   | Función | Definición | Llamador |
   |---|---|---|
   | `updateProductValues` | `catalog/repository.ts:162` | `catalog/service.ts:291` |
   | `updateProductActive` | `catalog/repository.ts:175` | `catalog/service.ts:336` |
   | `updateClientValues` | `crm/repository.ts:193` | `crm/service.ts:361` |
   | `updateClientActive` | `crm/repository.ts:203` | `crm/service.ts:401` |
   | `updateMemberRole` | `organizations/repository.ts:115` | `organizations/service.ts:404` |
   | `updateConversationStatus` | `conversations/repository.ts:176` | `conversations/service.ts:395` |
   | `widenConversationDates` | `conversations/repository.ts:347` | `conversations/service.ts:581` |

2. **Los siete llamadores tienen `organizationId` en el alcance**, incluido el más dudoso: `widenConversationDates` se llama desde `recordIngestedMessage`, que lo desestructura de su `input` en `conversations/service.ts:543`. No hay que hacer viajar el dato: ya está.

3. **La forma correcta ya existe en el mismo archivo.** `crm/repository.ts:213`, `findClientIdByPhoneE164(tx, organizationId, phoneE164)`, es el patrón a copiar. `inventory.applyStockChange` es el otro ejemplo que citaba la 8.4.

4. **El recuento de H-1 en `Risks.md` está mal.** Dice "sus cinco llamadores"; son **siete**, y siete funciones distintas: `listProductAudit` (`catalog/service.ts:169`), `listClientAudit` (`crm/service.ts:245`), `listStockMovements` (`inventory/service.ts:431`), y `getMember`, `listMembers`, `getAppFrame` y `lockedState` (`organizations/service.ts:104`, `190`, `213`, `256`). La conclusión no cambia —los siete arman los ids desde filas ya filtradas por organización, así que sigue siendo inalcanzable— pero el número sí. Es el **tercer recuento defectuoso** de esta línea de trabajo, después de los dos que la revisión independiente encontró en la 8.4.

5. **La corrección que `Risks.md` prescribe para H-1 es inviable como está escrita.** Dice "recibir la organización y filtrar por `organization_members`" dentro de `auth`. Eso choca con tres reglas vigentes a la vez:
   - `auth/repository.ts:5` declara que ninguna de sus consultas toca tablas de otro módulo ([brief-3.3](brief-3.3-autenticacion.md), D-2);
   - `eslint.config.mjs` bloquea que `auth/repository.ts` importe `@/modules/organizations/schema`: la excepción de `schema` solo alcanza a los archivos `src/modules/*/schema.ts`;
   - `auth` importando `organizations` crearía un **ciclo**, porque `organizations/service.ts:12` ya importa de `@/modules/auth`.

   Resuelto en **D-2**. La contradicción queda registrada acá porque es un defecto del plan de `Risks.md`, no del código.

6. **`organizations` no importa ningún módulo de negocio**: solo `audit` y `auth`. Así que darle la responsabilidad de la lectura filtrada no crea ciclos. `inventory` sí gana una dependencia nueva hacia `organizations`, y tampoco la cierra: `organizations` no importa `inventory`.

## Alcance incluido

1. **Agregar `organizationId` a las siete funciones de H-7** y al `where` de su `UPDATE`, según D-1.
2. **Pasar `organizationId` en los siete llamadores**, que ya lo tienen.
3. **Crear `getMemberSummaries` en `organizations`** como punto de entrada único de la lectura de usuarios, según D-2, y mover a él los llamadores de `getUserSummaries` que están fuera de `organizations`.
4. **Una guarda** que fije que solo `organizations` importa `getUserSummaries`, según D-3, con su caso que demuestra que falla.
5. **Tests de integración** que demuestren el aislamiento de las siete escrituras y de la lectura, según D-4.
6. **Actualizar la documentación**: [SecurityModel](../architecture/SecurityModel.md) §Autorización, y [Risks](../planning/Risks.md) cerrando H-1 y H-7 y **corrigiendo el recuento del hallazgo 4**.

## Alcance excluido

- **H-3**: es de la 9.1, y necesita un proxy real que acá no existe.
- **`unaccent`**: es de la 9.0.2, aunque toque `catalog/repository.ts:110` y `crm/repository.ts:86`.
- **La frontera de `analytics` en ESLint y el nombre del paso de guardas en `ci.yml`**: son de la 9.0.3. Esta subfase **no toca `eslint.config.mjs` ni `ci.yml`**.
- **Row-Level Security**, y cualquier cambio al rol con el que se conecta la aplicación.
- **Migraciones y esquema**: ninguna. El cambio es del acceso a datos, no de las tablas.
- **Cualquier cambio de comportamiento observable en pantalla.** Si una pantalla cambia lo que muestra, es un defecto de esta subfase, no una mejora.
- **Las demás funciones del repositorio que filtran solo por id y no son de las siete**, si aparecieran: se registran como hallazgo y se detiene (condición de detención 3), no se corrigen de más.

## Archivos o componentes autorizados

Lista cerrada. Tocar algo fuera de esto es hallazgo bloqueante.

- `src/modules/catalog/repository.ts`, `src/modules/catalog/service.ts`
- `src/modules/crm/repository.ts`, `src/modules/crm/service.ts`
- `src/modules/conversations/repository.ts`, `src/modules/conversations/service.ts`
- `src/modules/organizations/repository.ts`, `src/modules/organizations/service.ts`, `src/modules/organizations/index.ts`
- `src/modules/inventory/service.ts`
- `tests/guards/` — un archivo nuevo o el de frontera, según D-3
- `tests/integration/` — los archivos que D-4 determine
- `docs/architecture/SecurityModel.md`, `docs/planning/Risks.md`

## Fuentes de verdad

1. El código y las migraciones (jerarquía de CLAUDE.md).
2. [SecurityModel.md](../architecture/SecurityModel.md) §Autorización y [DataModel.md](../architecture/DataModel.md).
3. [brief-8.4](brief-8.4-revision-de-seguridad.md) para el enunciado de H-1 y H-7, y [ADR 0010](0010-un-usuario-una-organizacion-en-el-mvp.md) para por qué `users` es global.
4. [RepositoryStructure.md](../architecture/RepositoryStructure.md) y `eslint.config.mjs` para las fronteras.

## Dependencias

- Fase 8 cerrada, con su gate resuelto. Cumplido.
- El commit `6215320` está **sin publicar**: contiene las reglas nuevas de revisión independiente y la reasignación de `unaccent`. Por decisión del usuario (2026-09-21) se publica **al cerrar esta subfase**, junto con su propio commit.

## Decisiones a resolver

- **D-1 — Forma del filtro en las siete escrituras, y qué pasa si no actualiza nada.**
  Recomendación: agregar `organizationId` como parámetro y `where(and(eq(tabla.organizationId, organizationId), eq(tabla.id, entityId)))`, copiando `findClientIdByPhoneE164`. Sobre el caso de cero filas: hoy las siete devuelven `void` y un `where` que no encuentra nada pasa en silencio. Como los siete llamadores ya bloquearon la fila con `FOR UPDATE` en la misma transacción, cero filas solo puede ser un defecto de programación, no una carrera. Recomendación: **lanzar dentro de la transacción**, siguiendo la convención de la 4.3.1 ("un rechazo después de escribir se lanza dentro de la transacción"), en vez de agregar un resultado tipado que ningún llamador podría manejar de forma distinta.

- **D-2 — Forma de la corrección de H-1.**
  Recomendación: `organizations` expone `getMemberSummaries(organizationId, userIds)`, que lee `organization_members` filtrado por `organizationId`, interseca con los ids pedidos y llama a `auth.getUserSummaries` con el resultado. Sin JOIN entre tablas de dos módulos, sin ciclo, sin tocar ESLint y sin invalidar el comentario de `auth/repository.ts:5`, que sigue siendo cierto. `auth.getUserSummaries` **queda público** —`organizations` tiene que poder importarlo por la interfaz— y deja de ser el punto de entrada: de eso se ocupa D-3.
  Lo que esta forma **no** logra, y conviene decirlo antes de elegirla: la consulta de `auth` sigue sin filtro propio. La garantía pasa de siete lugares a uno, que es una mejora medible, pero no llega a ser estructural. La alternativa estructural es RLS, que está fuera de alcance.

- **D-3 — Dónde vive la guarda y qué demuestra.**
  Recomendación: archivo nuevo en `tests/guards/`, no dentro del de frontera, porque la regla que fija no es la frontera general sino un punto de entrada único. Tiene que fallar si cualquier archivo que no sea `src/modules/organizations/**` importa `getUserSummaries`, y su cabecera tiene que decir qué **no** comprueba, como mandó la 8.4 (D-4): no comprueba que `getMemberSummaries` filtre bien, solo que nadie esquive el punto de entrada. El caso que demuestra que falla se ejecuta y se registra.

- **D-4 — Qué prueba el aislamiento, y cómo se demuestra que la prueba sirve.**
  Recomendación: para cada una de las siete escrituras, un caso que intente la operación con el id de una entidad de **otra** organización y verifique que no escribe; y para la lectura, un caso que pida ids de otra organización y verifique que no vuelven. Y, obligatorio por la convención del proyecto: **cada caso se corre una vez sin la corrección** para registrar que falla. Sin esa corrida, la prueba no es evidencia de nada — es el hallazgo central de la 8.4 aplicado a esta subfase.

- **D-5 — Qué se escribe en `Risks.md`.**
  Recomendación: H-1 y H-7 se marcan resueltos con su evidencia, **sin borrar el enunciado original**, como se hizo con el hallazgo falso de la 8.4; y se corrige el recuento de cinco a siete dejando dicho que estaba mal, no en silencio.

- **D-6 — Revisión independiente.**
  El paso 4b no la obliga, porque esta subfase no abre ni cierra un gate. Recomendación: **hacerla igual**, con un agente que no participó y acceso de solo lectura, contra este brief. Motivo medido: la 8.4 aplicó todas las precauciones conocidas y su autoevaluación falló de cuatro formas. Además serviría para lo que el propio HANDOFF marca como límite conocido de la regla: la revisión independiente **nunca se usó dentro del ciclo, antes de cerrar**, y esta subfase es de bajo riesgo para probarlo.

## Invariantes

- Ninguna pantalla cambia lo que muestra.
- Ninguna migración, ningún cambio de esquema, ningún privilegio de `crm_app`.
- `messages`, `audit_logs`, `inventory_movements` e `ingestion_events` siguen siendo de solo inserción.
- Ningún `JOIN` entre tablas de módulos distintos; ningún ciclo de importación nuevo.
- Las cinco guardas existentes siguen pasando.
- Toda escritura auditada sigue siendo atómica con su auditoría.

## Criterios de aceptación

- **AC-1** — Las siete funciones de la tabla del hallazgo 1 reciben `organizationId` y lo incluyen en el `where` de su `UPDATE`. Verificable leyendo las siete.
- **AC-2** — Los siete llamadores pasan el `organizationId` que ya tenían, sin obtenerlo por una consulta nueva.
- **AC-3** — Existe `getMemberSummaries` en la interfaz pública de `organizations`, filtra por `organizationId` contra `organization_members` y es el único camino por el que los módulos de negocio obtienen resúmenes de usuario.
- **AC-4** — Los llamadores de `getUserSummaries` enumerados en el hallazgo 4 que están fuera de `organizations` pasan a usar `getMemberSummaries`; los que están dentro de `organizations` pueden seguir llamando a `auth` directamente.
- **AC-5** — Una guarda falla si un archivo fuera de `src/modules/organizations/**` importa `getUserSummaries`, y su cabecera declara qué no comprueba. Su caso de fallo está ejecutado y registrado.
- **AC-6** — Hay un caso de integración por cada una de las siete escrituras que demuestra que una entidad de otra organización no se modifica, y uno para la lectura. **Cada uno tiene registrada su corrida sin la corrección, mostrando que falla.**
- **AC-7** — `npm run test` en verde (guardas, unitarios, integración) y `npm run test:e2e` en verde, con los recuentos declarados y comparados contra los 62 / 302 / 390 / 81 de la Fase 8.
- **AC-8** — `SecurityModel.md` §Autorización refleja el estado nuevo, y `Risks.md` cierra H-1 y H-7 y corrige el recuento sin borrar el enunciado original.
- **AC-9** — Ningún archivo fuera de la lista cerrada quedó modificado, verificado con `git diff --name-only`.

## Pruebas y evidencia requerida

Nivel de evidencia: **`deterministic`**. Corresponde al `task_type` `hardening` sin efectos externos: tests unitarios, de integración y guardas contra el PostgreSQL real de desarrollo y de CI. El nivel del proyecto que esto alcanza es **validado localmente y en CI** — no "validado en integración" para el aislamiento, porque lo que se prueba es el acceso a datos y no un recorrido de pantalla.

No se repite la evidencia vigente de las pantallas: los end-to-end existentes ya cubren que el comportamiento visible no cambió, y se corren para confirmarlo (AC-7), no para producir evidencia nueva.

## Condiciones de detención

Parar y reportar, sin continuar:

1. **Antes de cualquier operación Git.** El commit de esta subfase y la publicación de `6215320` necesitan autorización explícita en el turno.
2. **Si un llamador no tiene `organizationId` disponible** y haría falta una consulta nueva para conseguirlo: eso cambia el diseño y no es un detalle de implementación.
3. **Si aparece una octava función** que escribe datos de negocio filtrando solo por id: se registra como hallazgo y se decide alcance, no se corrige por analogía.
4. **Si la guarda de D-3 no se puede hacer fallar**: una guarda cuyo caso de fallo no se demostró no cuenta como guarda (8.4).
5. **Si algún caso de D-4 pasa también sin la corrección**: significa que el test no prueba lo que dice, como pasó en la 7.2 con la defensa doble. Se registra y se busca una consulta donde sí tenga efecto.
6. **Si cerrar H-1 con la forma de D-2 exigiera tocar `eslint.config.mjs`**: eso es 9.0.3 y necesita otra autorización.
7. **Antes de escribir en Notion.**

---

## Revisión independiente (2026-09-21)

`self_assessment: false`. La hizo un agente que no participó de la implementación, con acceso de solo lectura, contra este brief. **Es la primera vez en el proyecto que la revisión independiente corre dentro del ciclo y no después de un cierre**, que era el límite conocido de la regla del paso 4b.

No pudo ejecutar nada —solo `Read`, `Grep` y `Glob`—, así que lo que dependía de ejecución quedó `no verificable por lectura`: AC-6 y AC-7, y el caso de fallo de la guarda. Eso es una limitación real del alcance de esa revisión y queda declarada.

Veredicto: **R1**, con dos hallazgos que exigen decisión del usuario, cuatro no bloqueantes y cuatro de estado documental. Todos se verificaron contra el código antes de aceptarse. Ninguno resultó falso.

### Corregido en esta misma subfase

1. **Agujero de la guarda.** Solo reconocía `import { … }`. No veía `import * as auth from "@/modules/auth"` —forma que usa el propio test de integración de esta subfase—, ni `export { … } from`, ni `export * from`. Es la misma clase de defecto que la revisión de la 8.4 encontró en `exposed-surface`, que solo veía `export function`. El detector ahora cubre las tres formas, con un caso versionado por cada una, y la cabecera declara el agujero que queda: la vía de `analytics`, que puede importar `@/modules/*/schema` y leer `users` directo, y que cierra la 9.0.3.
2. **La aserción de estado de los siete casos no podía fallar.** El ayudante `attempt` forzaba el rollback siempre, así que los `select` posteriores devolvían el valor original con y sin la corrección, y lo único que discriminaba era el mensaje de error. Ahora la transacción **se deja confirmar**: sin el filtro, la escritura no lanza, commitea y la aserción de estado falla. La prueba ahora falla por donde aparenta fallar.
3. **"Los siete llamadores ya bloquearon la fila con `FOR UPDATE`" era falso.** Seis lo hacen; `updateMemberRole` no, porque `findMember` no usa `FOR UPDATE`: su serialización viene de `withOrganizationLock`, que bloquea la fila de la organización. La conclusión de D-1 se sostiene, pero la afirmación estaba mal escrita en este brief y se había propagado a `src/modules/organizations/repository.ts`, a `Risks.md` y a `SecurityModel.md`. Corregida en los tres.
4. **`SecurityModel.md` afirmaba más que el instrumento**: decía que la guarda fija el punto de entrada "y no es solo una convención", sin la salvedad de lo que no cubre. Reescrito.

### Registrado sin corregir, por la condición de detención 3

5. **Hay dos escrituras más de la misma clase que H-7**, que esta subfase no vio: `ingestion.finishEvent` actualiza `ingestion_events` filtrando solo por id, y esa tabla tiene `organization_id`; `ingestion.revokeCredential` hace lo mismo sobre `ingestion_credentials`. Verificadas en `src/modules/ingestion/repository.ts:68-81` y `:123-135`. La primera es tan inalcanzable hoy como lo era H-7 y de la misma clase; la segunda recibe su id de un operador. **No se corrigieron**: la condición de detención 3 manda registrar y decidir alcance, no corregir por analogía. Quedan en `Risks.md` esperando la decisión del usuario.

   Es exactamente el modo de falla "un hallazgo no visto de la misma clase que uno que sí se vio" que la 8.4 ya había sufrido. Se repitió con las precauciones puestas.

6. **Un invariante de este brief estaba mal escrito.** Declaraba que `ingestion_events` es de solo inserción; [DataModel](../architecture/DataModel.md) dice que admite `UPDATE` de su estado, y no el borrado ni el cambio de identidad. Manda DataModel.

### Desvíos de alcance, declarados

7. **`docs/planning/Roadmap.md` y este brief no están en la lista cerrada de archivos autorizados.** El usuario autorizó explícitamente actualizar el Roadmap en el mismo turno en que aprobó este brief. Queda escrito acá y no solo en la conversación, que es lo que la revisión pedía.
8. **El test de integración importa cuatro `repository` internos**, y [RepositoryStructure](../architecture/RepositoryStructure.md) prohíbe eso para "cualquier archivo". ESLint no lo impide porque su regla solo alcanza a `src/**`. La motivación está escrita en la cabecera del test y es la única forma de probar el invariante, pero **la discrepancia con RepositoryStructure queda abierta**: ese documento no está en la lista cerrada y necesita autorización para registrar la excepción.

### Estado documental que quedó falso y no se pudo tocar

9. **`docs/product/NonFunctionalRequirements.md`** sigue afirmando en presente que "siete funciones escriben datos de negocio filtrando solo por id". Con esta entrega es falso. No está en la lista cerrada: necesita autorización.
10. **`HANDOFF.md`** dice "cinco guardas" (ahora son seis) y "62 guardas" de línea base. `CHANGELOG.md` dice "Guardas 63/63", que coincide con la medición de esta subfase. La cifra de `HANDOFF.md` era la equivocada; se corrige al reescribirlo en el cierre.

### Corrección propia, detectada al implementar

11. El **hallazgo 6 de la verificación previa** decía que `inventory` ganaría una dependencia nueva hacia `organizations`. Es falso: ya la tenía (`src/modules/inventory/service.ts` importaba `authorize` y `getOrganizationTimezone`). El resto del hallazgo —que no se cierra ningún ciclo— sigue siendo cierto.

### Cierre de los pendientes (2026-09-21)

12. Los cuatro puntos que quedaron abiertos se resolvieron con autorización del usuario en el turno del cierre:
    - **Alcance de `ingestion`** (punto 9 de la revisión): `ingestion_events` cuenta como datos de negocio. `finishEvent` entra como **9.0.4**, con brief y commit propios. `revokeCredential` queda diferida con su motivo escrito en [Risks](../planning/Risks.md); la condición que la reabre es que la revocación se exponga por HTTP o pase a manos no operativas.
    - **`RepositoryStructure.md`** (desvío 8): la excepción de prueba quedó registrada en §Frontera entre módulos, con la aclaración de que no se hereda en `src/**`.
    - **`NonFunctionalRequirements.md`** (punto 9 documental): §Seguridad dejó de afirmar en presente lo que ya no era cierto, y ahora separa lectura de escritura.
    - **Fragilidad nueva, observada al cerrar**: una corrida del proyecto `guards` falló una vez con 44 s de duración contra 2,7 s de las estables; tres corridas posteriores dieron 79/79. **No se reprodujo y la causa no está confirmada.** Se registró en el alcance de la 9.0.3 en lugar de descartarse: una guarda intermitente es peor que una que falla, porque el reintento la esconde.
      - **Fe de errata (2026-09-21, al preparar la 9.0.3).** Este párrafo decía además que «ninguna guarda fija timeout, así que corren con el default de 5 s». **La segunda mitad es falsa.** Ningún *archivo* de guarda fija timeout, eso sí, pero `vitest.config.mts` fija `testTimeout: 30000` para el proyecto `guards` desde `e820ca4` (2.5). De lo cierto se concluyó lo falso sin abrir la configuración del proyecto. Medido después: 79/79 en 3,3 s, con el caso de `module-boundary` —el que carga ESLint— en 1,5-1,6 s, veinte veces por debajo del límite real. La intermitencia sigue sin explicación; lo que se cae es la explicación que tenía.
