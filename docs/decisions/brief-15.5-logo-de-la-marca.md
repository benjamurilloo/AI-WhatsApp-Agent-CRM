---
schema: task-brief.v1
task_id: "15.5"
task_type: implementation
generated_at: 2026-10-06
---

# Brief: 15.5 — Logo de la marca

**Estado: aprobado el 2026-10-06 por el usuario, con las recomendaciones de D-1 a D-4 y la precisión de D-4 que sigue; cerrado el 2026-10-06** (§Cierre). La aprobación no autoriza ningún commit, ningún cambio en Notion, ninguna dependencia nueva ni el despliegue a producción: cada uno se autoriza en su turno.

- **Nivel de evidencia objetivo**: `producer-consumer` (Playwright sobre `next start`, con axe en claro y en oscuro, y la guarda de CSP) e `isolated-runtime` (la versión desplegada, mirada por el usuario).
- **Nivel de validación alcanzable**: **validado en integración** y **verificado en producción**.
- **Orden**: quinta subfase de la Fase 15, agregada a pedido del usuario el 2026-10-06, antes del cierre de la fase. Va después del despliegue de la 15.3 (15.3.4), para que cada despliegue tenga una sola vuelta atrás.

## Objetivo

Reemplazar la marca provisoria por el logo de Vixora que el usuario entregó el 2026-10-06:
- **Ícono de la pestaña del navegador**: el símbolo solo. Hoy no hay ninguno y el navegador muestra el suyo por defecto (un planeta gris).
- **Marca del panel lateral** (y de la barra del menú en el celular): la versión con el nombre, en lugar de la «V» de dos triángulos de la [brief-15.1](brief-15.1-identidad-visual-y-marco.md), D-4.

## Situación

- [brand.tsx](../../src/app/_components/brand.tsx) dibuja la «V» en SVG propio con los tokens `action` y `primary`, más el texto «Vixora». La usan el panel lateral y el menú del celular ([layout.tsx](../../src/app/(autenticado)/layout.tsx), [mobile-nav.tsx](../../src/app/_components/mobile-nav.tsx)). El login no muestra marca.
- No hay `favicon.ico` ni `icon.*` en `src/app/` ni en `public/`.
- La CSP permite imágenes solo del propio origen (`img-src 'self'`) y prohíbe atributos `style` ([proxy.ts](../../src/proxy.ts)).

## Hallazgos antes de diseñar

- **H-1. Las dos imágenes son PNG de 1995×788 y 1536×1024, con el fondo oscuro incluido** (sin transparencia). Puestas tal cual, se verían como un rectángulo azul noche dentro del panel claro.
- **H-2. Se puede separar el fondo.** Probado en el scratchpad con `sharp`, que ya está en `node_modules` como dependencia de Next (no se instala nada): el fondo es casi uniforme (#04011A), y el símbolo sale limpio, con bordes suaves, sobre claro y sobre oscuro. Quedan unos pocos puntos sueltos del brillo, que se eliminan con un umbral más alto. A 16 px el símbolo sigue reconocible.
- **H-3. En la versión con el nombre, «Vixora» es blanco.** Sin el fondo, el nombre desaparece en el tema claro. La imagen sirve solo para el tema oscuro, o hay que dibujar el nombre de otra forma (D-2).
- **H-4. «AI SOLUTIONS»** es un texto chico y espaciado: al alto del panel (unos 40 px para el logo entero) quedaría de unos 8 px, por debajo de lo legible.

## Decisiones pendientes

- **D-1. Ícono de la pestaña.** *Recomendado*: el símbolo sin fondo, generado una vez desde la imagen del usuario, en tres archivos con la convención de Next: `src/app/favicon.ico` (16, 32 y 48 px, para los navegadores que lo piden por esa ruta, que la CSP y el `matcher` del proxy ya dejan pasar), `src/app/icon.png` (512 px) y `src/app/apple-icon.png` (180 px, **con** el fondo azul noche de la marca, porque iOS no admite transparencia).
- **D-2. Marca del panel.** *Recomendado*: el **símbolo como imagen** (PNG sin fondo, a 2× y 3× de su tamaño en pantalla) y el **nombre «Vixora» como texto**, con la tipografía del CRM y el color del tema. Así se lee en claro y en oscuro, conserva el nombre accesible y no depende de la imagen para el texto. *Alternativas*: (b) la imagen completa en el tema oscuro y otra con el nombre recoloreado para el claro: dos PNG y un recoloreo de píxeles que deja bordes; (c) la imagen completa dentro de un recuadro oscuro en los dos temas.
- **D-3. «AI SOLUTIONS».** *Recomendado*: como texto debajo del nombre, en mayúsculas espaciadas, en el color `primary` y a 10 px como mínimo, solo en el panel de escritorio; en la barra del celular, solo el símbolo y el nombre. *Alternativa*: omitirlo.
- **D-4. Las imágenes originales.** *Recomendado*: en el repositorio van solo los archivos derivados (unos pocos KB); los originales van al vault, en `Vixora/Marca`, y el brief anota cómo se generaron. *Alternativa*: guardarlos en `docs/product/marca/` (unos 2,3 MB).
  - *Precisado por el usuario al aprobar*: en el vault se guardan **las versiones sin fondo**, el símbolo y el logo con el nombre, como los originales de la marca de aquí en adelante; las imágenes con el fondo incluido no se guardan. Vale solo si el recorte queda bien: sin dañar el símbolo, el nombre ni el lema.

## Alcance incluido

- Los íconos de D-1 y la marca de D-2 y D-3, en el panel y en la barra del celular.
- Generarlos con un script del scratchpad que usa `sharp` de `node_modules`: no queda en el repositorio ni en `package.json`.

## Alcance excluido

- La marca en el login, en los correos o en el manifiesto de aplicación instalable.
- Cambiar la paleta o los tokens por los colores del logo: el violeta y el azul ya son los de la 15.1.
- Redibujar el logo en vector.

## Archivos o componentes autorizados

- `src/app/_components/brand.tsx` y, si hace falta pasarle el modo, `mobile-nav.tsx` y `(autenticado)/layout.tsx`.
- Nuevos: `src/app/favicon.ico`, `src/app/icon.png`, `src/app/apple-icon.png` y `public/marca/vixora-simbolo*.png`.
- `tests/e2e/` (un caso de marca y de ícono), `docs/product/Screens.md` (una nota) y este brief.

## Invariantes

- Ningún atributo `style` ni clase de la paleta por defecto de Tailwind; ninguna imagen de otro origen.
- El nombre «Vixora» sigue siendo texto: la imagen del símbolo es decorativa (`alt=""`).
- Contraste del nombre y del lema de al menos 4,5:1 en claro y en oscuro.
- Sin dependencias nuevas en `package.json`.

## Criterios de aceptación

- **AC-1**: la pestaña muestra el símbolo; `/favicon.ico`, `/icon.png` y `/apple-icon.png` responden 200 con su tipo.
- **AC-2**: el panel y la barra del celular muestran el símbolo y el nombre, en claro y en oscuro, sin rectángulo de fondo.
- **AC-3**: axe sin violaciones en el panel, en claro y en oscuro; la guarda de CSP sin violaciones.
- **AC-4**: todas las pruebas end-to-end pasan; la CI en verde.
- **AC-5**: el usuario mira la marca y el ícono en producción.

## Pruebas y evidencia requerida

- Caso end-to-end: los tres íconos responden con su tipo; el panel muestra la imagen del símbolo con `alt=""` y el nombre como texto.
- Capturas del panel y de la pestaña, en claro y en oscuro, a 1280 y 375 px.

## Condiciones de detención

- Si al separar el fondo el símbolo pierde calidad visible a 32 px o en pantallas de alta densidad: se detiene y se consulta.
- Si hiciera falta una dependencia nueva o tocar la CSP.

## Resultados — 2026-10-06

- **Recorte**: alfa por distancia al color del fondo (#04011A), con el color des-premultiplicado para que los bordes no queden oscuros, y sin las manchas sueltas del brillo (componentes de menos de 400 píxeles: 9 en el símbolo y 4 en el logo con el nombre). Quedan 2 piezas en el símbolo (la «V» y la esfera) y 20 en el logo con el nombre (el símbolo, las 7 de «Vixora» con el punto de la i y las 11 de «AI SOLUTIONS»): ninguna letra se perdió. Revisado sobre fondo claro y oscuro.
- **Vault (D-4)**: las dos versiones sin fondo y una nota en `80 Projects/Marca Vixora/` del vault, porque el vault no tenía una carpeta `Vixora`. Las imágenes con fondo siguen solo en `Escritorio/Vixora`, donde estaban.
- **Archivos**: `src/app/favicon.ico` (16, 32 y 48 px), `src/app/icon.png`, `src/app/apple-icon.png` (con el fondo de la marca y 14 % de margen) y `public/marca/vixora-simbolo-{32,64,96}.png`. La marca ([brand.tsx](../../src/app/_components/brand.tsx)) usa un `<img>` común con `srcSet`: `next/image` escribe un atributo `style`, que la CSP prohíbe.
- **Desvío**: `icon.png` es de 192 px y no de 512: a 512 pesaba 186 KB para un ícono de pestaña; a 192, 35 KB.
- **Verificación**: tipos y lint pasan; `frame.spec.ts` (con el caso 3 nuevo: los cuatro archivos responden 200 con su tipo, el `<link rel="icon">` está en el login, la imagen cargó con `alt=""`, el nombre y el lema son texto, axe en claro y en oscuro, y en el celular sin el lema) y `security-headers.spec.ts` (CSP en las trece pantallas): 8 de 8, sobre un build nuevo. Capturas del panel a 1280 y 375 px, en claro y en oscuro.

## Cierre de la subfase 15.5, 2026-10-06

- **Commit**: `0cbe314` (CI 37537140696, `success`, leída por `headSha`), autorizado por el usuario junto con el cierre de la 15.3 y Notion.
- **Despliegue**, autorizado por el usuario: CI del SHA en `success` antes de tocar el servidor; anotado `e7d7b5c` en el registro de despliegues; dependencias, migraciones (ninguna nueva), build y reinicio; HEAD igual al SHA pedido. Servicio activo y sin errores en el registro; `/login`, `/favicon.ico` (`image/x-icon`), `/icon.png`, `/apple-icon.png` y `/marca/vixora-simbolo-32.png` (`image/png`) responden 200, y el login trae los dos `<link rel="icon">`.
- **AC-5**: el usuario miró el ícono de la pestaña y la marca del panel en producción y los dio por correctos el 2026-10-06.
- **Criterios**: AC-1 a AC-5 cumplidos. Desvío: `icon.png` de 192 px en lugar de 512 (§Resultados).
- **Revisión**: autoevaluación declarada, sin revisión independiente: la 15.5 no abre ni cierra un gate de producción (Roadmap, §Fase 15, «Gate de salida»).
- **Nivel**: validado en integración y verificado en producción por el usuario.
