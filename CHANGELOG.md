# Changelog

Registro de cierres de fase y subfase. Cada entrada dice qué se certifica y qué explícitamente no, sin inferir nunca un nivel de validación superior al alcanzado. El seguimiento de tareas vive en [Notion](https://app.notion.com/p/3d8702be6f4e81659e43c3d8bd9a6e1c); el porqué de cada decisión, en [docs/decisions](docs/decisions/README.md).

## 2026-09-18 — Subfase 8.1 cerrada (Endurecimiento web)

**Certifica:**

- **Content-Security-Policy en enforce y cabeceras de seguridad** según el [brief-8.1](docs/decisions/brief-8.1-endurecimiento-web.md), con D-1 a D-6 resueltas según la recomendación. Las emite [`src/proxy.ts`](src/proxy.ts), nuevo, en todas las respuestas salvo los estáticos de Next.
- **Nonce por request** (D-1): el proxy pone la política en la cabecera del request, de donde Next la lee para nonce-ar sus scripts, y en la de la respuesta. Por eso `script-src` no necesita `'unsafe-inline'` pese a que Next emite el payload RSC inline. El proxy existe solo para eso: no valida la sesión, no lee la base y no redirige, así que la D-6 de la 3.5 sigue vigente en lo suyo.
- **Sin `'unsafe-inline'` en ninguna directiva y sin `'unsafe-eval'`**: `default-src 'self'`; `script-src` con nonce y `'strict-dynamic'`; `style-src-attr 'none'`; `object-src`, `base-uri`, `frame-ancestors` y `frame-src` en `'none'`.
- **La medición de D-3 desmintió una suposición del brief**: se anticipaba que los `<style>` inline obligarían a `'unsafe-inline'` en `style-src`, y se dejaba como limitación aceptable. Las diez pantallas se recorrieron en report-only, en claro y oscuro, con **cero violaciones**, y una corrida con `style-src 'self'` sin nonce también dio cero: las pantallas no tienen ni un `<style>` inline ni un atributo `style=`. La limitación aceptada no se usó.
- **Cabeceras** (D-2): `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`, `Cross-Origin-Opener-Policy: same-origin` y `Permissions-Policy` negando cámara, micrófono y geolocalización.
- **CSRF demostrado, no confiado al framework** (D-5): un test captura una Server Action real y la reenvía con el `Origin` de otro sitio; Next aborta con 500 y la base no cambia.
- **Evidencia de mutación**, las tres con efecto: `style-src 'none'` hace fallar el recorrido con violaciones nombradas, así que el colector no está roto; quitar el nonce de `script-src` rompe la hidratación y hace fallar tres casos; agregar el origen atacante a `serverActions.allowedOrigins` hace que la acción pase de 500 a 200, así que el caso de CSRF mide la guarda y no un 500 accidental.
- **Tests**: `tests/e2e/security-headers.spec.ts` (5 casos). Suite completa: 707 de 707 unitarios y de integración, y **81 de 81 end-to-end** — los 76 existentes sin modificar más los 5 nuevos. Ninguna pantalla necesitó cambios para cumplir la CSP.
- **Nivel alcanzado**: **validado en integración** (`producer-consumer`) para las cabeceras, la CSP y el rechazo CSRF, con Chromium real sobre `next start` y PostgreSQL real, sin mocks.

**No certifica:**

- **`Strict-Transport-Security`**: está definido en [SecurityModel](docs/architecture/SecurityModel.md) pero **no se emite**, porque sin TLS no hace nada. Se enciende en la Fase 9, junto con la cookie detrás de TLS y de un proxy real.
- **Reporte de violaciones de CSP**: no hay `report-uri` ni endpoint receptor; quedó fuera de alcance.
- **Navegadores distintos de Chromium**: la política se midió solo ahí. `'strict-dynamic'` cambia de comportamiento en navegadores que no lo entienden.
- **La revisión ítem por ítem de SecurityModel y del threat model**: es la 8.4. Esta subfase actualizó solo la sección que ella misma cambió.
- **Logs sin PII, exportación y eliminación de datos de cliente** (8.2) y **auditoría de dependencias en CI** (8.3).
- **El helper de verificación de `Origin`** previsto en la 3.4 (D-5): sigue sin escribirse porque no hay ningún Route Handler con sesión que lo consuma. Escribirlo sin consumidor sería un módulo especulativo.
- **Revisión independiente**: es autoevaluación del mismo agente. El usuario aprobó el brief y el cierre.

## 2026-09-17 — Fase 7 cerrada (Métricas y dashboard)

**Certifica:**

- **Las cuatro subfases cerradas con autorización del usuario**: 7.1 → 7.2 → 7.3 → 7.4. El detalle de cada una está en sus entradas, debajo.
- **Criterio de aceptación del [Roadmap](docs/planning/Roadmap.md)**: las doce métricas tienen test de fixture con el valor calculado a mano y sus invariantes probados, incluidos los bordes de zona horaria. Los fixtures están en `tests/integration/analytics.test.ts` (1 a 6 y 10), `analytics-response.test.ts` (7, 8, 9 y 11) y `analytics-ingestion.test.ts` (12), cada tanda con su archivo y su fixture propios.
- **Gate de salida**: las doce métricas probadas individualmente, con CI en verde en el commit `d1f5c96` ([ejecución 35283074243](https://github.com/benjamurilloo/AI-WhatsApp-Agent-CRM/actions/runs/35283074243)), end-to-end incluido.
- **Entregables**: FR-MET-01 a 03, con la pantalla 2 y el módulo `analytics`.
- **Bordes de calendario probados con fechas confirmadas en la base de zonas**: el día de 23 horas (19/10/2008) y el de 25 horas (14/03/2009) de Buenos Aires, más una organización en `UTC` que clasifica el mismo instante en otro día.
- **Los tres estados de una métrica son distintos entre sí** en el servicio y en la pantalla: valor, "sin datos" (denominador cero) y "no disponible" (nadie estaba registrando el dato). Ninguno se muestra como `0`.
- **Nivel alcanzado**:
  - **validado en integración** para la pantalla 2;
  - **validado localmente y en CI** (`deterministic`) para las doce métricas, como pedía el Roadmap.

**No certifica:**

- **Valores con datos reales**: no hay emisor conectado. Todos los fixtures son sintéticos y la métrica 12 muestra "No disponible" en cualquier entorno sin ingestión configurada.
- **Rendimiento con varias organizaciones o en staging**: las mediciones de la 7.1 a la 7.3 son locales y sobre una sola organización grande, y la de la métrica 12 usó volumen sintético. Se vuelven a medir en la Fase 9 ([Risks](docs/planning/Risks.md)).
- **Los recorridos completos de tablas con 180 días**, aceptados desde la 7.1.
- **CSP, cabeceras y revisión de seguridad de la pantalla**: Fase 8.
- **Firefox y WebKit**.
- **Revisión independiente**: es autoevaluación del mismo agente. El usuario aprobó los briefs y los cierres.

## 2026-09-17 — Subfase 7.4 cerrada (Dashboard)

**Certifica:**

- **Pantalla 2** según el [brief-7.4](docs/decisions/brief-7.4-dashboard.md), con D-1 a D-6 resueltas según la recomendación:
  - **el dashboard reemplaza la página provisional en `/`** y el marco común lo enlaza como "Dashboard" (D-1);
  - **una tarjeta, un componente servidor** (D-2): cada métrica tiene su consulta, su estado de carga y su estado de error, así que una lenta no bloquea a las demás y una fallada muestra su código sin tumbar la pantalla;
  - **la definición de cada métrica en un desplegable** (D-3), con el texto en la pantalla porque el catálogo no se sirve desde la aplicación; el catálogo sigue siendo la fuente de verdad;
  - **gráfico diario en SVG generado en el servidor** (D-4), con su tabla de datos, sin dependencias nuevas y con la serie en la URL;
  - **atajos de 7, 30 y 90 días más rango personalizado** (D-5), sin "todas las fechas": en métricas un período vacío es el de defecto;
  - **`getMetricsPeriod`** resuelve el período compartido una sola vez (D-6); un período inválido muestra un aviso y no calcula ninguna métrica.
- **Los tres estados en pantalla**: `0`, "Sin datos" y "No disponible" son distintos entre sí, y el error de una tarjeta es un cuarto caso con su propio texto. Cubrirlos fue obligatorio: `RatioMetric` tiene tres casos desde la 7.3, así que el compilador pidió tratar "no disponible" también en las métricas 6, 8 y 9, que nunca lo devuelven.
- **Tests**:
  - 9 casos end-to-end de la pantalla con el cálculo a mano del fixture, axe en claro y oscuro, teclado y móvil a 375 px: `tests/e2e/dashboard.spec.ts`;
  - 2 casos en un **segundo servidor de end-to-end con la ingestión apagada**, autorizado por el usuario durante la ejecución, que es la única forma de ver "No disponible" en el navegador: `tests/e2e/dashboard-sin-ingestion.spec.ts`;
  - 27 unitarios de las partes puras: período de la URL, formato de los valores, textos de los estados y geometría del gráfico.
- **El fallo de una métrica está probado con una falla real**: el caso renombra la tabla que lee la métrica 12, su consulta falla, la tarjeta muestra "No se pudo calcular" con el identificador con el que quedó en el log y las once restantes siguen mostrando sus valores.
- **Cinco corridas de mutación**: las cinco hacen fallar los casos previstos, incluida la que deja escapar el error de una tarjeta. Ninguna resultó defensa redundante.
- **Ninguna respuesta entrega datos personales**: ni el HTML ni las respuestas RSC de `admin` o `viewer` contienen cuerpos de mensajes, nombres de clientes, teléfonos ni referencias externas de ingestión.
- **Suites**:
  - `npm run test`: 707 de 707;
  - `npm run test:e2e`: 76 de 76;
  - CI en verde en `d1f5c96` ([ejecución 35283074243](https://github.com/benjamurilloo/AI-WhatsApp-Agent-CRM/actions/runs/35283074243)), con todos los pasos.
- **Nivel alcanzado**: **validado en integración** (`producer-consumer`) para la pantalla 2, con datos sintéticos.

**No certifica:**

- **El rendimiento del dashboard**: doce consultas por carga, medidas solo en local y sobre una organización (Fase 9).
- **Valores con datos reales**: el fixture es sintético y no hay emisor conectado.
- **Que los textos de las definiciones no se desincronicen del catálogo**: quedan duplicados a propósito, con el catálogo como fuente de verdad (D-3).
- **CSP, cabeceras y el resto de la revisión de seguridad**: Fase 8.
- **Revisión independiente**: es autoevaluación del mismo agente. El usuario aprobó el brief y el cierre.

## 2026-09-17 — Subfase 7.3 cerrada (Métrica de errores de ingestión)

**Certifica:**

- **Métrica 12** en `analytics`, según el [brief-7.3](docs/decisions/brief-7.3-metrica-de-errores-de-ingestion.md), con D-1 a D-4 resueltas según la recomendación y sin reabrir ninguna decisión de la 7.1 ni de la 7.2:
  - **conteo y tasa**: eventos fallidos sobre el total de eventos con `received_at` en el período; los `received` y los `processed` cuentan en el denominador y no en el numerador; con el total en 0, "sin datos";
  - **grupos**: lista plana de `{ source, errorCode, count }` por conteo descendente, con desempate alfabético, y solo las combinaciones presentes: el origen y el código son taxonomías abiertas, así que no hay conjunto completo para rellenar con `0` (D-3);
  - **"no disponible"** (D-1): el estado aparece cuando la ingestión no está configurada en el entorno —apagada o con configuración inválida— **y** el período no tiene ningún evento. Con eventos registrados la métrica muestra su valor aunque el endpoint esté apagado. La configuración se lee en cada llamada y el entorno viaja por parámetro, así que la decisión es una función pura;
  - **`RatioMetric` con sus tres estados** (D-2), distintos entre sí y ninguno presentado como `0`. Las métricas 6, 8 y 9 no cambiaron.
- **Con esto el catálogo queda completo**: las doce métricas están implementadas.
- **Tests de fixture con el valor calculado a mano**, en archivo y fixture propios: los de la 7.1 y la 7.2 quedaron intactos y las tres suites comparten solo sus ayudantes de inserción. Cubren el conteo, la tasa, los grupos y su orden, los invariantes del catálogo, los bordes del período, la zona horaria, los tres estados distinguidos entre sí, el aislamiento, la autorización y que la respuesta no contenga referencias externas ni hashes de payload.
  - Evidencia: `tests/integration/analytics-ingestion.test.ts` (11 casos) y 4 unitarios de la disponibilidad en `src/modules/analytics/service.test.ts`.
- **Error del cálculo a mano registrado**: el caso de la medianoche local esperaba 5 eventos y el correcto era 6, porque el día local 02/09 abarca dos eventos del 03/09 en UTC. Se corrigió el valor esperado, no el código.
- **Cinco corridas de mutación**: las cinco hacen fallar los casos previstos. Ninguna resultó defensa redundante.
- **Medición local y sintética**, con las dos opciones de D-4 autorizadas: con la tabla vacía, `EXPLAIN` muestra el índice `(organization_id, received_at)` con las tres condiciones, y el CTE se materializa solo porque tres agregaciones lo leen; con 200.011 eventos sintéticos en la base de test y 34.895 en un período de 30 días, la mediana de cinco corridas fue de 26,2 ms, contra el umbral de 200 ms de la 7.1. Los datos sintéticos se borraron al terminar y la base de desarrollo solo se leyó, en solo lectura.
- **Suites**:
  - `npm run test`: 680 de 680;
  - `npm run test:e2e`: 65 de 65;
  - CI en verde en `a66d655` ([ejecución 35272618405](https://github.com/benjamurilloo/AI-WhatsApp-Agent-CRM/actions/runs/35272618405)), con todos los pasos.
- **Nivel alcanzado**: **validado localmente y en CI** (`deterministic`) para la métrica 12.

**No certifica:**

- **La pantalla 2**, el formato de los valores y los textos de los tres estados: 7.4, la primera subfase de la fase que toca `src/app/`.
- **El rendimiento con datos de ingestión reales**: el volumen medido es sintético y de distribución uniforme, y queda registrado en [Risks.md](docs/planning/Risks.md) para la Fase 9.
- **Valores con datos reales**: no hay emisor conectado, así que los eventos fallidos son sintéticos.
- **Que la taxonomía de códigos de error sea completa**: hoy el contrato solo registra rechazos de negocio, y el único código que deja fila es `CONFLICT`.
- **Revisión independiente**: es autoevaluación del mismo agente. El usuario aprobó el brief y el cierre.

## 2026-09-17 — Subfase 7.2 cerrada (Métricas de respuesta y estado)

**Certifica:**

- **Métricas 7, 8, 9 y 11** en `analytics`, según el [brief-7.2](docs/decisions/brief-7.2-metricas-de-respuesta-y-estado.md), con D-1 a D-6 resueltas según la recomendación y sin reabrir ninguna decisión de la 7.1:
  - **7 Conversaciones respondidas**: exige el entrante y el saliente estrictamente posterior dentro del período; un empate de timestamps no es una respuesta;
  - **8 Cobertura de respuesta**: divide por `|A_in|`, así que las conversaciones con solo salientes quedan fuera del denominador; con `|A_in| = 0`, "sin datos";
  - **9 Mediana de primera respuesta**: población acotada primero a las conversaciones con actividad en el período y resuelta después por conversación con el índice `(conversation_id, sent_at)` (D-2); usa el primer entrante de toda la conversación y admite la respuesta posterior al fin del período; el conteo de las que no tienen primera respuesta acompaña siempre al valor, también cuando la mediana es "sin datos" (D-3);
  - **11 Distribución por estado**: los tres estados, en el orden del dominio, con `0` explícito (D-4).
- **Tests de fixture con el valor calculado a mano**, en un archivo y un fixture propios: el de la 7.1 quedó intacto y las dos suites comparten solo sus ayudantes de inserción (D-5). Cubren los casos que discriminan entre las tres métricas de respuesta, la mediana con cantidad par e impar, los invariantes del catálogo, "sin datos", el aislamiento, la autorización y las respuestas sin datos personales.
  - Evidencia: `tests/integration/analytics-response.test.ts` (17 casos).
- **Bordes de zona horaria**: el día de 23 horas (19/10/2008), con una respuesta en el fin exacto del período, y el de 25 horas (14/03/2009), donde un entrante y su respuesta caen en el mismo horario local y el tiempo transcurrido es de 60 minutos reales. Los instantes se confirmaron en la base de zonas antes de fijarlos.
- **Seis corridas de mutación**: cinco hacen fallar los casos previstos. Quitarle el filtro de organización a la métrica 11 no hace fallar nada, porque su subconjunto de conversaciones ya está acotado por organización; queda registrado como defensa doble en el brief, con la mutación equivalente sobre la métrica 8, que sí falla.
- **Medición local** en solo lectura, sobre la organización de volumen: las cuatro funciones entre 4,3 y 75,6 ms, por debajo de los 200 ms de D-6. El CTE del primer entrante se materializa; sin eso la métrica 9 quedaba en 199,5 ms con 180 días. Los recorridos completos con 180 días son los ya aceptados en la 7.1 y siguen registrados en Risks.
- **Suites**:
  - `npm run test`: 665 de 665;
  - `npm run test:e2e`: 65 de 65;
  - CI en verde en `afb99d9` ([ejecución 35266463066](https://github.com/benjamurilloo/AI-WhatsApp-Agent-CRM/actions/runs/35266463066)), con todos los pasos.
- **Nivel alcanzado**: **validado localmente y en CI** (`deterministic`) para las métricas 7, 8, 9 y 11.

**No certifica:**

- **La pantalla 2**, el formato de los valores y los textos de los estados: 7.4.
- **La métrica 12** y el estado "no disponible": 7.3.
- **Rendimiento con varias organizaciones o en staging**: Fase 9.
- **Valores con datos reales**: no hay emisor conectado.
- **Revisión independiente**: es autoevaluación del mismo agente. El usuario aprobó el brief y el cierre.

## 2026-09-17 — Subfase 7.1 cerrada (Métricas de volumen)

**Certifica:**

- **Módulo `analytics`**, según el [brief-7.1](docs/decisions/brief-7.1-metricas-de-volumen.md), con D-1 a D-5 resueltas según la recomendación:
  - una función por tarjeta del dashboard: métricas 1, 2, 3, 4 y 5 juntas, 6 y 10 (D-1);
  - el período lo resuelve el servicio (D-2):
    - sin fechas, los últimos 30 días completos sin hoy, con el reloj de la base;
    - se rechazan un período con una sola fecha, invertido, de más de 366 días o con un fin futuro;
  - mediana con `percentile_cont` y valores sin redondear (D-3);
  - "sin datos" como estado propio, `no_data` (D-4).

  Solo lee `conversations` y `messages`, desde `conversations/schema`.
- **Métricas 1 a 6 y 10**, cada una con su valor calculado a mano, sus invariantes de MetricsCatalog y los bordes de zona horaria:
  - la medianoche local;
  - el 19/10/2008 (23 horas) y el 14/03/2009 (25 horas) de Buenos Aires;
  - una organización en `UTC`.

  Evidencia: `tests/integration/analytics.test.ts` (18 casos) y `analytics/service.test.ts` (7). Cuatro corridas de mutación hacen fallar los casos previstos.
- **Aislamiento y autorización**:
  - cada organización ve solo sus datos;
  - `viewer` lee lo mismo que `admin`, y con la contraseña pendiente recibe `FORBIDDEN`;
  - ninguna respuesta contiene cuerpos, teléfonos ni nombres.
- **Medición local** en solo lectura, sobre la organización de volumen:
  - todas las funciones quedan por debajo de 200 ms: 57 ms como máximo, con 180 días;
  - los recorridos completos con 180 días, y el de la métrica 3 con 30 días, quedaron aceptados por el usuario y registrados en Risks.
- **Suites**:
  - `npm run test`: 648 de 648;
  - `npm run test:e2e`: 65 de 65;
  - CI en verde en `0e87329` ([ejecución 35251536171](https://github.com/benjamurilloo/AI-WhatsApp-Agent-CRM/actions/runs/35251536171)), con todos los pasos.
- **Nivel alcanzado**: **validado localmente y en CI** (`deterministic`) para las métricas 1 a 6 y 10.

**No certifica:**

- **La pantalla 2** y el formato de los valores: 7.4.
- **Las métricas 7 a 9 y 11** (7.2) y la **12** (7.3).
- **Rendimiento con varias organizaciones o en staging**: Fase 9.
- **Valores con datos reales**: no hay emisor conectado.
- **Revisión independiente**: es autoevaluación del mismo agente. El usuario aprobó el brief y el cierre.

## 2026-09-17 — Fase 6 cerrada (Conversaciones, mensajes e ingestión)

**Certifica:**

- **Las siete subfases cerradas con confirmación del usuario**: 6.1 → 6.2 → 6.3 → 6.4, y 6.5.1 → 6.5.2 → 6.5.3. El detalle de cada una está en sus entradas, debajo.
- **Criterios de aceptación del [Roadmap](docs/planning/Roadmap.md)**:
  - idempotencia probada, incluido el reenvío con otro contenido: `ingestion.test.ts` (6.5.2) en el caso de uso, e `ingestion-http.test.ts` y `ingestion.spec.ts` (6.5.3) en el endpoint;
  - cuerpo de los mensajes escapado en la UI: `conversations.spec.ts` (6.4), con su corrida de mutación;
  - ninguna credencial ni configuración apunta a sistemas reales: el endpoint está apagado por defecto, y la búsqueda del cierre no encontró URLs, webhooks, proveedores ni credenciales configurados en el repositorio, la CI, `.env` ni la base de desarrollo, que no tiene credenciales ni eventos.
- **Gate de salida**: FR-CONV-01 a 05 y FR-CLI-04 probados según [TraceabilityMatrix](docs/architecture/TraceabilityMatrix.md), con CI en verde en el commit `53c3394` ([ejecución 35233410207](https://github.com/benjamurilloo/AI-WhatsApp-Agent-CRM/actions/runs/35233410207)), end-to-end incluido, y en su cierre `7cda5fc`.
- **Entregables**: FR-CONV-01 a 05, FR-CLI-04 y [docs/contracts/ingestion-v1.md](docs/contracts/ingestion-v1.md).
- **Nivel alcanzado**:
  - **validado en integración** para las pantallas 8 y 9 y las conversaciones en las pantallas 6 y 7;
  - **validado localmente y en CI** (`deterministic`) para el esquema, los seeds, el servicio de conversaciones, el contrato, el registro idempotente, la proyección y el endpoint con su autenticación de servicio, como pedía el Roadmap.

**No certifica:**

- **Compatibilidad con un emisor real**, incluida su autenticación con tráfico real: proyecto de integración.
- **Recorridos completos de `conversations` con una sola organización grande** (6.3, D-4): se vuelven a medir con varias organizaciones en staging (Fase 9).
- **Retención de `messages`**: Fase 9.
- **Verificación del límite de tasa, secretos e IP detrás de un proxy real**: Fases 8 y 9.
- **Métricas y dashboard**, incluida la métrica 12 sobre `ingestion_events`: Fase 7.
- **Firefox y WebKit**.
- **Revisión independiente**: es autoevaluación del mismo agente. El usuario aprobó los briefs y los cierres.

## 2026-09-17 — Subfase 6.5.3 cerrada (Autenticación de servicio y rate limit)

**Certifica:**

- **Endpoint `POST /api/ingestion/v1/events`**, según el [brief-6.5.3](docs/decisions/brief-6.5.3-autenticacion-de-servicio-y-rate-limit.md), con D-1 a D-6 resueltas según la recomendación:
  - credencial de servicio en `ingestion_credentials`, con solo el SHA-256 del token; de ella salen la organización y el `source` (D-1);
  - token `crm_ing_` por `Authorization: Bearer`, creado y revocado con `npm run ingestion:credential` (D-2);
  - límite de 120 requests por minuto por credencial en `ingestion_rate_windows`, con un contador atómico (D-3);
  - modo de prueba: apagado por defecto (`404`) y, encendido, solo las credenciales de `INGESTION_ALLOWED_CREDENTIALS` (D-4);
  - sin verificación de `Origin`: el endpoint no lee cookies, y una sesión del CRM no lo autentica (D-5);
  - lectura del cuerpo con límite de 64 KiB en `src/shared/http/`, y log sin token, payload, teléfono ni cuerpo.
- **Migraciones 0013 y 0014**, aplicadas también a la base de desarrollo con autorización del usuario.
- **Desvíos confirmados por el usuario**: el campo `source` en el log estructurado, las tablas nuevas en las listas de `audit.test.ts` e `identity-schema.test.ts`, y la lógica del endpoint en `handler.ts`, junto a `route.ts`.
- **Tests**: 13 casos en `tests/integration/ingestion-http.test.ts` contra PostgreSQL real, incluido el límite bajo concurrencia; 2 en `tests/e2e/ingestion.spec.ts`, con el evento visible en la pantalla 8; 16 unitarios. Mutaciones: sin la revocación, sin la allowlist, sin el contador atómico o sin el límite de bytes, fallan casos.
- **Suite local**: `npm run test` pasa 623 de 623 y `npm run test:e2e`, 65 de 65. Con la base detenida pasan typecheck, lint, formato, guardas, unitarios y build, y `db:generate` no produce migraciones.
- **Sin orígenes reales**: una búsqueda confirma que no hay emisores, URLs ni credenciales reales configurados.
- **CI**: [35233410207](https://github.com/benjamurilloo/AI-WhatsApp-Agent-CRM/actions/runs/35233410207), commit `53c3394`, en verde con todos los pasos.
- **Nivel alcanzado**: **validado localmente y en CI** (`deterministic`) para el endpoint, la credencial, el límite de tasa y el modo de prueba.

**No certifica:**

- **Compatibilidad con un emisor real y su autenticación con tráfico real**: proyecto de integración.
- **Verificación del límite de tasa en seguridad, gestión de secretos e IP detrás de un proxy**: Fases 8 y 9.
- **Revisión independiente**: es autoevaluación del mismo agente.

## 2026-09-17 — Subfase 6.5.2 cerrada (Registro idempotente y proyección)

**Certifica:**

- **Caso de uso de ingestión sin HTTP**, según el [brief-6.5.2](docs/decisions/brief-6.5.2-registro-idempotente-y-proyeccion.md), con D-1 a D-3 resueltas según la recomendación:
  - `recordIngestionEvent` en `ingestion`, con organización y `source` como contexto explícito hasta la 6.5.3; el endpoint llega con la credencial (D-1);
  - reserva del evento y proyección en la misma transacción; `accepted` para un evento nuevo, `duplicate` para un reenvío idéntico, `CONFLICT` para otro `payload_hash` o un mensaje ya existente, y `failed` terminal;
  - `recordIngestedMessage(tx, …)` en `conversations`, que crea la conversación con su primer mensaje o la bloquea, amplía sus fechas y nunca cambia su estado ni su cliente (D-2);
  - `findClientIdByPhone(tx, …)` en `crm`, que solo devuelve el id del cliente activo o inactivo de la organización; la ingestión nunca crea clientes;
  - `READ COMMITTED` con `INSERT … ON CONFLICT DO NOTHING` y `FOR UPDATE` sobre la conversación (D-3).
- **Desvío confirmado por el usuario**: `isOpaqueReference` exportado desde `contract.ts` para validar el `source` con la regla del contrato, sin cambios de comportamiento.
- **Tests**: 13 casos en `tests/integration/ingestion.test.ts` contra PostgreSQL real, incluidos dos de entregas simultáneas con la espera observada en `pg_stat_activity` y una reversión ante un error forzado; 7 unitarios en `service.test.ts`. Mutaciones: sin el `ON CONFLICT` de la reserva fallan 4 casos, sin el de la conversación fallan 5 y sin el `LEAST` de `started_at` fallan 2.
- **Suite local**: `npm run test` pasa 594 de 594. Con la base detenida pasan typecheck, lint, formato, guardas, unitarios y build, y `db:generate` no produce migraciones.
- **CI**: [35227372751](https://github.com/benjamurilloo/AI-WhatsApp-Agent-CRM/actions/runs/35227372751), commit `6d7626a`, en verde con todos los pasos.
- **Nivel alcanzado**: **validado localmente y en CI** para el registro idempotente, los reenvíos y la proyección.

**No certifica:**

- **Endpoint, credencial de servicio, límite de tasa y allowlist**: 6.5.3.
- **Compatibilidad con un emisor real**: los fixtures siguen con forma asumida.
- **Revisión independiente**: es autoevaluación del mismo agente.

## 2026-09-16 — Subfase 6.5.1 cerrada (Contrato de ingestión y validación)

**Certifica:**

- **Contrato de ingestión v1** en [docs/contracts/ingestion-v1.md](docs/contracts/ingestion-v1.md), según el [brief-6.5.1](docs/decisions/brief-6.5.1-contrato-de-ingestion.md), con D-1 a D-7 resueltas según la recomendación:
  - un solo tipo de evento, `message.recorded`: un mensaje que crea su conversación con el primero (D-2);
  - organización y `source` tomados de la credencial de servicio, nunca del payload (D-3);
  - `payload_hash`: SHA-256 del evento validado y normalizado, con claves ordenadas, y un vector de prueba (D-4);
  - reenvíos que devuelven solo referencias del emisor: `ingestion_events` no suma columnas, y queda cerrado el pendiente del brief-6.1, D-4 (D-5);
  - solo los rechazos de negocio quedan como `failed`; MetricsCatalog lo aclara para la métrica 12 (D-6);
  - la ingestión nunca crea clientes (D-7);
  - las reglas de la proyección que implementa la 6.5.2.
- **Validación ejecutable** en `src/modules/ingestion/` (`contract.ts` e `index.ts`), pura y sin otros módulos: esquema `zod` estricto, fechas normalizadas a UTC, rechazo de lo que PostgreSQL no acepta (NUL y UTF-16 inválido) y errores que nombran el campo sin repetir el payload.
- **Desvío confirmado por el usuario**: el límite del request es de 64 KiB en lugar de 16 KB, porque 16 KB no alcanzaba para un cuerpo de 4096 caracteres con emojis o escapes.
- **Tests**: 28 casos en `contract.test.ts`, incluidos el vector y 11 fixtures de `tests/fixtures/ingestion/v1/` marcados como forma asumida. Mutación: con la serialización sin ordenar, fallan 8.
- **Suite local**: `npm run test` pasa 574 de 574. Con la base detenida pasan typecheck, lint, formato, guardas, unitarios y build, y `db:generate` no produce migraciones.
- **CI**: [35158967940](https://github.com/benjamurilloo/AI-WhatsApp-Agent-CRM/actions/runs/35158967940), commit `6f026a9`, en verde con todos los pasos.
- **Nivel alcanzado**: **validado localmente y en CI** para la validación del payload y el hash; **diseñado** para el resto del contrato.

**No certifica:**

- **Endpoint, registro, reenvíos y proyección**: 6.5.2.
- **Credencial de servicio y límite de tasa**: 6.5.3.
- **Compatibilidad con un emisor real**: los fixtures tienen forma asumida; queda para el proyecto de integración.
- **Revisión independiente**: es autoevaluación del mismo agente.

## 2026-09-16 — Subfase 6.4 cerrada (UI de conversaciones)

**Certifica:**

- **Pantallas de conversaciones** según el [brief-6.4](docs/decisions/brief-6.4-ui-de-conversaciones.md), con D-1 a D-6 resueltas según la recomendación:
  - **pantalla 8** (lista): filtros de período (atajos, con "Todas las fechas" por defecto), estado, canal y cliente, este último con búsqueda en dos pasos sobre `crm` (D-1, D-2); paginada de a 25 y sin el cuerpo de ningún mensaje (FR-CONV-01);
  - **pantalla 9** (detalle): timeline con la dirección en texto, separadores de día y el cuerpo escapado (FR-CONV-02); "Cargar mensajes anteriores" con una Server Action de lectura que conserva la posición de lectura (D-3); cambio de estado solo para `admin`, auditado, con el resultado anunciado (FR-CONV-03);
  - **pantallas 6 y 7**: la lista de clientes ordenada por última interacción, con su columna (FR-CLI-04), y el detalle con la última interacción y una sección "Conversaciones" que carga por separado, pagina y filtra sin perder la auditoría (D-4);
  - enlace "Conversaciones" en el marco común.
- **Tests**: `tests/e2e/conversations.spec.ts` (10 casos, con fixtures sintéticos insertados por SQL, D-5) y los casos 13 a 15 de `clients.spec.ts`, con axe en cada estado, en claro y oscuro, teclado y móvil; 13 unitarios nuevos. Todos los specs esperan el título antes de axe (D-6), lo que cierra la carrera de `document-title`. Mutaciones: el cuerpo interpretado como HTML hace fallar el caso 5, y un cuerpo en la pantalla 8 hace fallar el caso 2 (evidencia en el brief).
- **Desvío autorizado**: el caso 1 de `clients.spec.ts` invirtió sus dos aserciones sobre "Última interacción".
- **Suite local**: `npm run test` pasa 546 de 546 y `npm run test:e2e` pasa 63 de 63. Con la base detenida pasan typecheck, lint, formato, guardas, unitarios y build, y `db:generate` no produce migraciones. `src/modules/` sin cambios.
- **CI**: [35153243944](https://github.com/benjamurilloo/AI-WhatsApp-Agent-CRM/actions/runs/35153243944), commit `3904548`, en verde con todos los pasos.
- **Nivel alcanzado**: **validado en integración** para las pantallas 6 a 9.

**No certifica:**

- **Rendimiento con volumen en pantalla**: Fase 9.
- **Lectores de pantalla reales**: solo axe y teclado.
- **Ingestión**: 6.5.
- **Revisión independiente**: es autoevaluación del mismo agente.

## 2026-09-16 — Subfase 6.3 cerrada (Servicio de consulta y estado)

**Certifica:**

- **Servicio de `conversations`** según el [brief-6.3](docs/decisions/brief-6.3-servicio-de-consulta-y-estado.md), con D-1 a D-5 resueltas según la recomendación:
  - `listConversations`, con filtros de período (días de calendario en la zona de la organización), estado, canal y cliente, paginada de a 25; no entrega el cuerpo de ningún mensaje (FR-CONV-01);
  - `getConversation` y `listConversationMessages`, un timeline de a 50 con cursor `(sent_at, id)` en base64url que conserva los microsegundos (D-2);
  - `changeConversationStatus`, solo para `admin`, con `FOR UPDATE`, última escritura gana (D-3) y auditoría en la misma transacción; sin diferencias devuelve `changed: false`;
  - `getClientActivity` (pantalla 7) y `searchClientsByLastInteraction` (pantalla 6, FR-CLI-04), que compone en memoria el orden con `crm.listClientOrderKeys` y `crm.getClientsByIds` (D-1); el teléfono sigue enmascarado para `viewer`.
- **`src/shared/calendar/`**: la validación de fechas de calendario, que `inventory` usa sin cambios de comportamiento (D-5).
- **Tests**: 29 casos en `tests/integration/conversations.test.ts`, incluida la concurrencia del cambio de estado y el rechazo de la auditoría, más 7 unitarios de `conversations` y 3 de `shared/calendar`. Mutaciones: una lista que trae el último cuerpo y `getClientsByIds` sin enmascarar hacen fallar sus casos (evidencia en el brief).
- **Mediciones locales** sobre la organización de volumen, en solo lectura: todas las funciones con mediana por debajo de 200 ms (la mayor, 93 ms). Tres consultas recorren `conversations` completa porque esa organización tiene el 99,9 % de las filas; el usuario aceptó registrarlo (D-4), y Risks lo deja para staging con varias organizaciones (Fase 9).
- **Suite local**: `npm run test` pasa 533 de 533 y `npm run test:e2e` pasa 50 de 50. Con la base detenida pasan typecheck, lint, formato, guardas, unitarios y build, y `db:generate` no produce migraciones.
- **CI**: [35147351833](https://github.com/benjamurilloo/AI-WhatsApp-Agent-CRM/actions/runs/35147351833), commit `887081d`, en verde con todos los pasos.
- **Nivel alcanzado**: **validado localmente y en CI** para el servicio de conversaciones.

**No certifica:**

- **Pantallas y escape del cuerpo de los mensajes**: 6.4.
- **Rendimiento con varias organizaciones y en staging**: Fase 9.
- **Ingestión**: 6.5.
- **Revisión independiente**: es autoevaluación del mismo agente.

## 2026-09-16 — Subfase 6.2 cerrada (Seeds sintéticos de conversaciones)

**Certifica:**

- **Seeds sintéticos** según el [brief-6.2](docs/decisions/brief-6.2-seeds-sinteticos-de-conversaciones.md), con D-1 a D-4 resueltas según la recomendación:
  - **conversaciones de ejemplo** (`seeds/conversations.ts`), cargadas por `npm run db:seed` después del seed básico, que no cambia; los end-to-end no las usan (D-1). Son 6 clientes, 10 conversaciones y 26 mensajes, con:
    - los tres estados, conversaciones sin cliente, un cliente inactivo, una proactiva y una sin respuesta;
    - un mensaje que en UTC cae en otro día, una conversación que cruza la medianoche y el 19/10/2008 de Buenos Aires;
    - cuerpos con marcado, nulos, largos y con emojis;
  - **fechas relativas a la primera corrida** (D-2): las corridas siguientes no mueven mensajes ni fechas, y solo reponen el estado y los clientes;
  - **volumen** (`seeds/volume.ts`, `npm run db:seed:volume`) en una organización propia con `volumen@example.com` (D-3). Es determinista por fila y no se ejecuta en CI. No incluye productos (D-4): TraceabilityMatrix corrige su afirmación sobre `EXPLAIN`, y Risks lo registra para la Fase 8.
- **Invariante entre filas**: toda conversación sembrada tiene al menos un mensaje, `started_at` igual a su primer `sent_at` y `last_message_at` igual al último. Con el seed alterado, 3 casos fallan (evidencia en el brief).
- **Tests**: 13 casos en `tests/integration/conversations-seed.test.ts`; los tests existentes y los end-to-end sin cambios.
- **Suite local**: `npm run test` pasa 494 de 494 y `npm run test:e2e` pasa 50 de 50. Con la base detenida pasan typecheck, lint, formato, guardas, unitarios y build, y `db:generate` no produce migraciones.
- **Base de desarrollo**: los dos seeds, dos veces cada uno, sin cambios en la segunda corrida. El volumen cargó 10.000 clientes, 10.000 conversaciones y 65.260 mensajes en 4,9 s.
- **`package.json`**: solo el script `db:seed:volume`.
- **CI**: [35142422082](https://github.com/benjamurilloo/AI-WhatsApp-Agent-CRM/actions/runs/35142422082), commit `fc580ad`, en verde con todos los pasos.
- **Nivel alcanzado**: **validado localmente y en CI** para los seeds.

**No certifica:**

- **Que las pantallas muestren estos datos**: 6.4.
- **Rendimiento de las consultas sobre el volumen**: 6.3.
- **Valores de las métricas**: Fase 7.
- **Volumen de productos e inventario**: Fase 8.
- **Revisión independiente**: es autoevaluación del mismo agente.

## 2026-09-16 — Subfase 6.1 cerrada (Migraciones de conversaciones)

**Certifica:**

- **Esquema de `conversations`, `messages` e `ingestion_events`** según DataModel y el [brief-6.1](docs/decisions/brief-6.1-migraciones-de-conversaciones.md), con D-1 a D-4 resueltas según la recomendación:
  - las tres tablas en esta subfase; la lógica del registro de ingestión queda para la 6.5.2 (D-1);
  - claves foráneas compuestas: una conversación no puede apuntar al cliente de otra organización, ni un mensaje a la conversación de otra organización. `clients` suma `UNIQUE(organization_id, id)`;
  - unicidades parciales de `external_ref` y `UNIQUE(organization_id, source, external_ref)` en el registro, con nombre para `ON CONFLICT`;
  - `CHECK` de coherencia (D-2): referencias e identidad no vacías, último mensaje no anterior al inicio, y fecha de proceso y código de error acordes al estado;
  - protección (D-3): `messages` es de solo inserción, como el ADR 0013. `ingestion_events` admite `UPDATE` de su estado para `crm_app`, sin `DELETE`, y un trigger rechaza el borrado y todo cambio de identidad;
  - las columnas de resultado del evento quedan para la 6.5.2 (D-4).
- **Migraciones**: `0010` (el `UNIQUE` de `clients`) y `0011` (tablas), generadas por Drizzle Kit, y `0012` (privilegios y triggers), escrita a mano. Se generaron en dos pasos porque Drizzle Kit emitía el `UNIQUE` después de la clave que lo usa (ajuste autorizado). Aplicadas en la base de desarrollo; una segunda corrida no hace nada.
- **Tests**: 31 casos en `tests/integration/conversations-schema.test.ts`, con SQLSTATE y constraint. Los triggers se prueban también quitándolos en una transacción revertida. `audit.test.ts` pasa a tres categorías de privilegios y suma un caso de detección. `identity-schema.test.ts` suma las tablas. `clients.spec.ts` vacía `messages` y `conversations` junto con `clients` (ajuste autorizado).
- **Suite local**: `npm run test` pasa 481 de 481 y `npm run test:e2e` pasa 50 de 50. Con la base detenida pasan typecheck, lint, formato, guardas, unitarios y build, y `db:generate` no produce migraciones.
- **Sin orígenes reales** (FR-CONV-05): ninguna URL, variable de entorno ni credencial nueva.
- **CI**: [35137789102](https://github.com/benjamurilloo/AI-WhatsApp-Agent-CRM/actions/runs/35137789102), commit `5a60334`, en verde con todos los pasos en el segundo intento. El primero falló en un caso end-to-end ajeno al cambio: axe encontró el `<title>` vacío tras una navegación en el cliente (`clients.spec.ts`, caso 1). Queda registrado como pendiente.
- **Documentación**: DataModel, TestingStrategy, RepositoryStructure, nota en el ADR 0013 y el índice de decisiones, donde también se corrigió la fila del brief-5.3.
- **Nivel alcanzado**: **validado localmente y en CI** para el esquema.

**No certifica:**

- **Idempotencia del contrato de ingestión**: solo se probó el mecanismo de base. La lógica es de la 6.5.2.
- **`started_at` igual al primer mensaje**: 6.2 y 6.5.2.
- **Consultas e índices con volumen**: 6.2, 6.3 y Fase 8.
- **La aplicación restringida por `crm_app`**: Fases 8 y 9.
- **Revisión independiente**: es autoevaluación del mismo agente.

## 2026-09-16 — Fase 5 cerrada (Clientes)

**Certifica:**

- **Las tres subfases cerradas con confirmación del usuario**, en el orden 5.1 → 5.2 → 5.3. El detalle de cada una está en sus entradas, debajo.
- **Criterios de aceptación del [Roadmap](docs/planning/Roadmap.md)**:
  - búsqueda por nombre y teléfono: `crm.test.ts` en el servicio y `clients.spec.ts` en pantalla, con el teléfono escrito en otro formato;
  - `CONFLICT` por teléfono duplicado, también de un cliente inactivo: `clients-schema.test.ts`, `crm.test.ts` y el mensaje en el campo de `clients.spec.ts`;
  - minimización verificada contra `NonFunctionalRequirements.md`: revisión escrita en el cierre del [brief-5.3](docs/decisions/brief-5.3-ui-de-clientes.md).
- **Gate de salida**: FR del alcance probados, con CI en verde en el commit `c2fa98b` ([ejecución 35132808628](https://github.com/benjamurilloo/AI-WhatsApp-Agent-CRM/actions/runs/35132808628)), end-to-end incluido.
- **Entregables**: FR-CLI-01, 02, 03, 05, 06 y 07, y FR-AUD-02 para clientes.
- **H-5 cerrado en sus dos mitades**: el servicio (5.2) y la pantalla (5.3), cada una con evidencia de mutación.
- **Nivel alcanzado**:
  - **validado en integración** para las pantallas 6 y 7, que supera el "validado localmente" que pedía el Roadmap;
  - **validado localmente y en CI** para el esquema y el servicio de clientes.

**No certifica:**

- **Última interacción y conversaciones del cliente** (FR-CLI-04), y el orden de la lista por última interacción: Fase 6.
- **Eliminación de los datos de un cliente** frente a `audit_logs` de solo inserción: Fase 8.
- **Búsqueda sin distinguir acentos y rendimiento con volumen real**: Fase 8.
- **La aplicación restringida por `crm_app`**: Fases 8 y 9.
- **Firefox y WebKit**.
- **Revisión independiente**: es autoevaluación del mismo agente. El usuario aprobó los briefs y los cierres.

## 2026-09-16 — Subfase 5.3 cerrada (UI de clientes)

**Certifica:**

- **Pantallas 6 y 7** según Screens.md, los wireframes 06 y 07 y el [brief-5.3](docs/decisions/brief-5.3-ui-de-clientes.md), con D-1 a D-5 resueltas según la recomendación:
  - `/clientes`: búsqueda por nombre o teléfono en una sola caja, filtro de actividad y página en la URL; tabla en escritorio y tarjetas en móvil; "no hay clientes" distinto de "sin resultados"; alta solo para `admin`;
  - `/clientes/nuevo` y la edición en `/clientes/[clientId]`: validación en línea, aviso de minimización en las notas y `CONFLICT` en el campo teléfono con un mensaje que sugiere buscar entre los inactivos (D-2); desactivar y reactivar con confirmación como segundo paso;
  - `/clientes/[clientId]`: datos del cliente y, solo para `admin`, su auditoría paginada con autor y fechas en la zona de la organización; el resumen muestra valores de nombre, teléfono y estado, y de las notas solo que cambiaron (D-4);
  - sin última interacción ni conversaciones hasta la Fase 6 (D-3);
  - "Clientes" en la navegación del marco común.
- **Teléfono en pantalla** (D-1): E.164 completo para `admin`; `•••• 1234` para `viewer`, con un texto propio para lectores de pantalla y otro para un enmascarado sin dígitos.
- **H-5 cerrado en pantalla** (D-5): el HTML y las respuestas RSC que recibe un `viewer` no contienen el número; con `crm` devolviendo el número completo, el test falla (evidencia en el brief), y el mismo recorrido como `admin` sí lo encuentra.
- **Minimización** (FR-CLI-05): revisión escrita en el cierre del brief; cada Server Action registra solo ids, código y duración.
- **Defecto corregido**: el resumen de auditoría dependía del orden de las claves de `jsonb`; ahora sigue el orden del formulario.
- **Tests**: 23 unitarios en `src/app/(autenticado)/clientes/` y 12 casos en `tests/e2e/clients.spec.ts`, con axe en cada estado en claro y oscuro, teclado, foco y móvil a 375 px. `src/modules/crm/` y los tests existentes sin cambios.
- **Suite local**: `npm run test` pasa 449 de 449 (188 unitarios, 30 guardas y 231 de integración); `npm run test:e2e` pasa 50 de 50. Con la base detenida pasan typecheck, lint, formato, guardas, unitarios y build, y `db:generate` informa "No schema changes". `package.json` sin cambios.
- **CI**: [35132808628](https://github.com/benjamurilloo/AI-WhatsApp-Agent-CRM/actions/runs/35132808628), commit `c2fa98b`, en verde con todos los pasos.
- **Documentación**: Screens, wireframes 06 y 07 y su índice, TraceabilityMatrix, TestingStrategy, RepositoryStructure y las líneas de estado de `README.md` y `docs/README.md`.
- **Nivel alcanzado**: **validado en integración** (`producer-consumer`) para las pantallas 6 y 7.

**No certifica:**

- **Última interacción y conversaciones del cliente**: Fase 6.
- **Formato de lectura del teléfono por país**: se muestra en E.164 (D-1).
- **Firefox y WebKit**.
- **Revisión independiente**: es autoevaluación del mismo agente.

## 2026-09-16 — Subfase 5.2 cerrada (Servicio de clientes)

**Certifica:**

- **Servicio de clientes** (FR-CLI-01, 02, 03 y 05) según el [brief-5.2](docs/decisions/brief-5.2-servicio-de-clientes.md), con D-1 a D-7 resueltas según la recomendación:
  - teléfono aceptado solo en formato internacional, con separadores quitados y sin adivinar el país (D-1);
  - el enmascarado vive en `crm`: un `viewer` recibe solo los últimos 4 dígitos, y ninguno si el número tiene 4 o menos (D-2, FR-CLI-06);
  - búsqueda por teléfono completo en cualquier formato o por prefijo de nombre sin distinguir mayúsculas, con `%` y `_` literales (D-3);
  - lista ordenada por nombre con desempate por `id`, filtrada y paginada de a 25 en SQL (D-4);
  - nombre de 1 a 200 caracteres y notas de hasta 1 000, recortados (D-5);
  - `diff` de auditoría completo, con teléfono y notas (D-6);
  - `listClientAudit` para `admin`, con autor compuesto por `auth` (D-7, FR-AUD-02).
- **Escrituras**: alta, edición, desactivación y reactivación auditadas en la misma transacción; un cambio sin diferencias no escribe ni audita; `CONFLICT` por teléfono, también escrito con otro formato o de un cliente inactivo; dos altas simultáneas con el mismo teléfono crean una sola.
- **Autorización y aislamiento**: `viewer` y contraseña pendiente → `FORBIDDEN` en escrituras y auditoría; cliente de otra organización → `NOT_FOUND`; id inválido → `VALIDATION_ERROR` sin `fields`.
- **H-5 cerrado**: la respuesta a un `viewer` de `getClient` y `searchClients`, incluida una búsqueda por el número completo, no contiene el número; con el enmascarado quitado, el test falla (evidencia en el brief).
- **Tests**: 17 unitarios en `crm` y 25 de integración en `tests/integration/crm.test.ts`. Ningún test existente cambió.
- **Suite local**: `npm run test` pasa 426 de 426 (165 unitarios, 30 guardas y 231 de integración); `npm run test:e2e` pasa 38 de 38. Con la base detenida pasan typecheck, lint, formato, guardas, unitarios y build, y `db:generate` informa "No schema changes". `package.json` sin cambios.
- **CI**: [35113732213](https://github.com/benjamurilloo/AI-WhatsApp-Agent-CRM/actions/runs/35113732213), commit `62e6b3c`, en verde con todos los pasos.
- **Documentación**: Overview (dependencias de `crm`), DataModel, SecurityModel, TraceabilityMatrix, Risks, TestingStrategy, RepositoryStructure y las líneas de estado de `README.md` y `docs/README.md`.
- **Nivel alcanzado**: **validado localmente y en CI** para el servicio de clientes, el enmascarado del teléfono y la lectura de su auditoría.

**No certifica:**

- **Pantallas 6 y 7**, su accesibilidad y que el HTML del `viewer` no contenga el número: 5.3.
- **Última interacción y conversaciones del cliente** (FR-CLI-04), y el orden de la lista por última interacción: Fase 6.
- **Eliminación de los datos de un cliente** frente a `audit_logs` de solo inserción: registrado en Risks para la Fase 8.
- **Que el número exista o sea de un país**: solo se valida la forma.
- **Rendimiento de la lista con volumen real**: Fase 8.
- **Revisión independiente**: es autoevaluación del mismo agente.

## 2026-09-16 — Subfase 5.1 cerrada (Migración de clientes)

**Certifica:**

- **Esquema de clientes** según el [brief-5.1](docs/decisions/brief-5.1-migracion-de-clientes.md), con D-1 a D-4 resueltas según la recomendación:
  - `clients` en `src/modules/crm/schema.ts`, solo con su esquema, con `organization_id` y `ON DELETE RESTRICT`;
  - teléfono en E.164 canónico por `CHECK` (`clients_phone_e164_format`) (D-1);
  - búsqueda por prefijo de nombre sin distinguir mayúsculas, con un índice sobre `lower(display_name) text_pattern_ops`, que cierra H-3 también para clientes (D-2);
  - teléfono único por organización cuando está presente, también frente a clientes inactivos (`clients_organization_phone_unique`) (D-3, ADR 0007, FR-CLI-07);
  - sin `UNIQUE(organization_id, id)` hasta que la Fase 6 lo necesite (D-4).
- **Migraciones**: `drizzle/0008_*`, generada por Drizzle Kit sin SQL a mano, y `drizzle/0009_*`, a medida, con los privilegios de `crm_app`. Aplicadas en la base de desarrollo y sobre bases vacías; aplicarlas otra vez no hace nada.
- **Tests**: 10 casos nuevos en `tests/integration/clients-schema.test.ts`, cada uno con su SQLSTATE y, en unicidad y formato, con el nombre de la constraint. El test de cobertura de privilegios detectó la tabla sin cambios. `identity-schema.test.ts` solo sumó `clients` a la lista y al título.
- **Suite local**: `npm run test` pasa 384 de 384 (148 unitarios, 30 guardas y 206 de integración); `npm run test:e2e` pasa 38 de 38. Con la base detenida pasan typecheck, lint, formato, guardas, unitarios y build, y `db:generate` informa "No schema changes". `package.json` sin cambios.
- **CI**: [35109441440](https://github.com/benjamurilloo/AI-WhatsApp-Agent-CRM/actions/runs/35109441440), commit `d369767`, en verde con todos los pasos, incluido el de desfase de migraciones.
- **Documentación**: DataModel, TraceabilityMatrix, Risks, TestingStrategy, RepositoryStructure y las líneas de estado de `README.md` y `docs/README.md`.
- **Nivel alcanzado**: **validado localmente y en CI** para el esquema de clientes.

**No certifica:**

- **Normalización de la entrada, `CONFLICT` por teléfono y búsqueda**: servicio de la 5.2.
- **Enmascarado del teléfono para `viewer` (H-5, FR-CLI-06)**: 5.2 y 5.3.
- **Que el número exista**: el `CHECK` valida la forma, no el país ni la numeración.
- **La aplicación restringida por `crm_app`**: sigue conectándose con el rol dueño (Fases 8 y 9).
- **`updated_at` en SQL crudo**: lo mantiene la aplicación, como en las tablas anteriores.
- **Revisión independiente**: es autoevaluación del mismo agente.

## 2026-09-16 — Fase 4 cerrada (Productos e inventario)

**Certifica:**

- **Las siete subfases cerradas con confirmación del usuario**, en el orden 4.0 → 4.1 → 4.2 → 4.3.1 → 4.3.2 → 4.3.3 → 4.4. La 4.3 no tuvo implementación propia: agrupa a la 4.3.1, la 4.3.2 y la 4.3.3. El detalle de cada una está en sus entradas, debajo.
- **Criterios de aceptación del [Roadmap](docs/planning/Roadmap.md)**:
  - ningún camino modifica `quantity_on_hand` sin su movimiento: `lockBalance` y `applyStockChange` son las únicas escrituras, vigiladas por `tests/guards/stock-writes.test.ts`, y `inventory-adjustment.test.ts` prueba que movimiento, saldo y auditoría son atómicos;
  - los ajustes concurrentes no dejan saldo negativo: `inventory-concurrency.test.ts`, con la evidencia del brief-4.3.2 de que falla sin sus bloqueos;
  - los movimientos son inmutables en la base: `catalog-inventory-schema.test.ts` verifica que `UPDATE` y `DELETE` sobre `inventory_movements` se rechazan.
- **Gate de salida**: suite de inventario en verde, con los invariantes de no negatividad e inmutabilidad, y CI en verde en el commit `dbdf5fa` ([ejecución 35099148671](https://github.com/benjamurilloo/AI-WhatsApp-Agent-CRM/actions/runs/35099148671)), end-to-end incluido.
- **Entregables**: FR-PROD-01 a 09 y FR-AUD-02 para productos (la lectura de auditoría quedó pendiente desde la 4.2 y se entregó en la 4.4); diseño visual base con modo claro y oscuro (4.0, sumada a pedido del usuario).
- **Hito demostrable 2**: ajuste de stock con historial visible, de punta a punta en `tests/e2e/products.spec.ts`.
- **Nivel alcanzado**:
  - **validado en integración** para las pantallas 3, 4 y 5, que supera el nivel "validado localmente" que pedía el Roadmap para el dominio;
  - **validado localmente y en CI** para el esquema, el servicio de catálogo, el ajuste de stock secuencial y bajo concurrencia, el historial de movimientos y la lectura de auditoría.

**No certifica:**

- **La aplicación restringida por `crm_app`**: sigue conectándose con el rol dueño; la defensa efectiva de `inventory_movements` y `audit_logs` es el trigger. Fases 8 y 9.
- **Rendimiento con catálogos o historiales grandes**, incluido el costo de `offset` en páginas lejanas: Fase 8.
- **Búsqueda sin distinguir acentos**: Fase 8.
- **El orden del historial con un reloj del servidor que retrocede**: límite aceptado en la 4.3.3.
- **Firefox y WebKit**.
- **Revisión independiente**: es autoevaluación del mismo agente. El usuario aprobó los briefs y los cierres.

## 2026-09-16 — Subfase 4.4 cerrada (UI de productos e inventario)

**Certifica:**

- **Pantallas 3, 4 y 5** según Screens.md, los wireframes 03 a 05 y el [brief-4.4](docs/decisions/brief-4.4-ui-de-productos-e-inventario.md), con D-1 a D-6 resueltas según la recomendación:
  - `/productos`: búsqueda por nombre o SKU, filtros de estado de stock y actividad y página en la URL; tabla en escritorio y tarjetas en móvil; estado de stock con texto e ícono; "no hay productos" distinto de "sin resultados"; alta solo para `admin`;
  - `/productos/nuevo` y la edición en `/productos/[productId]`: validación en línea y `CONFLICT` por SKU en el campo; desactivar y reactivar con confirmación como segundo paso;
  - `/productos/[productId]`: datos, stock, estado, últimos movimientos y, solo para `admin`, el historial de auditoría paginado con ediciones y ajustes en la misma lista;
  - `/productos/[productId]/movimientos`: ajuste para `admin` con saldo resultante anunciado; mensajes propios de `negative_stock`, `stock_limit`, `inactive_product` y `CONFLICT` con el saldo nuevo; historial para `admin` y `viewer` con filtros de tipo y período ("Todo" por defecto, D-4) y fechas en la zona de la organización.
- **Lectura de auditoría (FR-AUD-02)**: `listEntityAuditLogs` en `audit`, una sola consulta paginada con varios tipos de entidad, sin contexto ni rol; `listProductAudit` en `catalog` autoriza `admin`, verifica la organización y compone el autor con `auth` (ajuste 1 del brief, elegido por el usuario para evitar el ciclo `audit` ↔ `organizations`).
- **Presentación compartida**: `formatQuantity` ("2.500" → "2,5"), formato de fechas en la zona de la organización y `organizationId` y duración en `logEvent`, registrados por cada Server Action de las tres pantallas.
- **`VALIDATION_ERROR` por id inválido unificado sin `fields`** (D-6).
- **Defecto encontrado por el end-to-end y corregido**: un ajuste rechazado perdía el motivo escrito y dejaba el saldo y el historial viejos en pantalla (ajuste 2 del brief).
- **Tests**: 13 end-to-end en `products.spec.ts`, con axe sin violaciones WCAG 2.x A ni AA en cada estado, en claro y oscuro, teclado y móvil a 375 px; 6 de integración en `product-audit.test.ts`; unitarios de filtros, mensajes, resumen de auditoría, fechas, cantidades y log.
- **Suite local**: `npm run test` pasa 374 de 374 y `npm run test:e2e` 38 de 38; typecheck, lint y formato en verde; `db:generate` sin cambios de esquema. Sin dependencias nuevas ni migraciones.
- **CI**: [35099148671](https://github.com/benjamurilloo/AI-WhatsApp-Agent-CRM/actions/runs/35099148671), commit `dbdf5fa`, en verde con todos los pasos.
- **Documentación**: Overview (lectura de auditoría), RepositoryStructure, TraceabilityMatrix, TestingStrategy, Screens y wireframes 03 a 05 con sus desvíos.
- **Nivel alcanzado**: **validado en integración** para las pantallas 3, 4 y 5; **validado localmente y en CI** para la lectura de auditoría y los formateadores.

**No certifica:**

- **"Bajo stock" con color propio**: usa el token de énfasis existente, porque la 4.0 no define uno de advertencia (ajuste 3 del brief).
- **El orden de `audit_logs` con registros simultáneos**: su `created_at` sigue con `now()` y desempata por `id` (hallazgo 3).
- **La estabilidad de `product-audit.test.ts` bajo carga**: superó su tiempo de espera una vez en local y no se repitió (ajuste 5 del brief).
- **Rendimiento con catálogos grandes**, **Firefox y WebKit**, y la aplicación en staging o con `crm_app`: Fases 8 y 9.
- **Revisión independiente**: es autoevaluación del mismo agente.

## 2026-09-15 — Subfase 4.3.3 cerrada (Historial de movimientos)

**Certifica:**

- **Historial de movimientos a nivel de servicio** según el [brief-4.3.3](docs/decisions/brief-4.3.3-historial-de-movimientos.md), con D-1 a D-4 resueltas según la recomendación: `listStockMovements` de `inventory`, para `admin` y `viewer` (FR-PROD-09), con `getProduct` de `catalog` resolviendo autorización, id y organización.
- **Orden que sigue la cadena de saldos** (D-1): la migración `0007` cambia el valor por defecto de `inventory_movements.created_at` a `clock_timestamp()`, la hora del `INSERT`. Como el movimiento se inserta con el saldo bloqueado hasta confirmar, el orden por `created_at` (desempatado por `id`) coincide con el orden de los `balance_after`, también con ajustes simultáneos. Es el único cambio de la migración, y no toca filas existentes.
- **Paginación en SQL** (D-2): 25 por página con el total, del más reciente al más antiguo; una página fuera de rango se lleva a la última o a la primera.
- **Período en días de la zona de la organización** (D-3 y D-4): fechas `YYYY-MM-DD` inclusivas, convertidas por PostgreSQL a `[desde 00:00, hasta + 1 día 00:00)` con la zona IANA que aporta `getOrganizationTimezone` de `organizations`, sin dependencias nuevas ni `JOIN` entre módulos. El resultado devuelve esa zona, el autor de cada movimiento (por `getUserSummaries` de `auth`, también si está desactivado) y `productHasMovements`, que distingue "sin resultados" de "sin movimientos".
- **Tests**: 13 de integración en `tests/integration/inventory-history.test.ts` (orden y desempate, paginación, filtro por tipo, bordes del período con medianoche local, otra zona horaria y el 19/10/2008 de Buenos Aires con su día de 23 horas, filtros inválidos, autor, autorización, aislamiento e historial de un producto desactivado); unitarios de la validación de filtros y del cálculo de páginas; un caso de esquema que comprueba que `created_at` queda posterior a `transaction_timestamp()`; y el caso 6 de `inventory-concurrency.test.ts`, que verifica que el historial encadena los saldos después de seis ajustes con reintento.
- **Suite local**: `npm run test` pasa 327 de 327; `npm run test:e2e` pasa 25 de 25; typecheck, lint y formato en verde. Sin dependencias nuevas.
- **CI**: [35030637332](https://github.com/benjamurilloo/AI-WhatsApp-Agent-CRM/actions/runs/35030637332), commit `cb81303`, en verde con todos los pasos, incluido el control de migraciones al día con los esquemas.
- **Documentación**: DataModel (`created_at`, límite aceptado e índice), Overview (lectura del historial), TestingStrategy y RepositoryStructure.
- **Nivel alcanzado**: **validado localmente y en CI** para el historial de movimientos a nivel de servicio, con su orden bajo concurrencia.

**No certifica:**

- **Las pantallas 4 y 5**, su formato de fechas y cantidades ni los períodos predefinidos del selector: 4.4.
- **El orden con un reloj del servidor que retrocede** (ajuste de NTP) o dos inserciones en el mismo microsegundo: límite aceptado de D-1, registrado en DataModel.
- **El costo de paginar muy lejos** con volumen real: Fase 8.
- **Revisión independiente**: es autoevaluación del mismo agente.

## 2026-09-15 — Subfase 4.3.2 cerrada (Concurrencia de ajustes)

**Certifica:**

- **Ajustes de stock bajo concurrencia** según el [brief-4.3.2](docs/decisions/brief-4.3.2-concurrencia-de-ajustes.md), con D-1 a D-4 resueltas según la recomendación, en `tests/integration/inventory-concurrency.test.ts` contra PostgreSQL real y sin cambios en `src/`:
  - dos ajustes con el mismo saldo esperado: uno aceptado y el otro `CONFLICT`, con un solo movimiento y el libro cuadrado (saldo final igual al inicial más la suma de los movimientos);
  - dos primeros ajustes sobre un producto sin fila: una sola fila de `inventories`, sin `23505` ni `40P01`;
  - seis ajustes simultáneos que reintentan ante `CONFLICT`: todos aplicados, libro cuadrado y cada `balance_after` igual al resultado de su ajuste;
  - un ajuste en curso frena la desactivación del producto, y una desactivación sin confirmar frena el ajuste, que termina en `inactive_product` sin efectos.
- **Carrera garantizada** (D-1 y D-2): otra conexión retiene el bloqueo y el test espera en `pg_stat_activity` a que las conexiones queden detenidas en él antes de soltarlo, sin `setTimeout`.
- **Evidencia de que los tests fallan sin sus bloqueos** (D-4), registrada en el brief: sin el `FOR UPDATE` del saldo fallan los casos 1 y 3; sin el `FOR SHARE` del producto, los casos 4 y 5. Ambos bloqueos restaurados y `git diff -- src` vacío.
- **Suite local**: `npm run test` pasa 302 de 302; `npm run test:e2e` pasa 25 de 25; el archivo nuevo pasó 5 corridas seguidas; lint, typecheck y formato en verde.
- **CI**: [35019378208](https://github.com/benjamurilloo/AI-WhatsApp-Agent-CRM/actions/runs/35019378208), commit `d255bfd`, en verde con todos los pasos.
- **Documentación**: TestingStrategy (caso obligatorio de concurrencia cubierto y método de espera) y DataModel (nota sobre `inventory_movements.created_at`).
- **Nivel alcanzado**: **validado localmente y en CI** para el ajuste de stock bajo concurrencia. Con la 4.3.1 y la 4.1 se cumplen los tres criterios de aceptación de la Fase 4 a nivel de servicio y base: ningún camino cambia el saldo sin movimiento, los ajustes concurrentes no dejan saldo negativo y los movimientos son inmutables.

**No certifica:**

- **Que el caso 2 pruebe el `FOR UPDATE`**: la espera del `ON CONFLICT` sobre el índice único serializa por sí sola a dos primeros ajustes; el `FOR UPDATE` lo prueban los casos 1 y 3 (ajuste 1 del brief).
- **El orden del historial bajo concurrencia**: `created_at` es la hora de inicio de la transacción y puede quedar fuera de secuencia con `balance_after` (hallazgo 4); se decide en la 4.3.3.
- **Concurrencia bajo carga real** ni con la aplicación conectada con `crm_app`: Fases 8 y 9.
- **Revisión independiente**: es autoevaluación del mismo agente.

## 2026-09-15 — Subfase 4.3.1 cerrada (Transacción de ajuste de stock)

**Certifica:**

- **Ajuste de stock a nivel de servicio** según el [brief-4.3.1](docs/decisions/brief-4.3.1-transaccion-de-ajuste-de-stock.md), con D-1 a D-6 resueltas según la recomendación:
  - `adjustStock` de `inventory`, solo `admin`: movimiento con `balance_after`, saldo y auditoría en una sola transacción (FR-PROD-06);
  - el producto se bloquea con `FOR SHARE` a través de `lockProductForStockChange` de `catalog`, y después la fila de saldo con `FOR UPDATE`, creada en 0 si faltaba (D-1);
  - saldo esperado obligatorio: si cambió, `CONFLICT` con el saldo actual (D-2);
  - `BUSINESS_RULE_VIOLATION` con `rule`: `negative_stock` y `stock_limit` con saldo actual y cantidad solicitada, e `inactive_product` (D-3, FR-PROD-08, ADR 0008);
  - auditoría `inventory` / `stock_adjustment` con el id del producto y `{ quantityOnHand }` antes y después (D-4);
  - motivo recortado de 1 a 500 caracteres y cantidad mayor a 0 (D-5);
  - todo rechazo revierte la transacción entera, incluida la fila de `inventories` recién creada.
- **Una sola vía para cambiar el saldo** (FR-PROD-07, D-6): `applyStockChange` es la única función que actualiza `quantity_on_hand`, siempre junto con su movimiento; `lockBalance` solo crea la fila en 0. `tests/guards/stock-writes.test.ts` falla ante cualquier otra escritura en `src/`, con seis casos que demuestran que detecta y un control de que el repositorio tiene exactamente esas escrituras.
- **Tests**: 13 de integración en `tests/integration/inventory-adjustment.test.ts` contra PostgreSQL real (primer ajuste, serie con `balance_after` igual al saldo, saldo exacto en 0 y en el máximo, cada rechazo comparado contra una foto de la base, `FORBIDDEN`, `NOT_FOUND`, `VALIDATION_ERROR` y fallo del movimiento sin efectos), y unitarios del cálculo del saldo y de la validación. Ningún test existente cambió y el `CHECK` de la base no se disparó desde el servicio.
- **Suite local**: `npm run test` pasa 297 de 297 (97 unitarios, 30 guardas y 170 de integración); `npm run test:e2e` pasa 25 de 25. Con la base detenida pasan typecheck, lint, formato, guardas, unitarios y build, y `db:generate` informa "No schema changes". Sin migraciones ni dependencias nuevas.
- **CI**: [35012071693](https://github.com/benjamurilloo/AI-WhatsApp-Agent-CRM/actions/runs/35012071693), commit `a820df1`, en verde con todos los pasos.
- **Documentación**: DataModel (productor `inventory` y escrituras del saldo), Overview (flujo del ajuste), TestingStrategy y RepositoryStructure.
- **Nivel alcanzado**: **validado localmente y en CI** para el ajuste de stock secuencial: atomicidad, rechazos sin efectos y auditoría.

**No certifica:**

- **Ajustes simultáneos**, dos primeros ajustes sobre un producto sin fila y un ajuste contra una desactivación: 4.3.2.
- **Un fallo aislado de la auditoría después de actualizar el saldo**: el test provoca el fallo en el movimiento; no hay caso que haga fallar solo la auditoría.
- **SQL escrito a mano contra la base** que cambie el saldo sin movimiento, ni una tabla que llegue por un alias: fuera del alcance de la guarda (límite de D-6).
- **Pantalla 5** y su Server Action: 4.4.
- **Revisión independiente**: es autoevaluación del mismo agente.

## 2026-09-15 — Subfase 4.2 cerrada (Servicio de catálogo)

**Certifica:**

- **Servicio de catálogo** según el [brief-4.2](docs/decisions/brief-4.2-servicio-de-catalogo.md), con D-1 a D-6 resueltas según la recomendación:
  - `catalog`: `createProduct`, `updateProduct`, `deactivateProduct` y `reactivateProduct`, solo `admin`, auditados en la misma transacción; `getProduct` y `searchProducts` para ambos roles; `deriveStockStatus` según FR-PROD-05;
  - `inventory`, solo lectura: `listProductStock` y `getProductStock` componen productos, saldos (0 sin fila) y estado en memoria, sin `JOIN` y sin que `catalog` importe `inventory` (D-1);
  - cantidades exactas en `src/shared/quantity/`, como `bigint` en milésimas, con entrada con coma o punto (D-2);
  - búsqueda por prefijo de nombre y SKU exacto sin distinguir mayúsculas, con `%` y `_` literales; `drizzle/0006_*` reemplaza el índice de nombre por uno sobre `lower(name)` (D-3);
  - validación con recorte de espacios y límites por campo (D-4); escrituras con la fila bloqueada y última escritura gana (D-5).
- **Tests**: 23 de integración en `tests/integration/catalog.test.ts` contra PostgreSQL real (auditoría con `diff` exacto y reversión si falla, `CONFLICT` por SKU también con dos altas simultáneas, `FORBIDDEN`, `NOT_FOUND` entre organizaciones, `VALIDATION_ERROR`, filtros, orden y paginación de la lista), y unitarios de los bordes del estado de stock, de cantidades, de validación y de la composición de la lista. Ningún test existente cambió.
- **Suite local**: `npm run test` pasa 262 de 262; `npm run test:e2e` pasa 25 de 25. Con la base detenida pasan typecheck, lint, formato, guardas, unitarios y build, y `db:generate` informa "No schema changes". `package.json` sin cambios. La `0006` está aplicada en la base de desarrollo.
- **CI**: [35002153534](https://github.com/benjamurilloo/AI-WhatsApp-Agent-CRM/actions/runs/35002153534), commit `b4e903a`, en verde con todos los pasos.
- **Documentación**: DataModel, TraceabilityMatrix, Overview (composición del estado de stock), RepositoryStructure (`src/shared/quantity/`) y TestingStrategy. En Notion, la 4.4 suma FR-AUD-02 (D-6).
- **Nivel alcanzado**: **validado localmente y en CI** para el servicio de catálogo, la lectura de saldos y el estado de stock.

**No certifica:**

- **Pantallas 3 y 4** ni su accesibilidad: 4.4.
- **Que un producto desactivado no reciba ajustes** (FR-PROD-03): lo verifica la 4.3.1 dentro de su transacción.
- **Rendimiento de la lista con volumen real**: lee todos los productos que cumplen texto y actividad; se revisa en la Fase 8 o con más de 2 000 productos por organización.
- **Búsqueda sin distinguir acentos**: "cafe" no encuentra "Café".
- **Lectura del historial de auditoría** (FR-AUD-02): 4.4.
- **Revisión independiente**: es autoevaluación del mismo agente.

## 2026-09-15 — Subfase 4.1 cerrada (Migraciones de catálogo e inventario)

**Certifica:**

- **Esquema de catálogo e inventario** según el [brief-4.1](docs/decisions/brief-4.1-migraciones-de-catalogo-e-inventario.md), con D-1 a D-7 resueltas según la recomendación:
  - `products` en `src/modules/catalog/schema.ts`; `inventories` e `inventory_movements` en `src/modules/inventory/schema.ts`, solo con su esquema (D-1, D-2);
  - claves foráneas compuestas `(organization_id, product_id)` → `products(organization_id, id)`: un saldo o un movimiento no puede apuntar al producto de otra organización (D-3);
  - cantidades `numeric(14, 3)` (D-4);
  - `CHECK (reorder_point >= 0)` y `CHECK (btrim(reason) <> '')` (D-5);
  - SKU único por organización sin distinguir mayúsculas, con un índice sobre `lower(sku)` (D-6);
  - a lo sumo una fila de `inventories` por producto; sin fila, el saldo es 0 (D-7).
- **Migraciones**: `drizzle/0004_*`, generada por Drizzle Kit sin SQL a mano, y `drizzle/0005_*`, a medida, con los privilegios de `crm_app` y el trigger `inventory_movements_insert_only`. Aplicadas en la base de desarrollo y sobre bases vacías; aplicarlas otra vez no hace nada.
- **Solo inserción de `inventory_movements`** ([ADR 0013](docs/decisions/0013-rol-de-aplicacion-y-tablas-de-solo-insercion.md)): `UPDATE` y `DELETE` rechazados con `42501` para `crm_app` y con `P0001` para el rol dueño; la tabla entró en la lista del test de cobertura de privilegios.
- **Tests**: 25 casos nuevos en `tests/integration/catalog-inventory-schema.test.ts`, cada uno con su SQLSTATE. Los tests existentes solo sumaron las tablas nuevas: la lista de `audit.test.ts` y la lista de tablas y el título de un caso en `identity-schema.test.ts`.
- **Suite local**: `npm run test` pasa 218 de 218 (65 unitarios, 19 guardas y 134 de integración); `npm run test:e2e` pasa 25 de 25. Con la base detenida pasan typecheck, lint, formato, guardas, unitarios y build, y `db:generate` informa "No schema changes". `package.json` sin cambios.
- **CI**: [34981182897](https://github.com/benjamurilloo/AI-WhatsApp-Agent-CRM/actions/runs/34981182897), commit `1824ae1`, en verde con todos los pasos, incluido el de desfase de migraciones.
- **Documentación**: DataModel (tablas, convención de cantidades y diagrama), TraceabilityMatrix, TestingStrategy y RepositoryStructure.
- **Nivel alcanzado**: **validado localmente y en CI** para el esquema de catálogo e inventario y la solo inserción de `inventory_movements`.

**No certifica:**

- **Que la aplicación no pueda saltearse el movimiento**: no hay servicio de ajuste todavía (4.3.1).
- **Ajustes concurrentes**, incluido el primer ajuste simultáneo de un producto sin fila de `inventories` (4.3.2).
- **La aplicación restringida por `crm_app`**: sigue conectándose con el rol dueño (Fases 8 y 9).
- **`TRUNCATE`**: el dueño todavía puede vaciar `inventory_movements`, como `audit_logs`; no tiene test propio en esta tabla.
- **`updated_at` en SQL crudo**: lo mantiene la aplicación, como en las tablas anteriores.
- **Revisión independiente**: es autoevaluación del mismo agente.

## 2026-09-14 — Subfase 4.0 cerrada (Diseño visual base)

**Certifica:**

- **Diseño visual base** según el [brief-4.0](docs/decisions/brief-4.0-diseno-visual-base.md), aprobado después de revisar una vista previa:
  - paleta Laguna en tokens semánticos de `globals.css`, con modo claro y oscuro; la paleta por defecto de Tailwind queda anulada (D-1, D-2);
  - Manrope variable servida localmente con `next/font/local`, con licencia OFL y cifras tabulares (D-3);
  - selector "Sistema", "Claro" y "Oscuro" en el marco común, con la cookie `crm_theme` leída en el servidor y sin scripts en línea (D-4);
  - clases de `form-styles.ts` reescritas sobre tokens, más título, tarjeta, tabla e insignias (D-5);
  - marco común como barra superior (D-7).
- **Aplicado a las pantallas 1 y 10 y al marco común** sin cambiar comportamiento, textos ni rutas: los 24 end-to-end existentes pasan sin cambios en sus pasos.
- **Accesibilidad**: `expectAccessible` analiza cada estado con axe en claro y en oscuro (D-6), sin violaciones WCAG 2.x A ni AA.
- **Tests**: caso 13 de `users.spec.ts` (tema elegido sobre el sistema, persistencia al recargar, vuelta a "Sistema", fuente cargada y cero pedidos a dominios externos) y 5 unitarios de la cookie de tema.
- **Suite local**: `npm run test:e2e` pasa 25 de 25. `npm run test` pasa 192 de 193: una guarda de frontera superó su timeout de 30 s bajo carga de memoria, y las 19 guardas pasan solas. Con la base detenida pasan typecheck, lint, formato, guardas, 65 unitarios, build y el chequeo de migraciones. `package.json` sin cambios.
- **CI**: [34916460308](https://github.com/benjamurilloo/AI-WhatsApp-Agent-CRM/actions/runs/34916460308), commit `8a4bac1`, en verde con los pasos de end-to-end. La ejecución anterior, [34915965363](https://github.com/benjamurilloo/AI-WhatsApp-Agent-CRM/actions/runs/34915965363) sobre `e5029e1`, falló en axe en oscuro por `transition-colors`; el arreglo quitó la transición.
- **Documentación**: Screens.md (reglas comunes), EngineeringStandards (tipografía y convención de estilos) y RepositoryStructure.
- **Nivel alcanzado**: **validado en integración** para las pantallas 1 y 10 y el marco común en los dos modos.

**No certifica:**

- **La identidad visual definitiva**: logo, marca e iconografía siguen fuera del MVP.
- **Firefox y WebKit**, incluida la representación de Manrope.
- **Modos de alto contraste forzado** del sistema operativo.
- **Juicio estético**: lo dio el usuario sobre la vista previa y las capturas, no un test.
- **Revisión independiente**: es autoevaluación del mismo agente.

## 2026-09-14 — Fase 3 cerrada (Identidad, autorización y auditoría)

**Certifica:**

- **Las siete subfases cerradas con confirmación del usuario**, en el orden 3.1 → 3.2 → 3.3 → 3.4 → 3.6 → 3.5 → 3.7. El detalle de cada una está en sus entradas, debajo.
- **Criterios de aceptación del [Roadmap](docs/planning/Roadmap.md)**:
  - otra organización → `NOT_FOUND`, en `tests/integration/authorization.test.ts` y `members.test.ts`, y de punta a punta en `users.spec.ts`;
  - `viewer` → `FORBIDDEN`, en los mismos archivos;
  - la auditoría es atómica con el cambio que registra: `audit.test.ts` fuerza el fallo de la inserción de auditoría, y `members.test.ts` lo verifica con los cambios reales de miembros.
- **Gate de salida**: suite de autenticación y autorización en verde, con CI en verde en el commit `49a6209` ([ejecución 34895273473](https://github.com/benjamurilloo/AI-WhatsApp-Agent-CRM/actions/runs/34895273473)).
- **Entregables**:
  - FR-ORG-01 a 03: una organización por usuario con aislamiento, gestión de usuarios y roles, y redirección a login sin sesión;
  - base de FR-AUD-01: `audit_logs` de solo inserción y `recordAudit` atómico, con `organization_member` como primer productor;
  - ADRs 0012 (sesiones) y 0013 (rol de aplicación y solo inserción).
- **Hito demostrable 1**: login funcional con roles.
- **Nivel alcanzado**:
  - **validado en integración** para las pantallas 1 y 10 y el marco común, que supera el nivel que pedía el Roadmap para la gestión de usuarios;
  - **validado localmente y en CI** para la autenticación, la autorización, la auditoría y la gestión de miembros a nivel de servicio.

**No certifica:**

- **La aplicación restringida por `crm_app`**: sigue conectándose con el rol dueño, y la defensa efectiva de `audit_logs` es el trigger. Fases 8 y 9.
- **La cookie detrás de TLS y de un proxy real**, y el límite de intentos por IP detrás de un proxy: Fases 8 y 9.
- **Verificación de `Origin`**: no hay Route Handlers mutantes todavía.
- **Diseño visual**: las pantallas usan estilos funcionales y accesibles con Tailwind, sin identidad visual definida. Al cerrar la fase, el usuario pidió sumar la subfase 4.0 (diseño visual base), ya registrada en el Roadmap.
- **Firefox y WebKit**.
- **Revisión independiente**: es autoevaluación del mismo agente. El usuario aprobó los briefs, los cierres y el ADR de sesiones.

## 2026-09-14 — Subfase 3.7 cerrada (Gestión de usuarios y roles)

**Certifica:**

- **Pantalla 10** según Screens.md, el wireframe 10 y el [brief-3.7](docs/decisions/brief-3.7-gestion-de-usuarios-y-roles.md):
  - `/usuarios` con filtros de rol y estado y página en la URL, tabla en escritorio y tarjetas en móvil, "(vos)" y "Limpiar filtros";
  - `/usuarios/nuevo`: alta con contraseña inicial de 16 caracteres en 4 grupos (D-5), mostrada una sola vez con "Copiar", `must_change_password` en `true` y `CONFLICT` por email repetido;
  - `/usuarios/[memberId]`: cambio de rol, desactivación con confirmación como segundo paso (D-6) y reactivación;
  - un `viewer` ve "No tenés permiso para ver esta página." sin datos (D-10), y un miembro de otra organización da `NOT_FOUND`.
- **Marco común** en el route group `(autenticado)` (D-7): organización, navegación con `aria-current`, usuario con su rol y "Salir".
- **`organizations`**: `listMembers`, `createMember`, `changeMemberRole`, `deactivateMember`, `reactivateMember` y `getAppFrame`. Nombre y email vía la interfaz de `auth`, compuestos en memoria, sin `JOIN` entre módulos (D-3).
- **Regla del último `admin`** (ADR 0010, D-4): `SELECT … FOR UPDATE` sobre la organización y conteo de `admin` activos dentro de la transacción. Dentro del bloqueo también se verifica que quien actúa siga siendo `admin` activo.
- **Primer productor de auditoría**: alta, cambio de rol, desactivación y reactivación escriben `organization_member` en la misma transacción, con `diff` sin PII (D-8) y sin registro cuando no hay cambio real.
- **`auth`**: generación de la contraseña inicial con `crypto.randomInt`, alta en un savepoint que traduce `23505` a `CONFLICT`, y desactivación que borra las sesiones del usuario.
- **Tests**:
  - 12 end-to-end nuevos en `users.spec.ts`, con axe sin violaciones WCAG 2.x A ni AA en cada estado, teclado, móvil a 375 px y la sesión abierta de un usuario desactivado cerrándose en otro navegador;
  - 19 de integración nuevos, incluido el de concurrencia: una tercera conexión retiene el bloqueo y, al liberarlo, exactamente uno de dos cambios lo logra;
  - 20 unitarios nuevos: contraseña inicial, filtros, mensajes, composición de la lista y regla del último `admin`.
- **Suite local**: `npm run test` pasa 188 de 188 y `npm run test:e2e` 24 de 24. Con la base detenida pasan typecheck, lint, formato, 19 guardas, 60 unitarios, build y el chequeo de migraciones, sin cambios de esquema.
- **CI**: [34894885454](https://github.com/benjamurilloo/AI-WhatsApp-Agent-CRM/actions/runs/34894885454), commit `ff15318`, en verde con los pasos de end-to-end.
- **Decisiones D-1 a D-11** resueltas según la recomendación. Sin dependencias nuevas.
- **Documentación**: SecurityModel, Overview, DataModel, TestingStrategy, RepositoryStructure, Screens y wireframe 10.
- **Nivel alcanzado**:
  - **validado en integración** (UI ↔ Server Action ↔ servicio ↔ base) para la pantalla 10 y el marco común;
  - **validado localmente y en CI** para los casos de uso, la regla del último `admin` con concurrencia y la auditoría.

**No certifica:**

- **La aplicación restringida por `crm_app`**: sigue conectándose con el rol dueño. Fases 8 y 9.
- **Firefox y WebKit**, y un `INTERNAL` real de punta a punta.
- **Entrega de la contraseña inicial por un canal seguro**: el `admin` la copia y la transmite por fuera del CRM.
- **Revisión independiente**: es autoevaluación del mismo agente. El usuario aprobó el brief y el cierre.

## 2026-09-14 — Subfase 3.5 cerrada (Pantalla de inicio de sesión)

**Certifica:**

- **Pantalla 1** según Screens.md, el wireframe 01 y el [brief-3.5](docs/decisions/brief-3.5-pantalla-de-inicio-de-sesion.md):
  - `/login` con Server Action. Credenciales incorrectas, email inexistente, usuario sin membresía y contraseña fuera de política dan el mismo mensaje, con el foco en él;
  - email inválido asociado al campo, límite de intentos con el botón deshabilitado, "Ingresando…" y `request_id` visible solo en errores inesperados;
  - `/cambiar-contrasena` para `must_change_password`, y cierre de sesión;
  - `/` protegida provisional. Sin sesión va a `/login` (FR-ORG-03) y con el cambio pendiente vuelve a ese paso. Sin `proxy` (D-6).
- **`auth`**, sin cambios de esquema:
  - `completeRequiredPasswordChange` (D-4): no pide la contraseña inicial, devuelve `FORBIDDEN` con el flag en `false` y repite esa condición dentro de la transacción;
  - la cookie vence en `created_at` + 30 días (D-5), con nota fechada en el ADR 0012;
  - **defecto corregido del adaptador de la 3.3**: el borrado de la cookie `__Host-` no llevaba `Secure` ni `Path=/`, y Chromium la conservaba. La sesión ya se borraba en la base.
- **Infraestructura nacida con la pantalla**:
  - Tailwind CSS 4.3 (D-2);
  - `src/shared/log/`, JSON sin PII (D-9);
  - `seeds/basic.ts` con `npm run db:seed` y `tsx` declarado (D-7);
  - Playwright 1.63 con Chromium y `@axe-core/playwright` sobre `next start`, en la base `<nombre>_e2e` (D-3 y D-8).
- **Tests**:
  - 12 end-to-end, incluidos axe sin violaciones WCAG 2.x A ni AA en siete estados, el recorrido solo con teclado, los atributos y el vencimiento de la cookie en el navegador, el reenvío de la cookie anterior al cierre de sesión y el móvil a 375 px;
  - 13 de integración nuevos: 8 de `auth` y 5 del seed, incluido su rechazo contra una base no permitida;
  - 13 unitarios nuevos, de mensajes y de log. Este último verifica que no aparecen la contraseña, el token ni el email usados.
- **Suite local**: `npm run test` pasa 149 de 149 y `npm run test:e2e` 12 de 12. Con la base detenida pasan typecheck, lint, 19 guardas, 40 unitarios, build y el chequeo de migraciones.
- **CI**: [34881542804](https://github.com/benjamurilloo/AI-WhatsApp-Agent-CRM/actions/runs/34881542804), commit `49bfe74`, en verde con los pasos de Chromium y end-to-end.
- **Decisiones D-1 a D-9** resueltas según la recomendación. Dependencias instaladas con autorización y sin avisos de dependencias pares.
- **Documentación**: SecurityModel, Overview, RepositoryStructure, EngineeringStandards, Environments, TestingStrategy y `.env.example`.
- **Nivel alcanzado**:
  - **validado en integración** (UI ↔ Server Action ↔ servicio ↔ base) para el ingreso, el cambio obligatorio, el cierre de sesión, las redirecciones y la cookie;
  - **validado localmente y en CI** para `completeRequiredPasswordChange`, el seed y el log.

**No certifica:**

- **La cookie detrás de TLS y de un proxy real**: Fases 8 y 9. En los tests corre sobre `http://localhost`, que Chromium trata como seguro.
- **Firefox y WebKit**.
- **Un `INTERNAL` real de punta a punta**: solo el mensaje y el log, con tests unitarios.
- **Lint de accesibilidad**: no hay plugin compatible con ESLint 10. La cobertura es axe sobre el DOM.
- **Limitación aceptada (D-4)**: quien robe la sesión del primer ingreso puede definir la contraseña sin conocer la inicial.
- **Revisión independiente**: es autoevaluación del mismo agente. El usuario aprobó el brief y el cierre.

## 2026-09-14 — Subfase 3.6 cerrada (Módulo de auditoría)

**Certifica:**

- **`audit_logs`**, según DataModel y el [brief-3.6](docs/decisions/brief-3.6-modulo-de-auditoria.md):
  - enums completos de tipo de entidad y acción (D-1);
  - claves foráneas `ON DELETE RESTRICT` hacia `organizations` y `users` (D-5);
  - índice de historial por entidad;
  - migración `drizzle/0002_audit_logs.sql`, generada y revisada como SQL.
- **Solo inserción** según el [ADR 0013](docs/decisions/0013-rol-de-aplicacion-y-tablas-de-solo-insercion.md), en `drizzle/0003_crm_app_role_and_audit_insert_only.sql`, la primera migración a medida:
  - rol `crm_app` `NOLOGIN`, creado solo si no existe, con privilegios explícitos sobre las seis tablas;
  - solo `SELECT` e `INSERT` sobre `audit_logs`;
  - trigger que rechaza `UPDATE` y `DELETE` para cualquier rol, con `P0001`.
- **Módulo `audit`** (`src/modules/audit/`), según D-3 y D-4:
  - `recordAudit(tx, entry)` exige por tipo una transacción (`DbTransaction` en `src/shared/db/`);
  - valida la entrada con `zod`: forma `{ before, after }`, claves prohibidas y un error que nombra campos sin valores.
- **Tests contra PostgreSQL real**, cada invariante intentando violarlo:
  - 18 de integración: esquema, `42501` para `crm_app`, trigger para el dueño, cobertura de privilegios con sus dos casos de fallo, tres casos de atomicidad, entrada inválida que revierte el cambio y prueba de tipo;
  - 8 unitarios de validación de la entrada.
- **Migraciones**: aplicadas dos veces a desarrollo sin cambios. El paso de desfase quedó limpio después de la migración a medida.
- **Suite local**: `npm run test` pasa 123 de 123. Con la base detenida pasan typecheck, lint, 19 guardas, 27 unitarios y build.
- **CI**: [34874433744](https://github.com/benjamurilloo/AI-WhatsApp-Agent-CRM/actions/runs/34874433744), commit `e240bea`, en verde con todos los pasos. Los tests de permisos pasaron en Linux, así que la migración creó el rol y `SET LOCAL ROLE` funcionó.
- **Decisiones D-1 a D-5** resueltas según la recomendación; ADR 0013 aceptado.
- **Documentación**:
  - DataModel, SecurityModel (alineado con FR-AUD-01), TestingStrategy, Environments y RepositoryStructure;
  - Overview, con la dependencia de esquema de `audit`;
  - `ExecutionProtocol.md`, con la lista de cierre corregida en el Knowledge Capture del 2026-09-14.
- **Nivel alcanzado: validado localmente y en CI** para el esquema de `audit_logs`, el rechazo de `UPDATE` y `DELETE` por permisos y por trigger, y la atomicidad de `recordAudit`.

**No certifica:**

- **Restricción en ejecución**: la aplicación sigue conectándose con el rol dueño, y `crm_app` solo se probó con `SET LOCAL ROLE`. La conexión con un rol con login llega en las Fases 8 y 9.
- **`TRUNCATE` del dueño y trigger desactivado por un superusuario**: limitaciones aceptadas. Un test demuestra la primera.
- **`CREATEROLE` en un servicio gestionado**: Fases 8 y 9.
- **Productores reales**: el primero es la 3.7. Productos y stock llegan en la Fase 4, clientes en la 5 y conversaciones en la 6.
- **Consulta del historial** (FR-AUD-02): pantallas 4 y 7.
- **Revisión independiente**: es autoevaluación del mismo agente. El usuario aprobó el brief y el cierre.

## 2026-09-14 — Subfase 3.4 cerrada (Autorización y taxonomía de errores)

**Certifica:**

- **Taxonomía de errores** en `src/shared/errors/`: los 8 códigos de [Overview.md](docs/architecture/Overview.md) con su estado HTTP, el tipo `Failure` y `failure()`. `auth` declara `AuthFailure` con ese tipo, sin cambios de comportamiento.
- **Módulo `organizations`** (`src/modules/organizations/`), según el [brief-3.4](docs/decisions/brief-3.4-autorizacion-y-errores.md):
  - `getAuthContext(token)`: llama a `auth.validateSession` y resuelve membresía y rol con su propio repositorio, sin JOIN entre módulos; devuelve un contexto congelado o `UNAUTHENTICATED`;
  - `authorize(context, { role })`: `must_change_password` → `FORBIDDEN`, rol insuficiente → `FORBIDDEN`;
  - `getMember(context, memberId)`: solo `admin`, id validado con `zod`, consulta filtrada por `organization_id` en SQL → `NOT_FOUND` para otra organización.
- **Tests contra PostgreSQL real**:
  - 12 de integración (`tests/integration/authorization.test.ts`): contexto válido, token ausente, inválido o vencido, sin membresía, usuario inactivo, cambio de rol y baja de membresía en el request siguiente, `viewer` con `FORBIDDEN`, `NOT_FOUND` entre organizaciones idéntico al de un id inexistente, id inválido y `must_change_password`;
  - 5 unitarios nuevos: taxonomía y orden de `authorize`.
- **CI con tests unitarios**: paso `npm run test:unit` en `ci.yml`, antes de integración.
- **Suite local**: `npm run test` pasa 97 de 97. Con la base detenida pasan typecheck, lint, 19 guardas, 19 unitarios y build.
- **CI**: [34852017994](https://github.com/benjamurilloo/AI-WhatsApp-Agent-CRM/actions/runs/34852017994), commit `800115c`, en verde, con todos los pasos, incluido "Tests unitarios".
- **Decisiones D-1 a D-5** resueltas según la recomendación.
- **Nivel alcanzado: validado localmente y en CI** para contexto autenticado, guardas, aislamiento en `organization_members` y taxonomía, a nivel de servicio.

**No certifica:**

- **Redirecciones y respuestas HTTP** a partir de los códigos: no hay rutas todavía (3.5).
- **Verificación de `Origin` y log con `request_id`**: ubicaciones fijadas (`src/shared/http/`, `src/shared/log/`), sin implementar hasta su primer consumidor.
- **Reescritura de la cookie tras la renovación**: el contexto expone `sessionExpiresAt`, pero nada la reescribe todavía (3.5).
- **Aislamiento de otros recursos**: cada módulo de las Fases 4 a 7 agrega su test.
- **Regla del último `admin`**: 3.7.
- **Revisión independiente**: es autoevaluación del mismo agente. El usuario aprobó el brief y el cierre.

## 2026-09-13 — Subfase 3.3 cerrada (Autenticación)

**Certifica:**

- **Módulo `auth`** (`src/modules/auth/`), según el [ADR 0012](docs/decisions/0012-mecanismo-de-sesion.md) y el [brief-3.3](docs/decisions/brief-3.3-autenticacion.md):
  - `login`, `validateSession`, `logout`, `changePassword` y `revokeUserSessions`;
  - resultados tipados con `UNAUTHENTICATED`, `VALIDATION_ERROR` y `RATE_LIMITED`;
  - consulta solo sus propias tablas (D-2, nota fechada en el ADR 0012).
- **Contraseñas**:
  - argon2id con `@node-rs/argon2` 2.2.1 (`m=19456`, `t=2`, `p=1`, formato PHC);
  - verificación contra un hash ficticio para emails inexistentes;
  - política de 12 a 128 caracteres; entradas validadas con `zod` 4.6.4.
- **Sesiones**:
  - token de 32 bytes, con solo su SHA-256 en `sessions`;
  - deslizante de 7 días, renovada a mitad de ventana, con tope de 30;
  - revocación total al cambiar la contraseña; sesión nueva en cada ingreso.
- **Límite de intentos** en `login_attempts`, con claves hasheadas: 5 fallos por cuenta o 20 por IP en 15 minutos, evaluado antes de verificar la contraseña. La IP solo sale de `x-forwarded-for` con `TRUSTED_PROXY=true`.
- **Migración `drizzle/0001_*`** con `sessions` y `login_attempts`, revisada como SQL y aplicada dos veces en desarrollo.
- **Tests contra PostgreSQL real**:
  - 30 de integración del servicio, cada invariante intentando violarlo (token no guardado, rechazos indistinguibles, expiración, tope, manipulación, usuario desactivado, renovación, logout, revocación, cambio de contraseña, límites por cuenta e IP, entradas inválidas, sin secretos en consola);
  - 14 unitarios de hash, política, cookie e IP.
- **`updated_at` con `$onUpdate`** ahora probado por el cambio de contraseña (pendiente de la 3.1).
- **Suite local**: `npm run test` pasa 80 de 80; `npm ci` reproduce la instalación. Con la base detenida pasan typecheck, lint, guardas y build.
- **CI**: [34792128446](https://github.com/benjamurilloo/AI-WhatsApp-Agent-CRM/actions/runs/34792128446), commit `b779592`, en verde. 47 tests de integración y 19 guardas; paso de desfase sin cambios; sin avisos de `allowScripts` nuevos, y el binario de argon2 funcionó en Linux.
- **Decisiones D-1 a D-7** resueltas según la recomendación.
- **Nivel alcanzado: validado localmente y en CI** para contraseñas, sesiones y límite de intentos, a nivel de servicio.

**No certifica:**

- **Tests unitarios en CI**: `ci.yml` no corre el proyecto `unit`, porque no existía cuando se escribió en la 2.5. Los 14 unitarios solo pasaron en local. Pendiente para la 3.4.
- **Manejo de la cookie de punta a punta**: queda implementado (D-7); se valida en integración con la pantalla, en la 3.5.
- **La IP detrás de un proxy real** (D-4): Fase 8 o 9.
- **Cookie tras la renovación**: se reescribe en Server Actions o Route Handlers (3.4 y 3.5).
- **`@node-rs/argon2` dentro del build de Next.js**: ninguna ruta usa `auth` todavía (3.5).
- **Límite de intentos en el cambio de contraseña**: fuera de alcance.
- **Resistencia real a medición de tiempos**: la verificación ficticia está implementada, pero no se mide.
- **Revisión independiente**: es autoevaluación del mismo agente. El usuario aprobó el brief y el cierre.

## 2026-09-13 — Subfase 3.2 cerrada (ADR del mecanismo de sesión)

**Certifica:**

- **[ADR 0012](docs/decisions/0012-mecanismo-de-sesion.md) aceptado**: sesiones server-side propias sobre `node:crypto` y `cookies` de Next.js, sin dependencias.
  - **Almacenamiento**: tabla `sessions` en PostgreSQL con el SHA-256 de un token de 32 bytes; el token nunca se guarda.
  - **Expiración**: deslizante de 7 días, renovada a mitad de ventana, con tope absoluto de 30.
  - **Validación**: en cada request se leen de la base rol, organización, `is_active` y `must_change_password`.
  - **Revocación**: todas las sesiones al cambiar la contraseña o desactivar al usuario; sesión nueva en cada ingreso.
  - **`must_change_password`**: restringido en la validación.
  - **Cookie y CSRF**: `HttpOnly`, `SameSite=Lax` y `Secure` con TLS; Server Actions más verificación de `Origin` en Route Handlers mutantes; `proxy` solo optimista.
- **Decisiones D-1 a D-6 del [brief-3.2](docs/decisions/brief-3.2-adr-mecanismo-de-sesion.md)** resueltas según la recomendación.
- **Verificación de fuentes (2026-09-13)**:
  - guía de autenticación, `proxy` y seguridad de datos de Next.js 16.3;
  - registro npm: `lucia` y `@oslojs/crypto` deprecados, Auth.js v5 en beta, Better Auth 1.7.4 con esquema propio;
  - `crypto.argon2` nativo en Node 24.15, sin avisos.
- **Documentación**:
  - `sessions` diseñada en DataModel;
  - SecurityModel sin "a definir" y con la política CSRF;
  - fila Autenticación de EngineeringStandards;
  - pregunta abierta cerrada en Risks;
  - 9 casos obligatorios de sesión en TestingStrategy.
- **Contraste sin contradicciones** con SecurityModel, NonFunctionalRequirements, DataModel, Overview, ADR 0010 y el wireframe 01.
- **Notion**: tarea 3.2 con descripción corregida (sin organización activa).
- Enlaces internos verificados: 0 rotos.
- **Nivel alcanzado: diseñado.**

**No certifica:**

- **Implementación y validación de la sesión**: 3.3 (crear, validar, renovar, revocar y migración de `sessions`) y 3.4 (contexto autenticado, `must_change_password`, `Origin`).
- **Hash de contraseñas y rate limit**: se deciden en la 3.3. La estabilidad declarada de `crypto.argon2` sigue sin verificar.
- **Que Route Handlers no verifiquen `Origin` por su cuenta**: es una inferencia de la documentación, no una prueba.
- **Revisión independiente**: es autoevaluación del mismo agente. El usuario aprobó el brief y el cierre.

## 2026-09-13 — Subfase 3.1 cerrada (Migraciones de identidad)

**Certifica:**

- **Esquema de identidad** según [DataModel.md](docs/architecture/DataModel.md):
  - `users` en `src/modules/auth/schema.ts`; `organizations` y `organization_members` en `src/modules/organizations/schema.ts`;
  - migración inicial `drizzle/0000_keen_spyke.sql`, generada con `drizzle-kit` 0.31.10 y revisada como SQL: enum `member_role`, `gen_random_uuid()`, índice único sobre `lower(email)`, `UNIQUE(user_id)`, claves foráneas `ON DELETE CASCADE` e índice por `organization_id`.
- **`db:migrate` en la base de desarrollo**: aplicada dos veces, con 1 migración registrada.
- **Base de test aislada** (D-1): `<nombre>_test` recreada y migrada con el migrador de `drizzle-orm` en cada ejecución, `TRUNCATE` antes de cada test y archivos en serie. `crm_dev` tuvo 0 filas antes y después de la suite.
- **`identity-schema.test.ts`**: 17 tests que intentan violar cada invariante y comprueban el código de PostgreSQL (`23505` email repetido, también con otras mayúsculas, y segunda membresía; `23503` FK; `23502` NOT NULL; `22P02` rol inválido), más defaults, reaplicación de migraciones sin efecto y aislamiento entre tests.
- **Suite local**: `npm run test` pasa 41 de 41. Con la base detenida pasan typecheck, lint, guardas y build.
- **CI**: [34786605412](https://github.com/benjamurilloo/AI-WhatsApp-Agent-CRM/actions/runs/34786605412), commit `bef80d6`, en verde en 1m5s. El paso nuevo de desfase respondió "No schema changes"; 19 tests de guardas y 22 de integración contra `crm_ci_test`.
- **Detección de desfase probada** contra una copia de `drizzle/`: con una columna temporal generó el `ALTER TABLE`; sin cambios, nada.
- **`allowScripts` resuelto**: `drizzle-kit` funciona en local y en CI pese al aviso de los `postinstall` de `esbuild`.
- **Decisiones D-1 a D-6 del [brief-3.1](docs/decisions/brief-3.1-migraciones-de-identidad.md)** resueltas según la recomendación.
- Enlaces internos verificados: 0 rotos.
- **Nivel alcanzado: validado localmente y en CI**, solo para el esquema de identidad y el aislamiento de los tests.

**No certifica:**

- **Mantenimiento de `updated_at`** con `$onUpdate` (D-3): implementado, sin test. Se ejercita cuando un repositorio actualice filas (3.3 o 3.7).
- **Autenticación, sesiones, autorización, auditoría y reglas de negocio** (último `admin`): subfases 3.2 a 3.7.
- **`format:check` local de `src/app/page.tsx`**: la copia de trabajo en Windows tiene CRLF; en CI pasa. Es previo a la 3.1.
- **Revisión independiente**: es autoevaluación del mismo agente. El usuario aprobó el brief y el cierre.

## 2026-09-13 — Fase 2 cerrada (Fundación técnica)

**Certifica:**

- **Las cinco subfases cerradas con confirmación del usuario**, en el orden 2.2 → 2.1 → 2.3 → 2.4 → 2.5.
- **Criterios de aceptación del [Roadmap](docs/planning/Roadmap.md)**:
  - lint, typecheck, test y build pasan en local y en CI;
  - la guarda falla ante una referencia prohibida (AC-3 de la 2.5 y casos versionados).
- **Gate de salida**:
  - CI en verde en el commit `e820ca4`;
  - estructura ([RepositoryStructure.md](docs/architecture/RepositoryStructure.md)) aprobada por el usuario el 2026-09-13.
- **Entregables**:
  - app Next.js que compila;
  - PostgreSQL 18 local con health check;
  - CI en verde;
  - ADR 0004 aceptado y ADR 0011 para el lint.
- **Nivel alcanzado: validado localmente y en CI** para la fundación técnica, que incluye la conexión a la base, el health check y las guardas.

**No certifica:**

- **Lógica de negocio, tablas, migraciones, autenticación ni pantallas**: empiezan en la Fase 3.
- **Aislamiento de la base de test**: se decide en la 3.1.
- **Bloqueo de merges en rojo**: no hay protección de rama en el plan gratuito de GitHub; el control es por procedimiento (brief-2.5, D-3).
- **Seguridad de dependencias**: 4 avisos moderados de `npm audit` a través de `drizzle-kit`, que quedan para la Fase 8.
- **Revisión independiente**: es autoevaluación del mismo agente. El usuario aprobó los briefs, los cierres y la estructura.

## 2026-09-13 — Subfase 2.5 cerrada (Pipeline de CI)

**Certifica:**

- **`.github/workflows/ci.yml`** corre en cada push a `main` y en cada pull request:
  - pasos: `npm ci`, lint, typecheck, formato, guardas, tests de integración contra PostgreSQL 18.6 efímero y build;
  - permisos solo de lectura, acciones fijadas por SHA y sin secrets.
- **Primera ejecución en verde**: [34783979325](https://github.com/benjamurilloo/AI-WhatsApp-Agent-CRM/actions/runs/34783979325), del commit `e820ca4`. Terminó en 62 s con los 11 pasos en verde.
- **Guardas versionadas en `tests/guards/`**, que corren en local y en CI sin base de datos:
  - **referencias prohibidas**: detecta Airtable, `AIRTABLE_*` y el repositorio del agente de WhatsApp fuera de `.md`, y permite `ai-whatsapp-agent-crm`;
  - **frontera entre módulos**: los 9 casos de la 2.3, ahora como archivos virtuales con `ESLint#lintText`.
- **Caso forzado (AC-3)**: con una referencia a Airtable agregada temporalmente en `src/app/page.tsx`, la guarda falló e indicó `src/app/page.tsx:8 (Airtable)`. El archivo se restauró.
- **Suite local**: `npm run test` pasa 24 de 24 (19 de guardas y 5 de integración), con typecheck, lint y format en verde.
- **Decisiones D-1 a D-4 del [brief-2.5](docs/decisions/brief-2.5-pipeline-de-ci.md)** resueltas según la recomendación: guardas como tests, alcance sin `.md`, CI sin protección de rama aceptada y acciones por SHA.
- Enlaces internos verificados: 0 rotos.

**No certifica:**

- **Que la CI bloquee un push o un merge en rojo**: GitHub no ofrece protección de rama en repositorios privados del plan gratuito.
- **Scripts de instalación de npm en CI**: el runner avisa que los `postinstall` de tres versiones de `esbuild` no están cubiertos por `allowScripts`. No afecta al pipeline actual, pero puede afectar a `drizzle-kit` en la Fase 3.
- **Tests end-to-end**: llegan con Playwright en la Fase 3.
- **Revisión independiente**: es autoevaluación del mismo agente.

## 2026-09-13 — Subfase 2.4 cerrada (Base de datos local)

**Certifica:**

- **PostgreSQL 18 local** con Docker Compose:
  - imagen `postgres:18.6-trixie`;
  - puerto publicado solo en `127.0.0.1:5432`;
  - volumen en `/var/lib/postgresql`, la ruta que exige la imagen 18. Se verificó que los datos persisten tras `down` y `up`: el `system_identifier` no cambió.
- **Conexión con Drizzle 0.45 y `pg` 8.23**, en `src/shared/db/`. La conexión se abre en el primer uso, con una sola instancia por proceso y timeout de 2 s.
- **`/api/health`** responde 200 `{"status":"ok"}` o 503 `{"status":"unavailable"}`, con `Cache-Control: no-store` y sin detalles. En runtime local respondió 200, luego 503 en 69 ms con la base detenida y otra vez 200 al levantarla, sin reiniciar `next dev`.
- **Cinco tests de integración contra PostgreSQL real** pasan:
  - consulta con Drizzle;
  - versión 18.x del servidor;
  - health check disponible;
  - conexión cortada por el servidor;
  - health check sin servidor, que no expone credenciales.
  - `--passWithNoTests` se retiró.
- **Defecto encontrado y corregido**: sin un manejador de `error`, el pool de `pg` lanzaba un `uncaughtException` cuando la base cortaba una conexión inactiva. Eso podía tirar el proceso, y el volcado incluía la contraseña. Primero se reprodujo con un test que falló; después se corrigió con `pool.on("error")`.
- **Instalación y chequeos**:
  - `npm ci` desde cero sin conflictos de dependencias pares;
  - typecheck, lint, format y build pasan con la base detenida.
- **Decisiones D-1 a D-5 del [brief-2.4](docs/decisions/brief-2.4-base-de-datos-local.md)** resueltas según la recomendación:
  - driver `pg`;
  - una sola base local;
  - health check sin detalles;
  - `process.loadEnvFile()` nativo;
  - imagen `18.6-trixie`.
- Enlaces internos verificados: 0 rotos.

**No certifica:**

- **Tablas, migraciones, tipos de datos ni reglas de negocio**: no existen. `drizzle-kit` está instalado, pero nunca se ejecutó.
- **Aislamiento entre la base de desarrollo y la de tests**: los tests usan la misma base porque solo leen. La separación se decide en la 3.1.
- **Ejecución en CI**: corresponde a la 2.5.
- **`postgres` 3.4 (postgres.js)**: no se probó.
- **Seguridad de dependencias**: `npm audit` informa 4 avisos moderados de `esbuild` a través de `drizzle-kit`, y 0 altos o críticos. Se tratan en la Fase 8.
- **Revisión independiente**: es autoevaluación del mismo agente.

## 2026-09-12 — Subfase 2.3 cerrada (Bootstrap de la aplicación)

**Certifica:**

- **Instalación manual autorizada por el usuario**, sin `create-next-app`, con las dependencias de primer nivel que lista el [brief-2.3](docs/decisions/brief-2.3-bootstrap-de-la-aplicacion.md). `npm install` y `npm ci` corrieron sin avisos de dependencias pares, sin forzar nada y con 0 vulnerabilidades en `npm audit`.
- **[ADR 0011](docs/decisions/0011-lint-con-eslint-10-sin-eslint-config-next.md) aceptado**: lint con ESLint 10 y plugins sueltos, porque `eslint-config-next` arrastra plugins que solo aceptan ESLint 9.
- **Scripts que salen con 0**: `typecheck`, `lint`, `format:check`, `build` y `test`. `test` pasa con `--passWithNoTests`, porque todavía no hay tests.
- **Regla de frontera entre módulos**: se probó con 9 archivos temporales, 6 importaciones prohibidas y 3 permitidas, entre ellas las excepciones de `schema.ts` y `analytics`. Las 6 prohibidas fallaron y las 3 permitidas pasaron; los archivos se borraron.
- **`next dev`**: sirve `/` con 200, `lang="es"` y el título.
- **Ajustes durante la ejecución**, registrados en el brief:
  - TypeScript con rango `~6.0.3`;
  - `vitest.config.mts`;
  - `agentRules: false`, porque `next dev` escribía un bloque propio en `CLAUDE.md`. El bloque se descartó y se verificó que no vuelve a aparecer.
- Enlaces internos verificados: 0 rotos.

**No certifica:**

- **Validación local.** No hay tests: el nivel es *implementado*.
- **Regla de frontera en CI**: la prueba fue local y temporal. El caso versionado llega en la 2.5.
- **Accesibilidad**: no hay lint mientras `eslint-plugin-jsx-a11y` no soporte ESLint 10.
- **Base de datos, Drizzle, Playwright y estilos**: fuera del alcance.
- **Revisión independiente.** Es autoevaluación del mismo agente.

## 2026-09-12 — Subfase 2.1 cerrada (Estructura del repositorio)

**Certifica:**

- **2.1 como subfase de diseño**, sin fusionar con la 2.3, aprobada por el usuario.
- **Seis decisiones resueltas por el usuario** según la recomendación del [brief-2.1](docs/decisions/brief-2.1-estructura-del-repositorio.md):
  - código en `src/`;
  - módulos en `src/modules/<modulo>/` con `index.ts`, `service.ts`, `repository.ts`, `schema.ts` y `types.ts`;
  - cliente de base en `src/shared/db/`;
  - migraciones en `drizzle/` y seeds en `seeds/`;
  - tests unitarios junto al código, integración en `tests/integration/` y end-to-end en `tests/e2e/`;
  - frontera entre módulos con `no-restricted-imports` de ESLint.
- **[RepositoryStructure.md](docs/architecture/RepositoryStructure.md)**: árbol, ubicación de los nueve módulos, reglas de importación y una tabla que asigna cada carpeta a la subfase que le pone su primer archivo real.
- **Consecuencia documentada**: un `schema.ts` puede importar el `schema.ts` de otro módulo para declarar claves foráneas; sin esa excepción, D-3 y D-6 se contradicen.
- Documentos alineados: `Overview.md` (interfaz pública = `index.ts`), `TestingStrategy.md` (`seeds/`) y `EngineeringStandards.md` (forma del módulo). Enlaces internos verificados: 0 rotos.

**No certifica:**

- **Nada creado ni ejecutado.** Ninguna carpeta ni archivo de código existe todavía; todo sigue en nivel *diseñado*.
- **Que la regla de ESLint funcione** como se describe, incluida la excepción de `schema.ts`: se configura en la 2.3 y se prueba en la 2.5.
- **Que Drizzle Kit lea el esquema repartido por módulos** sin problemas: se valida en la 2.4 y con la primera migración de la Fase 3.
- **Revisión independiente.** Es autoevaluación del mismo agente.

## 2026-09-12 — Subfase 2.2 cerrada (Re-verificación del stack)

**Certifica:**

- **Orden de la Fase 2**: 2.2 → 2.1 → 2.3 → 2.4 → 2.5, decidido por el usuario y registrado en el [Roadmap](docs/planning/Roadmap.md). La estructura del repositorio depende del stack aceptado.
- **Versiones vigentes verificadas el 2026-09-12** contra el registro npm y las páginas oficiales de soporte, con fuente y fecha en [EngineeringStandards.md](docs/development/EngineeringStandards.md) y la tabla completa en el [brief-2.2](docs/decisions/brief-2.2-re-verificacion-del-stack.md).
- **Seis decisiones resueltas por el usuario** según la recomendación:
  - Node 24 LTS;
  - Drizzle ORM 0.45 y Drizzle Kit 0.31;
  - ESLint 10 + `eslint-config-next` + Prettier;
  - npm 11;
  - PostgreSQL 18;
  - TypeScript 6.0.
- **[ADR 0004](docs/decisions/0004-stack-tecnologico-propuesto.md) aceptado**, con alternativas descartadas y revisiones previstas (Node 26 en LTS, TypeScript 7.1, Drizzle 1.0 antes de la 3.1).
- **Hallazgo D-6**: TypeScript 7.0 salió sin API programática y `typescript-eslint` exige `<6.1.0`, así que el proyecto queda en TypeScript 6.0.
- Enlaces internos verificados: 0 rotos.

**No certifica:**

- **Nada instalado ni ejecutado.** Todo sigue en nivel *diseñado*: sin `package.json`, lockfile, código, base de datos ni CI. La instalación es la 2.3 y requiere autorización.
- **Soporte de PostgreSQL 18 en Drizzle y sus drivers**: no se encontró declaración oficial. Se valida con conectividad real en la 2.4.
- **Compatibilidad en ejecución** entre los componentes: solo se contrastaron `engines` y `peerDependencies` declarados.
- **Revisión independiente.** Es autoevaluación del mismo agente.

## 2026-09-12 — Fase 1 cerrada (Diseño UX y validación del modelo)

**Certifica:**

- **Las tres subfases cerradas con aprobación del usuario**, ejecutadas en el orden 1.3 → 1.1 → 1.2:
  - 1.3: nueve decisiones de producto y ADRs 0007 a 0009;
  - 1.1: wireframes de las 10 pantallas;
  - 1.2: once decisiones de modelo, ADR 0010 y [matriz de trazabilidad](docs/architecture/TraceabilityMatrix.md).

  El detalle de cada una está en sus entradas, debajo.
- **Criterios de salida del [Roadmap](docs/planning/Roadmap.md), a nivel documental**:
  - cada dato mostrado en los wireframes tiene origen en `DataModel.md`;
  - cada FR tiene pantalla, endpoint o invariante con test;
  - cada índice tiene una consulta que lo usa;
  - toda decisión pendiente está resuelta o diferida con fase límite;
  - el usuario aprobó wireframes y decisiones.
- **Repositorio remoto** en GitHub privado desde el 2026-09-12, con todo el historial subido.

**No certifica:**

- **Nada de implementación.** Todo sigue en nivel *diseñado*: sin código, migraciones, dependencias, base de datos ni CI.
- **Que el modelo funcione sobre PostgreSQL.** Constraints, índices y consultas no se ejecutaron; se validan desde la Fase 2 (entorno) y la Fase 4 (`EXPLAIN` con volumen).
- **Usabilidad ni accesibilidad probadas** con usuarios o lectores de pantalla.
- **Que las personas y las reglas reflejen la operación real** más allá de lo que confirmó el usuario: se contrastan en el piloto de la Fase 9.
- **Revisión independiente.** Todas las revisiones de la fase son autoevaluación del mismo agente.

## 2026-09-12 — Subfase 1.2 cerrada (Validación cruzada del modelo)

**Certifica:**

- **Once decisiones del [brief-1.2](docs/decisions/brief-1.2-validacion-cruzada-del-modelo.md)**, resueltas por el usuario el 2026-09-12 según la recomendación, que cierran las brechas B-1 a B-11 de los wireframes:
  - `inventory_movements.balance_after`, con los tipos de movimiento reducidos a los dos ajustes;
  - `users.must_change_password`, con el cambio obligatorio de contraseña en la pantalla 1;
  - `products.min_stock` quitado;
  - auditoría del cliente en la pantalla 7;
  - disponibilidad de la métrica 12 tomada de la configuración;
  - última interacción y cantidad de mensajes derivadas, con índices propios.
- **[ADR 0010](docs/decisions/0010-un-usuario-una-organizacion-en-el-mvp.md)** aceptado: en el MVP un usuario pertenece a una sola organización.
- **Cinco hallazgos surgidos al armar la matriz**, resueltos por el usuario:
  - se quitaron `deleted_at` de `users`, `clients` y `products`, y `organizations.slug` (H-1, H-2);
  - se corrigieron `SecurityModel.md`, `Scope.md` y `Risks.md` con autorización ampliada (H-4);
  - quedan diferidos con fase límite el tipo de búsqueda (H-3, Fases 4 y 5) y el test de enmascarado para `viewer` (H-5, Fase 5).
- **[TraceabilityMatrix.md](docs/architecture/TraceabilityMatrix.md)** con cuatro vistas:
  - cada FR tiene pantalla, endpoint o invariante con test;
  - cada índice de [DataModel.md](docs/architecture/DataModel.md) tiene una consulta que lo usa;
  - cada filtro sin índice propio está justificado.

  En la revisión se agregaron 5 índices y se quitaron 2.
- **Verificaciones documentales**: los enlaces internos resuelven; no queda ningún `BRECHA` en los wireframes; no quedan menciones vigentes a lo quitado; los archivos tocados están dentro de lo autorizado.

**No certifica:**

- **Que los índices sirvan en la práctica.** Se asignaron por la forma de cada consulta, sin ejecutar ninguna. Se confirman con `EXPLAIN` sobre datos de volumen a partir de la Fase 4.
- **Que las derivaciones (última interacción, cantidad de mensajes) rindan bien.** Se revisan con medición en staging.
- **Nada de implementación.** Todo sigue en nivel *diseñado*: sin migraciones, código ni pruebas.
- **El cierre de la Fase 1**, que es un paso aparte con su propia aprobación.
- **Revisión independiente.** Todo el contraste es autoevaluación.

## 2026-09-12 — Subfase 1.1 cerrada (Wireframes de baja fidelidad)

**Certifica:**

- **Wireframes de las 10 pantallas** de [Screens.md](docs/product/Screens.md) en [docs/product/wireframes/](docs/product/wireframes/README.md), aprobados por el usuario el 2026-09-12. Formato Markdown con layout ASCII y variantes de escritorio y móvil, según W-1 y W-2 del [brief-1.1](docs/decisions/brief-1.1-wireframes-baja-fidelidad.md).
- **Cada dato visible tiene origen anotado**: una columna de [DataModel.md](docs/architecture/DataModel.md), una regla de derivación o una brecha. Cada pantalla separa lo que ven y hacen `admin` y `viewer`, y cubre carga, vacío, sin resultados y error.
- **Once brechas y discrepancias registradas** (B-1 a B-11) como entrada de la 1.2: siete datos que faltan en el modelo y cuatro discrepancias entre documentos. Las cinco detectadas al preparar el brief quedaron confirmadas.
- **Verificaciones documentales**: los enlaces internos resuelven; los archivos tocados están dentro de la lista autorizada; ningún wireframe muestra datos prohibidos (teléfono completo a `viewer`, vista previa de mensajes, hashes, auditoría a `viewer`) ni módulos fuera del MVP. Los nombres de archivo abreviados se aceptaron tal cual.

**No certifica:**

- **Que el modelo soporte las pantallas.** Las brechas están registradas, no resueltas: corregir `DataModel.md` y armar la matriz de trazabilidad es la 1.2.
- **Diseño visual, usabilidad ni accesibilidad probadas.** Los wireframes describen las pautas de accesibilidad; nadie los probó con usuarios ni con lectores de pantalla.
- **Nada de implementación.** Todo sigue en nivel *diseñado*.
- **Revisión independiente.** El contraste contra los criterios es autoevaluación del mismo agente que dibujó.

## 2026-09-12 — Subfase 1.3 cerrada (Decisiones de producto pendientes)

**Certifica:**

- **Las nueve decisiones del [brief-1.3](docs/decisions/brief-1.3-decisiones-de-producto-abiertas.md)**, resueltas por el usuario el 2026-09-11 y cerradas con su aprobación el 2026-09-12. Resumen: teléfono completo para `admin` y enmascarado para `viewer`, en la lista y en el detalle del cliente (la extensión al detalle fue interpretación del agente, confirmada por el usuario al cerrar); sin vista previa de mensajes; pantalla 10 de usuarios y roles dentro del MVP; zona horaria por defecto `America/Argentina/Buenos_Aires`; retención de mensajes diferida a la Fase 9; solo `admin` ajusta stock; personas aceptadas como supuesto declarado hasta el piloto.
- **ADRs [0007](docs/decisions/0007-identificador-de-cliente-solo-telefono.md), [0008](docs/decisions/0008-stock-nunca-negativo.md) y [0009](docs/decisions/0009-repositorio-remoto-github-y-ci.md)** aceptados: el cliente se identifica solo por teléfono, el stock nunca es negativo y el remoto es GitHub privado con Actions.
- **Propagación documental** a [Screens](docs/product/Screens.md), [FunctionalRequirements](docs/product/FunctionalRequirements.md), [DataModel](docs/architecture/DataModel.md) y [Risks](docs/planning/Risks.md), en el commit `cec1fc2`. Al cerrar se sumaron las adendas a [MetricsCatalog](docs/analytics/MetricsCatalog.md) (zona horaria por defecto) y [TestingStrategy](docs/development/TestingStrategy.md) (stock negativo rechazado sin movimiento y métricas cruzando un cambio de horario), y se corrigió el [Roadmap](docs/planning/Roadmap.md) para registrar que la 1.3 se ejecutó antes que la 1.1 y la 1.2.
- **Verificaciones documentales**: ninguna marca "pendiente de confirmación" sobre decisiones ya resueltas; los enlaces internos resuelven; no hay secretos ni archivos temporales.

**No certifica:**

- **Nada de implementación.** Todo sigue en nivel *diseñado*: sin código, pruebas, base de datos ni CI.
- **Que las decisiones reflejen la operación real del negocio.** Las reglas se confirmaron con el usuario, pero las personas siguen siendo un supuesto hasta el piloto de la Fase 9.
- **Wireframes ni matriz de trazabilidad**: siguen siendo la 1.1 y la 1.2.
- **Que el repositorio remoto exista.** El ADR 0009 elige el proveedor, pero decidirlo no es crearlo.
- **Revisión independiente.** La verificación es autoevaluación del mismo agente que redactó las decisiones.

## 2026-09-11 — Fase 0 cerrada (Descubrimiento, alcance y decisiones)

**Certifica:**

- **0.1 — Documentación**, aprobada por el usuario. Producto ([Vision](docs/product/Vision.md), [Scope](docs/product/Scope.md), [Personas](docs/product/Personas.md), [requisitos funcionales](docs/product/FunctionalRequirements.md) y [no funcionales](docs/product/NonFunctionalRequirements.md), [Screens](docs/product/Screens.md) con las 10 pantallas del MVP), arquitectura ([Overview](docs/architecture/Overview.md) con módulos, taxonomía de errores y observabilidad, [DataModel](docs/architecture/DataModel.md) con las 11 tablas y su ERD, [SecurityModel](docs/architecture/SecurityModel.md), [IntegrationBoundaries](docs/architecture/IntegrationBoundaries.md)), [catálogo de las 12 métricas](docs/analytics/MetricsCatalog.md) con fórmula, denominador, zona horaria y casos límite por métrica, y desarrollo ([estándares](docs/development/EngineeringStandards.md), [pruebas](docs/development/TestingStrategy.md), [entornos](docs/development/Environments.md), [protocolo de ejecución](docs/development/ExecutionProtocol.md)). Todo en nivel **diseñado**.
- **ADRs 0001 a 0006**: base de datos propia sin Airtable, monolito modular, migración del legado como proyecto separado, stack propuesto, métricas desde datos transaccionales y el repositorio como registro de decisiones. El [0004](docs/decisions/0004-stack-tecnologico-propuesto.md) queda como **propuesta** hasta re-verificar versiones en la subfase 2.2.
- **0.2 — Setup operativo**: repositorio Git en `main` con tres commits (`a3b45da`, `8b7bfa3`, `cf13247`) *(corregido el 2026-09-12: decía "dos commits")*; proyecto en Notion con 11 fases como subproyectos, 11 tareas espejo y 49 subfases como tareas; hub `80 Projects/AI WhatsApp Agent CRM` en el vault de Obsidian; semilla `docs/planning/Backlog.md` retirada tras verificar la carga.
- **Verificaciones documentales**: todos los enlaces internos resuelven (una referencia colgada detectada y corregida antes de cerrar); las menciones a Airtable son solo prohibiciones o contexto histórico, ninguna es una dependencia; las versiones del stack se verificaron contra fuentes oficiales en septiembre de 2026 y quedaron citadas.

**No certifica:**

- **Nada de implementación.** No hay código, dependencias instaladas, migraciones, base de datos, entorno ni CI. Ninguna afirmación de este repositorio supera el nivel *diseñado*.
- **Las decisiones de producto de la subfase 1.3 siguen abiertas**: teléfono enmascarado, vista previa de mensajes, alta de usuarios por pantalla o por script, identificador adicional de cliente, zona horaria por defecto, excepciones al stock negativo, retención de mensajes, y repositorio remoto y proveedor de CI.
- **Personas y varias reglas de negocio son supuestos** documentados, no confirmados con el dueño del negocio ([Risks](docs/planning/Risks.md)).
- **Wireframes y matriz de trazabilidad no existen**: son la Fase 1. `Screens.md` es especificación funcional, no diseño visual validado.
- **No hay repositorio remoto**: los tres commits viven solo en esta máquina *(corregido el 2026-09-12: decía "los dos commits")*.
- **Ninguna conexión con sistemas externos**: el contrato de ingestión está diseñado, sin emisor real ni tráfico.
