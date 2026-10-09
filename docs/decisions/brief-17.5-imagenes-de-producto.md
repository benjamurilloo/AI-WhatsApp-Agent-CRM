---
schema: task-brief.v1
task_id: "17.5"
task_type: implementation
generated_at: 2026-10-09
---

# Brief 17.5 — Imágenes de producto

- **Contrato**: `task-brief.v1`
- **Tipo de tarea**: `implementation`
- **Nivel de evidencia objetivo**: `deterministic` para el esquema, el procesamiento, la subida y la ruta que sirve, contra PostgreSQL real; `producer-consumer` para la pantalla (end-to-end sobre `next start`); `isolated-runtime` para el despliegue, el aviso de 1 GB provocado a propósito y el recorrido del usuario.
- **Nivel de validación alcanzable**: **validado localmente y en CI**, **validado en integración** para la pantalla, y **desplegado en producción** con la revisión del usuario. No es «preparado para producción».
- **Orden**: quinta subfase de la Fase 17 ([Roadmap](../planning/Roadmap.md) §Fase 17), después de la 17.4, cerrada el 2026-10-09. Implementa el [ADR 0018](0018-imagenes-de-producto.md), aceptado el 2026-10-08.
- **No abre ni cierra gate.** Agrega la primera ruta del CRM que acepta archivos y el primer Route Handler con sesión: la revisión independiente se recomienda (D-13).
- **Estado de este documento**: **aprobado el 2026-10-09** por el usuario, con las recomendaciones de D-1 a D-13. La tarea 17.5, `3f4702be6f4e811b854ed33d9a6ca866`, está en «En proceso» en Notion desde ese día.

## Objetivo

Que cada producto pueda tener **una imagen principal**, que un `admin` sube, reemplaza y quita, y que la lista y la ficha muestran, con las decisiones del ADR 0018: guardada en PostgreSQL, procesada en el servidor sin metadatos, servida desde el mismo origen con sesión, y con un aviso automático si la base pasa de 1 GB.

## Lo que se verificó antes de escribir este brief

Releído o medido el 2026-10-09:

- **El ADR 0018 deja abiertas para este brief** (§Decisión, puntos 3, 4, 5 y 8, y §Consecuencias; [brief-17.3](brief-17.3-adr-de-las-imagenes.md) §Cierre): el formato guardado (WebP o JPEG), Server Action o Route Handler para subir, el aviso del umbral, la concurrencia, el límite de tasa, las imágenes animadas, si el ejercicio de restauración compara hashes y el aviso en pantalla sobre personas en las fotos.
- **Producción**, por `ssh crm-production`, solo lectura: la base ocupa **10 MB**; el disco, 48 GB con el 9 % usado; el droplet tiene **1 CPU y 1967 MB** de memoria.
- **`sharp` 0.35.5** está instalada como dependencia de `next` 16.3.8 (`npm ls sharp`), no del proyecto.
- **Límites de cuerpo hoy**: `next.config.ts` no fija `serverActions.bodySizeLimit` (rige 1 MB, global a todas las acciones); `nginx-crm-production.conf` tiene una sola `location /`, sin `client_max_body_size` (rige 1 MB). Next bufferiza el cuerpo de toda petición que pasa por `proxy.ts` hasta `proxyClientMaxBodySize`, 10 MB por defecto (`config-shared.d.ts`); el `matcher` de `proxy.ts` cubre todas las rutas salvo los estáticos.
- **No existe ningún Route Handler con sesión.** Los 11 que hay son de ingestión, lectura y salud, sin cookies. SecurityModel exige verificar `Origin` explícitamente en todo Route Handler que escriba con la sesión; el helper previsto desde la 3.4 nunca se escribió. La guarda `tests/guards/exposed-surface.test.ts` clasifica cada entrada como `sesion`, `previo-a-la-sesion` o `sin-sesion`.
- **La CSP** es `img-src 'self'` ([`src/proxy.ts`](../../src/proxy.ts)), y `nosniff` ya va en todas las respuestas.
- **El aviso de vida** ([deploy/production/README.md](../../deploy/production/README.md) §Monitoreo): Healthchecks.io alerta por email y Telegram si un trabajo no avisa a tiempo; `crm-heartbeat.sh` acepta una lista cerrada de trabajos (`backup`, `offsite`, `restore-check`) y lee sus URLs de `/etc/crm-production/heartbeat.env`. El disco y la memoria tienen alertas de DigitalOcean al 80 % y al 90 %.
- **El ejercicio de restauración** compara el conjunto de tablas y el recuento de cada una contra el manifiesto; **no compara ningún valor** (`crm-restore-check.sh`, comentario de límites).
- **La auditoría** ya tiene la entidad `product`; el historial de la ficha la muestra en castellano.

### Hallazgos

- **H-1. Una Server Action con un límite mayor lo sube para todas, y antes de la sesión.** Next lee el cuerpo de una acción antes de que el código compruebe la sesión, así que subir `bodySizeLimit` a 6 MB deja que cualquiera, sin ingresar, mande 6 MB a cualquier acción. Un Route Handler puede comprobar la sesión, el rol y el `Origin` **antes de leer el cuerpo**, y nginx puede subir el límite solo para su dirección.
- **H-2. Guardar una sola versión en JPEG evita convertir en cada lectura del agente.** El agente necesita JPEG (ADR 0018, §Lo que contestó el agente). Si se guarda WebP, la ruta posterior del agente decodifica y recodifica en cada pedido, en un droplet de 1 CPU; si se guardan las dos, el espacio casi se duplica. Un JPEG a 1600 px ocupa más que un WebP de la misma calidad, del orden de un 25 a un 35 % (estimación de la literatura del formato; la implementación lo mide con imágenes de prueba).
- **H-3. Un PNG con transparencia no tiene equivalente en JPEG**: hay que elegir un fondo. Un catálogo de productos suele usar blanco.
- **H-4. El aviso de 1 GB encaja en el aviso de vida que ya existe** si se invierte: un trabajo diario que **termina bien solo mientras la base está bajo el umbral**. Pasado el umbral, el aviso no llega y Healthchecks.io alerta por los mismos canales. No hace falta una herramienta nueva, pero sí un chequeo nuevo en Healthchecks.io, que crea el usuario.

## Decisiones

Cada una lleva una recomendación. El usuario aprueba, cambia o rechaza.

### D-1 — El formato guardado

- **(a) Recomendada: una sola versión en JPEG** (H-2): RGB en sRGB, sin metadatos, lado mayor de **1600 px**, calidad del orden de 80, y una **miniatura JPEG de 400 px** de lado mayor. Una imagen con transparencia se aplana sobre **blanco** (H-3). La ruta que sirve responde `image/jpeg`. **Enmienda el ADR 0018**, puntos 4 y 5 («WebP», «`image/webp`»), tal como el ADR delega en este brief; la enmienda se escribe en el ADR con su fecha.
- (b) Guardar WebP, y que la ruta del agente genere el JPEG en cada pedido.
- (c) Guardar las dos versiones.

### D-2 — Cómo se sube

- **(a) Recomendada: un Route Handler con sesión**, `PUT /productos/{productId}/imagen`, con el archivo como cuerpo (sin `multipart`). En este orden, **antes de leer el cuerpo**: la sesión, el rol `admin`, el `Origin` igual al del CRM (un helper nuevo, el que SecurityModel prevé desde la 3.4), el producto de la organización, y `Content-Length` presente y de hasta 5 MB. Después lee el cuerpo **con un tope que corta en 5 MB** aunque `Content-Length` mienta. **nginx sube `client_max_body_size` a 6 MB solo para esa dirección**; el resto sigue en 1 MB. La pantalla la llama con `fetch` desde un componente de cliente.
- (b) Una Server Action con `bodySizeLimit` de 6 MB para todas las acciones (H-1).

**Quitar la imagen** es una Server Action, como el resto de las escrituras de la ficha: no lleva cuerpo grande.

### D-3 — Dónde vive

**Recomendación**: una tabla nueva del módulo `catalog`, **`product_images`**: `id`, `organization_id`, `product_id`, `position` (`smallint`, con `CHECK (position = 0)` mientras haya una sola imagen; la galería cambia el `CHECK`, no los datos), `image` y `thumbnail` (`bytea`), `sha256` (del JPEG guardado, en hexadecimal), `width`, `height`, `created_at` y `created_by`. Clave foránea compuesta `(organization_id, product_id)` a `products`, como el resto del catálogo; único `(organization_id, product_id, position)`; `CHECK` de tamaño en las dos columnas (por ejemplo, 2 MB la imagen y 200 KB la miniatura, por encima de lo que produce el procesamiento) y del formato de `sha256`. `crm_app` tiene `SELECT`, `INSERT` y `DELETE`, **sin `UPDATE`**: reemplazar es borrar e insertar en una transacción. Listar o buscar productos no lee esta tabla.

### D-4 — El procesamiento

**Recomendación**:
- **Formato por contenido**: `sharp` lee la cabecera y solo acepta JPEG, PNG y WebP. Nunca SVG, aunque llegue con otra extensión.
- **Tope de píxeles al decodificar: 40 megapíxeles** (`limitInputPixels`), por encima de las fotos comunes de un celular. La implementación **mide el pico de memoria** del proceso con una imagen de 40 MP; si pasa de 400 MB, se detiene y se consulta (§Condiciones de detención).
- **Animadas o de varios cuadros: se rechazan**, con un mensaje que lo dice (D-5 del ADR, §Consecuencias). Reducirlas al primer cuadro guardaría una imagen que el usuario no eligió.
- **Concurrencia**: `sharp.concurrency(1)` y **un procesamiento a la vez** en el proceso, con una espera corta; si hay otra subida en curso más allá de esa espera, responde `503` con `Retry-After` y la pantalla pide reintentar. El droplet tiene 1 CPU.
- La orientación EXIF se aplica antes de quitar los metadatos, para que la foto no quede girada.

### D-5 — El límite de tasa

**Recomendación**: **20 subidas por usuario cada 10 minutos**, contadas sobre la auditoría, que ya registra cada subida con su autor y su hora: sin tabla nueva. Pasado el límite, `429` con `Retry-After`. Cubre a un `admin` con la sesión robada o un script mal hecho, no a un ataque distribuido, que ya acota el ingreso.

### D-6 — Cómo se sirve

**Recomendación**: `GET /productos/{productId}/imagen` y `GET /productos/{productId}/imagen/miniatura`, Route Handlers con sesión (`viewer` o `admin`), que leen solo la imagen del producto de la organización de la sesión. La pantalla las pide con `?v={sha256}`: la respuesta lleva `Content-Type: image/jpeg`, `Cache-Control: private, max-age=31536000, immutable` y el `ETag` del hash, así que reemplazar la imagen cambia la dirección. Si el producto no tiene imagen, o es ajeno, o no existe, `404` sin cuerpo, sin distinguir. **La CSP no cambia.** Límite declarado en el ADR: la copia queda en la caché del navegador después de cerrar la sesión.

### D-7 — La pantalla

**Recomendación**:
- **La ficha del producto** muestra la imagen principal, o un recuadro vacío con el ícono del producto si no tiene. Un `admin` ve «Subir imagen», «Reemplazar» y «Quitar» (con confirmación). Al elegir el archivo, la pantalla avisa el tamaño máximo y los formatos, y **una línea fija dice que la foto es del producto y no debe mostrar personas** (ADR 0018, punto 8).
- **La lista** muestra la miniatura a la izquierda del nombre, o el mismo recuadro vacío, en el tamaño de una fila.
- **El alta no lleva imagen**: se sube desde la ficha, una vez creado el producto. Así el alta no cambia y no hay un archivo sin producto.
- Un `viewer` ve la imagen y la miniatura, sin controles.

### D-8 — Auditoría, borrado y retención

**Recomendación**: subir, reemplazar y quitar se auditan como `update` del producto, con el campo `image` y, como valor, el hash corto y el tamaño en KB («a1b2c3d4, 182 KB»), **nunca los bytes**. Desactivar un producto no borra su imagen. La exportación y el vaciado de los datos de un cliente de la 13.4 no cambian.

### D-9 — El aviso de 1 GB

- **(a) Recomendada: un trabajo diario que solo avisa mientras la base está bajo 1 GB** (H-4). Una unidad nueva, `crm-db-size.service`, sin red y con el usuario `postgres`, la dispara el `OnSuccess=` del backup: consulta `pg_database_size` y **termina con error si pasa de 1 GB**. Su `OnSuccess=` es `crm-heartbeat@db-size.service`, un trabajo nuevo de la lista cerrada de `crm-heartbeat.sh`. Si el aviso no llega, Healthchecks.io alerta por email y Telegram, como con el backup. El umbral se puede bajar por una variable para **provocar la alerta** en el despliegue, como se midió la alerta de disco en la 13.3.
- (b) Un aviso en la pantalla de inicio de un `admin`: nadie lo ve si no entra.
- (c) Solo la alerta de disco al 80 %, como hasta ahora.

El usuario crea el chequeo en Healthchecks.io y escribe su URL en `heartbeat.env` (efecto externo, en la 17.5.2).

### D-10 — El ejercicio de restauración

**Recomendación**: suma **una comprobación de contenido para esta tabla**: en la base restaurada, cada fila de `product_images` cumple `encode(sha256(image), 'hex') = sha256`. No compara contra el origen, que cambia con el tráfico, sino **cada imagen contra su propio hash**, guardado al subirla: una imagen corrupta en el dump falla el ejercicio. PostgreSQL 18 trae `sha256(bytea)`, sin extensiones.

### D-11 — Dependencias y configuración

**Recomendación**, autorizadas con este brief:
- **`sharp` como dependencia directa**, con la versión exacta que ya instala `next` (0.35.5), para no tener dos.
- **nginx**: una `location` para `PUT /productos/{id}/imagen` con `client_max_body_size 6m`, con las mismas cabeceras de proxy que `location /`. En `nginx-crm-production.conf` y en `nginx-crm-staging.conf`, para no separar las dos; staging no se despliega en esta subfase, y queda declarado.
- **Next**: nada. `proxyClientMaxBodySize` sigue en 10 MB, por encima de los 5 MB; la implementación lo verifica en el código instalado de Next antes de confiar en él.
- **Las unidades nuevas** (`crm-db-size.service` y su script) se suman a la tabla de archivos de `deploy/production/README.md`, y el `diff` de la verificación pasa de catorce archivos a dieciséis.

### D-12 — Etapas

**Recomendación**, como la 17.4:
- **17.5.1**: el esquema, el procesamiento, las tres rutas, la acción de quitar, la pantalla, el aviso y el ejercicio de restauración, con su revisión independiente, y el commit con autorización;
- **17.5.2**: el despliegue, con la migración, la dependencia, nginx y las unidades nuevas; el chequeo de Healthchecks.io que crea el usuario; la alerta provocada con el umbral bajado; y el recorrido del usuario.

La ruta de lectura de la imagen para el agente **no entra**: es una subfase posterior, con su brief y su contrato diseñado con el agente (ADR 0018, punto 7).

### D-13 — Revisión independiente

**Recomendación**: sí, antes del commit de la 17.5.1, con un agente de solo lectura contra este brief, el ADR 0018, SecurityModel y DataModel. Es la primera ruta que acepta archivos y el primer Route Handler con sesión.

## Alcance incluido

1. **Migración** con la tabla de D-3, sus `CHECK`, sus índices y los privilegios de `crm_app`.
2. **Módulo `catalog`**: el esquema, el repositorio y el servicio de la imagen, con el procesamiento de D-4 y el límite de D-5.
3. **Rutas**: la subida (D-2) y las dos que sirven (D-6), con el helper de `Origin`; la acción de quitar.
4. **Pantalla**: la ficha y la lista (D-7), con su end-to-end.
5. **Operación**: el aviso de D-9 y la comprobación de D-10, con sus archivos de `deploy/production/`, y la `location` de nginx (D-11).
6. **Documentación**: DataModel, FunctionalRequirements (FR-PROD-16 y siguientes), Screens, SecurityModel (la superficie nueva y el helper de `Origin`), Risks (el umbral, ahora vigilado), TraceabilityMatrix, el ADR 0018 (la enmienda de D-1), el Roadmap y `deploy/production/README.md`.

## Alcance excluido

- **La ruta de lectura del agente** (ADR 0018, punto 7) y cualquier cambio en `read-v1`.
- **Una galería** de varias imágenes, y reordenarlas.
- **La foto de perfil del cliente** (ADR 0018, punto 1).
- **Imágenes que mandan los clientes por WhatsApp**, documentos u otros adjuntos.
- **Recortar o editar** la imagen en la pantalla.
- **Desplegar en staging.**
- **Cambios en el agente**.

## Archivos autorizados

- `drizzle/0034_*.sql`, su snapshot y `_journal.json`;
- `src/modules/catalog/` (esquema, repositorio, servicio, procesamiento, índice y sus tests);
- `src/modules/audit/` solo si la auditoría necesita un valor nuevo, y se consulta antes;
- `src/app/(autenticado)/productos/` (la ficha, la lista, la acción de quitar, las rutas de `[productId]/imagen/` y sus componentes);
- un helper de `Origin` en `src/shared/` y su test;
- `package.json` y `package-lock.json` (solo `sharp`);
- `deploy/production/` (`crm-db-size.service`, su script, `crm-heartbeat.sh`, `crm-backup.service`, `crm-restore-check.sh`, `nginx-crm-production.conf`, `README.md`) y `deploy/staging/nginx-crm-staging.conf`;
- `tests/integration/`, `tests/e2e/`, `tests/fixtures/` (imágenes de prueba generadas, sin fotos de personas) y `tests/guards/exposed-surface.test.ts`;
- la documentación del punto 6 y este brief.

## Fuentes de verdad

- El ADR 0018 y el brief-17.3 (las revisiones R-1 a R-11 y la respuesta del agente).
- DataModel (el catálogo y la clave compuesta), SecurityModel (superficie expuesta, CSRF, cabeceras), Risks (el crecimiento de la base).
- `deploy/production/README.md` (§Monitoreo, §Desplegar, §Verificar) y los scripts de backup, aviso de vida y restauración.

## Invariantes

1. **Ninguna respuesta que el agente ya lee cambia.**
2. **Nada se lee del cuerpo de una subida antes de comprobar la sesión, el rol, el `Origin` y el tamaño declarado.**
3. **Solo se guarda la versión procesada**: JPEG, sin metadatos, a lo sumo 1600 px. Nunca el original.
4. **Aislamiento por organización**: una imagen solo se sube, se sirve y se quita en el producto de la organización de la sesión, y la base lo exige con la clave compuesta.
5. **La auditoría nunca guarda bytes de una imagen.**
6. **La CSP no cambia.**

## Criterios de aceptación

**17.5.1**

- **AC-1**: la `0034` crea la tabla de D-3 con sus `CHECK`, índices y privilegios, sin tocar otras tablas; `crm_app` no puede hacer `UPDATE`.
- **AC-2**: un `admin` sube un JPEG, un PNG con transparencia y un WebP, y se guarda un JPEG de a lo sumo 1600 px, sin EXIF ni GPS (comprobado leyendo los metadatos del guardado), con su miniatura y su hash; reemplazar deja una sola fila; quitar la borra.
- **AC-3**: dan error en su campo, sin escribir nada: un SVG, un texto con extensión `.jpg`, un archivo de más de 5 MB (también con un `Content-Length` falso), una imagen de más de 40 MP y una animada. Un `viewer` recibe `403`; una petición sin sesión, `401`; con otro `Origin`, `403`; un producto ajeno, `404`. **En todos estos casos el cuerpo no se lee** cuando la causa se conoce antes (invariante 2), y un test lo mide.
- **AC-4**: con dos subidas simultáneas, una se procesa y la otra espera o recibe `503`; la 21.ª subida de un usuario en 10 minutos recibe `429`.
- **AC-5**: las rutas que sirven devuelven `image/jpeg`, el `ETag`, `Cache-Control: private` y `nosniff`; un producto ajeno, sin imagen o inexistente da el mismo `404`.
- **AC-6**: cada cambio queda en la auditoría sin bytes, y el historial lo nombra en castellano.
- **AC-7**: la pantalla cumple D-7; su end-to-end pasa con axe sin violaciones en claro y en oscuro, con el teclado y a 375 px; un `viewer` ve la imagen sin los controles.
- **AC-8**: `crm-db-size.sh` termina con error por encima del umbral y bien por debajo, probado con el umbral bajado; `crm-restore-check.sh` falla con una imagen alterada en la base restaurada y pasa sin alterar.
- **AC-9**: los tests de contrato del agente pasan sin cambios, y las guardas, entre ellas la de la superficie expuesta con las tres rutas nuevas, siguen en verde.
- **AC-10**: la batería completa de la CI pasa en local y en la CI del commit, leída por `headSha`.
- **AC-11**: la documentación del punto 6 está actualizada.
- **AC-12**: la revisión independiente se hace antes del commit, y cada hallazgo se verifica y se resuelve o se eleva.

**17.5.2**

- **AC-13**: con autorización, la `0034`, `sharp`, nginx y las unidades nuevas llegan a producción: `/login` responde `200`, los recuentos de las tablas existentes son iguales antes y después, la tabla nueva existe vacía, y una subida de 6 MB recibe el rechazo de la aplicación, no el `413` de nginx.
- **AC-14**: con el chequeo creado por el usuario, el aviso de `db-size` llega a Healthchecks.io; con el umbral bajado a propósito, **la alerta llega** por los canales de siempre, y vuelve a la normalidad al restaurarlo.
- **AC-15**: el usuario sube, reemplaza y quita una imagen en producción, la ve en la lista y en la ficha, y aprueba.

## Pruebas y evidencia requerida

- `deterministic`: los tests de integración de la imagen contra PostgreSQL 18 real, con mutaciones: el formato por extensión en lugar de por contenido (AC-3), leer el cuerpo antes de comprobar el rol (invariante 2), sin quitar los metadatos (AC-2), la ruta que sirve sin el filtro de organización, pidiendo el producto de otra organización **que sí tiene imagen** (invariante 4; sin una imagen ajena que exista, la mutación no puede cambiar nada, como mostró la 17.4), y el ejercicio de restauración sin la comprobación del hash (AC-8). El pico de memoria con 40 MP, medido y registrado.
- `producer-consumer`: el end-to-end de la pantalla sobre `next start`.
- `isolated-runtime`: la 17.5.2 en producción, con los comandos y las salidas registrados acá, sin secretos, URLs de aviso ni IP.

## Condiciones de detención

Se detiene y se consulta al usuario si:

- hace falta tocar un archivo fuera de §Archivos autorizados;
- el pico de memoria al procesar una imagen de 40 MP pasa de 400 MB;
- el JPEG procesado de las imágenes de prueba ronda o supera los 500 KB, el doble de lo que supone la cuenta del ADR;
- Next lee o rechaza el cuerpo de la subida antes del Route Handler de un modo distinto del que dice D-11;
- `drizzle-kit generate` produce cambios en otras tablas;
- una decisión exige cambiar `read-v1`.

Y siempre **antes de**: pasar la 17.5 a «En proceso» en Notion, instalar `sharp`, el commit y el push de la 17.5.1, cada paso sobre producción (incluida la configuración de nginx y las unidades), crear el chequeo en Healthchecks.io y el cierre.

## Implementación de la 17.5.1, en curso desde el 2026-10-09

### Autorizaciones durante la implementación

- **`sharp` 0.35.5 como dependencia directa**, autorizada por el usuario el 2026-10-09: la misma versión que instala `next`, deduplicada (`npm ls sharp`).
- **Fuera de §Archivos autorizados, autorizados por el usuario** el 2026-10-09:
  - `src/modules/audit/` (`repository.ts`, `service.ts` e `index.ts`): `countRecentUserChanges`, una consulta de solo lectura para el límite de D-5, sin migración ni cambio de esquema.
  - `tests/guards/staging-backup-config.test.ts`: el caso que recorre los trabajos con aviso de vida pasa de tres a cuatro, con `crm-heartbeat@db-size.service`.
  - `src/shared/http/read-body.ts` y la exportación de `readBytesWithLimit` en `index.ts`, autorizados después de la revisión independiente (H-1): la lectura con tope se separa de la decodificación UTF-8 y la usan la ingestión y la subida.
  - `docs/runbooks/restaurar-la-base.md` (el `diff` de verificación pasa de catorce a dieciséis archivos) y `docs/runbooks/responder-a-una-alerta.md` (la alerta de 1 GB).
- **Condición de detención, decidida por el usuario**: Next recibe el cuerpo de la subida en memoria antes del Route Handler, porque `proxy.ts` cubre todas las rutas (D-4 de la 8.1) y `cloneBodyStream` (`next/dist/server/body-streams.js`) lee el cuerpo para pasárselo al proxy, hasta 10 MB. Verificado en el código instalado. **El usuario decidió mantener `proxy.ts` y declararlo**: la invariante 2 vale para el código de la aplicación, que no lee el cuerpo antes de sus comprobaciones y un test lo mide; los bytes llegan al proceso hasta el límite de nginx, 6 MB en esa dirección y 1 MB en el resto, como con todo `POST` desde la 8.1. Queda en SecurityModel y en el comentario del handler.

### Precisiones

- **P-1 (D-5)**: el límite cuenta las **subidas**, no las bajas: una entrada de auditoría con `image` nulo en `after` no suma. La 21.ª subida en 10 minutos recibe `429` con `Retry-After`, los segundos hasta que sale de la ventana la más vieja, según el reloj de PostgreSQL.
- **P-2 (D-2)**: sin `Content-Length`, la subida responde `411`, sin leer el cuerpo; con uno de más de 5 MB, `413`. Un archivo rechazado por su contenido responde `400` con el motivo (`unsupported_format`, `unreadable`, `too_many_pixels`, `animated`, `empty`, `too_large`). El procesamiento ocupado responde `503` con `Retry-After`.
- **P-3 (D-6)**: la caché de un año (`immutable`) solo se da cuando la dirección lleva `?v=` con el hash vigente; sin él o con otro, `private, no-cache`, que revalida con el `ETag` y responde `304`.
- **P-4 (D-7)**: la miniatura va dentro de la celda del nombre en la lista, sin columna nueva, y en la tarjeta del móvil. Es decorativa (`alt=""`): el nombre está al lado. La imagen de la ficha lleva `alt="Imagen de <nombre>"`. Es un `<img>` y no `next/image`, porque el optimizador de Next la pediría desde el servidor, sin la cookie de sesión.
- **P-5 (D-4)**: una WebP con dos cuadros iguales no es animada: el codificador los funde en uno. Los tests usan cuadros distintos.
- **P-6 (D-9)**: el aviso de tamaño corre como `postgres`, sin red, y el umbral se baja con `/etc/crm-production/db-size.env` para provocar la alerta. No avisa la falla por `/fail`: la guarda del aviso de vida rechaza cualquier aviso fuera de `OnSuccess=`, porque uno en `OnFailure=` apaga la alerta (hallazgo 5a de la revisión de la 13.3). La alerta llega por ausencia, como con el backup.

### Lo hecho hasta acá

- `drizzle/0034_product_images.sql`: la tabla, sus `CHECK`, el índice único, las claves foráneas y los privilegios. `drizzle-kit generate` no produce otros cambios.
- `catalog`: `image-processing.ts` (formato por contenido, tope de píxeles antes y durante la decodificación, orientación, aplanado sobre blanco, JPEG sin metadatos y miniatura, y el turno único), `image-repository.ts` e `image-service.ts`.
- Las rutas `productos/[productId]/imagen/` (`handler.ts`, `route.ts` y `miniatura/route.ts`), `removeProductImageAction`, la tarjeta «Imagen» de la ficha (`product-image.tsx`), la miniatura de la lista (`product-image-view.tsx`), los mensajes y el historial.
- `src/shared/http/`: `isSameOrigin` y `readBytesWithLimit`, que separa de `readBodyWithLimit` la lectura con tope.
- Operación: `crm-db-size.sh` y `crm-db-size.service`, el `OnSuccess=` del backup, el trabajo `db-size` de `crm-heartbeat.sh`, la comprobación de hashes de `crm-restore-check.sh` y la `location` de nginx en producción y en staging.
- Tests: `image-processing.test.ts`, `origin.test.ts`, `messages.test.ts` y `audit-summary.test.ts` (unitarios); `product-images.test.ts` (13 de integración); `product-images.spec.ts` (4 end-to-end); las listas de tablas y privilegios de `audit.test.ts` e `identity-schema.test.ts`; `product_images` en los `TRUNCATE` de `products.spec.ts`, `product-fields.spec.ts` y `security-headers.spec.ts` (este último lo encontró la corrida completa en dos tandas), que sin ella fallan por la clave foránea; y las guardas.
- Documentación: DataModel, FunctionalRequirements (FR-PROD-16 a 18), Screens, SecurityModel (74 puntos de entrada), Risks, TraceabilityMatrix, la enmienda del ADR 0018, el Roadmap, `deploy/production/README.md` y los dos runbooks.

### Medido

- **Memoria y tamaño, en la máquina de desarrollo, no en el droplet**, con imágenes sintéticas (degradado con ruido o color plano, no fotos): un JPEG de 40 MP sube el RSS unos 20 MB y tarda 277 ms, porque `sharp` lo reduce al decodificar; **el peor caso es un PNG de 40 MP de color plano**, que pesa 770 KB, entra en los 5 MB y se decodifica entero: **+58 MB** de RSS y 537 ms. Lejos de los 400 MB de la condición de detención. Una de 40,8 MP se rechaza en 34 ms sin decodificar.
- **El JPEG procesado** de las imágenes sintéticas pesa entre 6 y 105 KB, y la miniatura, unos 3 KB: bajo los 500 KB de la condición de detención. Una foto real pesará más; se mide en producción con la primera imagen.
- **Mutaciones, en rojo y revertidas**: M1, sin el control de formato por contenido; M2, leer el cuerpo antes de comprobar el rol, el producto y el límite; M3, conservar los metadatos; M4, la ruta que sirve sin el filtro de organización, con una imagen ajena que existe; M5, el ejercicio de restauración sin la comprobación del hash; M6, sin la verificación de `Origin`; M7, el límite que cuenta también las bajas.

### Revisión independiente (D-13)

Hecha el 2026-10-09 por un agente que no participó del trabajo, con acceso de solo lectura, contra este brief, el ADR 0018, SecurityModel, DataModel y las reglas del proyecto. Leyó el código y no ejecutó nada. **Nueve hallazgos y una nota: ninguno crítico, uno alto, uno medio, cuatro bajos y tres observaciones.** No encontró ningún camino que escriba sin autorización ni que cruce organizaciones. Cada hallazgo se verificó contra el código antes de aceptarlo:

- **H-1 (alto), cierto**: `src/shared/http/read-body.ts` (y la exportación de `readBytesWithLimit` en `index.ts`) se modificó fuera de §Archivos autorizados sin autorización registrada. El cambio separa la lectura con tope de la decodificación UTF-8; la ingestión sigue usando `readBodyWithLimit` con la misma conducta, y sus tests de integración pasan sin cambios. **Autorizado por el usuario el 2026-10-09**: el cambio queda.
- **H-2 (medio), cierto**: la mitad de restauración de AC-8 se prueba sobre la consulta del script, no sobre su decisión: la mutación M5 solo queda en rojo si se borra la consulta. **Aceptado y declarado**: AC-8 se cumple a nivel de la consulta para el ejercicio de restauración; el script entero corre en producción en la 17.5.2, en su camino sin imágenes alteradas. El aviso de tamaño sí se corre entero, con un `psql` de mentira.
- **H-3 (bajo), confirmado ejecutando**: una PNG animada (APNG) se aceptaba y se guardaba su primer cuadro, porque `sharp` no informa sus cuadros. **Corregido**: el procesamiento lee el fragmento `acTL` antes del primer `IDAT` y la rechaza como animada. Test nuevo con una APNG armada a mano; la mutación **M8**, sin esa lectura, lo pone en rojo.
- **H-4 (bajo), cierto**: el comentario de límites de `crm-restore-check.sh` y el runbook de restauración decían que el ejercicio no compara ningún valor. **Corregidos**: compara uno, cada imagen contra su hash; la miniatura no tiene hash.
- **H-5 (bajo), cierto**: `deploy/production/README.md` pedía que el recuento de archivos diera 14. **Corregido** a 16.
- **H-6 (bajo), cierto**: SecurityModel decía que la guarda fija 50 puntos que no son páginas; son 53. **Corregido**, con la historia.
- **H-7 (bajo), cierto**: el límite de tasa cuenta las subidas que terminan bien; una rechazada después de decodificar no deja auditoría y no cuenta, así que alguien con una sesión de `admin` puede ocupar el turno único con imágenes que fallan tarde. Hay además una carrera de una o dos subidas de más. **Aceptado y declarado**: es lo que dice P-1, y contar los rechazos exige un registro aparte, fuera de D-5. Lo acota el turno único: el daño es demorar otras subidas, no escribir.
- **H-8 (observación)**: `withImageSlot` no tiene tope para el trabajo; si `sharp` nunca resolviera, toda subida recibiría `503` hasta reiniciar el proceso. **Declarado**: improbable, y el reinicio del servicio lo resuelve.
- **H-9 (observación)**: la `location` de nginx distingue mayúsculas (la pantalla genera el id en minúsculas); el `304` exige el `ETag` exacto; el índice de la auditoría no sirve a la consulta del límite, irrelevante con el volumen actual; el orden del código es sesión, `Origin` y rol, y D-2 enumera sesión, rol y `Origin`, sin cambiar ninguna garantía. **Sin cambios.**
- **Nota**: `.claude/settings.json` está sin seguimiento y no entra al commit, como siempre.
