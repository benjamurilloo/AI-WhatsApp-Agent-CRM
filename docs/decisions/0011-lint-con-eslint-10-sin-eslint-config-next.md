# 0011 — Lint con ESLint 10, sin `eslint-config-next`

- Estado: aceptada
- Fecha: 2026-09-12
- Supera al [ADR 0004](0004-stack-tecnologico-propuesto.md) solo en el conjunto de lint. El resto del ADR 0004 sigue vigente.

## Contexto

El ADR 0004 fijó ESLint 10 con `eslint-config-next` 16.3.x. Al preparar la 2.3 ([brief-2.3](brief-2.3-bootstrap-de-la-aplicacion.md)), el registro npm mostró que esa combinación no es instalable sin forzar dependencias:

- `eslint-config-next` 16.3.5 depende de `eslint-plugin-react` 7.37.5 (`eslint ^9.7`), `eslint-plugin-import` 2.32.0 (`^9`) y `eslint-plugin-jsx-a11y` 6.10.2 (`^9`). Ninguno tiene una versión que acepte ESLint 10.
- Un reporte público indica que 38 de las 101 reglas de `eslint-plugin-react` fallan en ejecución con ESLint 10.
- ESLint 9 es EOL desde el 2026-08-06, aunque la plantilla de `create-next-app` 16.3.5 todavía lo instala.

La 2.2 contrastó las dependencias pares de `eslint-config-next` y `typescript-eslint`, pero no las de cada plugin que `eslint-config-next` arrastra: ahí estaba la incompatibilidad.

## Decisión

ESLint 10 con plugins que declaran soporte para ESLint 10:

- `@eslint/js` (reglas recomendadas de JavaScript);
- `typescript-eslint` (reglas recomendadas de TypeScript);
- `@next/eslint-plugin-next`, usado directamente con sus reglas `recommended` y `core-web-vitals`, como documenta Next.js para configuraciones propias;
- `eslint-plugin-react-hooks`;
- `eslint-config-prettier`, para no chocar con Prettier.

Resuelta por el usuario el 2026-09-12.

## Alternativas descartadas

- **Forzar `eslint-config-next` con `overrides` de npm**: instala plugins con reglas que fallan en ejecución.
- **ESLint 9.39 con `eslint-config-next`**: herramienta sin parches de seguridad, que obligaría a migrar de todos modos.
- **Biome 2.5**: viable, pero reabre la decisión D-3 de la 2.2 por un problema que esta opción resuelve con menos cambio.

## Consecuencias

- Se pierden las reglas de JSX de `eslint-plugin-react`, las de importación de `eslint-plugin-import` (TypeScript estricto cubre buena parte) y las de accesibilidad de `eslint-plugin-jsx-a11y`.
- **Riesgo**: la accesibilidad queda sin lint. Se revisa antes de la primera pantalla (Fase 3): si `jsx-a11y` ya soporta ESLint 10 se incorpora; si no, se decide cómo cubrirla.
- **Revisión prevista**: volver a `eslint-config-next` cuando su versión estable dependa de plugins compatibles con ESLint 10.
- Lección de proceso: al fijar versiones, contrastar las dependencias pares de toda la cadena de plugins, no solo las del paquete de configuración.
