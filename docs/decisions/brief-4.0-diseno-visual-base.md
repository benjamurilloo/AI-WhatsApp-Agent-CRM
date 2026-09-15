---
schema: task-brief.v1
task_id: 4.0
task_type: implementation
generated_at: 2026-09-14
---

# Brief: 4.0 — Diseño visual base

## Objetivo

1. Definir un **diseño visual base** para el CRM:
   - paleta en la gama azul verdosa, con modo claro y modo oscuro;
   - tipografía;
   - escala de espaciado, radios y sombras;
   - componentes base.
2. Aplicarlo a la **pantalla 1** (ingreso y cambio obligatorio de contraseña), a la **pantalla 10** (usuarios y roles) y al **marco común**, **sin cambiar comportamiento**.
3. Agregar el **modo oscuro**, pedido por el usuario el 2026-09-14.
4. Mantener la accesibilidad WCAG 2.2 AA verificada con axe, ahora **en los dos modos**.

No es la identidad visual definitiva, que sigue fuera del MVP. Va antes de la 4.1 para que las pantallas 3 a 10 nazcan con estos estilos.

## Ubicación en la Fase 4

- **Orden previsto**: **4.0** → 4.1 → 4.2 → 4.3 → 4.4.
- **Notion**: "4.0 — Diseño visual base", en proceso desde el 2026-09-14. La Fase 4 pasó a "En progreso" el mismo día, con autorización del usuario.
- **Gates de entrada**:
  1. Fase 3 cerrada, con CI en verde en `4fa7a39` (ejecución 34897976903).
  2. Sin migraciones. La única incorporación prevista son los archivos de fuente de D-3, que necesitan autorización para descargarse.

## Hallazgos de la verificación previa (2026-09-14)

1. **Estado**: `main` limpio en `4fa7a39`, al día con `origin/main`.
2. **Los colores están escritos a mano en 10 archivos**: 35 usos de `slate`, `blue`, `red` y `green` de Tailwind en `src/app/`, 14 de ellos en `form-styles.ts`. Con `dark:` en cada clase habría que duplicar cada uno. Se resuelve en D-1.
3. **No hay tipografía definida**: el cuerpo usa la fuente del sistema que trae Tailwind por defecto.
4. **`globals.css` solo aplica `bg-slate-50 text-slate-900`.** No hay tokens ni variables CSS.
5. **Los end-to-end no dependen de clases CSS**: buscan por rol, etiqueta y texto. Cambiar estilos no debería romper ningún selector.
6. **axe corre solo en el esquema claro.** `expectAccessible` está duplicada en `login.spec.ts` y `users.spec.ts` y no emula `prefers-color-scheme`. Con modo oscuro, un contraste roto en ese modo pasaría la CI. Se resuelve en D-6.
7. **La paleta propuesta en D-2 se verificó** con un cálculo de contraste WCAG sobre sus 17 pares de uso en los dos modos. Todos cumplen, y el mínimo es 3,83:1 en bordes de campo (se exige 3:1). Es un cálculo sobre valores hexadecimales, no evidencia de la UI: la evidencia la da axe en AC-4.
8. **`next/font/local` viene con Next.js**: servir una fuente local no agrega dependencias de npm.
9. **Screens.md, reglas comunes**, exige foco visible y estados que nunca dependan solo del color. Los estados actuales ya usan texto: "Activo" e "Inactivo", "(vos)" y mensajes.

## Alcance incluido

1. Registrar la resolución de D-1 a D-7.
2. **Tokens** en `src/app/globals.css`, según D-1 y D-2:
   - variables CSS semánticas para los modos claro y oscuro;
   - expuestas a Tailwind con `@theme inline` (por ejemplo `bg-surface`, `text-muted`, `bg-primary`);
   - escala de radios y sombras, y el uso de la escala de espaciado de Tailwind documentado.
3. **Tipografía** según D-3: fuente local con `next/font/local`, pesos variables, respaldo con fuentes del sistema y cifras tabulares en tablas y paginación.
4. **Modo oscuro** según D-4:
   - sin preferencia guardada, sigue `prefers-color-scheme`;
   - selector "Sistema", "Claro" y "Oscuro" en el marco común, que guarda la preferencia en una cookie mediante una Server Action;
   - el layout raíz lee la cookie en el servidor y marca `data-theme` en `<html>`, sin script en línea ni parpadeo.
5. **Componentes base** según D-5, en `src/app/_components/`:
   - `form-styles.ts` reescrito sobre los tokens, con los mismos nombres exportados;
   - nuevas clases de tabla, tarjeta, insignia de estado y título de página;
   - `auth-card.tsx`, `page-notice.tsx`, `app-nav.tsx` y `copy-button.tsx` sobre los tokens.
6. **Aplicación**, sin tocar la lógica ni los textos:
   - pantalla 1: `/login` y `/cambiar-contrasena`;
   - pantalla 10: `/usuarios`, `/usuarios/nuevo` y `/usuarios/[memberId]`;
   - marco común y `/`.
   Ninguna clase de color de la paleta por defecto de Tailwind queda en `src/app/`.
7. **Tests end-to-end**, según D-6:
   - `expectAccessible` pasa axe en `light` y `dark` con `page.emulateMedia`, en los dos archivos;
   - un caso nuevo en `users.spec.ts`: el selector cambia el tema, marca `data-theme`, sobrevive a recargar y "Sistema" vuelve a seguir al sistema operativo;
   - ningún otro caso cambia.
8. **Tests unitarios**: lectura de la cookie de tema con valores inválidos reemplazados por "Sistema".
9. **Documentación**:
   - Screens.md, reglas comunes: tema claro, oscuro y de sistema, y la regla de usar solo tokens;
   - EngineeringStandards: convención de tokens y prohibición de colores directos de Tailwind;
   - RepositoryStructure: fila de la 4.0, `_fonts/` y el selector de tema;
   - licencia SIL OFL de la fuente junto a sus archivos en `src/app/_fonts/`: el repositorio no tiene un documento de avisos de terceros, y esta subfase no lo crea.

## Alcance excluido

- Logo, marca, ilustraciones e iconografía: son parte de la identidad visual definitiva.
- Pantallas 2 a 9, que se construyen en sus fases con estos estilos.
- Guardar la preferencia de tema en la base de datos o por usuario.
- Animaciones y transiciones más allá de `hover` y foco.
- Bibliotecas de componentes (shadcn/ui, Radix, Headless UI) y dependencias de npm.
- Cambios de comportamiento, textos, rutas, esquema o migraciones.

## Archivos o componentes autorizados

Lista cerrada:

- `src/app/globals.css` y `src/app/layout.tsx`.
- `src/app/_fonts/`: archivos `woff2` de la fuente de D-3 y su licencia.
- `src/app/_components/`: los existentes y un selector de tema con su acción y sus `*.test.ts`.
- `src/app/_theme/` o equivalente: lectura y escritura de la cookie de tema, con sus `*.test.ts`.
- `src/app/login/`, `src/app/cambiar-contrasena/` y `src/app/(autenticado)/`, solo en `className` y marcado de presentación.
- `tests/e2e/login.spec.ts` y `tests/e2e/users.spec.ts`, en lo que pide D-6.
- Los documentos del punto 9.
- Este brief y su fila en `docs/decisions/README.md`.
- `CHANGELOG.md` y `HANDOFF.md`, al cerrar la subfase.

## Fuentes de verdad

1. [Screens.md](../product/Screens.md), reglas comunes y §1 y §10, con los [wireframes](../product/wireframes/README.md) 01, 02 y 10.
2. [NonFunctionalRequirements.md](../product/NonFunctionalRequirements.md): accesibilidad.
3. [EngineeringStandards.md](../development/EngineeringStandards.md): Tailwind CSS 4.3.3, Playwright y `@axe-core/playwright`.
4. [brief-3.5](brief-3.5-pantalla-de-inicio-de-sesion.md) (D-2, estilos) y [brief-3.7](brief-3.7-gestion-de-usuarios-y-roles.md) (D-7, marco común).
5. [Roadmap.md](../planning/Roadmap.md), Fase 4.

## Dependencias

- Fase 3 cerrada.
- Autorización para descargar los archivos de la fuente (D-3).
- Contenedor de PostgreSQL en marcha para los end-to-end.

## Decisiones pendientes

Cada decisión trae una recomendación, no una resolución: la resuelve el usuario.

### D-1 — Cómo se expresan los colores

- **Opciones**:
  - (a) **Tokens semánticos**: variables CSS (`--surface`, `--text-muted`, `--primary`…) con valores por modo, expuestas a Tailwind con `@theme inline`. Las clases dicen el rol (`bg-surface`), no el color.
  - (b) **Variantes `dark:`** en cada clase, con la paleta de Tailwind.
- **Recomendación**: (a).
  - Cada clase se escribe una vez y el modo lo resuelve la variable: no hay 35 pares que mantener en sincronía.
  - Cambiar la identidad visual definitiva más adelante será cambiar valores, no pantallas.
  - Es el mecanismo documentado de Tailwind CSS 4 para temas.
- **Consecuencia**: EngineeringStandards prohíbe colores directos de la paleta de Tailwind en `src/app/`, y la verificación de AC-6 lo comprueba con `grep`.

### D-2 — Paleta

Nombre de trabajo: **Laguna**. Un verde azulado profundo como color principal, un azul petróleo como acento y neutros levemente fríos, para que el conjunto no se vea gris ni azul genérico.

| Token | Uso | Claro | Oscuro |
|---|---|---|---|
| `background` | fondo de página | `#F3F7F6` | `#0B1514` |
| `surface` | tarjetas, tablas, marco | `#FFFFFF` | `#11201F` |
| `surface-muted` | encabezados de tabla, filas en hover | `#E6EFEE` | `#172A29` |
| `text` | texto principal | `#10211F` | `#E3EEEC` |
| `text-muted` | texto secundario | `#4B5E5C` | `#9BB1AE` |
| `border` | separadores | `#D2DFDD` | `#24393A` |
| `border-strong` | bordes de campos | `#6F8785` | `#6C8785` |
| `primary` | botón principal, enlaces, sección actual | `#0B6E69` | `#3DBFB2` |
| `primary-hover` | hover del principal | `#08524F` | `#62D2C6` |
| `on-primary` | texto sobre `primary` | `#FFFFFF` | `#04201D` |
| `primary-soft` / `on-primary-soft` | insignias y sección actual | `#DDF1EE` / `#07423F` | `#123634` / `#A6E6DE` |
| `accent` / `focus` | anillo de foco y acentos | `#1C5D8C` | `#6BB6E8` |
| `danger` / `danger-soft` / `on-danger-soft` | errores y desactivar | `#B42318` / `#FDECEA` / `#8A1B12` | `#F47A6E` / `#3A1714` / `#FBC4BD` |
| `success` / `success-soft` / `on-success-soft` | avisos de éxito, "Activo" | `#17704A` / `#E3F4EA` / `#0F4F34` | `#56C98F` / `#10301F` / `#AEE8C8` |

- **Contraste calculado** (hallazgo 7): texto sobre fondo 15,4:1 en claro y 15,7:1 en oscuro; `on-primary` sobre `primary` 6,1:1 y 7,6:1; texto secundario sobre superficie 6,9:1 y 7,4:1; foco sobre superficie 7,0:1 y 7,6:1.
- **Alternativas**: (b) un azul verdoso más brillante y saturado (`#0D9488` como principal), que falla AA con texto blanco (3,7:1) y obliga a oscurecerlo igual; (c) la paleta `teal` de Tailwind sin tokens propios.
- **Recomendación**: la tabla de arriba. Si al aplicarla algún tono no convence, se ajusta dentro de la subfase manteniendo AA, y el cambio se registra en la resolución.

### D-3 — Tipografía

- **Opciones**:
  - (a) **Manrope**:
    - sans serif geométrica moderna, con formas abiertas;
    - se lee bien en tamaños chicos de tabla y tiene carácter en los títulos;
    - variable del 200 al 800, licencia SIL OFL;
    - poco vista en backoffices, a diferencia de Inter o Roboto.
  - (b) **Figtree**: más cálida y redondeada, también OFL y variable. Tiene menos carácter en títulos grandes.
  - (c) **Fuentes del sistema** (`system-ui`): sin archivos nuevos, pero se ve distinto en cada sistema operativo y no aporta identidad.
- **Recomendación**: (a), con esta escala:
  - títulos de página en 600–700, con `letter-spacing` levemente negativo;
  - texto de interfaz en 400–500, a 16 px de base; etiquetas y celdas a 14 px;
  - `font-variant-numeric: tabular-nums` en tablas y paginación.
- **Cómo se incorpora**:
  - archivo variable `woff2` con el subconjunto latino, en `src/app/_fonts/`, con su licencia al lado;
  - se carga con `next/font/local`, que la sirve desde el propio servidor, sin red en ejecución ni en la CI;
  - respaldo `system-ui, sans-serif` con ajuste de métricas.
- **Consecuencia**: descargar el archivo del repositorio oficial de la fuente es una acción externa y **necesita autorización**. Si la fuente no trae cifras tabulares, se detiene y se propone (b).

### D-4 — Mecanismo del modo oscuro

- **Opciones**:
  - (a) **Solo `prefers-color-scheme`**: sigue al sistema operativo, sin selector.
  - (b) **Sistema por defecto con selector** "Sistema", "Claro" y "Oscuro":
    - la preferencia se guarda en una cookie `theme`, no `HttpOnly`, `SameSite=Lax`, de un año;
    - una Server Action la escribe y valida el valor;
    - el layout raíz la lee en el servidor y marca `data-theme` en `<html>`;
    - sin cookie, el CSS aplica `prefers-color-scheme`.
  - (c) **Preferencia por usuario en la base**: necesita una migración.
- **Recomendación**: (b).
  - Quien trabaja muchas horas en el CRM puede querer un modo distinto al del sistema.
  - Leerla en el servidor evita el parpadeo sin scripts en línea, lo que deja libre la CSP de la Fase 8.
  - Todas las páginas ya son dinámicas por la sesión, así que leer la cookie no cambia su renderizado.
  - (c) agrega esquema por una preferencia visual.
- **Consecuencias**:
  - el selector vive en el marco común; `/login` y `/cambiar-contrasena` respetan la cookie, pero no muestran el selector;
  - la cookie no contiene datos personales ni afecta la seguridad: un valor inválido se trata como "Sistema".

### D-5 — Componentes base

- **Opciones**:
  - (a) **Constantes de clases** en `form-styles.ts`, como hoy, reescritas sobre tokens, más componentes React solo donde el marcado se repite (tarjeta y aviso de página, que ya existen).
  - (b) **Componentes React para todo**: `<Button>`, `<Input>`, `<Table>`…
  - (c) **Biblioteca de componentes**: shadcn/ui o Radix.
- **Recomendación**: (a).
  - Mantiene los nombres exportados, así que las pantallas solo cambian sus clases sueltas.
  - (b) reescribe marcado que ya pasa axe, con riesgo de cambiar comportamiento, justo lo que esta subfase no debe hacer.
  - (c) agrega dependencias y estilos propios que compiten con los tokens.
- **Consecuencia**: si en la Fase 4 un patrón se repite en tres pantallas, se extrae como componente en esa subfase.

### D-6 — axe en los dos modos

- **Opciones**:
  - (a) **Cada llamada a `expectAccessible`** analiza la página en `light` y en `dark` con `page.emulateMedia({ colorScheme })`.
  - (b) **Un caso nuevo** que recorre algunas páginas en oscuro.
  - (c) Solo modo claro, como hoy.
- **Recomendación**: (a).
  - Cubre en oscuro exactamente los mismos estados que ya cubre en claro, sin elegir a mano.
  - Suma segundos a la CI, no minutos: 15 análisis más (8 en `login.spec.ts` y 7 en `users.spec.ts`).
- **Consecuencias**:
  - `expectAccessible` cambia en `login.spec.ts` y `users.spec.ts`; ningún otro paso de los casos existentes cambia;
  - el caso del selector (alcance, punto 7) verifica además el modo forzado por cookie.

### D-7 — Aspecto del marco común

- **Opciones**:
  - (a) **Barra superior** sobre `surface`, con el nombre de la organización en peso 700, la navegación con la sección actual en `primary-soft`, y a la derecha usuario, rol como insignia, selector de tema y "Salir".
  - (b) **Barra lateral** en escritorio, que colapsa en móvil.
- **Recomendación**: (a).
  - Hoy hay dos enlaces: una barra lateral quedaría vacía hasta la Fase 7.
  - El wireframe 02 dibuja el marco arriba.
  - Se reevalúa cuando la navegación supere cinco secciones.
- **Consecuencia**: ninguna en rutas ni comportamiento.

## Invariantes

- No hay referencias a Airtable ni al repositorio del agente de WhatsApp.
- El comportamiento, los textos, las rutas y los roles accesibles de las pantallas no cambian: los end-to-end existentes pasan sin modificar sus pasos.
- axe no informa violaciones WCAG 2.x A ni AA en ningún estado cubierto, en claro ni en oscuro.
- Foco visible en todo elemento interactivo, en los dos modos.
- Ningún estado depende solo del color.
- Sin dependencias de npm nuevas, sin recursos cargados desde la red y sin scripts en línea.
- Sin cambios de esquema ni migraciones.
- `src/app/` importa módulos solo por su interfaz pública; los componentes de cliente no importan `@/modules/*`.

## Criterios de aceptación

- **AC-1**: D-1 a D-7 tienen resolución del usuario con fecha.
- **AC-2**: los 24 end-to-end existentes pasan en local sobre `next start` sin cambios en sus pasos, salvo `expectAccessible` según D-6.
- **AC-3**: el caso nuevo del selector de tema pasa.
- **AC-4**: axe no informa violaciones en claro ni en oscuro en todos los estados que ya cubrían los casos 11 de `login.spec.ts` y 12 de `users.spec.ts`.
- **AC-5**: los tests unitarios de la cookie de tema pasan, y la suite completa (`npm run test`) sigue en verde.
- **AC-6**: `grep` no encuentra clases de color de la paleta por defecto de Tailwind (`slate-`, `blue-`, `red-`, `green-`, etc.) en `src/app/`.
- **AC-7**: la fuente se sirve desde el propio servidor: en la pestaña de red de Playwright no hay pedidos a dominios externos.
- **AC-8**: con el contenedor detenido, `typecheck`, `lint`, `format:check`, `test:guards`, `test:unit` y `build` pasan, y `package.json` no cambió.
- **AC-9**: capturas de las pantallas 1 y 10 y del marco, en claro y en oscuro, a 1280 px y a 375 px, entregadas al usuario para su revisión visual.
- **AC-10**: CI en verde en el commit de la subfase, verificado con `gh run view`.
- **AC-11**: `git status` muestra solo archivos autorizados y los documentos del punto 9 reflejan las resoluciones.

## Pruebas y evidencia requerida

- **Evidencia `producer-consumer`**: Playwright con Chromium sobre `next start` contra PostgreSQL real, con axe en los dos esquemas de color.
- **Evidencia `deterministic`**: salidas de `npm run test` y `npm run test:e2e`, verificaciones con la base detenida y el `grep` de AC-6.
- **Evidencia visual**: las capturas de AC-9. El juicio estético es del usuario, no de un test.
- **Evidencia de CI**: ejecución en verde con los pasos de end-to-end.

**Nivel resultante esperado**: **validado en integración** para las pantallas 1 y 10 y el marco común en los dos modos.

**No se valida**:

- navegadores distintos de Chromium, incluida la representación de la fuente en Safari y Firefox;
- contraste en modos de alto contraste forzado del sistema operativo;
- la identidad visual definitiva.

La revisión es una autoevaluación (`self_assessment: true`).

## Condiciones de detención

- Si hace falta una dependencia de npm, un recurso de red o un script en línea.
- Si Manrope no trae cifras tabulares (D-3).
- Si un end-to-end existente necesita cambiar un paso distinto de `expectAccessible`.
- Si una violación de axe en oscuro exige salir de la paleta de D-2 más allá de un ajuste de tono.
- Si aplicar los estilos obliga a cambiar marcado con semántica accesible (roles, etiquetas, orden de foco).
- Antes de descargar la fuente, de commit, de push o de cambios en Notion.

## Resolución

Brief aprobado por el usuario el **2026-09-14**, después de revisar una vista previa de la paleta y la tipografía aplicadas al marco común y a las pantallas 1 y 10, en claro y en oscuro. D-1 a D-7 se resolvieron el mismo día, todas según la recomendación. El usuario autorizó descargar Manrope. Commit, push y el cambio de estado en Notion quedan para el cierre, con autorización propia.

| Decisión | Resolución |
|---|---|
| D-1 Colores | Tokens semánticos en variables CSS, expuestos con `@theme inline` |
| D-2 Paleta | Laguna, con los valores de la tabla |
| D-3 Tipografía | Manrope variable, local con `next/font/local` |
| D-4 Modo oscuro | Sistema por defecto, con selector en el marco común y cookie leída en el servidor |
| D-5 Componentes | Constantes de clases sobre tokens en `form-styles.ts` |
| D-6 axe | Cada `expectAccessible` analiza en claro y en oscuro |
| D-7 Marco común | Barra superior |

### Ajustes durante la ejecución

- **Fuente**: el archivo es el subconjunto latino variable (200 a 800) que distribuye Google Fonts, 24 836 bytes, SHA-256 `A30DDCD349703AFF7464C34BEF3FFFDFF405EE50C113440D7C8693C02D210972`. La licencia OFL viene del repositorio `google/fonts`. La tabla `GSUB` del archivo completo de ese repositorio incluye `tnum`, así que la condición de detención de D-3 no se activó.
- **La cookie `crm_theme` es `HttpOnly`**, al revés de lo que decía D-4: nada la lee desde el navegador, y `HttpOnly` reduce la superficie sin costo. `Secure` sigue el mismo criterio que la cookie de sesión (`NODE_ENV=production`).
- **`setThemeAction` no resuelve la sesión**, a diferencia del resto de las Server Actions: no lee ni escribe datos del CRM, y cada visitante solo puede cambiar su propia cookie. Valida el valor y trata uno inválido como "Sistema".
- **Textos que verifican los end-to-end**: "Nombre (admin)" en el marco, "admin · Activo" en las tarjetas y "Sí"/"No" en la tabla siguen iguales; las insignias solo cambian la presentación de esos textos.
- **Marca de la organización**: el marco muestra la inicial de la organización en un cuadrado `aria-hidden`, como en la vista previa aprobada. No es un logo.
- **Rutas dinámicas**: leer la cookie en el layout raíz vuelve dinámica también a `/_not-found`. Todas las demás rutas ya lo eran por la sesión.
- **Build local sin memoria**: `npm run build` falló dos veces por falta de memoria del sistema (0,3 GB libres) y pasó al liberar memoria, sin cambios de código.
- **Sin `transition-colors`**: la primera CI de la subfase (ejecución 34915965363, commit `e5029e1`) falló en axe, solo en oscuro, sobre el botón primario, el secundario y el enlace de la sección actual. Eran los tres elementos con `transition-colors`: al emular el cambio de esquema, axe midió el contraste de colores a mitad de la transición. En local pasaba porque la máquina es más lenta. Se quitó la transición, que el alcance excluido ya dejaba fuera, en lugar de hacer esperar al test.
- **Guarda con timeout bajo carga**: en `npm run test`, un caso de `module-boundary.test.ts` superó los 30 s mientras corría junto a la integración. Solas, las 19 guardas pasan en 9 s. No se tocó el test.

**Cerrada el 2026-09-14** con confirmación del usuario. CI en verde en el commit `8a4bac1` ([ejecución 34916460308](https://github.com/benjamurilloo/AI-WhatsApp-Agent-CRM/actions/runs/34916460308)); entrada en [CHANGELOG.md](../../CHANGELOG.md).
