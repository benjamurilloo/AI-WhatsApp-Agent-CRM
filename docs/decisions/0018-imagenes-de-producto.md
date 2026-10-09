# 0018 — Imágenes de producto

- Estado: **aceptada** (decisión del usuario del 2026-10-08, después de la revisión independiente; subfase 17.3, [brief-17.3](brief-17.3-adr-de-las-imagenes.md)). **El agente contestó el mismo día** (§Lo que contestó el agente): usaría la ruta del punto 7, y la necesita en JPEG. La implementación del CRM es la 17.5, después de la 17.4; la ruta del agente, una subfase posterior.
- Fecha: 2026-10-08
- Nivel: **diseñado**. No hay código ni ejecución.

## Contexto

Los bocetos de la Fase 15 dibujan la foto de cada producto y la foto de perfil del cliente. El CRM no tiene dónde guardar archivos: ninguna tabla ni ruta acepta uno, y `messages.body_text` guarda el epígrafe de una imagen que mandó un cliente, nunca la imagen ([DataModel](../architecture/DataModel.md)). La 15.4 las dejó para la Fase 17 con un ADR ([brief-15.4](brief-15.4-detalles-y-formularios.md), H-1), y el [Roadmap](../planning/Roadmap.md) §Fase 17 fijó las preguntas: el almacenamiento, el respaldo, el tamaño, los formatos y si el agente puede leerlas.

Lo que acota la decisión, verificado el 2026-10-08:

- **El disco no es el límite.** El droplet de producción tiene 48 GB con el 9 % usado, y la base ocupa 9,9 MB (`df -h /` y `pg_database_size`, por `ssh crm-production`, solo lectura). Los 78 MB que cita `crm-backup.sh` son otra base: la de medición de la 13.2, cargada con datos sintéticos ([evidencia-13.2](evidencia-13.2-mediciones.md)). Hay una alerta de disco por encima del 80 % (deploy/production/README §Alertas).
- **El respaldo cubre solo la base.** Es un `pg_dump` cifrado con `age`, guardado en el droplet y copiado a un bucket de Spaces con una credencial que solo alcanza a ese bucket. Un ejercicio de restauración lo restaura en una base aparte y compara la lista de tablas y el recuento de cada una de `public` contra el manifiesto del dump, con control negativo ([SecurityModel](../architecture/SecurityModel.md), `deploy/production/crm-restore-check.sh`). **No hay backups ni snapshots del droplet**, a propósito: el disco tiene los secretos y el dump en claro ([brief-13.1](brief-13.1-entorno-productivo.md), D-5).
- **El borrado de los datos de un cliente** (13.4) alcanza las columnas de la base, y un test exige que toda columna nulable de `clients` quede vacía ([runbook](../runbooks/datos-de-un-cliente.md)).
- **La CSP** admite imágenes solo del mismo origen: `img-src 'self'` (SecurityModel).
- **Los límites de cuerpo**: según el archivo versionado `deploy/production/nginx-crm-production.conf`, nginx no fija `client_max_body_size` y rige su valor por defecto, 1 MB (no se leyó la configuración global del servidor con `nginx -T`); Next limita una Server Action a 1 MB por defecto (`serverActions.bodySizeLimit`, sin configurar).
- **`sharp`** llega instalada como dependencia opcional de Next, no como dependencia directa del proyecto.
- **El agente** lee productos por [`read-v1`](../contracts/read-v1.md), que arma cada producto campo por campo; agregarle un campo cambia el contrato, y la 16.6 decidió que el contrato crece con rutas nuevas o con una v2. El CRM nunca llama al agente ni envía mensajes ([ADR 0014](0014-el-agente-de-whatsapp-como-consumidor-del-crm.md), puntos 1 y 5).
- **Meta**: un mensaje entrante trae el nombre de perfil y el número del cliente, no su foto; y para mandar una imagen, la API acepta un enlace público HTTPS o una imagen subida antes a Meta. Fuente: la referencia de la API oficial de WhatsApp de Meta (el objeto `contacts` del webhook y los mensajes de tipo `image`), tal como la conoce quien escribió este ADR; no se consultó con fecha en esta subfase. Nivel: **documentado por Meta, no verificado en este proyecto**. Lo verifica el agente al contestar el punto 7.

## Decisión

### 1. Solo imágenes de producto

El CRM guarda imágenes de producto. **La foto de perfil del cliente queda descartada**: no llega por WhatsApp (ver Meta, arriba), así que la cargaría a mano una persona del negocio; sería un dato personal más en la exportación y el vaciado de la 13.4, y nadie pidió todavía un uso concreto. La ficha del cliente conserva el avatar con iniciales. Se reabre con un pedido real.

### 2. Una imagen principal por producto, con el diseño abierto a varias

Cada imagen es una fila propia, con su producto, su organización y un orden; su miniatura (punto 4) va en la misma fila, no cuenta como otra imagen. La primera implementación ofrece **una** imagen por producto, la principal, que muestran la lista y la ficha. Una galería es una subfase posterior, sin migrar datos.

### 3. Se guardan en PostgreSQL

Las imágenes viven en **una tabla propia**, en `bytea`, separada de `products`: listar o buscar productos nunca lee los bytes. La tabla lleva la organización con la clave compuesta, como el resto de las tablas de catálogo, y su `CHECK` de tamaño.

Por qué en la base, y no en el disco ni en un bucket:

- **El respaldo, la copia externa cifrada y el ejercicio de restauración las cubren sin cambiar nada.** El dump incluye la tabla; el ejercicio cuenta todas las tablas de `public`, así que una tabla nueva entra sola en la comparación.
- **El borrado es transaccional**: quitar una imagen es borrar una fila, en la misma transacción que su auditoría. No queda un archivo huérfano ni una fila sin archivo.
- **El aislamiento por organización** es el de siempre: la clave compuesta y el filtro del repositorio. No hay una segunda autorización que mantener en otro sistema.
- **No hay credencial nueva ni servicio externo** en el camino de cada imagen.

**El costo** es que la base y el dump crecen con las imágenes. Con el procesamiento del punto 4, una imagen ronda los 200 KB, así que mil productos con su imagen son del orden de 200 MB. Es una estimación, no una medición.

**Lo que ocupa en el disco es mucho más que la base**: cada backup deja en el droplet el dump en claro y su copia cifrada (`crm-backup.sh`), se guardan 7 copias locales (SecurityModel), el ejercicio de restauración arma una base completa más (`crm-restore-check.sh`), y un WebP no se comprime más dentro del dump. Con la base en X, el disco carga cerca de **16·X**: con 200 MB, unos 3,2 GB de 48. El bucket guarda 30 días de copias cifradas. También es una estimación.

**Umbral para revisarlo**: el almacenamiento se reabre, con un ADR que enmiende este punto, cuando **la base supera 1 GB**, unos 16 GB de disco por la cuenta de arriba, un tercio del droplet. La 17.5 agrega **un aviso automático** cuando la base pasa ese umbral; la alerta de disco al 80 % sigue como respaldo. *Decidido por el usuario el 2026-10-08, después de la revisión independiente*: reemplaza el umbral de 2 GB y el de «más del doble» del tiempo del backup del brief (D-3). Hoy el backup tarda menos de un segundo y la restauración unos dos (journal de `crm-backup.service` del 2026-10-08 y de `crm-restore-check.service` del 2026-10-01), así que el criterio de tiempo se cumplía con unas pocas imágenes.

### 4. Formatos, tamaño y procesamiento

- **Se aceptan JPEG, PNG y WebP**, reconocidos por su contenido, no por la extensión ni por el tipo que declara el navegador. **SVG no**: es un documento que puede llevar código.
- **Hasta 5 MB** al subir, y un tope de píxeles al decodificar, para que una imagen chica en bytes no se expanda en memoria hasta tirar el proceso.
- **El servidor la procesa antes de guardarla**: la reduce a un lado mayor de **1600 px**, la vuelve a codificar en **WebP** y **le quita los metadatos**, entre ellos la ubicación GPS que guardan las fotos de un celular. Guarda solo esa versión y una **miniatura** para la lista. El original no se guarda. *Precisado el 2026-10-08 con la respuesta del agente*: Meta no acepta WebP como imagen, y la ruta del punto 7 entrega JPEG. **El brief de la 17.5 decide** si la versión guardada es JPEG en lugar de WebP, para tener una sola, o si se guarda además un JPEG; la pantalla muestra cualquiera de los dos.
- Exige **`sharp` como dependencia directa** y un límite de cuerpo mayor para la subida. En nginx se puede acotar a la ruta que sube; **en Next, no si la subida es una Server Action**: `serverActions.bodySizeLimit` es global y la subiría para todas. **El brief de la 17.5 elige** entre una Server Action con el límite global mayor o un Route Handler, que exige la verificación explícita de `Origin` que SecurityModel pide a todo Route Handler con sesión que escribe. La dependencia y la configuración se autorizan en ese brief.

### 5. Se sirven desde el mismo origen

Una ruta del CRM devuelve la imagen o su miniatura. Exige sesión, comprueba que la imagen sea de la organización de quien la pide, responde con su tipo fijo (`image/webp`) y `X-Content-Type-Options: nosniff`, y se cachea por el hash del contenido con `Cache-Control: private`, nunca `public`, así que reemplazar la imagen cambia la dirección. Límite: la copia queda en la caché del navegador después de cerrar la sesión. **La CSP no cambia**: sigue `img-src 'self'`.

### 6. Quién sube y quién ve

Como los campos de la 17.2: un `admin` sube, reemplaza y quita; un `viewer` ve. Cada cambio queda en la auditoría del producto con el id, el hash y el tamaño de la imagen, **nunca los bytes**.

### 7. El agente: una ruta de lectura, confirmada por el agente

Si el agente quiere mandar la foto de un producto a un cliente, el camino es este:

1. la lee por una **ruta nueva de `read-v1`**, la imagen de un producto, con su credencial y limitada a su organización, como el resto del contrato;
2. la sube a Meta y la manda él.

El CRM no publica un enlace abierto, no envía nada y no llama al agente: **respeta los puntos 1 y 5 del ADR 0014**. La ruta es nueva, así que no cambia las respuestas que el agente ya lee.

**El agente confirmó el 2026-10-08 que la usaría** (§Lo que contestó el agente). La ruta **no entra en la implementación del punto 9**: es una subfase posterior a la 17.5, con su brief, su contrato diseñado con el agente y su revisión independiente. **La ruta entrega JPEG**, no WebP, porque Meta no acepta WebP como imagen; el brief de la 17.5 decide si el CRM guarda la imagen en JPEG desde el principio o si la ruta genera el JPEG aparte (punto 4).

**Preguntas abiertas para ese brief**, porque la ruta no encaja tal cual en el contrato de hoy: toda respuesta `200` de `read-v1` es JSON con `contract_version` y pasa el validador, y una imagen es binaria; toda respuesta lleva `Cache-Control: no-store`, y el punto 5 cachea por el hash; el agente no sabe si un producto tiene imagen sin un campo nuevo en el producto, que es v2; y el `404` hoy significa «inactivo, ajeno o inexistente», no «sin imagen». El agente propuso cómo resolverlas (§Lo que contestó el agente); se deciden en el brief de la ruta.

### 8. Borrado y retención

- Quitar o reemplazar una imagen borra su fila. Desactivar un producto no borra su imagen.
- Las copias del backup la conservan lo que dura su retención, como cualquier otro dato.
- **Se asume que ninguna imagen es un dato de un cliente**: con el punto 1, la exportación y el vaciado de la 13.4 no cambian. **Límite**: una foto de producto no debería mostrar personas, pero nada lo impide. Si aparece una, un `admin` la quita (primer punto de esta lista) y las copias del backup vencen con su retención; el pedido de borrado de un cliente no la alcanza, porque la imagen no está vinculada a él. Cómo se avisa en la pantalla lo decide el brief de la 17.5.

### 9. La implementación

Una subfase nueva de la Fase 17, **17.5 — Imágenes de producto**, con su brief y su revisión independiente, después de la 17.4. El usuario fija el orden al aceptar este ADR.

## Lo que contestó el agente

Pedido entregado el 2026-10-08 por el usuario (`Pedido-17.3-CRM-al-Agente.md`, en su Escritorio); respuesta del agente del mismo día (`Respuesta-17.3-Agente-al-CRM.md`). **El agente contestó sobre el resumen del pedido, sin leer este ADR**, y dice que contrasta el contrato con el ADR antes de implementar. Nivel: **confirmado por el agente**, salvo donde se indica.

- **Lo usaría, solo cuando el cliente pide la foto** de un producto que ya encontró; si no tiene imagen, lo dice y sigue con texto. Es una propuesta de producto que confirma el dueño del negocio antes de su subfase.
- **La sube a Meta y la manda por id**, sin enlace público, que prefiere que no exista. Ya descarga de Meta por id las imágenes de los clientes.
- **Formato: JPEG.** Según la referencia de media de la Cloud API, consultada por el agente el 2026-10-08, una imagen se manda en JPEG o PNG de hasta 5 MB, de 8 bits y RGB o RGBA, y **el WebP vale solo para stickers**. Nivel: **documentado por Meta, verificado por el agente**, no por el CRM. Pide que el CRM entregue JPEG, RGB y sin metadatos, de hasta 1600 px y con margen bajo 5 MB, porque convertir en su lado le agregaría una dependencia.
- **Saber si hay imagen**: le alcanza con pedirla, sin campo nuevo ni v2. Necesita distinguir «el producto no tiene imagen» de «el producto no existe o no es mío». Propone: `200` con `image/jpeg`, el hash en `ETag` y su `X-Correlation-Id`; un código propio en el JSON de error para «sin imagen», como `image_not_found`; el resto como en `read-v1`; la versión del contrato en un encabezado.
- **Caché**: guarda el id de Meta por el hash, menos de 30 días porque Meta borra lo subido; un `GET` condicional con `If-None-Match` y `304`, o solo el `ETag` en cada `200`. `Cache-Control: no-store` puede seguir.
- **Lo que el ADR no veía**: el piloto del agente no lee del CRM, así que la prueba real es en producción, con la organización de demostración, un producto con imagen y uno sin; la ventana de 24 h no molesta, porque la imagen responde a un pedido del cliente; un fallo de la lectura o de la subida no frena la respuesta, que sigue en texto; una imagen por respuesta, solo la principal.
- **Del lado del agente son varias subfases**, que planifica cuando la ruta tenga contrato. **No hace falta adelantar la 17.5** por él.

Ninguna respuesta contradice una decisión del ADR. El formato agrega un requisito a la ruta del punto 7, no cambia lo que guarda el CRM para sus pantallas.

## Alternativas descartadas

- **Archivos en el disco del droplet.** Exige extender el backup, el cifrado, la copia externa y el ejercicio de restauración a una carpeta, y el borrado deja de ser transaccional con la fila. Es más trabajo de operación que la base, para un volumen que la base soporta.
- **Un bucket privado de Spaces, servido por el CRM.** Exige otra credencial, esta vez con escritura y en la aplicación, un servicio externo en el camino de cada imagen, su propio respaldo (el bucket no versiona por defecto) y un borrado que coordina dos sistemas. Es la salida si se pasa el umbral del punto 3.
- **Un bucket público o una CDN.** Exige cambiar la CSP y deja cada imagen al alcance de cualquiera con el enlace.
- **La foto de perfil del cliente**, por el punto 1.
- **No guardar imágenes.** Deja sin resolver lo que los bocetos dibujan y lo que el agente podría mandar, cuando la base las soporta sin infraestructura nueva.
- **Una galería desde el principio.** Suma orden, reordenar y quitar una de varias, sin un pedido concreto; el diseño del punto 2 la admite después sin migrar datos.
- **Que el agente no lea imágenes.** Cierra la razón de negocio más fuerte sin preguntarle; el punto 7 la deja escrita y pendiente.
- **Implementar la ruta del agente sin esperarlo.** Sería superficie expuesta sin consumidor, y su forma depende de lo que el agente necesite (punto 7).
- **Guardar el original además de la versión procesada.** Duplica el tamaño y conserva los metadatos que el punto 4 quita.

## Consecuencias

- **La base deja de ser chica**: el tamaño del dump y el tiempo de restauración pasan a depender del catálogo. Hasta la 17.5 no hay vigilancia automática del tamaño de la base, solo la alerta de disco al 80 %; la 17.5 agrega el aviso del punto 3, y Risks lo registra.
- **El ejercicio de restauración compara recuentos, no contenido**: una imagen corrupta en el dump pasaría. La 17.5 decide si el ejercicio suma una comparación de los hashes.
- **Una ruta que acepta archivos** es superficie nueva: SecurityModel la declara con sus controles (punto 4) y la guarda de la superficie expuesta la cuenta.
- **El servidor decodifica imágenes de terceros.** `sharp` corre sobre libvips; un defecto ahí afecta al proceso de la aplicación. Se mitiga con el tope de tamaño y de píxeles y con la versión al día. **El brief de la 17.5 trata además**: las subidas simultáneas en un droplet de 1 CPU y 1967 MB, con la alerta de memoria al 90 %; un límite de tasa para la subida, como los que ya existen; y las imágenes animadas o de varios cuadros, que se rechazan o se reducen a su primer cuadro.
- **El agente no cambia** hasta la subfase de la ruta del punto 7, que se diseña con él.

## Lo que este ADR no decide

- Las imágenes que mandan los clientes por WhatsApp: siguen fuera.
- Documentos, PDF u otros adjuntos.
- La galería de varias imágenes, más allá de que el diseño la admite.
- El diseño de la pantalla: es del brief de la 17.5.
