---
schema: task-brief.v1
task_id: 8.3
task_type: hardening
generated_at: 2026-09-18
---

# Brief: 8.3 — Dependencias

## Objetivo

Que la CI audite las dependencias en cada ejecución y falle ante una vulnerabilidad que importe, con un umbral elegido a conciencia y no por defecto; y que los avisos conocidos queden aceptados con una condición de salida verificable en lugar de silenciados.

Es la subfase más chica de la Fase 8 y la única paralelizable ([Roadmap](../planning/Roadmap.md)). Cierra la línea de [SecurityModel](../architecture/SecurityModel.md) §"Revisión de dependencias" que dice "se ejecuta auditoría automática de dependencias en CI (Fase 8)".

## Ubicación en la Fase 8

- **Orden**: paralelizable. 8.1 y 8.2 están cerradas; quedan 8.4 y 8.5.
- **Notion**: tarea "8.3 — Dependencias", descripción "S. Auditoría automática de dependencias en CI, que falla ante vulnerabilidades críticas". Estado "Bandeja de Entrada" y prioridad **baja** al escribir este brief (verificado el 2026-09-18).
- **Necesario ahora**: el paso de auditoría con su umbral, y la política escrita de qué se acepta y hasta cuándo.
- **Requisito antes de producción**, fuera de esta subfase: nada de esta subfase bloquea producción por sí mismo, pero la política que fije es la que después se cita en la 8.4.
- **Mejora posterior**: actualización automática de dependencias (Dependabot o Renovate), firma y verificación de procedencia de paquetes, SBOM.
- **Gates de entrada**: 8.2 cerrada, con CI en verde en `1b124a1` ([ejecución 35381730196](https://github.com/benjamurilloo/AI-WhatsApp-Agent-CRM/actions/runs/35381730196)). Verificado el 2026-09-18: `main` limpio en `1b124a1`.

## Hallazgos de la verificación previa (2026-09-18)

1. **La CI no audita nada hoy.** Sus quince pasos cubren migraciones desfasadas, lint, tipos, formato, guardas, tests, build y end-to-end. Ninguno mira vulnerabilidades.
2. **`npm audit` informa 4 moderadas, 0 altas y 0 críticas**, verificado hoy. El umbral que pide la tarea —fallar ante críticas— **pasaría en verde desde el primer día**, lo cual está bien pero conviene decirlo: no va a encontrar nada ahora.
3. **`npm audit --omit=dev` da CERO de cualquier severidad.** Las cuatro son de `devDependencies`. **Lo que se despliega no arrastra ninguna vulnerabilidad conocida**, y eso cambia el análisis: el umbral estricto sale gratis donde de verdad importa.
4. **Las cuatro son una sola cadena**: `drizzle-kit` → `@esbuild-kit/esm-loader` → `@esbuild-kit/core-utils` → `esbuild`. El aviso de `esbuild` es que su **servidor de desarrollo** permite que cualquier sitio le haga pedidos y lea la respuesta. `drizzle-kit` es la herramienta de migraciones: no corre en producción ni recibe tráfico.
5. **El arreglo que npm propone es un downgrade.** `fixAvailable` dice `drizzle-kit` 0.18.1, semver-major **hacia atrás** desde la 0.31.10 instalada. `npm audit fix` rompería el proyecto. Ya está registrado en [EngineeringStandards](../development/EngineeringStandards.md) (línea 52).
6. **No hay salida en la línea estable, pero sí una con condición concreta.** `drizzle-kit@latest` es 0.31.10 —la instalada— y sigue dependiendo de `@esbuild-kit/esm-loader`. En cambio **Drizzle Kit 1.0 suelta la cadena entera**: la `1.0.0-rc.5` usa `jiti` en vez de `@esbuild-kit/esm-loader`, y `esbuild ^0.25.10`, que es la línea corregida. Es decir, los cuatro avisos **desaparecen con Drizzle Kit 1.0 estable**, que ya figura en las revisiones de stack pendientes. Esto convierte un riesgo abierto en uno con condición de salida verificable.
7. **Las acciones de GitHub ya están fijadas por SHA**, con la versión en un comentario ([EngineeringStandards](../development/EngineeringStandards.md), línea 91). Es una defensa de cadena de suministro que ya existe: la 8.3 no la agrega, la verifica como vigente.
8. **No hay Dependabot ni Renovate**: `.github/` contiene solo `workflows/ci.yml`.
9. **El nombre del paso de guardas está desactualizado, y esta es la subfase que puede arreglarlo.** Dice "Guardas (referencias prohibidas y frontera entre módulos)" y hoy hay cuatro archivos de guarda: esos dos más `stock-writes` (4.3.1) y `log-surface` (8.2). El pendiente registrado desde hace varias subfases decía "se renombra en una subfase que autorice `ci.yml`", y la 8.3 es la primera que lo autoriza. Se resuelve en D-5.
10. **La CI informa pero no bloquea**: el plan gratuito no ofrece protección de rama, y se compensa verificando la CI antes de cada cierre (Risks). "Fallar ante una vulnerabilidad" significa que la ejecución sale en rojo, no que impida un merge. No es un defecto de esta subfase: es la limitación ya aceptada, y conviene que la política no prometa más que eso.

## Alcance incluido

1. Un paso de auditoría de dependencias en `ci.yml`, con el umbral que fije D-1.
2. La política escrita de qué se acepta, por qué y hasta cuándo, con la condición de salida del hallazgo 6 (D-2).
3. El lugar del paso en el pipeline (D-3).
4. El renombre del paso de guardas (D-5), si se aprueba.
5. Actualización de [SecurityModel](../architecture/SecurityModel.md) §"Revisión de dependencias" y de [EngineeringStandards](../development/EngineeringStandards.md) con lo que la CI realmente comprueba, y de [Risks](../planning/Risks.md) para reformular la entrada de los avisos de `npm audit`.

## Alcance excluido

- **Actualizar `drizzle-kit`, migrar a Drizzle 1.0 o cambiar cualquier versión del stack.** Es un cambio de versión mayor y tiene su propia revisión registrada; esta subfase solo fija la condición.
- **`npm audit fix`**, en cualquier variante.
- **Dependabot, Renovate, SBOM o verificación de procedencia**, salvo que D-4 los incluya.
- **Tocar `package.json` o `package-lock.json`.** Si el umbral elegido falla hoy, eso es un hallazgo y una condición de detención, no una excusa para actualizar paquetes dentro de esta subfase.
- **La revisión de seguridad ítem por ítem** (8.4) y **el rendimiento** (8.5).
- **Cambiar la política de protección de rama**: no está disponible en el plan actual.

## Archivos o componentes autorizados

Lista cerrada.

- `.github/workflows/ci.yml`
- `docs/architecture/SecurityModel.md`
- `docs/development/EngineeringStandards.md`
- `docs/planning/Risks.md`
- `docs/decisions/brief-8.3-dependencias.md` — este archivo.

Con autorización explícita en el turno, al cerrar: `docs/decisions/README.md` y `CHANGELOG.md`.

**`package.json` y `package-lock.json` quedan fuera a propósito**, para que esta subfase no pueda convertirse en una actualización de dependencias encubierta.

## Fuentes de verdad

1. La salida real de `npm audit` sobre el `package-lock.json` versionado.
2. [architecture/SecurityModel.md](../architecture/SecurityModel.md) §"Revisión de dependencias" y [development/EngineeringStandards.md](../development/EngineeringStandards.md).
3. [planning/Roadmap.md](../planning/Roadmap.md) (alcance de la Fase 8) y [planning/Risks.md](../planning/Risks.md).
4. [CLAUDE.md](../../CLAUDE.md): vocabulario de validación, y la prohibición de instalar dependencias sin autorización.

## Dependencias

- 8.2 cerrada (gate verificado). No depende de 8.4 ni de 8.5.
- No necesita base de datos: la auditoría es sobre el lockfile.

## Decisiones pendientes

### D-1 — Qué umbral hace fallar la CI

La tarea de Notion dice "falla ante vulnerabilidades críticas". Tomado literalmente es `--audit-level=critical` sobre todo el árbol, que hoy pasa y seguiría pasando aunque apareciera una vulnerabilidad **alta** en una dependencia de producción. Dado el hallazgo 3 —producción está en cero— hay margen para más sin costo.

- **(a) Literal**: `npm audit --audit-level=critical` sobre todo el árbol. Cumple la tarea. Deja pasar altas en producción.
- **(b) Dos puertas**: `npm audit --omit=dev --audit-level=high` (o incluso `moderate`) para lo que se despliega, **más** `npm audit --audit-level=critical` para todo el árbol. La primera es la que protege al usuario; la segunda honra la tarea sin romperse con los cuatro avisos de herramientas conocidos.
- **(c) Un solo umbral alto** para todo el árbol: falla hoy no, pero cualquier alta en una herramienta de desarrollo frenaría la CI.

**Recomendación: (b), con la puerta de producción en `high`.** Es la que separa "esto llega a un usuario" de "esto corre en la máquina de quien desarrolla", que es la distinción que el hallazgo 4 vuelve evidente. Poner producción en `moderate` es tentador —hoy está en cero, así que sería gratis— pero cualquier aviso moderado futuro frenaría la CI sin que nadie haya decidido que eso vale, y la CI que se ignora es peor que la que no existe. Si preferís `moderate`, se cambia una palabra.

Pendiente de resolución del usuario.

### D-2 — Qué se hace con los cuatro avisos conocidos

- **(a) Aceptarlos con condición de salida escrita**: son de herramientas, no llegan a producción, el arreglo de npm es un downgrade, y desaparecen con Drizzle Kit 1.0 (hallazgo 6). El umbral de D-1 los deja pasar sin necesidad de silenciarlos.
- **(b) Silenciarlos con una lista de excepciones** (`audit-ci`, `better-npm-audit` u `overrides`), lo que permitiría bajar el umbral general.
- **(c) Forzar `overrides` de `esbuild`** en `package.json` para sacarlos del árbol.

**Recomendación: (a).** La (b) suma una dependencia nueva y una lista que hay que mantener y que, sobre todo, **oculta el aviso en vez de fecharlo**. La (c) toca `package.json`, está excluida, y forzar un `esbuild` distinto por debajo de `drizzle-kit` es exactamente el tipo de arreglo que rompe una herramienta de migraciones sin avisar. Aceptarlos por escrito con la condición "desaparecen con Drizzle Kit 1.0 estable" es honesto y verificable: alguien puede comprobarlo con un comando.

Pendiente de confirmación.

### D-3 — Dónde va el paso y qué hace cuando falla

El paso necesita `npm ci` antes. Puede ir inmediatamente después, o al final junto al resto.

**Recomendación**: **inmediatamente después de instalar dependencias**, antes de lint. Una vulnerabilidad crítica en el árbol es información que conviene tener en los primeros segundos, no después de doce minutos de tests. Falla el job como cualquier otro paso: sin `continue-on-error`, porque un paso que nunca puede fallar no es una puerta. Y sin `--audit-level` implícito: los dos comandos con su umbral explícito, para que la salida diga qué se comprobó.

Pendiente de confirmación.

### D-4 — Si entra la actualización automática de dependencias

Dependabot es gratis en repositorios privados y sería un archivo (`.github/dependabot.yml`).

**Recomendación: no, fuera de alcance.** La tarea pide auditoría, no actualización, y un bot que abre pull requests en un repositorio de una sola persona sin protección de rama agrega ruido sin agregar garantía. Queda como mejora posterior, registrada. Si lo querés ahora, es una decisión tuya y amplía la lista de archivos autorizados.

Pendiente de confirmación.

### D-5 — Renombrar el paso de guardas

El nombre menciona dos de las cuatro guardas (hallazgo 9). Esta es la primera subfase que autoriza `ci.yml`, y el pendiente pedía justamente eso.

**Recomendación: sí**, con un nombre que no haya que volver a cambiar cada vez que se agrega una guarda: "Guardas" a secas, o "Guardas del repositorio". El detalle de cuáles son vive en `tests/guards/`, no en el nombre de un paso de CI.

Pendiente de confirmación.

## Invariantes

1. **No se tocan `package.json` ni `package-lock.json`.**
2. **No se ejecuta `npm audit fix`** ni ninguna actualización de paquetes.
3. **Ningún paso existente de la CI cambia de comportamiento**; el de guardas puede cambiar de nombre si D-5 lo aprueba, no de contenido.
4. **Sin dependencias nuevas**, tampoco de CI.
5. **El umbral queda explícito en el comando**, no heredado de un valor por defecto que puede cambiar entre versiones de npm.
6. **La política no promete bloquear merges**, porque la CI no puede hacerlo hoy.

## Criterios de aceptación

- **AC-1** — `ci.yml` tiene un paso de auditoría con el umbral de D-1 escrito explícitamente, sin `continue-on-error`.
- **AC-2** — La CI pasa en verde con el árbol de dependencias actual, y la salida del paso muestra qué se comprobó.
- **AC-3** — **Se demuestra que el paso sabe fallar**: con el umbral bajado a propósito, la auditoría falla con los avisos conocidos. La prueba se hace localmente y su salida queda en el brief; no se commitea el umbral mutado.
- **AC-4** — Los cuatro avisos conocidos están aceptados por escrito con su razón (herramientas, no producción; el arreglo de npm es un downgrade) y su **condición de salida verificable** (Drizzle Kit 1.0 estable suelta la cadena), no silenciados.
- **AC-5** — [SecurityModel](../architecture/SecurityModel.md) §"Revisión de dependencias" dice qué comprueba la CI y con qué umbral, y [EngineeringStandards](../development/EngineeringStandards.md) queda coherente con eso. La entrada de [Risks](../planning/Risks.md) sobre `npm audit` queda reformulada con la condición de salida, no borrada.
- **AC-6** — Si D-5 se aprueba, el paso de guardas tiene un nombre que no miente, y el pendiente correspondiente queda cerrado.
- **AC-7** — La suite completa sigue pasando y ningún test se modificó.

## Pruebas y evidencia requerida

| Afirmación | Nivel | Dónde |
|---|---|---|
| La CI audita dependencias y pasa con el árbol actual | `deterministic` | ejecución de CI del commit |
| El paso falla cuando hay algo que encontrar | `deterministic` | corrida local con el umbral bajado, con su salida en el brief |
| Producción no arrastra vulnerabilidades conocidas | medición | `npm audit --omit=dev`, con fecha |
| Los avisos conocidos desaparecen con Drizzle Kit 1.0 | medición | comparación de dependencias declaradas entre `0.31.10` y la `1.0.0-rc`, con fecha |

**Nivel del proyecto alcanzable**: *validado localmente y en CI*. Una auditoría de dependencias no da más que eso: comprueba un lockfile contra una base de avisos en un momento, y esa base cambia sola. Conviene que la documentación no lo presente como una garantía permanente.

## Condiciones de detención

1. **D-1 sin resolver**: no se toca `ci.yml`.
2. **Si el umbral elegido falla con el árbol actual**: parar y reportar con la salida. La salida **no** es actualizar paquetes ni bajar el umbral por conveniencia: las dos son decisiones del usuario.
3. **Si aparece una vulnerabilidad alta o crítica en una dependencia de producción** durante la verificación: parar y reportar de inmediato. Eso deja de ser esta subfase.
4. **Si cumplir el criterio exigiera tocar `package.json` o `package-lock.json`**: parar. Están fuera de la lista por diseño.
5. **Antes de cualquier commit, push o cambio en Notion**, y antes de tocar `docs/decisions/README.md` o `CHANGELOG.md`.

---

## Resolución (2026-09-18)

El usuario aprobó las cinco recomendaciones.

| Decisión | Resolución |
|---|---|
| **D-1** | **(b)**, con la puerta de producción en `high`: `npm audit --omit=dev --audit-level=high` y `npm audit --audit-level=critical`. |
| **D-2** | **(a)**: los cuatro avisos se aceptan por escrito en [Risks](../planning/Risks.md), con su condición de salida. Sin lista de excepciones, sin `overrides`, sin `npm audit fix`. |
| **D-3** | Inmediatamente después de `npm ci`, antes del control de migraciones y del lint. Sin `continue-on-error`. |
| **D-4** | **No**: Dependabot y Renovate quedan fuera de alcance, como mejora posterior. |
| **D-5** | **Sí**: el paso pasa a llamarse "Guardas del repositorio". |

## Ejecución (2026-09-18)

### Corrección al hallazgo 6

La versión que el hallazgo 6 citaba como `1.0.0-rc.5` **no existe con ese nombre en el registro**. La línea 1.0 de `drizzle-kit` solo publica prelanzamientos con sufijo de commit: `npm view drizzle-kit@1.0.0-rc.5` responde 404. Los identificadores reales al 2026-09-18 son la etiqueta `rc` → `1.0.0-rc.4` y la etiqueta `rc5` → `1.0.0-rc.5-5935859`, y `latest` sigue siendo `0.31.10`.

La conclusión del hallazgo **no cambia**, y se verificó sobre las versiones reales:

| Versión | Dependencias declaradas relevantes |
|---|---|
| `0.31.10` (instalada) | `@esbuild-kit/esm-loader ^2.5.5`, `esbuild ^0.25.4`, `tsx ^4.21.0` |
| `1.0.0-rc.4` | `jiti ^2.6.1`, `esbuild ^0.25.10` — sin `@esbuild-kit/*` |
| `1.0.0-rc.5-5935859` | `jiti ^2.6.1`, `esbuild ^0.25.10` — sin `@esbuild-kit/*` |

El `esbuild ^0.25.4` de la 0.31.10 no es el vulnerable: el aviso es sobre el `esbuild` anidado bajo `@esbuild-kit/core-utils`, que es la dependencia que la 1.0 suelta. La condición de salida queda escrita en Risks con esta precisión y con la fecha.

### AC-2 — Las dos puertas pasan con el árbol actual

```
$ npm audit --omit=dev --audit-level=high
found 0 vulnerabilities                      → exit 0

$ npm audit --audit-level=critical           → exit 0
```

### AC-3 — Evidencia de mutación: el paso sabe fallar

Con el umbral bajado a propósito a `moderate` sobre el árbol completo, **la auditoría falla** (no se commiteó el umbral mutado):

```
$ npm audit --audit-level=moderate
esbuild  <=0.24.2
Severity: moderate
esbuild enables any website to send any requests to the development server and read the response
  @esbuild-kit/core-utils  *
    @esbuild-kit/esm-loader  *
      drizzle-kit  0.19.0 - 1.0.0-beta.1-fd8bfcc

4 moderate severity vulnerabilities
                                             → exit 1
```

El paso no es decorativo: falla cuando hay algo que encontrar, y el umbral es lo único que separa los dos resultados.

### Hallazgos de la ejecución

11. **La lista de pasos de CI de [EngineeringStandards](../development/EngineeringStandards.md) §CI tenía el orden equivocado.** Ponía el control de desfase de migraciones en quinto lugar, después de lint, typecheck y formato; en `ci.yml` va inmediatamente después de `npm ci`. No es un defecto de comportamiento —la CI siempre corrió en el orden del archivo—, sino documentación que se citaba mal. Se corrigió al insertar el paso de auditoría, porque la numeración había que rehacerla igual.
12. **La entrada de los avisos de `npm audit` no estaba en [Risks](../planning/Risks.md)**, como suponía el alcance incluido: estaba solo en EngineeringStandards, en la línea de compatibilidades. Se agregó a Risks como limitación aceptada con su condición de salida —que es donde el brief la quería— y la línea de EngineeringStandards quedó apuntando ahí en vez de repetir el análisis.
13. **La descripción de las guardas en EngineeringStandards también mencionaba solo dos de las cuatro**, igual que el nombre del paso de CI. Al renombrar el paso (D-5) se completó la lista en el documento, que es donde el detalle sí corresponde.
