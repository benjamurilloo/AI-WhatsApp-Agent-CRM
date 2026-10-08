# Changelog

Registro de cierres de fase y subfase. Cada entrada dice qué se certifica y qué explícitamente no, sin inferir nunca un nivel de validación superior al alcanzado. El seguimiento de tareas vive en [Notion](https://app.notion.com/p/3d8702be6f4e81659e43c3d8bd9a6e1c); el porqué de cada decisión, en [docs/decisions](docs/decisions/README.md).

## 2026-10-08 — 17.2 cerrada: campos de productos

Segunda subfase de la Fase 17 ([brief-17.2](docs/decisions/brief-17.2-campos-de-productos.md)), en dos etapas. Commit `a7838f1` (17.2.1, CI 37859458500, `success`, leída por `headSha`). Desplegada en producción el 2026-10-08 con la migración `0032` (17.2.2), y recorrida por el usuario el mismo día.

**Certifica**:
- **Siete campos opcionales del producto** (FR-PROD-14): código de barras, peso en kg, largo, ancho y alto en cm (los tres juntos o ninguno), ubicación y estante, con sus `CHECK` en la base y su validación en el servicio. Los carga un `admin` y los ve también un `viewer`. Cada cambio queda en la auditoría y en el historial de la ficha, en castellano.
- **El código de barras es único por organización** sin distinguir mayúsculas, con un índice único parcial; el repetido da `CONFLICT` en su campo, también con SQL directo.
- **Búsqueda por código de barras exacto en la lista** (FR-PROD-15), combinada con los filtros; la ubicación sugiere las ya cargadas.
- **El agente no cambia**: `read-v1` no expone los campos y su búsqueda no encuentra por código de barras; un test lo exige.
- **Revisión independiente** de la 17.2.1: 7 hallazgos, resueltos o registrados antes del commit. Mutaciones M1 a M4, cada una en rojo.
- **En producción**: `crm.vixoraai.app` corre `a7838f1`. Las 20 tablas, iguales antes y después; 33 migraciones; las columnas nuevas, nulas. Versión anterior: `726a88d`.

**No certifica**:
- Que el agente lea los campos nuevos o busque por código de barras.
- El dígito verificador del código de barras, ni la ubicación por depósito.
- «Visible en catálogo» y las marcas y categorías administradas: siguen como candidatas.
- Las ubicaciones más allá de las 200 primeras en las sugerencias.

**Nivel**: validado localmente y en CI, validado en integración para las pantallas y desplegado en producción con el recorrido del usuario (`isolated-runtime`). No es «preparado para producción».

## 2026-10-08 — 17.1 cerrada: campos de clientes

Primera subfase de la Fase 17 ([brief-17.1](docs/decisions/brief-17.1-campos-de-clientes.md)), en dos etapas. Commit `726a88d` (17.1.1, CI 37848046092, `success`, leída por `headSha`). Desplegada en producción el 2026-10-08 con la migración `0031` (17.1.2), y recorrida por el usuario el mismo día.

**Certifica**:
- **Nueve campos opcionales del cliente**: email, tipo (persona o empresa), empresa, cargo, calle, ciudad, provincia (los 24 códigos ISO de Argentina), código postal y segmento, con sus `CHECK` en la base y su validación en el servicio (FR-CLI-12). Cada cambio queda en la auditoría y en el historial de la ficha.
- **El email, la calle y el código postal no llegan a un `viewer`** (FR-CLI-13), como el teléfono: la ficha dice «Solo visible para administradores».
- **Filtros de la lista** por tipo, provincia y segmento, combinados entre sí y con los existentes (FR-CLI-14); las opciones son solo de la organización.
- **Los datos de un cliente** (13.4): la exportación los incluye y el vaciado los deja en nulo; un test exige que toda columna nulable de `clients` quede vacía.
- **Revisión independiente** de la 17.1.1: 10 hallazgos, resueltos o registrados antes del commit. Mutaciones M1 a M4, cada una en rojo.
- **En producción**: `crm.vixoraai.app` corre `726a88d`. Las 20 tablas, iguales antes y después; 32 migraciones; las columnas nuevas, nulas. Versión anterior: `40253d6`.

**No certifica**:
- Que el agente lea o escriba estos campos: ningún contrato cambia.
- El documento y el CUIT/CUIL, que van a la Fase 20.
- Los segmentos más allá de los 200 primeros en las opciones del filtro.
- La medición de la lista con filtros en la máquina de producción: la de 66,8 ms con 10 000 clientes es local.

**Nivel**: validado localmente y en CI, validado en integración para las pantallas y desplegado en producción con el recorrido del usuario (`isolated-runtime`). No es «preparado para producción».

## 2026-10-08 — Fase 16 cerrada (Herramientas de operación)

Cierra por decisión del usuario, que es el gate de salida de la fase ([Roadmap](docs/planning/Roadmap.md), §Fase 16). El usuario aprobó el cierre el 2026-10-08, junto con el de la 16.6 (brief-16.6, D-8).

**Certifica:**
- **Las seis subfases cerradas**, cada una con su entrada abajo:
  - 16.1, etiquetas de clientes, manuales;
  - 16.2, etiquetas puestas por el agente;
  - 16.3, pausar y reanudar al agente;
  - 16.4, notas de la conversación;
  - 16.5, el ADR 0017, responder desde el CRM, aceptado con la implementación pospuesta;
  - 16.6, la cantidad de stock para el agente.

  Todas las que cambiaron código o un contrato llevaron revisión independiente antes del commit. Las etapas de despliegue, las ventanas con el agente y los cierres son autoevaluación declarada.
- **Con el agente**: tres rutas nuevas de la lectura v1 (`client-tags`, `conversation-state` y `products/{product_id}/stock`) y dos tipos de evento nuevos de la ingestión v2 (`client.tag_added` y `client.tag_removed`), todos cambios compatibles. La 16.2, la 16.3 y la 16.6 están **validadas en integración** en producción, en la organización de demostración.
- **Producción** corre `40253d6`, con 31 migraciones. Las versiones anteriores de la fase, de la más nueva a la más vieja, están en el registro de despliegues del servidor: `975034f`, `259d23f`, `9549364` y `b5544d6`; antes de la fase, `0cbe314`.

**Nivel**: el de cada subfase. No certifica «preparado para producción»: ese gate es de la Fase 13, y la 13.5.2-b sigue pendiente.

**No certifica:**
- La bandeja de salida del ADR 0017 ni el registro de lo que se contesta desde la app de WhatsApp: pospuestos por decisión del usuario.
- Lo que los bocetos dibujan y no existe: acciones rápidas, buscador global y notificaciones.
- Ninguna conversación con un cliente real: las ventanas usaron el teléfono del usuario en la organización de demostración.

En Notion, la tarea pendiente del CI (la instalación de Chromium de Playwright y el límite de 15 minutos) pasó al proyecto raíz, en «Esperando», antes de cerrar la fase.

## 2026-10-08 — 16.6 cerrada: la cantidad de stock para el agente

Sexta subfase de la Fase 16 ([brief-16.6](docs/decisions/brief-16.6-la-cantidad-de-stock-para-el-agente.md)), en tres etapas. Commit `40253d6` (16.6.1, CI 37804285565, `success`, leída por `headSha`). Desplegada en producción el 2026-10-08 sin migraciones (16.6.2), y validada con el agente el mismo día (16.6.3).

**Certifica**:
- **La ruta nueva** `GET /api/read/v1/products/{product_id}/stock`, con alcance `read`: la cantidad disponible de un producto activo como decimal en texto, en forma canónica, sin tope y nunca `null`, con su unidad y el estado derivado de esa misma cantidad. Un producto inactivo, ajeno o inexistente da el mismo `404`. Es un cambio compatible dentro de v1: las rutas de productos siguen sin la cantidad.
- **Revisión independiente** (D-7): R-1 a R-8, verificados antes del commit; R-1 resuelto con la precisión de D-3 aprobada por el usuario.
- **Mutaciones**: sin el filtro por organización, sin el filtro de activos y con la cantidad como número de JSON, cada una en rojo.
- **En producción**: `crm.vixoraai.app` corre `40253d6`. Las 20 tablas y las 31 migraciones, iguales antes y después; la ruta responde `401` sin token. Versión anterior: `975034f`.
- **Con el agente** (AC-10): una lectura de prueba, cuyo cuerpo crudo está transcrito en el brief y validado como el fixture `captured-product-stock.json`, y una ventana de cinco pasos en la organización de demostración. Las tres lecturas de la ruta coinciden con el log del CRM, y en los dos pasos sin lectura no hubo ninguna.
- **La política del agente con el número** (D-1) queda en `read-v1.md`, como la del consumidor.

**No certifica**:
- El `"0"` de un producto sin movimientos ni una cantidad decimal, leídos por el agente: validados solo localmente.
- Una lectura fallida del agente, que no se provocó.
- **La correlación del agente lleva el `wamid`**, que codifica el teléfono: 25 líneas del journal desde el 2026-10-03, ninguna fila de la base. Se corrige en el origen, por decisión del usuario; queda en Risks.
- La causa de las caídas de proceso de la batería local, que se repitieron en esta máquina; la corrida limpia es la de la CI.

**Nivel**: validado localmente y en CI, verificado en producción (`isolated-runtime`) y **validado en integración** (`producer-consumer`) con el agente. No es «preparado para producción».

## 2026-10-08 — 16.5 cerrada: ADR 0017, responder desde el CRM

Quinta subfase de la Fase 16 ([brief-16.5](docs/decisions/brief-16.5-adr-responder-desde-el-crm.md)), solo de diseño. Brief y ADR propuesto en `a5767a7` (CI 37791971029, `success`, leída por `headSha`). Sin despliegue.

**Certifica**:
- **El [ADR 0017](docs/decisions/0017-responder-desde-el-crm.md), aceptado** por el usuario el 2026-10-08 con la implementación pospuesta. Escribir desde el CRM es una bandeja de salida: el CRM guarda la respuesta pendiente, el agente la lista por la lectura, sin efectos, y la toma, confirma o rechaza por la ingestión v2, con tipos de evento nuevos. A lo sumo una vez. El registro de lo que se contesta desde la app lo haría el agente, con el número en coexistencia.
- **Respeta los puntos 1 y 5 del ADR 0014**, que suma una nota fechada, y Scope §Sigue fuera: el CRM no llama al agente ni envía mensajes.
- **Revisión independiente** del ADR propuesto: R-1 a R-10 verificados; R-1 y R-3 decididos por el usuario.
- **La respuesta del agente**: puede consultar la bandeja cada minuto y tomar, confirmar y rechazar por la ingestión. Su número de prueba no puede estar en coexistencia.

**No certifica**:
- Nada implementado: ni la bandeja ni el registro desde la app.
- Que la coexistencia funcione con un número real, ni que Argentina esté habilitada: es documentación de Meta y de terceros, sin probar.
- Las formas de los errores de Meta que el agente distinguiría, salvo `131030`.

**Nivel**: diseñado.

## 2026-10-08 — 16.4 cerrada: notas de la conversación

Cuarta subfase de la Fase 16 ([brief-16.4](docs/decisions/brief-16.4-notas-de-la-conversacion.md)), en dos etapas. Commit `975034f` (16.4.1, CI 37783217435, `success`, leída por `headSha`). Desplegada en producción el 2026-10-08 con las migraciones `0029` y `0030` (16.4.2), y recorrida por el usuario el mismo día.

**Certifica**:
- **Las notas internas**: `conversation_notes`, de solo inserción, escritas solo por un `admin` desde la pantalla 9, en cualquier estado de la conversación, y leídas por los dos roles de a 25. Cada nota deja un `note_added` con el id de la nota y sin el texto; si la auditoría falla, la nota no queda.
- **El vaciado de un cliente** deja sin texto las notas de sus conversaciones, en la misma transacción que sus mensajes, incluida una nota que se confirma mientras corre. El informe las cuenta y la exportación las trae. La enmienda del ADR 0015 suma la tabla.
- **Revisión independiente** (D-9): R-1 a R-9, verificados antes del commit; R-1, R-2, R-4 y R-7 corregidos. Las correcciones son autoevaluación.
- **En producción**: `crm.vixoraai.app` corre `975034f`, con 31 migraciones. Las 19 tablas que había tienen los mismos recuentos antes y después, y `conversation_notes` aparece con 0. El trigger está habilitado y `crm_app` tiene solo `INSERT` y `SELECT` sobre la tabla. Versión anterior: `259d23f`.
- **El recorrido del usuario**: agregó una nota como admin y la vio. La base tiene 1 nota y 1 `note_added`, y ninguna entrada de auditoría contiene el texto.

**No certifica**:
- Que el texto no llegue al log estructurado por una prueba: se verificó leyendo el código.
- El vaciado de una nota escrita después del vaciado: conserva su texto hasta repetirlo, como un mensaje que llega después. Está declarado en el runbook.
- La causa de dos caídas de proceso en la batería local, un worker de Vitest y el servidor de `next start`, que no se repitieron.

**Nivel**: validado localmente y en CI, verificado en producción (`isolated-runtime`) y recorrido por el usuario con su sesión (`authenticated-end-to-end`) sobre una nota. No es «preparado para producción».

## 2026-10-07 — 16.3 cerrada: pausar y reanudar al agente

Tercera subfase de la Fase 16 ([brief-16.3](docs/decisions/brief-16.3-pausar-y-reanudar-al-agente.md)), en tres etapas. Commit `259d23f` (16.3.1, CI 37679269082, `success`, leída por `headSha`). Desplegada en producción el 2026-10-07 con la migración `0028` (16.3.2) y validada con el agente el mismo día (16.3.3).

**Certifica**:
- **La marca por conversación**: `conversations.agent_paused_at`, puesta y quitada solo por un `admin` desde la pantalla 9, en una transacción con su auditoría `agent_pause_change`. No se pausa una cerrada; reanudar se puede en cualquier estado. La derivación no la toca, y un mensaje del agente en una pausada se registra igual (D-7). Las pantallas 7, 8 y 9 la muestran.
- **`GET /api/read/v1/conversation-state`**: `agent_paused` y `agent_paused_at`, con alcance `context`. Es una ruta nueva y ninguna respuesta existente cambia.
- **Revisión independiente** (D-10): R-1 a R-4, verificados antes del commit; R-1 corregido.
- **En producción**: `crm.vixoraai.app` corre `259d23f`, con 29 migraciones. Las tablas tienen los mismos recuentos antes y después, y la ruta nueva responde `401` sin token. Versión anterior: `9549364`.
- **Con el agente** (16.3.3), en la organización de demostración: un turno activo, la pausa, un turno pausado sin ninguna salida del agente, la reanudación y otro turno activo, conciliados contra el log, `messages`, `ingestion_events` y `audit_logs`. La conciliación del agente coincide y confirma el `agent_paused` leído en cada turno.

**No certifica**:
- Que la pausa sea estricta: si la lectura falla, el agente contesta igual, y su mensaje de emergencia sale antes de la lectura. Lo decidió el agente y queda en `read-v1.md`.
- Una lectura fallida con la conversación pausada: no se provocó.
- Una persona contestando desde la app de WhatsApp durante la pausa: esas respuestas no llegan al CRM (16.5).

**Nivel**: validado localmente y en CI, verificado en producción (`isolated-runtime`) y **validado en integración** (`producer-consumer`) con el agente como consumidor real. No es «preparado para producción».

## 2026-10-07 — 16.2 cerrada: etiquetas puestas por el agente

Segunda subfase de la Fase 16 ([brief-16.2](docs/decisions/brief-16.2-etiquetas-puestas-por-el-agente.md)), en tres etapas. Commit `9549364` (16.2.1, CI 37634311710, `success`, leída por `headSha`). Desplegada en producción el 2026-10-07 sin migraciones (16.2.2) y validada con el agente el mismo día (16.2.3).

**Certifica**:
- **Dos tipos nuevos, solo en la ingestión v2**: `client.tag_added` y `client.tag_removed` ponen y quitan una etiqueta del catálogo en un cliente, identificado por teléfono, con la etiqueta por su id. Siguen las mismas reglas que la ficha, en una sola función de `crm`, y quedan auditados con la credencial como autor. Responden siempre `200`; las reglas `client_not_found`, `tag_not_found` y `client_tag_limit` dan `422` terminal. v1 los rechaza, y no cuentan en la métrica 12.
- **`GET /api/read/v1/client-tags`**: el catálogo de etiquetas activas, con `tag_id` y `name`, con alcance `read`. Es una ruta nueva y ninguna respuesta existente cambia.
- **Revisión independiente** (D-11): 12 hallazgos y 4 dudas, verificados antes del commit.
- **En producción**: `crm.vixoraai.app` corre `9549364`, con 28 migraciones. Las tablas tienen los mismos recuentos antes y después, y la ruta nueva responde `401` sin token. Versión anterior: `b5544d6`.
- **Con el agente** (16.2.3), en la organización de demostración: 8 eventos conciliados contra `ingestion_events`, las asignaciones y la auditoría. Incluyen poner, quitar, `accepted` sin escritura y un `422 tag_not_found` con la etiqueta desactivada. La ficha muestra las etiquetas y su historial con el autor «Servicio · agente-demo».
- **De paso**: el paso 6 de «Verificar después de desplegar» de `deploy/production/README.md` pasa a esperar `401` con la ingestión encendida.

**No certifica**:
- Que el agente ponga «Reclamo»: lo deriva a una persona, y eso es «Derivado». Lo resuelve el agente.
- Que el agente quite etiquetas en un turno: los `client.tag_removed` los mandó un llamador de prueba suyo.
- `client_not_found` y `client_tag_limit` con el emisor real: solo están validados localmente.
- La cantidad de stock que pidió el agente: es la 16.6.

**Nivel**: validado localmente y en CI, verificado en producción (`isolated-runtime`) y **validado en integración** (`producer-consumer`) con el agente como emisor real. No es «preparado para producción».

## 2026-10-07 — 16.1 cerrada: etiquetas de clientes, manuales

Primera subfase de la Fase 16 ([brief-16.1](docs/decisions/brief-16.1-etiquetas-de-clientes.md)), en dos etapas. Commit `b5544d6` (16.1.1, CI 37553649605, `success`, leída por `headSha`). Desplegada en producción el 2026-10-07 (16.1.2), con las migraciones `0026` y `0027`.

**Certifica**:
- **El catálogo de etiquetas por organización** (pantalla 13, `/clientes/etiquetas`): crear, renombrar, cambiar el color entre seis fijos, desactivar con confirmación y reactivar, con el nombre único sin distinguir mayúsculas y hasta 50 activas. Con el catálogo vacío, «Crear las sugeridas» crea «Interesado», «Quiere señar», «Reclamo» y «No interesado». Ninguna se borra ni dispara nada: «Quiere señar» no es un pago.
- **Las etiquetas en la ficha y en la lista**: un admin las pone y las quita (hasta 10 por cliente), cada cambio queda en el historial del cliente (`tag_change`); cualquier usuario las ve y filtra la lista por una etiqueta activa. Una desactivada queda en el cliente, marcada, y no se ofrece.
- **La base**: dos tablas con claves compuestas por organización; `crm_app` sin `DELETE` en el catálogo ni `UPDATE` en las asignaciones; asignar espera a una desactivación en curso.
- **Los datos de un cliente**: la exportación incluye sus etiquetas, y el vaciado y el borrado las quitan ([runbook](docs/runbooks/datos-de-un-cliente.md)).
- **De paso**: el historial de auditoría que se desplaza en un teléfono ahora se recorre con el teclado, en las fichas de clientes, productos e información.
- **Revisión independiente** (D-12): 8 hallazgos (1 medio, 7 bajos), todos verificados y resueltos antes del commit.
- **En producción**: `crm.vixoraai.app` corre `b5544d6`, con 28 migraciones; las 17 tablas existentes con los mismos recuentos antes y después, y las dos nuevas vacías. El usuario recorrió el catálogo, la ficha y el filtro y aprobó el cierre. Versión anterior: `0cbe314`.

**No certifica**:
- Que el agente lea o ponga etiquetas: es la 16.2.
- Otros navegadores que Chromium.
- Las tareas de Notion: la sesión del cierre no tuvo el conector; la 16.1 queda por pasar a «Completado».

**Nivel**: validado localmente y en CI, validado en integración (`producer-consumer`) y verificado en producción por el usuario (`isolated-runtime`). No es «preparado para producción».

## 2026-10-06 — Fase 15 cerrada (Identidad visual y presentación)

Cierra por decisión del usuario, que es el gate de salida de la fase ([Roadmap](docs/planning/Roadmap.md), §Fase 15). El usuario confirmó el cierre el 2026-10-06, después de mirar la 15.5 en producción.

**Certifica:**
- **Las cinco subfases cerradas y desplegadas en producción**, cada una con su entrada abajo:
  - 15.1, identidad visual, marco y pantallas principales;
  - 15.4, pantallas de detalle y formularios;
  - 15.2, controles de los listados;
  - 15.3, dashboard interactivo;
  - 15.5, logo de la marca.

  La 15.2 y la 15.3 llevaron revisión independiente; la 15.1, la 15.4 y la 15.5, autoevaluación declarada, como permite el gate de la fase.
- **El alcance de la fase**: solo presentación. Sin tablas nuevas ni contratos nuevos con el agente; las únicas definiciones nuevas son las métricas 13 y 14, de solo lectura, en el catálogo antes de dibujarse.
- **Producción** corre `0cbe314`. Las versiones anteriores, de la más nueva a la más vieja, están en el registro de despliegues del servidor: `e7d7b5c`, `dd7eed7`, `2aaa619`, `a7aa97d`, `b00b333` y `29d6ccc`.

**Nivel**: el de cada subfase: validado en integración y verificado en producción por el usuario. No certifica «preparado para producción»: ese gate es de la Fase 13.

**No certifica:**
- Otros navegadores que Chromium.
- Que el dashboard muestre valores sin JavaScript (desde la 7.4).
- Lo que los bocetos dibujan y no existe: acciones rápidas, buscador global y notificaciones (Fase 16), y los campos ampliados de clientes y productos (Fase 17).

## 2026-10-06 — 15.5 cerrada: logo de la marca

Quinta subfase de la Fase 15 ([brief-15.5](docs/decisions/brief-15.5-logo-de-la-marca.md)), agregada a pedido del usuario. Commit `0cbe314` (CI 37537140696, `success`, leída por `headSha`). Desplegada en producción el 2026-10-06.

**Certifica**:
- **El ícono de la pestaña** con el símbolo de Vixora sin fondo: `favicon.ico` (16, 32 y 48 px), `icon.png` (192 px) y `apple-icon.png` (con el fondo de la marca, porque iOS no admite transparencia).
- **La marca del panel** y de la barra del celular: el símbolo como imagen decorativa (`alt=""`) y «Vixora» como texto en el color del tema, porque el nombre del logo es blanco; el lema «AI SOLUTIONS», solo en el panel de escritorio. Un `<img>` común: `next/image` escribe un atributo `style` que la CSP prohíbe.
- **El recorte del fondo**, con `sharp` de `node_modules` como herramienta local, sin dependencias nuevas: sin manchas, sin letras perdidas (20 piezas en el logo con el nombre) y revisado sobre claro y oscuro. Las versiones sin fondo quedaron en el vault, en `80 Projects/Marca Vixora/`, como los originales de la marca (decisión del usuario).
- **Local**: 119 de 119 end-to-end sobre `next start`, con el caso nuevo de la marca, axe en claro y en oscuro y la guarda de CSP.
- **En producción**: `crm.vixoraai.app` corre `0cbe314`, sin migraciones ni cambios en `app.env`; los cuatro archivos de imagen responden 200 con su tipo y el login trae los `<link rel="icon">`. El usuario miró el ícono y la marca y los dio por correctos. Versión anterior: `e7d7b5c`.

**No certifica**:
- El ícono en iOS y en Android: no se probó en un dispositivo.
- Otros navegadores que Chromium.

**Nivel**: validado en integración (`producer-consumer`) y verificado en producción por el usuario (`isolated-runtime`). Autoevaluación declarada.

## 2026-10-06 — 15.3 cerrada: dashboard interactivo

Cuarta subfase cerrada de la Fase 15 ([brief-15.3](docs/decisions/brief-15.3-dashboard-interactivo.md)), en cuatro etapas. Commits: `5cd632d` (brief, CI 37515543231), `7190108` (15.3.1, CI 37517549365), `7461da3` (15.3.2, CI 37520512994), `aeb3f2a` (15.3.3, CI 37530121615) y `e7d7b5c` (correcciones de la revisión independiente, CI 37533591795), todas `success`, leídas por `headSha`. Desplegada en producción el 2026-10-06 (15.3.4).

**Certifica**:
- **Período anterior**: el intervalo de la misma cantidad de días que termina el día antes del elegido, con la misma fórmula de cada métrica ([MetricsCatalog](docs/analytics/MetricsCatalog.md), §Convenciones).
- **Variación** en cada tarjeta salvo la 11: en porcentaje las cantidades, en puntos porcentuales las tasas y como diferencia absoluta el promedio y la mediana, sin verde ni rojo. No compara si el período incluye hoy, y nombra cada caso sin comparación: «sin datos», «no disponible» y «el período anterior fue 0» (este último, decidido por el usuario a partir de la revisión).
- **«Ver detalles»** en cada tarjeta, con la definición y el valor del período anterior.
- **Métricas nuevas 13 (tipos de mensajes entrantes) y 14 (distribución del tiempo a primera respuesta, en los rangos del boceto)**, en el catálogo antes de dibujarse, con tests de integración de bordes, zona horaria e invariantes contra las métricas 4 y 9.
- **Gráficos en SVG propio, sin librería**: la dona de la 13, el histograma de la 14 y el gráfico diario, legibles con el puntero y con el teclado, con una línea `aria-live` y su alternativa con los valores exactos. Siete tokens de color nuevos, con contraste de 3:1 o más.
- **Hallazgo de CSP, medido**: React, al mandar la página por partes, inserta un `<svg style="display:none">` cuando corta dentro de un SVG, y la CSP lo bloquea. Ningún gráfico se arma con elementos del servidor dentro del `<svg>`: 0 atributos `style` en 40 cargas.
- **Revisión independiente** de solo lectura (D-9): 9 hallazgos (1 alto, 2 medios, 6 bajos), verificados contra el código; los que pedían cambio, corregidos en `e7d7b5c`, y dos resueltos por el usuario (la tabla del histograma en un desplegable cuenta como a la vista; el texto del anterior en 0).
- **Local**: 1.732 de 1.732 unitarios y de integración; end-to-end 118 de 118 con la 15.3.3 y, después de las correcciones, 21 de 21 del dashboard, sin ingestión y CSP, sobre un build nuevo; axe sin violaciones en claro y en oscuro.
- **En producción**: `crm.vixoraai.app` corre `e7d7b5c`, sin migraciones ni cambios en `app.env`; el servicio activo, sin errores en el registro, `/login` 200 y la CSP con `style-src-attr 'none'`. El usuario miró el dashboard y lo dio por correcto. Versión anterior: `dd7eed7`.

**No certifica**:
- Que el dashboard muestre valores sin JavaScript: no lo hace desde la 7.4 (streaming de las tarjetas); se registró y el invariante se enmendó por decisión del usuario.
- Pantallas táctiles: la lectura dura mientras se toca.
- Otros navegadores que Chromium.
- Mediciones con volumen en producción: las métricas 13 y 14 se midieron en una base local con volumen (11,9 ms la 14, con la subconsulta materializada).
- Que el cambio de serie con el teclado dejara la lectura vieja antes de la corrección: el hallazgo vino de leer el código y no se reprodujo contra la versión anterior; el caso 14 cubre el camino corregido.

**Nivel**: validado en integración (`producer-consumer`) y verificado en producción por el usuario (`isolated-runtime`).

## 2026-10-06 — 15.2 cerrada: controles de los listados

Tercera subfase cerrada de la Fase 15 ([brief-15.2](docs/decisions/brief-15.2-controles-de-los-listados.md)), en cinco etapas. Commits: `ebccca0` (brief), `ff139ae` (15.2.1), `d7d5a6d` (15.2.2), `62399ab` (`source-map-js` 1.2.2), `83aa2e5` (15.2.3), `0b902e8` (15.2.4), `defbe57` (`sharp` 0.35.5) y `dd7eed7` (correcciones de la revisión independiente; CI 37502534330, `success`). Las CI de `d7d5a6d` y `0b902e8` fallaron solo en la auditoría de dependencias, por avisos nuevos sobre paquetes transitivos que corrigió el commit siguiente. Desplegada en producción el 2026-10-06 (15.2.5).

**Certifica**:
- **Orden y filas por página** en Productos (nombre en los dos sentidos, SKU, stock y precio, agrupado por moneda y con los productos sin precio al final), Clientes (última interacción o nombre) y Conversaciones (último mensaje en los dos sentidos o inicio), con 10, 25 o 50 filas. Los dos viven en la URL y se conservan al filtrar y al paginar.
- **Filtros por categoría y marca** en Productos, con los valores que existen en la organización.
- **El componente propio de sugerencias** (patrón combobox de ARIA 1.2), en lugar del `datalist`: en Marca y Categoría del producto y en la categoría de Información, con los valores existentes. Sin JavaScript sigue siendo un campo de texto.
- **El autocompletar de los buscadores** de Productos y Clientes, desde 2 caracteres, con la misma regla del buscador. Elegir una sugerencia abre el detalle. Clientes nunca devuelve teléfonos, y las dos Server Actions rechazan un pedido sin sesión.
- **Revisión independiente** de solo lectura, sin bloqueantes. Sus cinco hallazgos menores, verificados y resueltos:
  - la opción marcada vieja en el componente;
  - el precio con monedas mezcladas;
  - `DataModel.md` y `TraceabilityMatrix.md` sobre el orden por inicio dentro de un estado, medido en local (6,9 y 7,5 ms);
  - la cobertura de AC-3;
  - `.claude/settings.json`, que nunca entró en un commit.
- **Local**:
  - 113 de 113 end-to-end sobre `next start`, con axe sin violaciones;
  - 529 de 529 unitarios y 485 de 485 guardas;
  - 685 de 685 de integración, en dos corridas seguidas, después de una falla intermitente sin causa conocida (ver «No certifica»).
- **Medición** en una base local con volumen, borrada después. En la organización grande, el camino más lento es Productos ordenado por precio, con 226 ms de mediana; sin orden, la misma corrida da 162 ms. Los demás tardan menos de 50 ms. Todos quedan debajo del umbral local de 400 ms. Tres planes cambiaron de forma; el usuario los aceptó el 2026-10-05, sin índices nuevos.
- **En producción**:
  - `crm.vixoraai.app` corre `dd7eed7`, sin migraciones ni cambios en `app.env`;
  - `/login` responde 200, y la ingestión y la lectura, sin token, 401;
  - el usuario miró las pantallas y las dio por correctas.

  Versión anterior: `2aaa619`.

**No certifica**:
- Otros navegadores que Chromium.
- El orden por precio con varias monedas reales: el piloto solo tiene ARS, y lo cubre un test unitario.
- La causa de la falla de integración que apareció una vez y no se repitió («D-6: las sugerencias usan la regla del buscador»).
- La lista de credenciales permitidas de `agente-demo`, probada con tokens después del despliegue: la configuración no cambió.
- Mediciones con volumen en producción.
- El dashboard interactivo (15.3).

**Nivel**: validado en integración (`producer-consumer`) y verificado en producción por el usuario (`isolated-runtime`).

## 2026-10-05 — 15.4 cerrada: pantallas de detalle y formularios

Segunda subfase cerrada de la Fase 15, adelantada a la 15.2 por decisión del usuario ([brief-15.4](docs/decisions/brief-15.4-detalles-y-formularios.md), [Roadmap](docs/planning/Roadmap.md), §Fase 15). El mismo día se aceptó el [ADR 0016](docs/decisions/0016-el-crm-se-amplia-hacia-un-erp-por-fases.md): el ERP (pedidos, ventas, caja y cobros, compras y proveedores) va en las Fases 18 a 22, y la prohibición de `CLAUDE.md` pasa a «fuera de la fase abierta que los incluye». Commits: `81a07ec` (ADR 0016, Roadmap y brief), `a7aa97d` (las etapas 15.4.1 a 15.4.4; CI 37371792455, `success`) y `2aaa619` (ajuste; CI 37374970769, `success`). Desplegada en producción el mismo día (15.4.5).

**Certifica**:
- **Los detalles y formularios de los cinco módulos**, con lo que ya existía: Productos (detalle con las tarjetas de información, precio y stock, alta, edición, historial de precios y movimientos, con una barra de páginas propia), Clientes (detalle con estadísticas de conversaciones y días desde la última interacción, alta y edición), Conversaciones (mensajes como burbujas y los datos al costado), Información (detalle con el ícono de su categoría, alta y edición) y Usuarios (edición y alta, con el aviso que describe lo que pasa de verdad: una contraseña de un solo uso, sin email).
- **Los componentes compartidos**: encabezado de detalle, tarjeta de sección, lista de definición con íconos, barra de páginas, tarjeta de estadística y tarjeta de auditoría con su paginación.
- **Las listas de sugerencias** de Marca y Categoría sin el historial del navegador (`autoComplete="off"`), pedido por el usuario después del primer despliegue.
- **Sin cambios de comportamiento**: `src/modules/`, `package.json` y `package-lock.json` sin diferencias; ninguna clase de la paleta por defecto de Tailwind en `src/app/`.
- **Local**: 102 de 102 end-to-end con axe sin violaciones en los dos modos (8 aserciones existentes cambiadas por nombres de región y un texto de paginación); 510 de 510 unitarios y 485 de 485 guardas; 674 de 674 de integración.
- **En producción**: `crm.vixoraai.app` corre `2aaa619`, sin migraciones ni cambios en `app.env`; `/login` en 200; la ingestión y la lectura, sin token, en 401. El usuario miró las pantallas y las dio por correctas. Versiones anteriores: `a7aa97d` y `b00b333`.

**No certifica**: la estética más allá del juicio del usuario; otros navegadores que Chromium; el contraste de cada pantalla más allá de lo que mide axe; que la lista de sugerencias ya no muestre el historial, que Playwright no ve y comprobó el usuario a ojo; la allowlist de `agente-demo` probada con tokens después del despliegue (la configuración no cambió); el componente propio de sugerencias, el orden, los filtros y el autocompletar (15.2); el dashboard interactivo (15.3). Revisión: autoevaluación declarada (D-11); la subfase no abre ni cierra un gate.

**Nivel**: validado en integración (`producer-consumer`) y verificado en producción por el usuario (`isolated-runtime`).

## 2026-10-05 — 15.1 cerrada: identidad visual, marco y pantallas principales

Primera subfase de la Fase 15, «Identidad visual y presentación», abierta el mismo día en paralelo con la 13.5.2-b ([brief-15.1](docs/decisions/brief-15.1-identidad-visual-y-marco.md), [Roadmap](docs/planning/Roadmap.md), §Fase 15). Commits: `bb21073` (Roadmap y brief) y `b00b333` (las etapas 15.1.1 y 15.1.2; CI 37347328043, `success`). Desplegada en producción el mismo día (15.1.3).

**Certifica**:
- **La paleta violeta** en claro y en oscuro, con los tokens nuevos `sidebar`, `action`, `action-hover` y `on-action`: `primary` queda para texto y enlaces, y `action` para el relleno de botones, que es lo que permite el violeta saturado de los bocetos con AA en oscuro. Contraste AA calculado en los 25 pares de cada modo.
- **El marco**: panel lateral con la marca Vixora y la navegación con íconos, plegable en pantallas angostas (Escape lo cierra y devuelve el foco), y barra superior con la organización, el tema en tres íconos y el usuario. Los nombres accesibles del marco anterior se conservan.
- **Las seis pantallas de los bocetos** con lo que ya existía: el dashboard con tarjetas e íconos y el gráfico diario rediseñado; los cinco listados con avatar, acción de editar para `admin` y la paginación «Mostrando X a Y de Z». Íconos copiados de Lucide (ISC), sin dependencia nueva.
- **Sin cambios de comportamiento**: `src/modules/`, `package.json` y `package-lock.json` sin diferencias; ninguna clase de la paleta por defecto de Tailwind en `src/app/`.
- **Local**: 102 de 102 end-to-end con axe sin violaciones en los dos modos (2 casos nuevos del marco; 6 aserciones existentes cambiadas por textos y colores que la subfase cambia a propósito); 992 de 992 unitarios y guardas; 674 de 674 de integración.
- **En producción**: `crm.vixoraai.app` corre `b00b333`, sin migraciones ni cambios en `app.env`; `/login` en 200; la ingestión y la lectura siguen encendidas solo para `agente-demo`. El usuario miró la demostración en los dos modos y la dio por correcta. Versión anterior: `29d6ccc`.

**No certifica**: la estética más allá del juicio del usuario; otros navegadores que Chromium; el contraste de cada pantalla más allá de lo que mide axe; la allowlist de `agente-demo` probada con tokens después del despliegue (la configuración no cambió); las pantallas de detalle y los formularios (15.4 en adelante); el orden y las filas por página (15.2); el dashboard interactivo (15.3). Revisión: autoevaluación declarada (D-12); la subfase no abre ni cierra un gate.

**Nivel**: validado en integración (`producer-consumer`) y verificado en producción por el usuario (`isolated-runtime`).

## 2026-10-01 — 13.4 cerrada: retención y borrado de datos reales

Cuarta subfase de la Fase 13 ([brief-13.4](docs/decisions/brief-13.4-retencion-y-borrado.md), [evidencia-13.4](docs/decisions/evidencia-13.4-retencion-y-borrado.md), [ADR 0015](docs/decisions/0015-vaciado-de-una-sola-direccion-en-tablas-de-solo-insercion.md), [runbook de datos de un cliente](docs/runbooks/datos-de-un-cliente.md)). En dos etapas: la 13.4.1 (`9f3dc2b`), local; la 13.4.2 (`75577b1`), en el droplet de producción. Las correcciones de la revisión independiente van en `9354c42`.

**Certifica**:
- **La retención de `messages` (R-3)**: mientras haga falta, con borrado a pedido, sin horizonte por edad (D-1, decisión del usuario).
- **El borrado real (O-11)**: borrar es vaciar el contenido y conservar la forma. El ADR 0015 enmienda el 0013: los triggers de `messages` y `audit_logs` dejan pasar un único `UPDATE`, el vaciado, comparando la fila entera; `crm_app` sigue sin `UPDATE`. Probado por efecto, con 14 mutaciones en rojo.
- El script `client-data-delete.ts --vaciar`: después del vaciado, ninguna columna de texto de ninguna tabla tiene el nombre, el teléfono, las notas, los mensajes ni las referencias de la persona, y las métricas del período dan lo mismo. Espera a la ingestión que escribe en ese momento y la alcanza.
- La migración `0025` en producción, con los recuentos iguales y `/login` en `200`; el vaciado recorrido en una base aparte del droplet, que se borró.
- El journal de producción a 30 días, instalado y verificado, con su guarda; el vencimiento global de `login_attempts`.
- **Revisión independiente** (D-9): 1 crítico condicional, 2 mayores y 11 menores, los 14 confirmados y resueltos.

**No certifica**:
- un borrado a pedido de una persona real: no hay datos reales hasta la 13.5;
- **H-4**: que los identificadores del agente no lleven el teléfono. Se resolvió en el contrato (I-1, opción A1), sin validación del CRM, y se verifica con el primer evento real, en la 13.5;
- que el vaciado alcance las **conversaciones sin cliente**: queda declarado, por decisión del usuario (R-1);
- que `/var/log/syslog` respete los 30 días: guarda hasta unos 35, declarado y con tarea en Notion (R-12);
- que el journal venza a los 30 días: no se puede observar antes del 2026-10-30;
- lo que guarda el agente, ni cumplimiento legal.

**Nivel**: validado localmente y en el entorno productivo sin datos reales (`deterministic` e `isolated-runtime`).

## 2026-10-01 — 13.3 cerrada: disponibilidad y observabilidad

Tercera subfase de la Fase 13 ([brief-13.3](docs/decisions/brief-13.3-disponibilidad-y-observabilidad.md), [evidencia-13.3](docs/decisions/evidencia-13.3-disponibilidad.md), [runbook de alertas](docs/runbooks/responder-a-una-alerta.md)). En dos etapas: la 13.3.1 (`579397e`), los avisos de vida y el criterio de disponibilidad, desplegada; la 13.3.2 (`e96ec8e`), la configuración externa y las fallas provocadas en producción. Las correcciones de la revisión independiente van en `9ffd112`.

**Certifica**:
- **Pregunta 6**: un objetivo del 99,5 % mensual, medido desde afuera y sin SLA, con la consecuencia escrita para el consumidor.
- La medición externa: DigitalOcean Uptime sobre `/api/health`, desde cuatro regiones y sin costo. Con la aplicación detenida, la alerta y la recuperación se vieron llegar. Con la base detenida, se vio llegar la alerta por `503`, y la aplicación reconectó sola.
- Un aviso de vida por trabajo programado, en Healthchecks.io, que sale solo por `OnSuccess=` y lo cuida una guarda. Un aviso que no llega alerta por email y por Telegram, visto con un chequeo de prueba. Las corridas programadas del 2026-10-01 llegaron a su aviso, incluido **el primer ejercicio de restauración programado en producción**, con sus 17 tablas iguales.
- La alerta de disco, vista llegar con el umbral bajado, y el umbral devuelto a 80 %.
- El corte de un despliegue: de 1 a 3 s, solo en el reinicio.
- Los recuentos de `crm_production` iguales después de cada falla.
- **Revisión independiente** (D-8): 1 crítico por la letra de la escala, 1 mayor, 10 menores y 3 observaciones. Los doce hallazgos se confirmaron y se corrigieron. El script del aviso corregido, con la URL fuera de los argumentos de `curl`, se instaló en el droplet el 2026-10-01.

**No certifica**:
- que el 99,5 % se cumpla: hace falta un mes de medición;
- la latencia de las rutas de servicio con tráfico, ni la herramienta de APM: las dos pasan a la 13.5;
- que el agente tolere una caída del CRM;
- que las alertas lleguen siempre: la de memoria, la de latencia y la del certificado están configuradas y no se provocaron;
- una detección rápida: Uptime avisa la caída entre 4,5 y 9,5 minutos después y la recuperación entre 11 y 16; mandó dos avisos de caída con el sitio arriba, y una caída de 40 s no produjo alerta. El usuario lo aceptó, y se revisa en la 13.5.

**Nivel**: verificado en el entorno productivo, sin tráfico real (`isolated-runtime`).

## 2026-09-30 — Next.js 16.3.8 por GHSA-vcvr-r3jv-pc5j, desplegado en producción

Fuera de subfase. El aviso, publicado el 2026-09-30 a las 14:48 UTC, es crítico: ejecución remota de código en `ImageResponse` de `next/og`, de la 16.2.0 a la 16.3.5. La CI del cierre de la 13.2 (`5d77e93`) falló por él en la auditoría de dependencias.

**Certifica**:
- `next` y `@next/eslint-plugin-next` en `^16.3.8` (`471cf7b`), con la CI en `success` (run 36754258894).
- El usuario lo desplegó en producción a las 18:02 UTC, siguiendo el [README de producción](deploy/production/README.md). La versión anterior, para volver atrás, es `938423d`.
- Verificado después: HEAD en `471cf7b` y `next` 16.3.8 instalado en el servidor, la aplicación solo en loopback, `/login` y `/api/health` en 200, la ingestión y la lectura en 404 desde afuera, HSTS presente y los recuentos de `crm_production` sin cambios.

**No certifica**:
- Que el CRM haya estado expuesto: no usa `next/og`. La versión instalada sí era vulnerable.
- La comparación de los once archivos de configuración ni la del salto único de proxy: no se repitieron, porque el despliegue no toca `/etc` ni nginx.

## 2026-09-30 — 13.2 cerrada: las mediciones previas a exponer datos reales

Segunda subfase de la Fase 13 ([brief-13.2](docs/decisions/brief-13.2-mediciones-previas-a-datos-reales.md), [evidencia-13.2](docs/decisions/evidencia-13.2-mediciones.md), [planes](docs/decisions/planes-13.2/)). En dos etapas: la 13.2.1 (`803571e`), los instrumentos en local; la 13.2.2 (`f278d0a`), la medición en el droplet de producción, en una base aparte que se borró al terminar.

**Certifica**: qué plan elige PostgreSQL para cada consulta del producto, con datos sintéticos, en la máquina de producción.
- **O-2**: la aplicación no deja sentencias preparadas con nombre, así que el plan genérico no aplica. Comprobado por efecto en el pool, en local y en el servidor, y fijado por una guarda.
- **O-39**: 118, 116 y 118 consultas con su plan crudo y su tiempo, desde una organización de 10.000 clientes, una de 50 y una con una conversación de 4.000 mensajes.
- Todos los recorridos secuenciales registrados, y los cambios de forma entre organizaciones explicados: 28 contra la chica y 18 contra la concentrada.
- La última página de cada listado, el dashboard con la métrica 12, la conversación vigente y el historial de la conversación concentrada.
- La ventana del manifiesto del backup: entre 2,28 y 2,62 s con una base de 78 MB.
- El umbral recalibrado en esa máquina: factor 3,77×, 754 ms por consulta y 1508 ms por camino.
- **R-8 de la 12.2**, con tests de tres conexiones: el bloqueo del cliente hace esperar sin perder nada, y la candidata cerrada no abre una tercera conversación. El usuario decidió no cambiar el bloqueo.
- La limpieza: ni la base ni el rol de medición existen, y `crm_production` conserva sus recuentos.
- **Revisión independiente** (D-7): 14 hallazgos, uno mayor y uno de proceso; los 14 verificados y resueltos.

**Veredicto**: ninguna consulta es patológica. La más lenta tardó 91,0 ms y el camino más lento, 573,9 ms de mediana. No hizo falta ningún índice y `src/` no se tocó.

**Lo más importante que encontró la revisión**:
- la guarda de sentencias preparadas no cubría el pool crudo: cualquier archivo llegaba a `pg` por `$client` sin importarlo;
- `inventory.listProductStock` manda un parámetro por producto activo, y PostgreSQL admite 65.535 por sentencia. Quedó como riesgo y como tarea.

**Nivel**: medido en la máquina de producción, con datos sintéticos y sin tráfico (`isolated-runtime`).

**No certifica**:
- ningún tiempo con tráfico real ni con concurrencia: el script corre una llamada por vez;
- desde qué proporción de la tabla PostgreSQL deja el índice: no se midió desde una organización de 1.000 clientes;
- la conversación vigente con varias candidatas por cliente;
- la ventana del manifiesto con escrituras concurrentes;
- el AC-3 por revisión independiente: el revisor no leyó a fondo el seed.

## 2026-09-30 — 13.1 cerrada: el entorno productivo

Primera subfase de la Fase 13 ([brief-13.1](docs/decisions/brief-13.1-entorno-productivo.md), [evidencia-13.1](docs/decisions/evidencia-13.1-produccion.md)). El usuario la cerró el 2026-09-30, después de aceptar las correcciones de la revisión independiente.

**Certifica**: los mecanismos del entorno productivo, verificados ahí y desde afuera, sin tráfico real.
- `crm.vixoraai.app` en un droplet propio, separado del de staging, con PostgreSQL 18.6 y collation ICU `es`, Node 24.21.0 y TLS con su renovación vista funcionar.
- **H-3 (O-29)**: dos IP distintas dan claves de límite distintas, un `x-forwarded-for` falsificado no cambia la IP que ve la aplicación, y 20 fallos desde una IP no bloquean a otra.
- La cookie de sesión sobre el `Set-Cookie` crudo, HSTS, y `permission denied` en el `DELETE` sobre `audit_logs`.
- Los secretos fuera del repositorio y de la CI, en `0600` de `root`, y ninguno igual a uno de staging.
- El backup diario cifrado, con copia externa, y una restauración desde el bucket a una base aislada, con su control negativo.
- Un reinicio real, y un despliegue con su vuelta atrás: 90 s y 62 s.
- La base sin datos de clientes, con una sola organización; la ingestión y la lectura apagadas.
- **Revisión independiente** (D-11): 14 hallazgos, ninguno crítico ni mayor, y 7 más, menores, en la verificación de las correcciones. Los 21 verificados y corregidos.

**Lo más importante que encontró la revisión**:
- el paso de despliegue del README salía bien con el SHA vacío, sin cambiar de versión;
- una recuperación con el runbook perdía la collation ICU `es`, porque la base nueva toma la de `template1`.

**Nivel**: verificado en el entorno productivo (`isolated-runtime`).

**No certifica**:
- «preparado para producción»: faltan la 13.2, la 13.3 y la 13.4;
- el caso «droplet perdido» de la restauración, que está diseñado y no ejecutado;
- una restauración con ICU `es` en el droplet: se midió en un contenedor, y la del AC-18 quedó en libc;
- que nginx reemplaza `x-forwarded-for` por medición: sale de la configuración y de su guarda.

**Pendiente, fuera de la subfase** (en Notion): la nota de `contrib` del README de staging, el timeout de `module-boundary` y la regla de finales LF para `deploy/**`.

**CI**: `3cab09a` dio `failure` en el paso de formato; se corrigió en el commit de cierre, cuya corrida hay que leer por `headSha`.

## 2026-09-29 — 12.5.3: la derivación con el agente, en staging

Ventana corta, después del cierre de la fase, para el límite conocido del turno 3 ([evidencia-12.5](docs/decisions/evidencia-12.5-turno-completo.md), §12.5.3). El agente corrigió su clasificación de su lado.

**Certifica**: el turno 3 derivó con la cadena real del agente.
- La conversación pasó de `open` a `pending`, con una fila de auditoría y la credencial como actor.
- La conciliación dio `ok` (3 de 3), y los eventos quedaron todos `processed`.
- Un primer intento, cortado por un timeout de OpenAI del lado del agente, dejó su entrante registrado sin respuesta: no se perdió.
- Todo terminó apagado y con las tres credenciales revocadas.

**Nivel**: validado en integración, en staging (`producer-consumer`, datos sintéticos).

**No certifica**: `authenticated-end-to-end` ni producción. Tampoco qué hace el agente con un mensaje nuevo en una conversación `pending`: el turno terminó en la derivación.

## 2026-09-29 — Fase 12 cerrada (El contexto del turno)

Cierra con el gate de salida cumplido: **el agente completa turnos contra el CRM en staging, detrás del modo de prueba, sin pérdida de mensajes** ([Roadmap](docs/planning/Roadmap.md), §Fase 12). Tiene un límite conocido: la derivación del turno 3, decidida por el usuario. El usuario confirmó el cierre el 2026-09-29.

**Certifica:**

- **Las cinco subfases cerradas**:
  - 12.1, actor de servicio y cliente por teléfono;
  - 12.2, conversación vigente y derivación;
  - 12.3, contrato de ingestión v2;
  - 12.4, historial y memorias;
  - 12.5, turno completo en staging.

  Cada una tiene su entrada abajo, y las cinco llevaron revisión independiente.
- **Brechas cerradas**: B-3 (cliente por teléfono), B-4 (conversación vigente), B-5 (derivación, con el límite de abajo), B-6 (mensajes con tipo y autor) y B-7 (historial). **B-10 (memorias) quedó decidida**: tienen dueño en el CRM y las genera el emisor, pero no se construyen en esta fase.
- **Los criterios de aceptación de la fase**:
  - toda escritura de servicio se audita con la credencial como actor;
  - la idempotencia está probada en cada operación nueva, incluido el reenvío;
  - ninguna pérdida de mensajes ante `CONFLICT` ni ante la ingestión apagada (el turno 4 de la 12.5.2);
  - el historial trae los últimos N, en orden.
- **Los dos contratos con el agente como consumidor real**: la ingestión v2 (desde la 12.3.3) y la lectura v1, que incluye el catálogo, la información y el historial (12.5.2).

**Nivel**:
- el turno completo y los dos contratos, **validados en integración, en staging** (`producer-consumer`, datos sintéticos);
- el resto, validado localmente y en CI.

**No certifica:**

- ~~**La derivación con la cadena real del agente**~~ *Probada el mismo día en la 12.5.3 (arriba)*: el agente no derivó en el turno 3. La ingestión de `conversation.escalated` está validada desde la 12.3.3. Se prueba en una ventana corta cuando el agente corrija su clasificación.
- **Un timeout del lado del emisor**: no se provocó. La indisponibilidad probada fue el `404` de la ingestión apagada.
- **`authenticated-end-to-end`**: ningún mensaje real de WhatsApp pasó; la entrada fue simulada.
- **Producción, tráfico real y datos personales reales**: son de la Fase 13.
- **Lo que hereda la Fase 13**:
  - la 13.2 recibe AC-15 de la 12.3 (el plan de la conversación vigente con volumen), R-8 de la 12.2 y el plan del historial de una conversación grande (H-3 de la 12.4);
  - la 13.1 recibe E-2, la collation de la base de producción;
  - la 13.5 recibe la capacidad por credencial con tráfico real (Risks, fila 24).

  Quedan abiertos, sin destino fijo, E-3 (la advertencia de npm 11.19 sobre los `postinstall` de esbuild) y N-6 de la 11.2.

## 2026-09-29 — 12.5 cerrada: turno completo en staging

Quinta y última subfase de la Fase 12 ([brief-12.5](docs/decisions/brief-12.5-turno-completo-en-staging.md), [evidencia-12.5](docs/decisions/evidencia-12.5-turno-completo.md)). Tuvo dos etapas:

- **12.5.1, preparación del CRM**, en `c530558`: corrida 36347725367, `success`. Staging pasó a `c530558`, con las migraciones `0000` a `0024`.
- **12.5.2, turno completo con el agente**, el 2026-09-28, en dos ventanas de staging. Se registró en `dc49787`: corrida 36582055676, `success`.

Llevó revisión independiente (D-11): 11 hallazgos, 3 mayores, todos verificados y resueltos en `21a615c`: corrida 36587111693, `success`. 1388 tests en Vitest y 100 end-to-end.

**Certifica:**

- **Turnos completos del agente contra el CRM** con su cadena real (n8n), entrada simulada, un doble de WhatsApp y datos sintéticos:
  - los turnos 1 a 5, más el 5b;
  - dos ventanas, cada una con la conciliación `ok` (7 de 7): sin faltantes, duplicados ni mensajes en otra conversación.
- **Sin pérdida de mensajes** (AC-6):
  - el turno 4 quedó retenido mientras la ingestión respondía `404`, y llegó entero y en orden después de la reapertura;
  - `conversation_ref_taken` terminó en `…~r2`, con el mensaje guardado y separado de la semilla;
  - `message_already_recorded` no guardó nada. Este `409` lo mandó el llamador temporal acordado, así que prueba el emisor y su clasificador, no la cadena real.
- **La lectura v1 con el agente como consumidor** (AC-9): el catálogo, la información y el historial respondieron `200`. Hay tres capturas `"shape": "captured"` que pasan los esquemas estrictos en CI. El historial del turno 2 trae el turno 1 completo, con la respuesta del agente y su autor (AC-7).
- **Los pedidos por turno** (AC-8, pregunta 5): de 3 a 4 escrituras y de 1 a 3 lecturas, **ningún `429`**. La capacidad por credencial quedó en Risks.
- **R-6 de punta a punta** (AC-10): el teléfono como nombre terminó en «Sin nombre». El formato local pasa, y es un límite escrito.
- **La métrica 12** (AC-12): 7 y 0 en la ventana 1; 9 y 2 en la ventana 2, que son los dos `409` del guion. El dashboard muestra «12,5 %, 2 fallidos de 16».
- **N-1 de la 11.4 cerrada**: el agente no necesita la cantidad en stock.
- **Todo apagado** a las 23:04:35 UTC, con `app.env` idéntico a la copia. Las cuatro credenciales quedaron revocadas y todo responde `404` desde afuera.
- **Mutaciones M26 a M32**, detectadas y restauradas.

**Nivel**: **validado en integración, en staging** (`producer-consumer`, datos sintéticos).

**No certifica:**

- ~~**La derivación del turno 3**~~ *Probada el mismo día en la 12.5.3; AC-5 pasa a cumplido* (AC-5 cumplido en parte). Por decisión del usuario queda como límite conocido.
- **Los bytes de las respuestas de lectura**: n8n guarda el cuerpo ya parseado, así que las capturas validan el esquema.
- **`authenticated-end-to-end` ni producción.**
- **Hallazgos para el agente, que no bloquean**:
  - el turno 1 no leyó la información del negocio;
  - usa una correlación por pedido y no una por turno;
  - la búsqueda del catálogo no encuentra plurales («fundas» no es «Funda»), y el agente lo corrigió de su lado.
- **R-1, la IP del usuario y sus hashes**: se quitaron de los archivos actuales, pero siguen en el historial de Git. El usuario decidió no reescribirlo.

## 2026-09-27 — 12.3 cerrada: contrato de ingestión v2

Tercera subfase de la Fase 12 ([brief-12.3](docs/decisions/brief-12.3-contrato-de-ingestion-v2.md)); cerró después que la 12.4 porque esperaba al emisor real. Tuvo tres etapas, las tres con la CI en verde al primer intento:

- **12.3.1, contrato v2**, en `49a3cb4`: corrida 36199681876.
- **12.3.2, staging**, en `cc90eaf`: corrida 36202372270.
- **12.3.3, emisor real**, en `b778850`: corrida 36342686970.

Llevó revisión independiente (D-11): R2, con 8 hallazgos (2 mayores), todos verificados y resueltos.

**Certifica:**

- **El contrato de ingestión v2** (FR-API-07), en su propia ruta y con v1 congelada. Agrega:
  - el tipo original del mensaje (`messages.kind`) y su autor (`sent_by`), con la migración `0023` y el rótulo en la pantalla 9;
  - el `409` con `reason`, guardado en `error_code`;
  - la correlación por turno, validada antes del límite de tasa;
  - la guía del emisor, que desde la 12.3.3 exige también contenido reproducible;
  - el teléfono como nombre, rechazado con `400`.
- **El borde real de staging** (12.3.2): 18 pedidos sintéticos, 0 fallas, y el log sin secretos.
- **La compatibilidad con el agente como emisor real** (12.3.3, gate O-35):
  - en una ventana autorizada, la instancia de n8n del agente mandó un turno con los cuatro tipos, dos salidas con autor, un reenvío `duplicate` y un `400` deliberado, sin rechazos inesperados;
  - se cruzaron con el log, las filas, el `payload_hash` guardado por staging y el dashboard;
  - las seis capturas son fixtures con `"shape": "captured"`.
- **La métrica 12 con eventos de un emisor real** (O-34): 3 eventos y 0 fallidos, igual a mano y en el dashboard.

**Nivel**:
- el contrato de ingestión v2, **validado en integración** (`producer-consumer`, datos sintéticos);
- el borde, validado en staging;
- el resto, validado localmente y en CI.

**No certifica:**

- **El turno completo**: es la 12.5. Tampoco un turno que haya recorrido la cadena real del agente, cuyo emisor sigue sin cablear.
- **Las lecturas por turno y R-6** (el teléfono como nombre): pasan a la 12.5, por decisión del usuario.
- **La referencia devuelta distinta de la propuesta y los dos `409`** con el emisor real.
- **El plan de la vigente (AC-15) y R-8 de la 12.2**: pasan a la 13.2.

## 2026-09-27 — 12.4 cerrada: historial y memorias

Cuarta subfase de la Fase 12 ([brief-12.4](docs/decisions/brief-12.4-historial-y-memorias.md)); se cerró antes que la 12.3, que espera al emisor real (12.3.3). Una sola entrega, en `225b35a`: corrida 36337842640, `success`. 1365 tests en Vitest y 100 end-to-end.

Llevó revisión independiente (AC-13): R1, con 8 hallazgos menores, todos verificados y corregidos.

**Certifica:**

- **La lectura del historial** (FR-API-08): `GET /api/read/v1/messages?conversation_ref=&limit=` devuelve los últimos N mensajes (1 a 50, 20 por defecto) en orden cronológico, con dirección, tipo, autor, hora y texto. El corte se hace en SQL.
  - Una conversación ajena o inexistente responde el mismo `404 NOT_FOUND`; una cerrada se lee; una vacía devuelve `items: []`.
  - Pasa por la misma cadena que la lectura: modo de prueba, credencial, allowlist, límite por credencial y correlación. El log no guarda la referencia ni el texto.
- **Un alcance de credencial nuevo, `context`** (prefijo `crm_ctx_`, migración `0024`): es el único que lee el historial, y no lee el catálogo ni escribe. La sesión del CRM tampoco lo autentica.
- **La pregunta 3 de las brechas** (B-10): las memorias tienen dueño en el CRM y las genera el emisor, pero no se construyen en la Fase 12 (enmienda del Roadmap).
- **Las rutas de productos e información sin cambios de contrato**: siguen exigiendo `read`.
- **Mutaciones M18 a M21**, las cuatro detectadas y restauradas.

**Nivel**: validado localmente y en CI (`deterministic`, datos sintéticos).

**No certifica:**

- **Compatibilidad con el agente**: los fixtures del historial tienen forma asumida. Es la 12.5.
- **Nada en staging**: la 12.4 no desplegó, y la `0024` no está aplicada allá.
- **El plan con una conversación que concentra los mensajes de su organización** (H-3): pasa a la 13.2.
- **El renombre del módulo `ingestion`**, postergado por decisión del usuario (H-1).

## 2026-09-25 — 12.2 cerrada: conversación vigente y derivación

Segunda subfase de la Fase 12 ([brief-12.2](docs/decisions/brief-12.2-conversacion-vigente-y-derivacion.md)). Tuvo dos etapas:

- **12.2.1, `conversation.resolved`**, en `840d9d1`: corrida 36188422058, `success`.
- **12.2.2, `conversation.escalated`**, en `94590ce`: corrida 36193461054, `success`. 1265 tests en Vitest y 98 end-to-end.

Llevó revisión independiente (D-11): 8 hallazgos, 1 bloqueante por la regla del brief y 1 mayor, todos verificados y resueltos o registrados.

**Certifica:**

- **La conversación vigente** (FR-API-05), con el evento `conversation.resolved` del contrato de ingestión v1. El mensaje entrante va a la conversación del cliente abierta o pendiente cuyo tramo queda a 24 horas o menos del mensaje, a cada lado, y entre varias a la más cercana; si no hay, a una nueva que nace con él.
  - Una `closed` nunca recibe el mensaje ni se reabre.
  - Un mensaje tardío va a la conversación de su momento (ventana simétrica, R-2).
  - Dos mensajes simultáneos del mismo cliente dejan una conversación, probado con el cliente bloqueado desde una tercera conexión.
  - La respuesta trae la referencia y el estado, sin id, teléfono ni texto.
- **La derivación** (FR-API-06), con `conversation.escalated`: `open` pasa a `pending`, que significa «espera a una persona» (FR-CONV-03), auditado con la credencial como actor. Una `pending` no escribe; una `closed` o inexistente se rechaza con su regla. Dos derivaciones simultáneas dejan una sola fila de auditoría.
- **Los rechazos de negocio de los tipos nuevos** responden `422` con la regla, que queda en `error_code`, así que un reenvío responde la misma.
- **Las preguntas 1 y 2 de las brechas**, contestadas en el modelo del CRM y no copiadas del emisor.
- **La métrica 12** cuenta `conversation.resolved`, que registra un mensaje, y excluye `conversation.escalated`.
- **`message.recorded` y `client.resolved` sin cambios**: mismos vectores y los tests de su forma sin tocar.

**Nivel**: validado localmente y en CI (`deterministic`, requests sintéticos).

**No certifica:**

- **Compatibilidad con un emisor real**: los fixtures tienen forma asumida. Es la 12.3.
- **Nada en staging**: la 12.2 no desplegó.
- **Dos bordes de concurrencia** (R-8), sin defecto demostrado, registrados para la 12.3.
- **El plan de la consulta de la vigente**: no se midió con `EXPLAIN`.

## 2026-09-25 — 12.1 cerrada: actor de servicio y cliente por teléfono

Primera subfase de la Fase 12 ([brief-12.1](docs/decisions/brief-12.1-actor-de-servicio-y-cliente-por-telefono.md)). Tuvo dos etapas:

- **12.1.1, actor de servicio y E-1**, en `273d277`: corrida 36174142257, `success`.
- **12.1.2, `client.resolved`**, en `51843dc`: corrida 36180602360, `success`. 1209 tests en Vitest y 98 end-to-end.

Llevó revisión independiente (D-13): 12 hallazgos, 2 mayores, todos verificados y resueltos o registrados.

**Certifica:**

- **El actor de servicio en la auditoría** (FR-AUD-03). Cada fila de `audit_logs` tiene exactamente un actor, un usuario o una credencial de servicio, con un `CHECK` y una clave foránea compuesta por organización (migraciones `0021` y `0022`). `audit_logs` sigue siendo de solo inserción. El detalle de cliente, producto e información muestra «Servicio · &lt;source&gt;», compuesto en la página sin `JOIN` entre módulos.
- **El cliente por teléfono** (FR-API-04), con el evento `client.resolved` del contrato de ingestión v1, en el mismo endpoint y sin una tercera superficie (M-5).
  - Si el teléfono es de un cliente, activo o no, lo devuelve sin escribir ni reactivar ni renombrar.
  - Si no, lo crea con el nombre del evento o «Sin nombre», auditado con la credencial como actor.
  - Un reenvío nunca crea. Dos resoluciones simultáneas dejan un cliente y una fila de auditoría, probado con el bloqueo retenido desde una tercera conexión.
  - La respuesta no lleva el teléfono, y el log tampoco lleva el nombre.
- **`message.recorded` sin cambios**: el mismo vector de `payload_hash` y sus tests sin tocar.
- **La métrica 12 excluye `client.resolved`** (R-2): ese evento no es un mensaje y bajaba la tasa de errores.
- **E-1**: `deploy/staging/README.md` corregido con la forma que funcionó en la 11.4.

**Nivel**: validado localmente y en CI (`deterministic`, requests sintéticos); la pantalla 7 con el autor de servicio, `producer-consumer`.

**No certifica:**

- **Compatibilidad con un emisor real**: los fixtures tienen forma asumida. Es la 12.3.
- **Nada en staging**: la 12.1 no desplegó (D-2). El README de E-1 se ejecuta por primera vez en el próximo despliegue.
- **Que un emisor no mande el teléfono como nombre** (R-6): limitación escrita, a revisar en la 12.3.
- **Los 4 fixtures nuevos con identificador de requisito** (R-3): el `it.each` compartido los nombra por archivo.

## 2026-09-25 — Fase 11 cerrada (Lo que el agente necesita leer)

Cierra con el gate de salida cumplido como está escrito: **piloto sin bloqueantes y contrato de lectura publicado con su validador en verde** ([Roadmap](docs/planning/Roadmap.md), §Fase 11). El cierre lo confirmó el usuario el 2026-09-25.

**Certifica:**

- **Las cinco subfases cerradas**:
  - 11.0, instrumentos;
  - 11.1, catálogo comercial;
  - 11.2, información del negocio;
  - 11.3, API de lectura;
  - 11.4, piloto.

  Cada una tiene su entrada abajo.
- **El contrato de lectura v1** ([read-v1.md](docs/contracts/read-v1.md)), con su validador estricto en verde en CI. Además, **una corrida en staging**, a través de nginx, TLS y `TRUSTED_PROXY`, con 0 fallas contra ese validador.
- **El backoffice en staging**, con las migraciones `0016` a `0020`:
  - las 13 pantallas cargan con su contenido;
  - el guion del piloto lo recorrió una persona con `admin` y con `viewer`.
- **Brechas cerradas**: B-8 (catálogo comercial), B-9 (información del negocio) y la parte de lectura de B-2 (API de servicio).
- **Obligaciones asignadas a la Fase 11**:
  - cerradas: O-8, O-10, O-17, O-21, O-22, O-33, O-40, R-1 (piezas 1 y 2), R-2 (el registro) y C-6;
  - O-36, cerrada en parte: falta la observación de un operador real, que va a la 13.5;
  - la pregunta 5, estimada en `Risks.md`, con la medición en la 12.3.

**Nivel**:

- **El contrato de lectura**: validado localmente y en CI, más una corrida en staging. **No está validado en integración**, porque ningún agente lo consumió. Es la rama «si no» del gate del Roadmap, y se dice (brief-11.4, H-1).
- **El backoffice**: validado en staging, con datos sintéticos.

**No certifica:**

- **Integración con el agente**: el contrato llega a validado en integración recién en la 12.3 o en la 12.5, cuando el agente lo consuma.
- **Que 120 pedidos por minuto alcancen**: se mide en la 12.3.
- **Uso real sostenido y observación de un operador real**: los dos van a la 13.5.
- **Preparado para producción**: es de la Fase 13.

## 2026-09-25 — 11.4 cerrada: piloto en staging

Última subfase de la Fase 11 ([brief-11.4](docs/decisions/brief-11.4-piloto-en-staging.md)). Tuvo tres etapas:

- **11.4.1, preparación**, en `f241f62`: corrida 36090109504, `success`. 1170 tests en Vitest y 97 end-to-end.
- **11.4.2, despliegue y verificación en staging**, en `c51cb47`: corrida 36141464167, `success`. Evidencia cruda en [evidencia-11.4-piloto.md](docs/decisions/evidencia-11.4-piloto.md).
- **11.4.3, ventana de observación y triage**: el usuario recorrió el guion el 2026-09-25. Notas y triage en [notas-piloto-11.4.md](docs/decisions/notas-piloto-11.4.md).

Cierra el gate de la Fase 11, así que lleva revisión independiente.

**Certifica:**

- **El seed del piloto** (`npm run db:seed:pilot`): un comercio de tecnología inventado.
  - 60 productos en 6 categorías y 8 marcas, un tercio reacondicionados, 5 inactivos y los tres estados de stock;
  - 15 entradas de información, con una programada, una vencida y una inactiva;
  - 30 clientes y 40 conversaciones.

  Es determinista e idempotente, y lo prueba `pilot-seed.test.ts`. En staging se corrió dos veces, con los mismos recuentos.
- **Los instrumentos**:
  - `recorrer-pantallas.ts` cubre 13 pantallas, incluidas precios, información y el detalle de una entrada;
  - `probar-api-lectura.ts` valida contra el contrato y no imprime el token.

  Los dos tienen una mutación que los pone en rojo.
- **El despliegue en staging** (validado en staging, `isolated-runtime`):
  - backup previo;
  - migraciones de 16 a 21;
  - HEAD en `f241f62`;
  - las cinco comprobaciones del README, entre ellas el salto único de proxy, con su control desde otra IP;
  - 13 pantallas con 0 problemas, y el control negativo en verde.
- **La API de lectura en staging**:
  - encendida solo para la prueba, con 0 fallas;
  - 12 pedidos y 12 líneas de log, sin el token ni el texto buscado;
  - apagada al terminar, con `app.env` igual byte a byte al anterior y la credencial revocada.
- **La ventana**:
  - las 12 tareas del guion, hechas;
  - staging sin cambios entre la apertura y el cierre;
  - la auditoría coincide con lo que el `admin` hizo, y el `viewer` no tiene ninguna escritura.
- **El triage**: 12 filas, **0 bloqueantes**, 1 mayor, 1 menor y 10 observaciones.
  - **E-1**, el único mayor: el procedimiento de despliegue del README no corre tal como está escrito, porque los archivos de `/etc/crm-staging/` son `0600` de `root`. El usuario aceptó su destino el 2026-09-25: se corrige en la **12.1**, antes de su primer despliegue.
- **Las personas (O-36)**, contrastadas con el dueño del negocio:
  - `admin` confirmado: hoy opera solo el dueño;
  - `viewer` confirmado como necesidad futura;
  - el teléfono enmascarado para `viewer`, **refutado**, sin cambiarse todavía;
  - se pidió un rol intermedio, a futuro.

  Todo está en [Personas.md](docs/product/Personas.md), con el límite de D-4.
- **O-10**: no hace falta un end-to-end contra staging hasta la 13.1 ([TestingStrategy](docs/development/TestingStrategy.md)).

**Revisión independiente** (D-11): veredicto R1, 0 bloqueantes, 1 mayor, 5 menores y 6 observaciones. Cada hallazgo se verificó, y los doce se aceptaron. El mayor, **H-1**, bajó el nivel declarado de la API de «validada en staging» a lo que se midió: validada localmente y en CI, más una corrida en staging. El usuario siguió esa recomendación al cerrar.

**Pedidos del dueño en la ventana, registrados y no implementados**: métricas de productos, ordenar las listas, mejorar el alta de productos y la estética, y la cantidad de stock para el agente (N-1, pregunta de la 12.5). El dueño resumió: el CRM «sí sirve como respaldo para el agente», pero para manejar un negocio «todavía no sirve». Eso coincide con el plan: el ERP es posterior a la Fase 13.

**No certifica:**

- **Validado en integración**: el agente no consumió la API.
- **`authenticated-end-to-end` con un operador real**: una sola persona hizo de las dos personas, con datos sintéticos. El `viewer` no deja auditoría.
- **El orden de las listas con la collation `C.UTF-8` de staging** (E-2): el piloto no lo midió. Va a la 13.1.
- **Rendimiento en staging** (13.2).

## 2026-09-24 — 11.3 cerrada: API de servicio de lectura

Cuarta subfase de la Fase 11 ([brief-11.3](docs/decisions/brief-11.3-api-de-lectura.md)), en dos etapas:

- **11.3.1** en `2eb1110`: corrida 36065777017, `success` en el intento 2. El intento 1 falló en el caso intermitente conocido de `conversations.spec.ts`, que la etapa no toca.
- **11.3.2** en `4066a53`: corrida 36071051286, `success` en el intento 1.

No abre ni cierra gate. La revisión independiente se hizo igual (D-12).

**Certifica (validado localmente y en CI, con requests sintéticos):**

- **Credencial de lectura** (D-2): la columna `scope` (`ingest` | `read`) en `ingestion_credentials`, con la migración `0020`. Cada credencial tiene un solo alcance y el token de lectura es `crm_read_`. Una credencial de lectura no escribe por la ingestión, y una de ingestión no lee. El script de credenciales acepta `--scope`.
- **El borde de la API** (FR-API-03). Se comprueba en este orden:
  - el modo de prueba, propio (`READ_API_ENABLED`, `READ_API_ALLOWED_CREDENTIALS`), que la ingestión no enciende;
  - la credencial y su alcance;
  - la allowlist;
  - el límite de 120 pedidos por minuto, con un presupuesto por credencial;
  - `X-Correlation-Id`, que se valida, se devuelve y queda en el log como `correlation_id`.

  Toda respuesta lleva `no-store` y `X-Request-Id`, y queda en el log con la ruta fija, nunca con el texto ni el id buscados. Una sesión del CRM no autentica.
- **Productos** (FR-API-01), en `/api/read/v1/products` y `/products/{product_id}`:
  - solo activos, por palabras o por SKU exacto, ordenados por relevancia en SQL y con `limit`;
  - el precio vigente como decimal en texto, con los decimales de la moneda;
  - el estado de stock, sin la cantidad.
- **Información del negocio** (FR-API-02), en `/api/read/v1/knowledge`: solo las entradas vigentes hoy en la zona de la organización, con o sin texto.
- **Contrato de lectura v1** ([read-v1.md](docs/contracts/read-v1.md)), con un validador estricto por el que pasa toda respuesta de éxito de los tests, y fixtures con forma asumida. Un NUL o un carácter de control en `q` da `400` y nunca llega a PostgreSQL.
- **Guardas**:
  - `service-read-entry-points`, la decimotercera: fuera de los módulos, solo `src/app/api/read/` llama a las lecturas `…ForService`, que no pasan por `authorize`, y nadie las renombra;
  - O-33: ningún archivo de `src/app` nombra la revocación;
  - `stock-writes` ve las cuatro formas que tenía `price-writes`. Se comprobó que antes no las veía;
  - `module-boundary` tiene los casos de `knowledge`.
- **Planes**: la búsqueda de productos (GIN y SKU), el precio vigente (el índice del historial, pendiente desde la 11.1) y la búsqueda de información (GIN), capturados sobre el SQL real, cada uno con su mutación.
- **O-22**: las cabeceras de `proxy.ts` llegan a las tres rutas, en end-to-end sobre `next start`, con su mutación.
- **`SecurityModel.md`**: 48 puntos de entrada, 29 de ellos fijados por guarda.
- **Suite local**: 1164 de 1164 en 89 archivos, y 97 de 97 end-to-end.

**Revisión independiente** (D-12): nueve hallazgos, dos mayores, cuatro menores y tres notas. Cada uno se verificó contra el código, y los nueve se confirmaron:
- **R-1**: `Risks.md` y FR-API-03 decían que un `429` registra la correlación. El código la valida después del límite, como fija el contrato, y la afirmación era falsa. Se corrigió la documentación.
- **R-2**: varias respuestas `200` no pasaban por el validador. Ahora pasan todas.
- **R-7 y R-8**: dos huecos en las guardas nuevas. Cerrados, con su mutación.

**No certifica:**

- **Integración con el agente**: ningún consumidor usa el contrato. Se valida en la 12.3.
- **Que 120 pedidos por minuto alcancen**: es una estimación, y se mide en la 12.3 ([Risks](docs/planning/Risks.md)).
- **El `correlation_id` en un `401`, `403` o `429`**: no llega al log. Cambiarlo es un cambio del contrato.
- **Nada en staging.** Tampoco la medición con volumen de precios ni de información: el seed de desarrollo no los tiene.

## 2026-09-24 — 11.2 cerrada: información del negocio

Tercera subfase de la Fase 11 ([brief-11.2](docs/decisions/brief-11.2-informacion-del-negocio.md)). La implementación está en `dd26e9c`, con la corrida 36056855249 en `success` al primer intento. No abre ni cierra gate. La revisión independiente se hizo igual (D-10).

**Certifica (validado localmente y en CI; las pantallas, validadas en integración):**

- **Entradas de información del negocio** (FR-INFO-01): el módulo nuevo `knowledge`, con título único sin distinguir mayúsculas, categoría, contenido de hasta 4000 caracteres y vigencia opcional. Migraciones `0018` y `0019`. `crm_app` tiene `SELECT`, `INSERT` y `UPDATE`, sin `DELETE`: las entradas se editan y se desactivan, nunca se borran. Cada alta, edición, desactivación y reactivación se audita (`knowledge_entry`), y la edición registra solo lo que cambió.
- **Vigencia** (FR-INFO-03): fechas de calendario de la zona de la organización. El estado (vigente, programada, vencida, inactiva) lo calcula PostgreSQL contra el día de esa zona. Lo prueban dos zonas extremas, Kiritimati y Pago Pago, con una mutación en UTC que falla.
- **Búsqueda por palabras con pesos** (FR-INFO-02): título, categoría y contenido, sin acentos, por prefijo, ordenada por relevancia, con un índice GIN que un caso con `EXPLAIN` exige. La búsqueda de `catalog` pasó a `src/shared/search`, compartida, sin cambiar el esquema (`drizzle-kit generate`: sin cambios). Un caso con una URL con comilla prueba el escape contra PostgreSQL.
- **Pantallas 11 y 12**: la lista con búsqueda y filtro de estado, el alta, el detalle con su auditoría y la edición. El contenido conserva los saltos de línea y la sangría. Se probaron con axe en claro y en oscuro en doce estados, para `admin` y para `viewer`, con teclado y a 375 px.
- **Saltos de línea**: un `textarea` envía CRLF; el servicio los normaliza a `\n` antes de validar el límite. Lo encontró el end-to-end.
- **`SecurityModel.md`**: la superficie expuesta pasa a 45 puntos de entrada, 26 de ellos fijados por guarda.
- **Suite local**: 1067 de 1067 en 86 archivos, y 94 de 94 end-to-end.

**Revisión independiente** (D-10, no obligatoria): 5 hallazgos menores y 8 notas, sin bloqueantes ni mayores. Cada uno se verificó contra el código:
- **m-4**: ningún test probaba el filtro de organización en las escrituras del repositorio. Corregido, con su mutación.
- **m-5**: la afirmación de que los casos de integración probaban el escape de la búsqueda **era falsa**. Ahora hay un caso que sí lo prueba, con su mutación.
- **m-1, m-2 y m-3**: listas de la documentación sin la tabla nueva (una tampoco tenía `product_prices`) y un recuento de axe. Corregidos.
- **N-8**: `pre-line` juntaba la sangría del contenido. Corregido a `pre-wrap`, con su mutación.

**No certifica:**

- **Nada en staging.** El primero en usarlo allá es el piloto (11.4).
- **`lower()` fuera de ASCII en staging** (N-5): depende del `LC_CTYPE` de la base, verificado solo en local. Va al piloto.
- **La búsqueda con volumen**: el `EXPLAIN` se hizo con pocas filas.

**Registrado sin corregir** (fuera de la lista):

- **N-3**: `module-boundary.test.ts` no tiene casos para `knowledge`. La frontera la hace cumplir ESLint, probado con una mutación y su control, pero no queda una guarda permanente.
- **N-6**: un carácter NUL en un formulario o en la búsqueda llega a PostgreSQL. Es transversal a todos los formularios, sin subfase propia.
- **Un comentario de `catalog/repository.ts`** todavía nombra `productSearchQuery`, que ya no existe.
- **D-8**: las pantallas 5b, 11 y 12 no están en `recorrer-pantallas.ts` ni en `security-headers.spec.ts`. Las suma la 11.4.

**Ampliación de la lista autorizada por el usuario**: `tests/e2e/users.spec.ts`, cuyo caso 11 contaba las paradas de tabulación de la navegación. El tope pasó de 10 a 12.

---

## 2026-09-24 — 11.1 cerrada: catálogo comercial

Segunda subfase de la Fase 11 ([brief-11.1](docs/decisions/brief-11.1-catalogo-comercial.md)). Se hizo en dos etapas verticales (D-1): la 11.1.1 en `487def8` (run 36013939490, `success`) y la 11.1.2 en `aa29504` (run 36045565521, `success` en el intento 2, ver abajo). No abre ni cierra gate. La revisión independiente se hizo igual (D-10).

**Certifica (validado localmente y en CI; las pantallas, validadas en integración):**

- **Marca, categoría y condición** (FR-PROD-10). Migración `0016`, sin cambiar ninguna fila existente: la huella de las 10 001 filas de desarrollo es igual antes y después. El tipo de entrada exige los tres campos. «Bajo stock» usa el token de advertencia nuevo (O-17).
- **Búsqueda por palabras** (FR-PROD-11). Busca por prefijo de palabras de nombre, marca y categoría, sin acentos, o por SKU exacto, con un índice GIN. El texto buscado pasa por el mismo parser que el documento, así que la sintaxis de `tsquery` nunca llega cruda. Un caso con `EXPLAIN` exige el índice, con su corrida de mutación.
- **Precio vigente con historial** (FR-PROD-12 y FR-PROD-13):
  - **Tabla y dinero.** `product_prices` es de solo inserción, en la migración `0017`: `crm_app` solo tiene `SELECT` e `INSERT`, un trigger rechaza `UPDATE` y `DELETE`, y la FK es compuesta. El dinero son centésimos en `bigint` (`src/shared/money`), con un parser que conoce los decimales de cada moneda: «300.000» se rechaza en CLP.
  - **Quién y cómo.** Fijar un precio es solo de `admin` y exige el producto activo. Se hace con `FOR UPDATE` y da `CONFLICT` si el precio vigente cambió mientras se editaba. Un precio igual al vigente no escribe nada. La auditoría registra `price_change` con el antes y el después.
  - **Probado.** La concurrencia se probó con el bloqueo retenido desde una tercera conexión y con una mutación sin el `FOR UPDATE`.
- **Guarda `price-writes`, la duodécima.** `insertProductPrice` es la única escritura de la tabla. La prueban diez corridas de mutación en rojo y dos límites declarados, que pasan en verde como se esperaba.
- **Pantallas**: la de precios (5b), y el precio vigente en la lista y en el detalle. Se probaron con axe en claro y en oscuro, para `admin` y para `viewer`.
- **`SecurityModel.md`**: la superficie expuesta pasa a 38 puntos de entrada, 22 de ellos fijados por guarda.
- **Suite local**: 1016 de 1016 en 80 archivos, y 85 de 85 end-to-end.

**Revisión independiente** (D-10, no obligatoria): 6 hallazgos, 2 mayores y 4 menores. Cada uno se verificó contra el código, en lo posible primero con un test en rojo:
- **M-1**, mayor: tras un rechazo de validación, el formulario perdía la detección del `CONFLICT`. Corregido.
- **M-2**, mayor: la guarda no veía cuatro formas de escribir en la tabla. Corregido.
- **M-3**: un id en mayúsculas salteaba el `CONFLICT`. Corregido.
- **M-4**: no se reprodujo, y la corrección tentativa se quitó.
- **M-5** (`SecurityModel.md`): corregido con autorización del usuario.
- **M-6**: el plan del índice sin medir quedó documentado.

**No certifica:**

- **Nada en staging.** El primero en usarlo allá es el piloto (11.4).
- **El plan de la consulta del precio vigente**: el índice se asignó por la forma de la consulta, sin `EXPLAIN`. Queda para la 11.3.
- **La búsqueda por palabras con volumen** fuera del `EXPLAIN` de desarrollo: `medir-caminos.ts` no la mide. Queda para la 11.3.
- **D-9 no tuvo efecto**: `seeds/basic.ts` no tiene productos.

**Registrado sin corregir** (fuera de la lista):

- **`stock-writes.test.ts`** tiene el mismo hueco que tenía `price-writes` (M-2). Va a la 11.3, o a la próxima subfase que toque `inventory`.
- **`conversations.spec.ts` caso 2** falló en el intento 1 de la CI con la firma ya conocida («Target page, context or browser has been closed»), y pasó al volver a correrlo. Es la tercera vez, y sigue sin causa.
- **Una corrida end-to-end local tardó 41 minutos** y falló el caso 8 de productos por el tiempo máximo dentro de axe. La siguiente dio 85 de 85 en 4,5 minutos.

---

## 2026-09-24 — 11.0 cerrada: instrumentos antes de construir encima

Primera subfase de la Fase 11 ([brief-11.0](docs/decisions/brief-11.0-instrumentos-antes-de-construir-encima.md)). Corrige los instrumentos que el piloto de la 11.4 va a reutilizar y la herramienta de migración, antes de que la 11.1 y la 11.2 construyan encima. No abre ni cierra gate. La implementación está en `174276a`, con la corrida 36004268721 en `success`.

**Certifica (validado localmente y en CI):**

- **Recorrido de pantallas** (R-7, R-8, R-21):
  - cada una de las nueve pantallas se comprueba con un elemento propio, buscado dentro de `main`, que no coincide con el menú;
  - el dashboard, además, sin esqueletos y sin tarjetas en error;
  - las respuestas HTTP ≥ 400 son una clase propia, porque `requestfailed` no las ve (verificado en playwright-core@1.63.0);
  - el control negativo exige cada provocación en su clase y con su propio texto;
  - al terminar, sale y comprueba que la cookie anterior ya no entra.
- **Medición de caminos** (R-1, R-9): mide la métrica 12 y revisa **cada** corrida, incluida la carga en paralelo. Un `Failure` sale como falla, con código 1.
- **`npm run db:migrate`** (O-8): corre `scripts/migrar.ts` con el migrador de `drizzle-orm` e imprime el error de PostgreSQL con su SQLSTATE. Antes, `drizzle-kit migrate` salía con 1 y stderr vacío: reproducido en local y verificado en `bin.cjs` de drizzle-kit@0.31.10.
- **Guardas**:
  - la de PostgreSQL de staging acepta la gramática de PostgreSQL 18, falla ante una línea que no entiende y lee `effective_cache_size` sin unidad en bloques de 8 kB (R-12);
  - la de identidad del seed comprueba la forma de los ids en los ocho tipos (R-13, **reproducido**).
- **Seed de volumen** (R-14): la segunda corrida ya no reescribe `users`. Tenía dos causas: el hash y el `$onUpdate` de `updated_at`.
- **Artefactos de Playwright** (O-21): la CI sube `test-results/` solo cuando falla el end-to-end, con retención de 7 días. Probado con el PR de borrador #1, que falló a propósito: el artefacto trae `trace.zip`. El PR se cerró sin mergear y la rama se borró. En `main`, el paso queda `skipped`.
- **Staging** (D-5): `crm-backup.sh` copiado, con un cambio que solo toca comentarios. El `diff` de los **nueve** archivos da cero otra vez.
- **Documentación**:
  - `Risks.md` registra `cancel-in-progress` en `main`, sin decidir (R-2);
  - `EngineeringStandards.md` define la convención de etiquetar los FR desde la 11.1 y lista **once** guardas: decía nueve, porque la 9.3 agregó dos sin sumarlas.
- **Suite local**: 953 de 953 en 77 archivos, y 81 de 81 end-to-end.

**Revisión independiente** (D-7, no obligatoria): 9 hallazgos, **0 bloqueantes**, 4 mayores, 4 menores y 1 nota. Los nueve se verificaron contra el código: 8 corregidos y 1 registrado. **Dos de los mayores eran huecos de las correcciones de esta misma subfase**, de la clase que venían a cerrar:

- la guarda corregida leía mal un valor sin unidad;
- el chequeo nuevo de ids miraba un solo tipo.

**No certifica:**

- **Nada contra staging salvo la copia de D-5.** Ningún instrumento corregido se volvió a correr allá; el primero en usarlos es el piloto (11.4). El recorrido y la medición están probados contra `next start` local.
- **La CI no ejecuta `scripts/migrar.ts`**: prueba el migrador que usa. El script se probó a mano, con un caso que falla y uno que pasa.
- **O-8 se reprodujo por el síntoma, no por su causa original.** `crm_app` ya existe en el clúster local, así que se provocó otra falla de privilegio de la misma clase.
- **Un end-to-end que se cuelga termina `cancelled` y no sube artefactos.**

**Registrado sin corregir** (fuera de la lista autorizada):

- **`module-boundary`**: la intermitencia de `guards` ya tiene nombre. Es el primer caso de ese archivo, que carga ESLint en frío y superó los 30 s. La hipótesis está sin verificar.
- **Seed de volumen**: `organizations` y `organization_members` se reescriben en cada corrida (m-3).
- **Detalle de producto**: un historial de movimientos que falla se muestra como vacío (`productos/[productId]/page.tsx:86-88`).

**Notion**: el proyecto de la Fase 11 se había creado sin la plantilla y con sus subfases en «Sin fecha». Ya tiene la plantilla, las tareas pendientes pasaron a «Esperando», y la convención quedó escrita en `CLAUDE.md` §Convenciones de Notion, por decisión del usuario.

---

## 2026-09-23 — Fase 10 cerrada (Evaluación del MVP): continuar ampliando el alcance

Cierra con la **decisión explícita del usuario**, que es su gate de salida: **continuar ampliando el alcance**, sobre el backend validado, hacia las Fases 11 a 14 de integración con el agente de WhatsApp. La decisión se tomó con la brecha a la vista, no se derivó de los criterios. Un solo [brief](docs/decisions/brief-10-evaluacion-del-mvp.md) con tres subfases, sin código. Esta entrada cubre las tres: la 10.1 y la 10.2 cerraron sin entrada propia, porque el brief reservaba `CHANGELOG.md` para el cierre de la fase, aunque el [ExecutionProtocol](docs/development/ExecutionProtocol.md) pide una por subfase. Queda dicho.

**Certifica:**

- **10.1 — Evaluación** ([evaluación 10.1](docs/decisions/evaluacion-10.1-mvp.md), `15597ee`):
  - la Definición de Terminado de `15c8faf` con **cinco de seis criterios cumplidos** y el piloto **incumplido por decisión**;
  - el usuario confirmó que el backoffice resuelve el dolor de la visión;
  - las tres reevaluaciones heredadas: APM, tres piezas mínimas antes de producción; protección de rama, decisión del usuario antes del primer despliegue productivo; retención, sigue y se reabre en la 13.4;
  - 42 obligaciones inventariadas, cada una con destino;
  - la revisión independiente de la 9.3.
- **10.2 — Enmiendas** (`347f88c`):
  - el [ADR 0014](docs/decisions/0014-el-agente-de-whatsapp-como-consumidor-del-crm.md): el agente es consumidor del CRM, por contratos versionados diseñados desde el modelo del CRM, con dependencia unidireccional; la migración es una fase de este repositorio, por CSV y nunca por la API de Airtable. Reemplaza parcialmente al ADR 0003;
  - enmiendas fechadas, con el texto anterior visible, en once archivos;
  - `CLAUDE.md` cambió en una sola frase, y **ninguna prohibición cambió**.
- **10.3 — Roadmap y decisión**:
  - las **Fases 11 a 14** en el [Roadmap](docs/planning/Roadmap.md): lectura (con el **piloto como subfase propia, la 11.4**), contexto del turno, producción y migración;
  - cada fase con objetivo, alcance, brechas, subfases, entregables, criterios y gates;
  - las 18 obligaciones con destino de integración, las tres reevaluaciones, las seis preguntas abiertas de las brechas y C-6, cada una en **una** subfase;
  - una opción de decisión nueva, «continuar ampliando el alcance», que ninguna de las tres escritas describía.
- **Revisión independiente de la fase** (obligatoria, D-7): 23 hallazgos, **0 bloqueantes**, 7 mayores, 11 menores y 5 notas, verificados antes de aceptarse. Corrigió:
  - un recuento falso de la propia evaluación: 8 FR etiquetados en tests, no 15;
  - nueve hallazgos de la 9.3 que se habían aceptado sin verificar;
  - una contradicción sobre cuándo entran datos reales: el usuario decidió que en la **Fase 13**, nunca en staging;
  - y registró antes de llegar dos choques futuros: escrituras de servicio que el ADR 0014 no prevé (12.1) y un importador de CSV frente a la prohibición de mappers de Airtable (14.1).

**No certifica:**

- **El piloto**: no hubo, y el criterio 4 de la Definición de Terminado queda incumplido.
- **FR-MET-03** (ninguna métrica editable) no tiene ningún caso que lo afirme: se sostiene de forma indirecta. Los otros 28 FR tienen un caso concreto.
- **Nada nuevo sube de nivel.** La fase no produjo evidencia de runtime: cita la vigente con el nivel que ya tenía.
- **Tres hallazgos de la revisión de la 9.3 (R-11, R-13 y R-22) no se pudieron reproducir** y quedan como no verificados.
- **La revisión independiente es una sola pasada**: no garantiza que no quede un defecto más.

**Correcciones a entradas anteriores** (O-42; las entradas no se reescriben):

- **Entrada «9.3: veinte organizaciones…»**:
  - los «4.309 productos que no son suyos» son **3.800 ajenos y 509 inactivos de la propia organización** (los 3.806 clientes sí son ajenos);
  - «las doce métricas en paralelo, 226,8 ms» midieron **diez llamadas, sin la métrica 12**, y sin comprobar su resultado;
  - la «página profunda» es la **página 100**, no la última.
- **Entrada «Fase 9 cerrada»**: «las 10 pantallas funcionan sin errores con volumen» probó que cargan sin error, **no que muestren su contenido**. La comprobación de contenido coincide con el menú en 6 de 9 pantallas. El usuario decidió registrarlo sin reabrir el cierre.

---

## 2026-09-23 — Fase 9 cerrada (Staging y piloto controlado), con el gate enmendado

Cierra contra los criterios del [Roadmap](docs/planning/Roadmap.md) **salvo uno, por decisión del usuario**. Cuatro subfases cerradas —la 9.0 con sus cuatro hijas, la 9.1, la 9.2 y la 9.3— y la **9.4 disuelta sin abrirse**. CI en verde en el commit de cierre de cada subfase.

**Es la primera vez en el proyecto que un gate no se cumple como está escrito.** El de esta fase era «informe del piloto sin bloqueantes», y no hubo piloto. El usuario lo enmendó el 2026-09-23, y queda acá como decisión con fecha y no como omisión.

**Por qué se disolvió la 9.4.** Contenía dos cosas que se movían en direcciones opuestas. El **piloto sintético perdió valor**: el usuario decidió conectar al agente de WhatsApp como consumidor del CRM, y eso va a cambiar las pantallas 3 a 5 y agregar una que no existe, así que se iba a pilotear lo equivocado. **Las tres reevaluaciones que traía ganaron valor** —APM y tracing, protección de rama y la retención de `messages`—, porque con un consumidor sincrónico y datos de clientes reales dejan de ser opcionales. Las tres pasan a la Fase 10. **El piloto se reasigna con condición escrita, no se pospone**: el roadmap de la Fase 10 tiene que enumerarlo como subfase propia de la primera fase de integración.

**Certifica, con nivel *validado en staging* y ni un escalón más:**

- **Dos de los tres criterios de aceptación de la fase**:
  - **Las 10 pantallas funcionan sin errores con volumen** (9.3, AC-10): cero errores de consola, cero excepciones, cero peticiones fallidas, sobre 13.800 productos y veinte organizaciones, **con control negativo que detecta cuatro**.
  - **Un backup se restauró en un entorno aislado** (9.2), y se volvió a medir al volumen real en la 9.3: **5,08 s** el ejercicio completo, con la aplicación corriendo.
- **Existe un entorno equivalente a producción** en `https://staging.vixoraai.app` (9.1): TLS, `systemd`, nginx, PostgreSQL 18.6 con el rol `crm_app` y la aplicación solo en loopback.
- **Las seis afirmaciones `no-verificable-aquí` del modelo de seguridad quedaron verificadas** —cinco en la 9.1 y la de backups en la 9.2—, que era la deuda que la Fase 8 le dejó nombrada.
- **Los tres hallazgos mayores de la 8.4 están cerrados**: H-1 y H-7 en la 9.0.1, y **H-3 medido por consecuencia** en la 9.1, que era precondición bloqueante de la fase.
- **Las deudas que la fase absorbió al descomponerse quedaron saldadas**, cada una en una subfase con número: `unaccent` (9.0.2, la deuda más vieja del proyecto), la frontera de `analytics` en ESLint (9.0.3), la escritura de `ingestion` que la 9.0.1 no vio (9.0.4) y la medición con varias organizaciones que arrastraban la 6.3, la 7.1 a la 7.3 y la 8.5 (9.3).
- **Backup diario disparado por timer**, ejercicio de restauración mensual agendado con control negativo por tres vías, simulacro de recuperación completo con ingreso autenticado, y **un runbook ejercitado contra su propio hallazgo** (9.2 y 9.3).
- **Veinte organizaciones medidas**: tres de seis consultas cambian de forma de plan, y la organización dominante paga por las demás (9.3). Nada patológico.
- **Once guardas con 205 casos**, seis de ellas nuevas en esta fase.

**No certifica:**

- **El tercer criterio de aceptación: las notas del piloto triageadas.** No hubo piloto. Y con eso **tampoco se cumple el ítem de la Definición de Terminado del MVP «piloto en staging sin bloqueantes, con datos sintéticos»**: la Fase 10 tiene que registrarlo como incumplido por decisión, que es lo que su propio criterio de aceptación le pide.
- **Uso real del producto por una persona.** Todo lo validado lo ejercitaron scripts y tests. Que las pantallas carguen sin error está demostrado; que se pueda **trabajar** con ellas, no. Es exactamente lo que el piloto iba a medir y lo que la condición de reasignación protege.
- **El gate no lo cerró una revisión independiente.** La 9.4 la llevaba por obligación y no hubo entrega que revisar. La 9.3 tampoco la tuvo, por decisión del usuario. Las que sí hubo en la fase —una en la 9.0.1, cuatro en la 9.1 y una en la 9.2— informaron **58 hallazgos reales en total, ninguno falso**.
- **Lo que la 9.1 dejó abierto y ninguna subfase posterior cerró**: la corrida en seco de `certbot` sin capturar; la discrepancia `account|13|17` sin explicación; el AC-4 verificado por inferencia; que la migración `0003` no corra sin `CREATEROLE`; que `drizzle-kit migrate` salga con código 1 sin imprimir error; y que el servidor sigue sin poder leerse desde un test.
- **Lo que la 9.2 declaró y sigue igual**: la recuperación en una máquina nueva no se ejecutó; el ejercicio compara tablas y recuentos, **no valores**; la copia fuera del droplet es manual; el backup **no está cifrado en reposo**.
- **Lo que la 9.3 declaró**: los planes son *custom*, no genéricos; y al restaurar, **el dueño a nivel de base cambió de `postgres` a `crm_owner`** sin que nada lo estuviera mirando.
- **Nada es *preparado para producción*.** Y la Fase 10 lo va a necesitar por primera vez: la integración con el agente es el primer camino del proyecto que termina con datos reales.

**Lo que la fase midió sobre el propio método:** el patrón que más se repitió no fue de código sino de **instrumentos que corrían en verde sin hacer lo que decían**: una guarda ciega a `sort -r`, un control negativo que no controlaba nada, un ejercicio que restauraba con `--no-owner`, un medidor que publicaba como el camino más rápido del sistema uno que nunca tocó la base, un monitor cuyo rótulo había escrito yo a mano. Los tres primeros los encontró la revisión independiente de la 9.2. Los dos últimos los encontré yo en la 9.3, y en los dos casos solo porque un número no cerraba contra otro: un camino más rápido en la máquina lenta, y un `cancelled` donde había escrito `success`. **Un instrumento que no puede fallar no es evidencia.**

---

## 2026-09-23 — 9.3: veinte organizaciones, y tres de seis consultas cambian de plan

Cierre de subfase. **No abre ni cierra gate** —los de la Fase 9 son la 9.1 y la 9.4—, así que la revisión independiente no era obligatoria. **Esta vez no se hizo**, y eso queda declarado abajo y no tapado: todo el cuerpo de esta entrada es **autoevaluación**.

**Certifica, con nivel *validado en staging* y ni un escalón más:**

- **Se midió con veinte organizaciones y no con una**, que era la deuda que la 6.3 (D-4), la 7.1 a la 7.3, la 8.5 y la 9.0.2 arrastraban con la misma frase. Distribución 1×10.000 + 3×1.000 + 16×50 (D-1): 13.800 clientes, 90.100 mensajes, 13.800 productos, 51.830 movimientos, 750 miembros y 27.600 eventos de ingestión, en 35,6 s. El `n_distinct` de `organization_id` pasó de **1 a 20-21** tras `ANALYZE`, que es la premisa sin la cual nada de lo demás significa algo.
- **Tres de seis consultas cambian de forma de plan** según el tamaño de la organización: productos activos, el total de clientes y la página profunda de clientes. Es exactamente el hallazgo que la subfase existía para producir y que con una sola organización era **invisible por construcción**.
- **El hallazgo que más enseña no está en la comparación sino en la columna de la izquierda**: sobre la organización grande, el recorrido secuencial ahora **lee y descarta 4.309 productos y 3.806 clientes que no son suyos**. Con una sola organización eso era imposible: no había filas ajenas. **La organización dominante paga por las demás**, y ese costo crece con el total de la tabla, no con su propio tamaño. No es patológico hoy y no se corrigió (D-7); queda **registrado** por la regla de D-1 de la 8.5.
- **El SQL de los planes no se escribió a mano.** Se encendió `log_min_duration_statement = 0` en el rol y se extrajeron del log de PostgreSQL las sentencias que los servicios **realmente emiten**. Era el primer punto que el brief mandó vigilar, por ser el modo de falla más probable de toda la subfase.
- **Los parámetros de costo del planificador quedaron corregidos y versionados** en [deploy/staging/postgresql-crm-staging.conf](deploy/staging/postgresql-crm-staging.conf): `effective_cache_size` de 4 GB —que era **cuatro veces la RAM de la máquina**— a 600 MB, y `random_page_cost` de 4 a 1,1 sobre SSD. Eran **dos errores que empujaban en sentidos opuestos**, que es peor que uno solo: no se cancelan de forma conocida, así que ni siquiera se podía razonar el sesgo. `diff` contra el archivo del servidor: **cero diferencias**.
- **La máquina se recalibró antes de juzgar** (D-3b), reproduciendo la tanda de la 8.5 con una sola organización. El factor **no es un número**: va de 0,82× a 4,17×, mediana **2,29×**, y la dispersión tiene causa medible —los caminos que componen en memoria se degradan 3-4× por el núcleo único; los que son casi puro SQL, 1-2×—. Umbral resultante: **916 ms**.
- **Ninguna consulta resultó patológica** contra ese umbral. El máximo es `inventory.listProductStock` con **440,3 ms**, menos de la mitad. **D-7 no se activó y `src/` no se tocó**, comprobado por `git diff`.
- **El dashboard se midió por primera vez fuera de la máquina de desarrollo**: las doce métricas en paralelo, **226,8 ms** desde la organización grande con veinte cargadas, 39,3 ms desde una chica.
- **El tiempo de restauración al volumen real está medido** (AC-12), que era deuda nominal de la 9.2: dump de **4.746.187 bytes** contra los 55.996 de entonces, backup completo ~2 s, y el ejercicio de restauración entero en **5,08 s** con la aplicación **corriendo**. El manifiesto de recuentos que la 9.2 introdujo **aguantó el volumen**: no hubo falla por deriva, que es el escenario exacto que hizo fallar la primera corrida por timer.
- **Las 10 pantallas se recorrieron con volumen y sin un solo problema** (AC-10), con `scripts/recorrer-pantallas.ts` sobre `https://staging.vixoraai.app`: cero errores de consola, cero excepciones, cero peticiones fallidas, cero pantallas sin contenido. **Con control negativo ejecutado**: `CRM_CONTROL=1` provoca las tres clases y detecta cuatro. **`/productos/[id]` y `/productos/[id]/movimientos`, las dos rutas que la 9.1 dejó sin recorrer**, quedan cubiertas.
- **La carga se deshizo** (AC-11) restaurando el dump previo, sin desactivar ningún trigger, por el procedimiento publicado del runbook. Los siete recuentos coinciden **exactamente** con el manifiesto, el dueño sigue siendo `crm_owner` y `crm_app` sigue sin poder borrar `audit_logs`. **Se verificó por consecuencia y no por confianza**: el usuario sintético que el seed creó después del dump ya no existe. La base desplazada se conservó hasta que el usuario decidiera y **se borró el mismo día con su autorización**: en el servidor queda una sola base `crm%`.
- **Tres instrumentos nuevos versionados** —el seed de distribución, `scripts/medir-caminos.ts` y `scripts/recorrer-pantallas.ts`—, **11 guardas con 205 casos**, y una prueba de integración cuyo caso principal comprueba que la organización 0 queda **byte a byte igual** que con el seed de una sola organización, con **control negativo**: otra organización del mismo tamaño no coincide. Evidencia en [evidencia-9.3](docs/decisions/evidencia-9.3-volumen.md).

**No certifica:**

- **Nada sobre producción.** Un núcleo, 961 MB y PostgreSQL compartiendo máquina con la aplicación. **Lo que transfiere de acá es la forma del plan, no los milisegundos**, y solo bajo un modelo de costo equivalente.
- **Que los planes medidos sean los que la aplicación usa siempre.** Se tomaron con `EXPLAIN` sobre valores literales, o sea el plan *custom*. La aplicación usa sentencias preparadas, donde PostgreSQL puede pasar a un plan **genérico** después de varias ejecuciones. **No se comprobó si alguno de los seis cambia.**
- **Que la distribución elegida sea la real.** Es una hipótesis sobre cómo se van a repartir las organizaciones, declarada como tal.
- **Nada sobre concurrencia.** Ni un solo usuario simultáneo se ejercitó.
- **Que la métrica 12 funcione con datos reales.** Sigue sin emisor: se midió con eventos sintéticos.
- **Nada sobre accesibilidad ni tema oscuro** en el recorrido de pantallas —eso lo cubre la suite end-to-end contra la base local—, ni sobre las pantallas de alta y edición, ni sobre intermitencias: **un navegador, una corrida, y solo la organización grande**.
- **Que la base restaurada sea idéntica a la desplazada en todo lo que no son tablas y recuentos.** Al borrar la desplazada apareció una deriva que el AC-11 no había medido: **el dueño a nivel de base pasó de `postgres` a `crm_owner`**, porque el runbook la crea con `createdb -O crm_owner`. Las tablas siguen siendo de `crm_owner` y eso sí se comprobó. Es la clase de diferencia que el ejercicio de la 9.2 declaró explícitamente que no puede ver.
- **Esto no es autoevaluación corregida por nadie.** No hubo revisión independiente. El brief la recomendaba, por un motivo que sigue vigente: **un instrumento roto falla y se nota; un número mal medido se cita**, en la 9.4 y en la Fase 10.
- **Nada de esto es *preparado para producción***.

**Lo que la subfase midió sobre el propio método, y es su resultado:**

- **Un `Failure` devuelto en microsegundos es indistinguible de una consulta veloz si el instrumento solo mira el reloj.** La primera tanda dio `listConversations` en 0,4 ms y `listStockMovements` **más rápido que en una máquina de desarrollo cuatro veces más veloz**. Las dos llamadas fallaban la validación de filtros y volvían sin tocar la base: `allOr(...)` espera `"all"` y se le pasaba `""`. Se corrigió en dos partes, los filtros **y el instrumento**, que desde entonces declara en cada fila qué devolvió la llamada —filas leídas o el código de la falla—. Un camino que no se ejecutó ya no puede entrar en la tabla como el más rápido del sistema.
- **Un número que no se puede volver a medir no es una línea de base.** El script de medición de la 8.5 vivía en el scratchpad y nunca se versionó, así que su tanda no se podía repetir y hubo que reconstruirla. El de esta subfase queda en `scripts/`.
- **Un veredicto sin recalibrar mide la máquina.** `listProductStock` da 440,3 ms; con el umbral de 400 ms de la 8.5 se habría declarado **patológica** una consulta que no cambió y cuyo plan es el correcto. Elegir D-3(b) fue lo que evitó ese falso positivo.
- **Un recorrido que informa «0 problemas» y uno cuyos oyentes nunca se dispararon se ven idénticos.** De ahí el control negativo, sin el cual el cero no valdría nada. Y el control expuso algo que el código no sugiere: la petición fallida llega como **mensaje de consola**, no por el oyente de `requestfailed`, porque un 404 es una respuesta válida del servidor y no un fallo de red.
- **Un monitor que rotula su propia salida puede mentir sin fallar.** Informé la CI de `7e02795` en verde apoyándome en una tarea de fondo que imprimía «CI de 7e02795: success» — pero el rótulo lo había escrito yo a mano y la corrida que leía ya era la de `c2edbb5`. `7e02795` estaba **cancelada**. Es la misma familia que los cinco instrumentos verdes de la 9.2.
- **Una mutación puede mutar un comentario.** La primera mutación de la guarda de parámetros, `/effective_cache_size = \S+/`, pegó en el comentario de cabecera que cita el valor viejo para explicar el defecto. Anclada con `^…$/m`, y con un caso agregado que prueba que la mutación muerde el parámetro y no el encabezado. Misma familia que el hallazgo de `--no-owner` de la 9.2.
- **Cuarto error de recuento de este linaje.** «Corregí» el número de archivos de `deploy/staging/` de seis a siete sumando uno a un número equivocado en vez de contar. Son **nueve**. Después de H-5, N-2 y R-7. El comando que los cuenta quedó escrito en el README, que es la única corrección que sirve.
- **El runbook se ejercitó contra su propio hallazgo, y aguantó.** La trampa del paso 2 —el glob se expande en el shell de quien llama y no puede leer un directorio `root:postgres`— volvió a aparecer, y la forma publicada desde la 9.2 la resolvió. Es la primera vez que eso pasa.
- **Dije que el AC-10 no se podía hacer desde esta sesión, y era falso.** Lo que la 9.1 declaró bloqueado es apuntar la **suite** end-to-end a staging, porque cada caso vacía y siembra su propia base. Un recorrido de **solo lectura** no necesita nada de eso. La diferencia estaba en el enunciado desde el principio.
- **Un secreto no sale del servidor ni para una medición.** Leer `SEED_USER_PASSWORD` a la máquina local se bloqueó, y estuvo bien bloqueado. La vía que se usó no lee ningún secreto: la contraseña se generó en local, se calculó su hash argon2id con el `hashPassword` del propio proyecto, y al servidor viajó **solo el hash**.
- **Segunda observación de la intermitencia del proyecto `guards`**, sin diagnóstico: una corrida dio `1 failed | 193 passed` y el nombre del caso se perdió por filtrar la salida con `grep`. Once corridas siguientes en verde. Se registra sin explicación, que es lo único honesto por ahora. **Filtrar la salida de una tanda con `grep` pierde el nombre del caso que falló**: se captura a un archivo y se filtra después.

## 2026-09-22 — 9.2: el backup se restaura, y seis instrumentos que no hacían lo que decían

Cierre de subfase. **No abre ni cierra gate** —los de la Fase 9 son la 9.1 y la 9.4—, así que la revisión independiente no era obligatoria. Se hizo igual, y fue la decisión que definió la subfase.

**Certifica, con nivel *validado en staging* y ni un escalón más:**

- **Hay backup lógico diario disparado por `systemd`**, con el rol dueño, en formato `custom` —el único que permite restaurar una sola tabla— y rotación de 7 copias. Se observó correr **sin que nadie lo arrancara**.
- **El backup se restaura y lo restaurado sirve.** El ejercicio crea una base nueva, restaura **sin `--no-owner`**, compara los recuentos contra un manifiesto escrito junto al dump, comprueba que el conjunto de tablas sea el del origen y que el **dueño se haya restituido**, y borra la base comprobándolo. Corre **agendado**, el día 1 de cada mes, después del backup de esa madrugada.
- **El ejercicio puede fallar, medido por tres vías**: dump truncado, manifiesto que no coincide y `dropdb` que falla con una conexión abierta. Las tres salen distinto de cero.
- **Se ejecutó un simulacro de recuperación completo**: se renombró la base viva, la aplicación quedó corriendo sobre la restaurada y se verificó con un **ingreso autenticado** desde afuera. Encontró dos defectos del runbook.
- **La retención de `messages` quedó decidida**: se conservan indefinidamente, con condición de reapertura en la 9.4. **No se agregó ningún mecanismo de expiración** — `git diff` sobre `drizzle/` y `src/` vacío de cambios de esquema, que es como se comprueba una decisión de no hacer algo.
- **Nueve guardas**, 178 casos. La de backup **simula la tubería de rotación** en vez de buscarla como texto: la extrae del script, la interpreta y afirma qué archivos sobrevivirían. **Quince mutaciones ejecutadas** con su resultado antes y después.
- **Runbook ejecutado**, no escrito, en [docs/runbooks/restaurar-la-base.md](docs/runbooks/restaurar-la-base.md), y evidencia en [evidencia-9.2](docs/decisions/evidencia-9.2-backups.md).

**No certifica:**

- **Que la recuperación funcione en una máquina nueva.** Crear los roles ahí está **diseñado, no ejecutado**: no hay una segunda máquina. Es el único escenario donde la copia de fuera del droplet sirve, y es el único paso del runbook sin ejecutar.
- **Que el contenido restaurado sea el correcto.** El ejercicio compara tablas y recuentos. **No compara ni un valor de columna**, ni índices, ni triggers.
- **Que la restauración funcione al volumen real.** Staging tiene datos sintéticos y pocos; el tiempo medido acá no predice nada. Se vuelve a medir en la 9.3.
- **Que la copia externa exista todos los días.** Es manual (D-1, opción b): depende de una máquina que puede estar apagada.
- **Nada de esto es *preparado para producción***: falta cifrado del backup en reposo, y está sin verificar si un servicio gestionado exige superusuario para restaurar — lo que condiciona la elección de hosting.

**Lo que la subfase midió sobre el propio método, y es su resultado:** la revisión independiente informó **21 hallazgos, 8 mayores, y ninguno resultó falso** — la primera vez que eso pasa en el proyecto. Cinco de los ocho mayores eran **instrumentos que existían, corrían en verde y no hacían lo que se esperaba de ellos**: una guarda ciega a `sort -r` que dejaba invertir la rotación para borrar las copias más nuevas; un ejercicio que restauraba con `--no-owner`, o sea sin ensayar el paso que rompe una recuperación real; un ejercicio mensual que nada disparaba; un runbook que no creaba el rol dueño; y el paso 2 del runbook —el primer comando de una recuperación real— que **no se podía ejecutar** por falta de `sudo`.

Ese último es el que más enseña: el simulacro no lo detectó porque lo corrí yo, poniendo el `sudo` por costumbre en vez de leer el texto publicado. **Un runbook ejecutado por quien lo escribió no está ejecutado.**

Y un sexto instrumento apareció al **desplegar** las correcciones: el primer ejercicio disparado por la unidad falló por escrituras normales de la aplicación posteriores al dump, porque se comparaba contra un blanco móvil. Con el timer mensual habría dado rojo casi todos los meses por un motivo que no es el backup. De ahí el manifiesto de recuentos. **Un instrumento no cuenta como entregado hasta que corre en el lugar donde va a correr, disparado como va a dispararse.**

La guarda de backup fue la **quinta** aparición del patrón del detector ciego, y se escribió el mismo día que la regla de mutación que la habría evitado. La regla se afinó en [EngineeringStandards](docs/development/EngineeringStandards.md): **la mutación útil es la que uno espera que pase en verde**, y cuando una guarda comprueba texto donde podría comprobar comportamiento, la salida no es agregar mutaciones sino dejar de comprobar texto.

## 2026-09-22 — 9.1: staging existe, H-3 cerrado, y cuatro revisiones independientes

Cierre de subfase. **Abre gate**, así que no se cierra con autoevaluación: la revisaron cuatro agentes que no participaron del trabajo, en rondas sucesivas sobre las correcciones de la anterior.

**Certifica, con nivel *validado en staging* y ni un escalón más:**

- **Existe un entorno equivalente a producción en `https://staging.vixoraai.app`**, sin tráfico real: Ubuntu 24.04, Node 24, PostgreSQL 18.6 con `unaccent`, TLS de Let's Encrypt, `systemd` y nginx. La aplicación escucha **solo en loopback** y el puerto 3000 nunca se abre.
- **H-3 quedó resuelto y medido por consecuencia**, no por lectura: 20 fallos desde una IP la bloquean mientras la misma cuenta ingresa desde otra en el mismo momento. Era el último hallazgo mayor abierto de la 8.4 y precondición bloqueante de esta subfase. La clave del límite se comparó por hash contra tres cadenas conocidas, así que la afirmación es una medición y no un relato.
- **La configuración del servidor está versionada en [deploy/staging/](deploy/staging/)** y fijada por una guarda que **parsea nginx** y calcula las cabeceras efectivas por contexto que proxea, con la regla de herencia real del servidor. Rechaza las tres directivas de `realip`, que reescriben `$remote_addr` desde una cabecera del cliente.
- **HSTS se emite sobre TLS y no sobre texto plano**, con los casos que ejercitan `proxy()` real y no solo el predicado.
- **La aplicación no corre con el rol dueño de la base**: `DELETE FROM audit_logs` responde `permission denied` y un `UPDATE` legítimo funciona, que es el par que le da poder a la comprobación.
- **Ocho guardas**, 129 casos. Dos nacieron en esta subfase y **las dos con un agujero**, encontrado por revisiones independientes y no por autoevaluación.
- **Evidencia de runtime versionada** en [evidencia-9.1-staging.md](docs/decisions/evidencia-9.1-staging.md), con los bloques transcritos marcados como tales y lo que no consta declarado como que no consta.

**No certifica:**

- **Que el servidor tenga lo que el repositorio dice.** La guarda fija el archivo versionado; nadie puede leer la máquina desde un test. La comparación es un paso manual y queda como tal.
- **El AC-2 está cumplido a medias**: la corrida en seco de `certbot` no tiene salida capturada.
- **El AC-4 se verificó por inferencia**, no sobre el `Set-Cookie` crudo como el criterio enuncia. El AC-11 dejó dos rutas de producto sin recorrer.
- **Una discrepancia en la evidencia del AC-6 que no se pudo reconstruir** (`account|13|17` contra el método declarado). La conclusión del criterio se reapoyó en un argumento que la salida sí cierra; el relato original no se sostiene.
- **Nada de esto es *preparado para producción***: faltan backups probados, rollback y retención, que son de la 9.2.

**Lo que la subfase midió sobre el propio método, y es su resultado menos cómodo:** cuatro revisiones independientes informaron **33 hallazgos, todos reales**. Dos rondas de correcciones **introdujeron defectos nuevos mientras corregían**, y ninguna de las cuatro resultó limpia. Cuatro detectores del proyecto nacieron viendo una sola forma sintáctica de lo que debían prohibir, y las cuatro veces lo encontró una revisión independiente. De ahí la regla nueva de [EngineeringStandards](docs/development/EngineeringStandards.md): **una mutación ejecutada por cada forma sintáctica que un detector dice cubrir**, con el resultado antes y después. El riesgo del agente único pasó a probabilidad **alta** en [Risks.md](docs/planning/Risks.md), medida y no estimada.

## 2026-09-21 — 9.0.3: la frontera de `analytics`, y dos pendientes que no existían

Cierre de subfase, y con ella cierra la tarea madre **9.0**. Autoevaluación, no revisión independiente: la 9.0.3 no abre ni cierra gate — eso es la 9.1.

**Certifica:**

- **`analytics` dejó de poder importar `next`, `next/*` y `@/app/*`.** Era el único módulo de dominio que podía, y no por una decisión: su bloque existe por un permiso extra —leer `@/modules/*/schema` para calcular métricas entre dominios— y, como ESLint **reemplaza** la configuración de una regla cuando otro bloque aplica a los mismos archivos, ese bloque no heredó las prohibiciones generales. La excepción por un motivo arrastró una excepción que nadie decidió.
- **Ese permiso de leer esquemas ajenos ahora excluye `@/modules/auth/schema`.** Era la vía por la que `analytics` podía leer `users` directo, sorteando `organizations.getMemberSummaries` — el agujero que la guarda de la 9.0.1 **declaró abierto en su propia cabecera** en vez de dejarlo implícito. El recorte es nominal y no general porque no puede serlo: `audit`, `inventory` y `organizations` importan ese esquema para su clave foránea a `users`, y hay un caso por cada uno que lo fija.
- **Ningún archivo de `src/` cambió**, que era la predicción del brief: los permisos que se cerraron no estaban en uso. La subfase cierra puertas abiertas, no corrige abusos.
- **La guarda pasó de 9 casos a 20**, en pares: por cada fila corregida, uno que debe estar prohibido y uno que debe seguir permitido. `module-boundary` aplica `eslint.config.mjs` **real** sobre archivos virtuales, así que la tabla de [RepositoryStructure](docs/architecture/RepositoryStructure.md) y la configuración no pueden separarse sin que un caso lo note.
- **Cinco mutaciones ejecutadas, no supuestas**, cada caso nuevo cubierto por al menos una. Tres de ellas existen para los casos que esperan «permitido»: sin ellas, un caso así pasa aunque la corrección se haya llevado puesto un permiso legítimo, que es la forma en que este tipo de cambio hace daño.
- **Tests**: 797 — 302 unitarios, **90** de guardas y 405 de integración — y 81 de 81 end-to-end, con typecheck, lint y formato limpios.

**No certifica:**

- **Que `analytics` no pueda llegar a `users` por ninguna vía.** Cierra la del esquema. Una guarda de importaciones comprueba lo que dice un `import`, no todo lo que un módulo puede alcanzar.
- **Dos de los tres puntos con que esta subfase se había descompuesto no existían, y eso vale registrarlo más que el trabajo que ahorraron.** El nombre del paso de guardas en `ci.yml` ya estaba arreglado desde `cae7061` (8.3), con la forma genérica que no vuelve a envejecer: **el pendiente sobrevivió a su propia solución y llegó a figurar en el alcance de una subfase futura.** Y el del timeout de las guardas **era falso**: decía que corren con el default de 5 s de Vitest, pero `vitest.config.mts` fija `testTimeout: 30000` para el proyecto `guards` desde la 2.5. Lo cierto y lo falso venían pegados —ningún *archivo* de guarda fija timeout, eso sí— y de ahí se concluyó el default sin abrir la configuración del proyecto. La corrida de 44 s que originó ese pendiente **no pudo fallar por un techo de 5 s**; sigue sin explicación, ahora sin diagnóstico inventado. Quedó fe de errata en el cierre de la 9.0.1, que es donde el error estaba escrito.
- **Dos fallas end-to-end del mismo día, con la misma firma y un patrón en común, que quedan como hallazgo sin subfase.** `conversations` caso 2 en CI y `clients` caso 9 en local, las dos con «Target page, context or browser has been closed», las dos pasando al reintentar. Lo común no es el caso sino el patrón: solo tres archivos de `tests/e2e/` escuchan `page.on("response")` y acumulan `response.text()`, y las dos fallas cayeron ahí. La hipótesis **está declarada como hipótesis** y el propio código ya la nombra: una respuesta que la navegación corta deja su lectura sin resolver, el `Promise.all` no termina y el test agota su presupuesto. Falta reproducirla.
- **Nada en runtime**: la frontera es estática, la hacen cumplir ESLint en local y en CI.

Detalle en [brief-9.0.3](docs/decisions/brief-9.0.3-frontera-de-analytics-en-eslint.md).

---

## 2026-09-21 — 9.0.2: buscar sin acentos, y el fin de la deuda más vieja del proyecto

Cierre de subfase. Buscar clientes y productos por nombre ya no distingue acentos. La deuda venía de la 4.2, que la excluyó; la 4.4 la asignó a la Fase 8; ninguna de las cinco subfases de esa fase la tomó; el preflight de su cierre la encontró sin hacer y la reasignó a la Fase 9, que ese mismo día la aterrizó en una subfase nominal. **Sobrevivió una fase entera por nombrar una fase y no una subfase.**

**Certifica:**

- **`azucar` encuentra «Azúcar» y `azúcar` encuentra «Azucar», en clientes y en productos.** Las cuatro direcciones tienen caso propio. Sigue siendo búsqueda por prefijo: `zucar` no encuentra nada, y los comodines `%` y `_` siguen escapados.
- **Los dos índices que sostienen esas búsquedas no se perdieron.** Es lo que hacía que la subfase no fuera «agregarle `unaccent` a la consulta»: `unaccent()` está declarada **`STABLE`**, y PostgreSQL solo admite funciones inmutables en una expresión de índice, así que la vía directa costaba los dos índices — o sea introducir a mano la regresión que la 8.5 midió para evitar. Verificado en la fuente instalada de la extensión y después en `pg_proc.provolatile`, dos instrumentos independientes. La salida fue la envoltura `immutable_unaccent`, con los dos índices recreados sobre ella y `text_pattern_ops`.
- **La expresión del índice y la de la consulta se definen una sola vez.** El brief planeaba escribirlas dos veces y vigilarlas con un test; al implementar se vio que el esquema y el repositorio de cada módulo son el mismo módulo, así que se define una vez en `searchNormalized` y la importan las dos. **La desincronización pasó de vigilada a imposible**, que es la diferencia entre una garantía estructural y una que depende de quien edite.
- **Primera extensión de PostgreSQL del proyecto**, en la migración `0015`, aplicada en la base local, en la de test y en el PostgreSQL de CI.
- **Tests**: 786 — 302 unitarios, 79 de guardas y **405** de integración, cinco más que la 9.0.4 — y 81 de 81 end-to-end, con typecheck, lint y formato limpios. `drizzle-kit generate` responde «No schema changes, nothing to migrate».

**No certifica:**

- **Que el diccionario `unaccent` no cambie.** La envoltura declarada `IMMUTABLE` **promete al planificador algo que la función no cumple**: es la práctica habitual y tiene esa mentira adentro. Solo es correcta mientras el diccionario no cambie; si cambiara —otra versión de la extensión, o uno propio—, los índices quedan mal **en silencio** y hay que `REINDEX`. Es una limitación **aceptada y escrita** —en la cabecera de la migración y en [DataModel](docs/architecture/DataModel.md)—, no resuelta, y **no hay chequeo automático de ella**.
- **Rendimiento con volumen.** Los dos casos de `EXPLAIN` comprueban la **forma del plan**, no un umbral de tiempo, y para eso insertan 2.000 filas sintéticas porque con pocas el planificador no tiene con qué decidir. Medir con volumen y con varias organizaciones es de la 9.3.
- **El orden de la lista de clientes**, que sigue distinguiendo acentos a propósito: «Ángel», «Avila», «Ávila», «Bravo», fijado ahora en un caso propio. Unificarlo sería una decisión de producto con su propia subfase.
- **Una aserción propia que no discriminaba nada, encontrada al comprobar que podía fallar.** La primera versión del caso de `EXPLAIN` afirmaba que el plan **nombra** el índice, y eso pasaba igual sin la normalización: los dos índices empiezan por `organization_id`, así que el planificador los usa para resolver la organización y deja el nombre en `Filter`. Tercera vez en este linaje que aparece una aserción incapaz de fallar, y **la primera que la encuentra la propia implementación** — por ejecutar la mutación en lugar de suponer su resultado, el paso que faltó las dos veces anteriores. La aserción quedó en que el prefijo entre como **cota del índice** (`~>=~`).
- **La verificación en CI necesitó dos intentos, y por qué no es lo mismo que un reintento a ciegas.** El intento 1 del run 35646632631 falló en un caso end-to-end de `conversations` **ajeno a la subfase**, por timeout de 30 s donde históricamente tarda entre 1,9 y 3,0 s. Antes de relanzar se descartó que fuera del cambio —el caso nunca busca por nombre, y migraciones, integración y build pasaron— y se intentó reproducirlo en local diez veces, 10/10. El intento 2 dio los 16 pasos en verde con ese caso en 2,2 s. La comparación caso por caso muestra que el runner del intento 1 fue **uniformemente ~30 % más lento**, lo que contribuye pero **no explica** un factor catorce. Queda en `HANDOFF.md` **sin causa determinada y sin subfase**, con lo que faltó para poder mirarlo: subir los artefactos de Playwright cuando el paso falla.

Detalle en [brief-9.0.2](docs/decisions/brief-9.0.2-busqueda-sin-distinguir-acentos.md).

---

## 2026-09-21 — 9.0.4: la octava escritura, la que la 9.0.1 no vio

Cierre de subfase. Existe porque la revisión independiente de la 9.0.1 encontró una escritura de su misma clase en un módulo que esa subfase no había mirado, y porque la 9.0.1 **no la corrigió por analogía**: su condición de detención manda registrar y elevar la decisión de alcance. El usuario decidió que entraba.

**Certifica:**

- **`ingestion.finishEvent` filtra por organización.** Actualizaba `status`, `error_code` y `processed_at` de `ingestion_events` filtrando solo por id, y esa tabla tiene `organization_id`. Ahora recibe `organizationId`, lo incluye en el `where` y verifica el `returning`.
- **La justificación del `throw` es distinta de la de las siete de la 9.0.1, y el comentario del código no la repite.** Ahí el llamador leía la fila con `FOR UPDATE`; acá **no lee: crea**. `reserveEvent` inserta la fila en la misma transacción y devuelve su id, con el bloqueo del insert vigente hasta el commit, así que cero filas actualizadas no puede ser una carrera ni una fila ajena. Copiar el comentario habría puesto una razón falsa al lado de un código correcto — el defecto que la revisión de la 9.0.1 acababa de encontrar en este mismo linaje. Quedó fijado como decisión D-1 del brief **antes** de implementar, para no dejarlo al criterio del momento.
- **Evidencia de mutación por el estado, no por el mensaje.** Quitando el filtro, el caso nuevo falla con `expected 'failed' to be 'received'`: la fila de la otra organización efectivamente modificada y confirmada. La aserción de estado se evalúa antes que la del mensaje y la transacción se deja confirmar, como quedó el archivo tras la corrección de la 9.0.1.
- **Tests**: 781 de 781 — 302 unitarios, 79 de guardas y **400** de integración, uno más que la 9.0.1 — y 81 de 81 end-to-end, con typecheck, lint y formato limpios.

**No certifica:**

- **`ingestion.revokeCredential` sigue sin filtro de organización.** Es de la misma clase y queda **diferida por decisión de alcance**, no descartada: su id lo provee un operador que ya tiene acceso al script y a la base, así que el filtro no defendería de nadie que no haya pasado esa puerta. La condición que la reabre está escrita en [Risks](docs/planning/Risks.md) — que la revocación se exponga por HTTP o pase a manos no operativas. **Lo que hay que vigilar es esa condición, no la función.**
- **Nada estructural.** Igual que en la 9.0.1, la garantía la sostiene el código de cada función, no la base. RLS por organización sigue sin decidirse.
- **Una caída de proceso que no se explicó.** Un worker de Vitest murió con código 0xC0000409 corriendo `tests/integration/db-connectivity.test.ts`, y la suite lo reportó como 69 de 70 archivos **sin marcar ningún test como fallado**. No se reprodujo en tres corridas del archivo ni en tres de la suite completa. Se registra en vez de archivarse como intermitencia porque ese archivo prueba justamente que el proceso **no** se cae cuando la base corta una conexión. Queda en `HANDOFF.md` **sin subfase asignada**, con la hipótesis declarada como hipótesis.
- **Otras dos tandas de fallas de esa verificación no eran del repositorio y quedan escritas para no confundirlas**: cuatro tests de autenticación cayeron con `Connection terminated unexpectedly` por un build lanzado en paralelo —esos tests hashean contraseñas—, y dos corridas end-to-end se cortaron a los 66 y 31 casos con el contenedor de Postgres arriba más de dos horas; reiniciado, 81 de 81.

Detalle en [brief-9.0.4](docs/decisions/brief-9.0.4-aislamiento-de-la-escritura-de-ingestion.md).

---

## 2026-09-21 — 9.0.1: aislamiento por organización, y la primera revisión independiente dentro del ciclo

Cierre de subfase. Primera de la Fase 9, y primera vez en el proyecto que la revisión independiente corre **antes** del cierre y no después de uno ya publicado.

**Certifica:**

- **H-7 cerrado.** Las siete escrituras de datos de negocio que filtraban solo por id reciben `organizationId` y lo incluyen en el `where`; además verifican el `returning` y lanzan dentro de la transacción, que revierte. La serialización **no es igual en todas**: seis leen su fila con `FOR UPDATE` en la misma transacción y `updateMemberRole` se serializa por `withOrganizationLock`, porque `findMember` no usa `FOR UPDATE`.
- **H-1 acotado a un punto de entrada único**, con una forma distinta de la que [Risks](docs/planning/Risks.md) prescribía. Filtrar dentro de `auth` era **inviable**: no puede leer `organization_members` sin importar `organizations`, que ya importa `auth`, y la frontera de ESLint bloquea el ciclo. El filtro vive entonces del lado dueño de la membresía: `organizations.getMemberSummaries` interseca en SQL antes de leer.
- **Dos instrumentos nuevos.** Una guarda que impide a cualquier módulo fuera de `auth` y `organizations` acceder a `getUserSummaries`, con tres detectores —import con nombre, namespace y reexportación— y 16 casos; y un test de integración de aislamiento con un caso por escritura, que llama a los repositorios directamente porque por la interfaz pública la operación da `NOT_FOUND` y nunca llega a escribir. Esa excepción quedó registrada en [RepositoryStructure](docs/architecture/RepositoryStructure.md), con la aclaración de que no se hereda en `src/**`.
- **Tests**: 780 de 780 —302 unitarios, **79** de guardas y 399 de integración— y 81 de 81 end-to-end. Los 81 sin cambios respecto de la Fase 8 son la evidencia de que ninguna conducta visible se movió.
- **Recuento corregido, el cuarto de este linaje.** `HANDOFF.md` daba 62 guardas de línea base; eran **63**, como decía este changelog. La cifra equivocada era la del handoff.

**No certifica:**

- **Nada estructural para H-1.** La garantía pasó de siete llamadores a uno, no a una defensa de la base: la consulta de `auth` sigue sin filtro propio y un llamador dentro de `organizations` podría esquivarla. Lo estructural sería RLS, que exige un rol sin `BYPASSRLS` y **no está decidido**. La guarda fija el punto de entrada **contra el acceso literal, no contra toda vía posible**: su cabecera enumera lo que no cubre, incluido que `analytics` pueda importar `@/modules/*/schema` y leer `users` directo, frontera que cierra la 9.0.3.
- **La revisión independiente encontró cuatro defectos y los cuatro eran reales.** Ninguno falso, a diferencia de la primera revisión del proyecto. Dos estaban **en instrumentos que iban a quedar versionados**: el detector de la guarda nueva era ciego a tres formas de importación —una de ellas la que usa el test hermano del mismo commit—, y el ayudante del test de integración forzaba el rollback **siempre**, así que las siete aserciones sobre el estado de la base no podían fallar y solo discriminaba el mensaje de error. Los otros dos: la afirmación de que las siete escrituras usaban `FOR UPDATE`, que venía del brief y era falsa para una, propagada a tres archivos; y una promesa sobreescrita en el modelo de seguridad.
  - **El agujero del detector es la segunda vez**, después de `exposed-surface` en la 8.4, y la lección ya estaba escrita. Repetirla con la advertencia delante es el dato útil de este cierre.
- **Dos escrituras más de la clase de H-7 quedaron sin corregir**, en `ingestion`, registradas y elevadas según la condición de detención del brief en vez de arregladas por analogía. Su destino se decidió el mismo día: `finishEvent` a la 9.0.4, `revokeCredential` diferida.
- **El invariante de `ingestion_events` del brief estaba mal escrito**: lo declaró de solo inserción y [DataModel](docs/architecture/DataModel.md) dice que admite `UPDATE` de su estado. Manda DataModel.
- **La revisión tuvo solo acceso de lectura**, así que dos criterios de aceptación le quedaron como no verificables por lectura y la ejecución la respalda quien implementó. Es autoevaluación en esa parte, y se declara.

Detalle en [brief-9.0.1](docs/decisions/brief-9.0.1-aislamiento-por-organizacion.md).

---

## 2026-09-21 — Revisión independiente obligatoria en los gates, y `unaccent` con destino

No es un cierre: son los pendientes que la Fase 8 dejó abiertos, resueltos antes de abrir la Fase 9.

**Certifica:**

- **`unaccent` (búsqueda sin distinguir acentos) va a la Fase 9**, por decisión del usuario. Estaba asignada a la Fase 8 desde el [brief-4.4](docs/decisions/brief-4.4-ui-de-productos-e-inventario.md), ninguna de las cinco subfases la tomó y la fase cerró sin ella. Ahora está enumerada en el alcance de la Fase 9 en el [Roadmap](docs/planning/Roadmap.md), con el puntero de vuelta desde el brief-4.4 y **una condición escrita: tiene que aterrizar en una subfase concreta cuando la Fase 9 se descomponga.** Nombrar la fase es justamente lo que ya falló una vez.
- **Se corrigió una afirmación falsa del cierre de la Fase 8**: decía que `unaccent` había quedado "reasignada explícitamente" cuando en esa fecha seguía sin destino. Estaba escrita en la lista de lo que el cierre **no** certificaba, en la línea que se felicitaba por no silenciarla.
- **La revisión independiente pasa a ser obligatoria en toda subfase que abra o cierre un gate** ([ExecutionProtocol](docs/development/ExecutionProtocol.md) paso 4b y regla 6, y [CLAUDE.md](CLAUDE.md)). El motivo está medido, no supuesto: la primera del proyecto encontró **cuatro defectos** en la 8.4, que había fijado la escala de severidad antes de mirar y declarado su sesgo por escrito. **Declarar el sesgo no lo mitigó.** Quedan escritos sus dos límites: el revisor **informa, no aprueba** —sus hallazgos se verifican contra el código y un subagente nunca transporta autoridad del usuario—, y **corregir no es borrar**: un hallazgo invalidado se tacha con el mecanismo del error al lado.
- **`HANDOFF.md` quedó al día**: su encabezado seguía apuntando a `9658bf1` y listaba como pendiente de confirmar algo ya confirmado. Otra línea de estado que dejó de ser cierta, que es el defecto H-4 de la 8.4 por cuarta vez en el proyecto.

**No certifica:**

- **Que la regla nueva funcione.** La revisión independiente se usó **una sola vez, y después de cerrar la fase**. Dentro del ciclo, antes de cerrar —que es donde tiene que servir— todavía no se probó. La primera oportunidad real es la Fase 9.
- **Ningún cambio en `src/`, en las pruebas ni en el comportamiento.** Es documentación y método.

---

## 2026-09-18 — La 8.4, corregida por una revisión independiente

No es un cierre: es la corrección de uno ya publicado. Después de cerrada la Fase 8, un revisor que no participó del trabajo leyó la subfase 8.4 contra su brief y contra el código. Es **la primera revisión del proyecto que no es autoevaluación**, y encontró cuatro defectos. Los cuatro se verificaron contra el código antes de aceptarse.

**Certifica:**

- **H-2 era falso y queda retirado.** La 8.4 había registrado que el límite de intentos por IP no tenía ninguna prueba. El test existía desde antes: `tests/integration/auth-service.test.ts`, caso "20 fallos desde una IP bloquean también a otras cuentas", que además comprueba que otra IP sigue ingresando. El error vino de buscar los casos con un patrón que no ve la forma multilínea de `it(`, y de "confirmarlo" con una segunda búsqueda de una constante que el test no usa: **dos búsquedas ciegas a lo mismo, leídas como corroboración**. Es la falacia que el propio brief había escrito como hallazgo previo 7 —"contar no responde la pregunta"—, evitada en la dirección del falso positivo y no vista en la del falso negativo.
- **H-7, nuevo y mayor**: **siete funciones de repositorio escriben datos de negocio filtrando solo por id**, sin `organization_id` (`products` ×2, `clients` ×2, `organization_members`, `conversations` ×2). No son alcanzables hoy —los siete llamadores cargan la fila filtrada con `FOR UPDATE` antes de pasar el id—, pero la corrección que la 8.4 había hecho a `SecurityModel`, que declaraba `auth` como única excepción al aislamiento, **también era falsa**. `inventory.applyStockChange` muestra la forma correcta en este mismo código.
- **Dos recuentos corregidos.** "20 puntos de entrada" no salía de ninguna agrupación de su propia tabla, que suma **36** (15 páginas, 19 Server Actions, 2 Route Handlers), y el threat model lo usaba como evidencia. Y la tabla de veredictos del AC-1 **no demostraba el AC-1**: le faltaba la sección §Superficie expuesta, agregada por esa misma subfase, y sus dos totales daban 95 y 96. Ahora son 13 secciones y las dos sumas dan **104**.
- **Un agujero del instrumento**: la guarda `exposed-surface` solo detectaba `export function`, no `export const accion = async () => {}`, que Next acepta igual — y la mutación que la validó usó justamente la forma que sí detectaba. Detector ampliado, con un caso versionado por cada variante que antes se escapaba. Sobre el repositorio real el conjunto declarado no cambió: no existe ninguna acción escrita como constante. **Guardas 63/63.**
- **`Risks.md` abría con "Estado: diseñado. Ningún riesgo ha sido validado o descartado con evidencia real"** en un documento que ya tenía riesgos cerrados desde la Fase 1 y mediciones de la 8.5. Es el defecto H-4 que la 8.4 vino a corregir, en el archivo donde la 8.4 escribió sus hallazgos.
- **Nada se borró.** El texto de H-2 queda tachado en el brief con el mecanismo del error escrito al lado: borrarlo escondería que la revisión falló, que es el dato más útil de este cierre.
- **La escala de severidad estaba incompleta, y el gate se resolvió por ampliarla.** Los cuatro supuestos de "crítico" de la D-2 hablan solo de confidencialidad y autorización, así que **ningún defecto de disponibilidad podía alcanzar el umbral** — y sin embargo esa misma escala calificó la fila de denegación de servicio del threat model. Que H-3 fuera `mayor` no salió de mirar el código: salió de que la escala no tenía dónde ponerlo. Se agregó un quinto supuesto —**denegación de servicio total, no autenticada, barata y renovable**— más la regla de evaluar la severidad contra los entornos que existen y declararla condicional cuando depende del entorno.
  - **H-3 reevaluado**: `crítico` en cualquier entorno compartido, `mayor` en el único que existe hoy, una máquina de desarrollo de un usuario sin proxy ni adversario.
  - **El gate de la Fase 8 se ratifica, con una condición que antes no tenía**: H-3 pasa a ser **precondición bloqueante de la 9.1**. No se levanta ningún entorno compartido sin `TRUSTED_PROXY=true` contra un proxy real, o con el límite por IP desactivado. Si la 9.1 arranca sin eso, el hallazgo es crítico por la escala nueva y detiene la fase.
  - **Corrección a lo que se había reportado**: se dijo que la equivalencia "bloqueante = crítico-D-2" nunca se aprobó. **Era inexacto**: está escrita en la propia D-2 —"Crítico (bloquea el gate de la fase)"— y la D-2 se aprobó con el brief. El defecto era la enumeración, no la equivalencia.

**No certifica:**

- **Que esta resolución esté libre de sesgo.** La firma el mismo agente que definió la escala original, la aplicó a su propio trabajo y ahora la vuelve a aplicar, con un resultado que conserva su veredicto anterior. Lo que la hace algo más que eso es que concede que el instrumento estaba mal y agrega una condición bloqueante que antes no existía, las dos en contra de quien decide. Revocarla es una línea: declarar H-3 crítico sin condición de entorno reabre la Fase 8.
- **Que la 8.4 esté ahora completa.** Una segunda lectura encontró cuatro defectos en una revisión que se declaraba exhaustiva sobre 95 afirmaciones. Nada dice que una tercera no encuentre un quinto.
- **Ningún cambio en `src/`.** Lo único que cambió fuera de la documentación es la guarda y su test.

---

## 2026-09-18 — Fase 8 cerrada (Calidad, seguridad y observabilidad)

Cierra contra los criterios del [Roadmap](docs/planning/Roadmap.md), con las cinco subfases cerradas y CI en verde en cada commit.

> **Corregida el 2026-09-18 por una revisión independiente** (entrada de arriba): H-2 era falso y quedó retirado, apareció H-7, y los recuentos "95 afirmaciones" y "20 puntos de entrada" pasaron a 104 y 36. **El gate se ratifica**, sobre una escala de severidad ampliada con un supuesto de disponibilidad que le faltaba, y con H-3 convertido en precondición bloqueante de la 9.1.

**Certifica:**

- **Gate de salida alcanzado: revisión de seguridad sin bloqueantes** (8.4). Ningún hallazgo crítico abierto; los no críticos están en [Risks](docs/planning/Risks.md) con su plan, que es exactamente lo que el criterio de aceptación de la fase pedía.
- **Entregable de la fase**: `SecurityModel.md` verificado ítem por ítem — 95 afirmaciones con veredicto y evidencia, más las 6 filas del threat model.
- **Los requisitos no funcionales de seguridad, privacidad y rendimiento quedaron contrastados contra el código real**, que era el objetivo de la fase:
  - **8.1 Endurecimiento web**: CSP en enforce con nonce por request, sin `'unsafe-inline'` en ninguna directiva, más cuatro cabeceras de seguridad; el rechazo CSRF de las Server Actions pasó de confiarse al framework a estar demostrado. **Validado en integración.**
  - **8.2 Logs y privacidad**: los logs no llevan datos personales, verificado en tres capas; y el procedimiento de exportación y borrado existe como runbook de operador, con su límite declarado: la exportación es completa, el borrado es una **minimización**. **Validado localmente y en integración.**
  - **8.3 Dependencias**: la CI audita en cada ejecución con dos puertas de umbral explícito, y los cuatro avisos conocidos quedaron aceptados con condición de salida verificable en vez de silenciados. **Validado localmente y en CI.**
  - **8.4 Revisión de seguridad**: el gate de la fase, con tres hallazgos mayores registrados y ninguno crítico, más una guarda nueva que fija los 21 puntos de entrada que no son páginas. **Revisión declarada como autoevaluación.**
  - **8.5 Rendimiento de los listados**: once consultas medidas con `EXPLAIN (ANALYZE, BUFFERS)` sobre volumen sintético. **Ningún índice faltaba y ninguna consulta resultó patológica.** **Validado localmente.**
- **La deuda de medición más vieja del proyecto quedó saldada.** La matriz de trazabilidad decía desde la subfase **1.2** que "ninguna consulta se ejecutó: los índices se asignan por la forma de la consulta descrita, no por un plan real". Ya no lo dice.
- **Cuatro obligaciones que la fase se había asignado a sí misma y que ninguna subfase había tomado** se ejecutaron o se reasignaron con razón escrita (8.4 D-5 y D-6, 8.5 D-6): el rate limiting de ingestión y la minimización de FR-CLI-05 se verificaron; la IP real con proxy, la reevaluación de APM y la decisión de hosting pasaron a la Fase 9 y a la 9.1; las dos listas compuestas en memoria entraron en la 8.5.
- **Nivel de validación de la fase**: *validado localmente, más revisión de seguridad declarada como autoevaluación* — el que el Roadmap fijó, sin inferir ninguno superior.

**No certifica:**

- **Que el sistema sea seguro ni que escale.** Certifica que lo declarado se contrastó contra el código, con el veredicto de cada afirmación a la vista, y que ninguna consulta de listado es patológica con una organización de 10.000 filas por tabla en una máquina de desarrollo.
- **Revisión independiente**: las cinco subfases y su revisión las hizo el mismo agente. El Roadmap ya lo declaraba como riesgo de la fase y la fase no lo resolvió: lo declaró. *(El riesgo se materializó: una revisión independiente posterior encontró cuatro defectos en la 8.4 — ver la entrada del 2026-09-18 más arriba. Desde el 2026-09-21 esa revisión es obligatoria en toda subfase que abra o cierre un gate.)*
- **Nada que exija TLS, proxy real, entorno persistente o varias organizaciones**: HSTS, la cookie `__Host-` bajo TLS, `TRUSTED_PROXY`, los backups y su restauración, el gestor de secretos, la conexión con el rol `crm_app` y los planes de consulta con varias organizaciones. Todo eso es Fase 9 y está nombrado, no omitido.
- **Los tres hallazgos mayores de la 8.4**, que quedan abiertos con su plan: el bloqueo global del ingreso sin proxy de confianza, ~~la falta de prueba del límite por IP~~ y la lectura de usuarios sin filtro de organización. *(Corregido el 2026-09-18: el segundo era falso y quedó retirado; en su lugar hay otro, H-7, que esta revisión no había visto. Siguen siendo tres.)*
- **Búsqueda sin distinguir acentos** (`unaccent`): estaba asignada a la Fase 8 en [brief-4.4](docs/decisions/brief-4.4-ui-de-productos-e-inventario.md) y ninguna subfase la tomó. Detectada en el preflight de este cierre y **elevada al usuario sin destino, no silenciada**. *(Esta línea decía "reasignada explícitamente" y era falsa: en la fecha de este cierre la obligación seguía sin destino. Se reasignó a la Fase 9 el 2026-09-21, por decisión del usuario.)*

---

## 2026-09-18 — Subfase 8.5 cerrada (Rendimiento de los listados)

**Certifica:**

- **Las consultas de listado de las Fases 4 y 5 quedaron medidas con planes reales**, según el [brief-8.5](docs/decisions/brief-8.5-rendimiento-de-listados.md), con D-1 a D-6 resueltas según la recomendación. **El umbral se fijó antes de medir** (200 ms por consulta, 400 ms por camino completo), igual que la 8.4 fijó la severidad antes de revisar.
- **Ningún índice faltaba.** Con un filtro selectivo el planificador elige los cinco índices que la matriz daba por buenos "por la forma de la consulta": los dos de `products`, los dos de `clients` y el de historial de `inventory_movements`, este último también como *Index Only Scan* para el total. **D-5 no se activó: `src/` no se tocó.**
- **El seed de volumen se extendió** a 10.000 productos, 8.563 saldos, 37.967 movimientos y 500 miembros, en 8,2 s. Es determinista e idempotente —la segunda corrida devuelve los mismos siete conteos sin error— y la idempotencia sobre `inventory_movements` es por id, nunca por `UPDATE`, que el trigger rechazaría. Cuatro comprobaciones de consistencia dan cero filas en falta: el saldo coincide con la suma de sus movimientos y con el último `balance_after`, y ningún `balance_after` es negativo.
- **Medir solo el plan habría dado un informe falso.** La lista de stock tarda **4,5 ms en la consulta y 133 ms en el camino completo**: el 96 % del tiempo ocurre después del `EXPLAIN`, en la composición en memoria. Fue la razón de decidir, antes de medir, que el umbral cubriera el camino completo y no solo la consulta.
- **Los tres límites aceptados de [Overview](docs/architecture/Overview.md) se midieron en o por encima de su condición de revisión**: la lista de stock con 10.000 productos (cinco veces su límite de 2.000), la de miembros con 500 (su límite exacto) y la de clientes por última interacción con 10.000. Los tres se sostienen: 133 ms, 8,7 ms y 53,6 ms.
- **Cuatro recorridos secuenciales registrados aunque cumplieran el tiempo**, por decisión de D-1: son consultas sin filtro selectivo sobre tablas de ~10.000 filas, donde recorrerlas enteras corresponde. El caso a vigilar —la última página de clientes por nombre, 24,7 ms— tiene su costo en el orden y crece con el total, y queda en [Risks](docs/planning/Risks.md) para medirlo con datos de staging.
- **El hash de contraseña se calcula una vez y lo comparten los 500 usuarios sintéticos**, declarado en el seed: hashear 500 contraseñas con los parámetros de producción habría costado más que toda la medición, y este seed no prueba autenticación.
- **Tests**: 62 de 62 de guardas, 302 de 302 unitarios y 390 de 390 de integración, sin escribir ni modificar ningún test — la suite ya ejercitaba el seed de volumen, así que la extensión quedó cubierta por tests existentes.

**No certifica:**

- **Que el sistema escale**: una organización, 10.000 filas por tabla, una máquina de desarrollo. Medir con **varias organizaciones** sigue siendo Fase 9, y la 6.3 ya había registrado que con una organización dueña de casi todas las filas el planificador no se comporta como lo hará en producción.
- **Ningún objetivo de latencia productiva**: los umbrales son criterios de detección de patologías, no un SLA.
- **El comportamiento con volúmenes mayores**: lo medido cubre el límite escrito en la NFR y las tres condiciones de revisión de `Overview`, y nada dice sobre 100.000 productos.
- **Las pantallas**: se midieron los servicios, no el render ni la carga completa de la página.

## 2026-09-18 — Subfase 8.4 cerrada (Revisión de seguridad)

**Certifica:**

- **`SecurityModel.md` y su threat model contrastados contra el código real**, afirmación por afirmación, según el [brief-8.4](docs/decisions/brief-8.4-revision-de-seguridad.md), con D-1 a D-6 resueltas según la recomendación. De **95 afirmaciones**: 73 `verificado` con test, guarda o medición citada; 11 `verificado-por-lectura`, distinguidas a propósito porque nada las fija; 6 `parcial` o con hallazgo; 6 `no-verificable-aquí` por necesitar TLS, proxy real o entorno persistente, con destino Fase 9. El vocabulario de veredictos y el criterio de severidad **se fijaron antes de mirar** (D-2): definirlos al final los habría ajustado, sin mala intención, al resultado encontrado.
- **Veredicto del gate de salida de la Fase 8: sin bloqueantes.** Ningún hallazgo alcanza el umbral de crítico —acceso o modificación cross-organización, un `viewer` ejecutando una operación de `admin`, credenciales expuestas, u operar sin sesión algo que la exija—. Quedan tres hallazgos mayores y tres menores, todos en [Risks](docs/planning/Risks.md) con su plan, como pide el Roadmap.
- **Inventario de la superficie expuesta**: 36 puntos de entrada revisados uno por uno —13 páginas autenticadas, 2 del ingreso, 15 Server Actions con sesión, 2 previas a la sesión, 2 públicas a propósito y 2 Route Handlers—, con su exigencia y cómo se resuelve. Incorporado a `SecurityModel`, que no lo tenía. *(El recuento decía 20 hasta la corrección del 2026-09-18; esta misma enumeración siempre sumó 36.)*
- **Tres hallazgos mayores, ninguno explotable hoy y los tres registrados sin arreglar**, porque la D-3 solo autorizaba corregir documentación y hallazgos críticos:
  - **H-3**: mientras `TRUSTED_PROXY` no sea `true` —hoy, en todos los entornos— la clave de IP del límite de ingreso es la misma para todas las peticiones, así que **20 ingresos fallidos de cualquiera, en cualquier cuenta, bloquean el ingreso de todos** durante la ventana. El mecanismo estaba documentado; su consecuencia no. En esa configuración el límite por IP es también un vector de denegación de servicio, más barato que el que pretende frenar;
  - ~~**H-2**: el límite por IP (20/15 min) **no tiene ninguna prueba**; el de cuenta (5/15 min) sí. Era la única defensa declarada del ingreso sin evidencia;~~ **falso, retirado el 2026-09-18**: el test existía desde antes y lo encontró la revisión independiente. En su lugar queda **H-7**, siete escrituras de datos de negocio que filtran solo por id;
  - **H-1**: `findUserSummaries` lee `id`, `name`, `email` e `isActive` de cualquier usuario por id **sin filtro de organización**, contra la afirmación de que todo repositorio recibe `organization_id`. No es alcanzable: sus cinco llamadores pasan ids de filas ya filtradas. La garantía vivía en el llamador y no en el repositorio, y la afirmación general se corrigió con la excepción escrita.
- **Rate limiting verificado en sus dos puntos** (obligación que `SecurityModel` y el Roadmap asignaban a esta fase): ingreso por cuenta e ingestión por credencial, citando los tests que ya existían; ~~el de IP queda como H-2~~ — **el de IP también tenía su test y no se lo encontró** (corregido el 2026-09-18).
- **Minimización de FR-CLI-05 revisada**: `clients` almacena `display_name`, `phone_e164` (opcional) y `notes`, y ningún otro campo personal, ni declarado ni de hecho. El requisito se cumple en el almacenamiento y no solo en la pantalla. `TraceabilityMatrix` queda cerrada en esa fila.
- **Threat model con veredicto por fila**, diciendo **cómo** se comprobó cada mitigación: una mitigación diseñada y una probada no son lo mismo y la tabla no las distinguía. Se sumó además qué **no** cubre ese modelo: atacante con acceso a la base o al servidor, cadena de suministro más allá de la auditoría de dependencias, y abuso por un `admin` legítimo de su organización.
- **Un recuento no habría servido, y queda escrito por qué**: `analytics` mostraba 14 funciones exportadas contra 1 `authorize(` y `inventory` 10 contra 1, y las dos son falsas alarmas —las doce métricas pasan por `withPeriod`, que autoriza en su primera línea, y las lecturas de inventario delegan en `catalog`, que autoriza antes de leer un saldo—. La autorización por delegación es correcta e invisible para cualquier instrumento que cuente.
- **Instrumento permanente** (D-4), uno solo y no tres: `tests/guards/exposed-surface.test.ts` declara los 21 puntos de entrada que no son páginas con su exigencia, exige una razón escrita a lo público y prohíbe que algo bajo `(autenticado)` se declare público. **Evidencia de mutación**: una Server Action nueva en un archivo real hace fallar la guarda nombrándola. Su cabecera dice qué **no** comprueba —que la exigencia declarada se cumpla— y por qué reducirlo a un patrón de texto sería mentir.
- **Obligaciones de fase que flotaban, ahora asignadas** (D-5 y D-6): la IP real con proxy pasó de "Fase 8 o 9" a **Fase 9**; las dos listas compuestas en memoria —miembros y clientes por última interacción— entran en la **8.5**; la reevaluación de APM y tracing pasa a la **Fase 9**, porque pide evidencia que sin entorno desplegado no existe; y la decisión de hosting dejó de decir "Fase 8/9" para quedar en la **9.1**. Una obligación que cabe en dos fases no se cumple en ninguna.
- **Dos líneas de estado corregidas**: `SecurityModel.md` y `NonFunctionalRequirements.md` decían "Estado: diseñado" mientras media docena de secciones citaba implementaciones validadas en integración.
- **Tests**: 62 de 62 de guardas (antes 49), 302 de 302 unitarios y 390 de 390 de integración, sin modificar ningún test existente y sin tocar `src/`.

**No certifica:**

- **Que no existan defectos de seguridad.** Certifica que 104 afirmaciones se contrastaron contra el código y que los 36 puntos de entrada se revisaron uno por uno, con el veredicto de cada uno a la vista.
- **Revisión independiente**: es autoevaluación del mismo agente que escribió lo revisado. El Roadmap ya lo anticipaba como riesgo de la fase y esta subfase no lo compensa, solo lo declara.
- **Lo que necesita TLS, proxy real o entorno persistente**: HSTS, la cookie `__Host-` bajo TLS, `TRUSTED_PROXY` con un proxy de verdad, los backups y su restauración, el gestor de secretos y la conexión con el rol `crm_app`. Seis afirmaciones quedan `no-verificable-aquí`, con destino Fase 9.
- **Que la guarda de superficie verifique la autorización**: comprueba que nada aparezca sin declararse, no que lo declarado se cumpla. Tampoco ve un archivo sin versionar, porque recorre `git ls-files`.
- **Que los tres hallazgos mayores estén resueltos**: están registrados con su plan y su decisión pendiente, no corregidos.
- **Ningún nivel de validación subió** por esta revisión: revisar no valida.

## 2026-09-18 — Subfase 8.3 cerrada (Dependencias)

**Certifica:**

- **La CI audita las dependencias en cada ejecución**, según el [brief-8.3](docs/decisions/brief-8.3-dependencias.md), con D-1 a D-5 resueltas según la recomendación. Son **dos puertas con el umbral escrito en el comando**, inmediatamente después de instalar y sin `continue-on-error`:
  - `npm audit --omit=dev --audit-level=high` sobre lo que se despliega;
  - `npm audit --audit-level=critical` sobre el árbol completo, que incluye las herramientas de desarrollo.

  La separación es deliberada: una vulnerabilidad que llega a un usuario y una que corre en la máquina de quien desarrolla no merecen el mismo umbral. El umbral va explícito para no heredar el valor por defecto de npm, que puede cambiar entre versiones.

- **Producción no arrastra ninguna vulnerabilidad conocida** (medición del 2026-09-18): `npm audit --omit=dev` informa cero de cualquier severidad. Por eso la puerta estricta sale gratis donde de verdad importa.
- **Los cuatro avisos moderados conocidos quedan aceptados por escrito, no silenciados** (D-2): la cadena `drizzle-kit` → `@esbuild-kit/esm-loader` → `@esbuild-kit/core-utils` → `esbuild`, toda de `devDependencies`. Siguen visibles en la salida de la auditoría; no se agregó lista de excepciones, ni `overrides`, ni se corrió `npm audit fix`, cuyo arreglo es bajar `drizzle-kit` a 0.18.1, un major hacia atrás. Registrados en [Risks](docs/planning/Risks.md) **con condición de salida verificable**: desaparecen al adoptar Drizzle Kit 1.0, que reemplaza `@esbuild-kit/esm-loader` por `jiti` y declara `esbuild ^0.25.10`.
- **La condición de salida se verificó sobre las versiones reales del registro.** El brief citaba una `1.0.0-rc.5` que **no existe con ese nombre**: la línea 1.0 solo publica prelanzamientos con sufijo de commit (`rc` → `1.0.0-rc.4`, `rc5` → `1.0.0-rc.5-5935859`) y `latest` sigue siendo `0.31.10`. La conclusión no cambió, pero ahora los identificadores son comprobables con un comando.
- **Evidencia de mutación, con efecto**: con el umbral bajado a `moderate`, la auditoría falla con los cuatro avisos a la vista y sale en código 1. Sin esa corrida, un paso que siempre pasa es indistinguible de uno que no mira nada. El umbral mutado no se commiteó y la salida quedó en el brief.
- **El paso de guardas dejó de mentir** (D-5): se llama "Guardas del repositorio" a secas. Nombraba dos de las cuatro guardas y ya se había desactualizado dos veces; el detalle de cuáles son vive en `tests/guards/` y en [EngineeringStandards](docs/development/EngineeringStandards.md), no en el nombre de un paso.
- **Dos correcciones de documentación que la ejecución destapó**: la lista de pasos de CI de EngineeringStandards tenía el orden equivocado —ponía el control de desfase de migraciones después de lint, cuando en `ci.yml` va inmediatamente tras `npm ci`—, y la descripción de las guardas mencionaba dos de cuatro. Ninguna era un defecto de comportamiento: eran documentación citable y equivocada.
- **Sin dependencias nuevas y sin tocar el lockfile**: `package.json` y `package-lock.json` quedaron fuera de los archivos autorizados a propósito, para que la subfase no pudiera volverse una actualización de dependencias encubierta.
- **Tests**: 49 de 49 de guardas y 302 de 302 unitarios, sin modificar ningún test. Ningún paso existente de la CI cambió de comportamiento.

**No certifica:**

- **Que el proyecto esté libre de vulnerabilidades.** Una auditoría compara un lockfile contra una base de avisos **en un momento dado**, y esa base cambia sin que el proyecto cambie. Lo que la CI garantiza es que se vuelve a comprobar en cada ejecución, no que el resultado de hoy siga valiendo mañana.
- **Que un aviso alto en una herramienta de desarrollo frene la CI**: la puerta del árbol completo está en `critical` por decisión de D-1. Queda escrito en [Risks](docs/planning/Risks.md) como consecuencia conocida, no descubierta.
- **Que la auditoría impida un merge**: sin protección de rama, la CI informa y no bloquea. Es la limitación ya aceptada, y la política no promete más que eso.
- **Actualización automática de dependencias** (Dependabot o Renovate), SBOM y verificación de procedencia de paquetes: fuera de alcance por D-4, registrados como mejora posterior.
- **Adoptar Drizzle Kit 1.0**: es un cambio de versión mayor con su propia revisión, que además exige convertir `drizzle/` con `drizzle-kit up`. Esta subfase solo fijó la condición.
- **Revisión independiente**: es autoevaluación del mismo agente. El usuario aprobó el brief con sus cinco recomendaciones y autorizó el cierre.

## 2026-09-18 — Subfase 8.2 cerrada (Logs y privacidad)

**Certifica:**

- **Los logs no contienen datos personales ni contenido de conversaciones**, según el [brief-8.2](docs/decisions/brief-8.2-logs-y-privacidad.md), con D-1 a D-4 resueltas según la recomendación. La evidencia está en tres capas, cada una con su nivel declarado:
  - **unitaria**: el formateador arma el JSON campo por campo, así que un dato fuera de `LogEvent` no puede salir. Se sumaron teléfono, nombre, notas y cuerpo de mensaje a los casos, y un error de unicidad de PostgreSQL cuyo mensaje trae el teléfono —el caso realista, porque el teléfono es único por organización— que se registra reducido a `{ name, code }`;
  - **guarda** (`tests/guards/log-surface.test.ts`, nueva): en `src/`, solo el módulo de log usa `console.*`, con dos excepciones declaradas por nombre en `src/shared/db/`; y ningún `route` de un evento se arma interpolando ni concatenando, porque una ruta armada con datos los mete en el log. La guarda también comprueba que las dos excepciones siguen existiendo y siguen usando `console.*`, para que la lista no mienta;
  - **integración** (`tests/integration/log-privacy.test.ts`, nueva): contra PostgreSQL real, el módulo de dominio no escribe nada en consola ni al crear ni al rechazar, la línea que registra la acción no lleva datos personales en ninguno de los tres rechazos, y un error inesperado que sí trae el teléfono en su mensaje se registra sin él.
- **No se duplicó evidencia existente**: el camino de ingestión ya estaba cubierto por el caso 12 de `ingestion-http.test.ts` (6.5.3), que manda eventos reales con teléfono y cuerpo. Lo que faltaba era el camino de la UI, y ahí fue el test nuevo.
- **Qué registra el proceso además de la aplicación** (medición local, los dos modos): `next start` —el modo con el que corre un entorno desplegado— **no registra las peticiones**, así que una URL como `/clientes?q=<teléfono>` no llega a ningún log. **`next dev` sí las registra con la query completa**, así que la terminal de una máquina de desarrollo puede quedar con el teléfono que alguien buscó. Registrado en [SecurityModel](docs/architecture/SecurityModel.md) y en [Risks](docs/planning/Risks.md), sin corregir: la condición de detención del brief lo mandaba elevar, no arreglar.
- **Procedimiento de exportación y eliminación de los datos de un cliente**, como runbook de operador ([docs/runbooks/datos-de-un-cliente.md](docs/runbooks/datos-de-un-cliente.md)) con dos scripts en `scripts/`, sin pantalla:
  - **exportación completa**: `clients`, `conversations`, `messages` con su cuerpo y `audit_logs` con los valores anteriores. `ingestion_events` queda fuera porque no tiene datos personales, y el propio archivo lo declara en su campo `excluded`;
  - **eliminación parcial, nombrada como minimización y no como eliminación** (D-3). Un cliente sin conversaciones se borra de verdad. Uno con conversaciones **no se puede borrar con ningún rol**: la 8.2 confirmó ejecutándolo que la cadena está cerrada —`messages` rechaza `DELETE` y `UPDATE` por trigger, y las claves foráneas hacia `conversations` y `clients` son `ON DELETE RESTRICT`—, y tampoco se puede anonimizar. Para ese caso el procedimiento vacía teléfono, nombre y notas de la ficha y declara qué queda retenido;
  - **la ejecución no se audita en la base**, a propósito: auditar la minimización volvería a escribir el teléfono y las notas en el `diff` de `audit_logs`, que es de solo inserción, deshaciendo su propio efecto. Un test fija que la cantidad de entradas de auditoría no cambia al minimizar.
- **Los dos casos se probaron por separado**, porque son distintos: con conversaciones y sin conversaciones. Un cliente sin conversaciones pero con cambios auditados tampoco queda del todo limpio, y el runbook lo dice.
- **Evidencia de mutación**, las dos con efecto: quitar la reducción del error hace fallar el test de privacidad con el teléfono a la vista; un `console.log` y un `route` interpolado en un archivo real hacen fallar las dos reglas del recorrido de la guarda.
- **Tests**: 741 de 741 unitarios, de guardas y de integración (antes 707), y 81 de 81 end-to-end sin modificar ningún spec.

**No certifica:**

- **Borrado real** de un cliente con conversaciones: no es posible sin revisar el [ADR 0013](docs/decisions/0013-rol-de-aplicacion-y-tablas-de-solo-insercion.md). Es una subfase propia si el negocio lo exige, registrada en [Risks](docs/planning/Risks.md).
- **Los procedimientos contra datos reales**: se ejercitaron con datos sintéticos en la base de test. Un procedimiento de borrado no está probado de verdad hasta correrse en un entorno con datos reales y backups (Fase 9). El runbook lo dice en su encabezado.
- **La política de retención de mensajes**, que es lo que podría vencer los cuerpos retenidos: pendiente de definición de negocio, Fase 9.
- **Que no exista PII en ningún log de ningún entorno**: lo verificado son los caminos de la aplicación y los dos modos del servidor en local. Un proxy, un balanceador o un agregador de logs de un despliegue no están en este alcance.
- **Alias de npm para los dos scripts**: se invocan con `npx tsx scripts/…`, porque `package.json` no estaba entre los archivos autorizados.
- **Revisión independiente**: es autoevaluación del mismo agente. El usuario aprobó el brief, confirmó los dos desvíos y aprobó el cierre.

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
