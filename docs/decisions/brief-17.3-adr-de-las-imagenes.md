---
schema: task-brief.v1
task_id: "17.3"
task_type: design
generated_at: 2026-10-08
---

# Brief 17.3 — ADR de las imágenes

- **Contrato**: `task-brief.v1`
- **Tipo de tarea**: `design`. El resultado es un ADR y las enmiendas que él ordene. No hay código, migraciones, dependencias ni cambios de contrato.
- **Nivel de evidencia objetivo**: ninguno de ejecución. Lo que se afirme de Meta o del agente se declara con su fuente y su nivel: «documentado por Meta», «confirmado por el agente» o «pendiente». Las mediciones de producción se citan con su fecha y su comando.
- **Nivel de validación alcanzable**: diseñado.
- **Orden**: tercera subfase de la Fase 17 ([Roadmap](../planning/Roadmap.md) §Fase 17), después de la 17.2, cerrada el 2026-10-08. El Roadmap la fija como **solo el ADR**.
- **No abre ni cierra gate.** La revisión independiente se recomienda (D-11).
- **Estado de este documento**: **aprobado el 2026-10-08** por el usuario, con las recomendaciones de D-1 a D-12. La tarea 17.3 estuvo en «En proceso» en Notion desde ese día. **Cerrado el 2026-10-08** (§Cierre).

## Objetivo

Decidir, con un ADR, si el CRM guarda imágenes y cómo: **dónde se guardan, cómo se respaldan, qué tamaño y qué formatos acepta, quién las sube y quién las ve, y si el agente puede leerlas**. Es la pregunta que el Roadmap dejó escrita:

> **Imágenes** de producto y foto de perfil del cliente: **empiezan por un ADR**. Hoy no hay dónde guardar archivos: hay que decidir el almacenamiento, el respaldo, el tamaño, los formatos y si el agente puede leerlas.

## Lo que se verificó antes de escribir este brief

Releído o medido el 2026-10-08:

- **No hay ningún archivo subido en el CRM.** Ninguna tabla ni ruta acepta un archivo; `messages.body_text` guarda, desde la 12.3, el epígrafe de una imagen que mandó un cliente, nunca la imagen (DataModel). Las imágenes de producto y la foto de perfil quedaron para la Fase 17 «con ADR» en la 15.4 ([brief-15.4](brief-15.4-detalles-y-formularios.md), H-1), porque «no hay dónde guardar archivos».
- **Producción** (`ssh crm-production`, solo lectura): el droplet tiene **48 GB de disco con el 9 % usado**, 1 CPU y 1967 MB de RAM; la base `crm_production` ocupa **9,9 MB**. Hay una alerta de disco por encima del 80 % (deploy/production/README §Alertas).
- **El backup** es un `pg_dump` cifrado con `age`, en el droplet y en un bucket de DigitalOcean Spaces, con una credencial que solo alcanza a ese bucket; un ejercicio de restauración lo verifica con recuentos, con control negativo ([SecurityModel](../architecture/SecurityModel.md), deploy/production/README). **Sin backups ni snapshots del droplet**, a propósito (brief-13.1, D-5): el disco tiene secretos y el dump en claro. **Todo lo que no esté en la base queda fuera del backup.**
- **La CSP** permite imágenes solo del mismo origen: `img-src 'self'` (SecurityModel). Una imagen servida desde otro dominio, como un bucket, exige cambiarla.
- **nginx** de producción no fija `client_max_body_size`: rige el valor por defecto de nginx, 1 MB. **Next** limita el cuerpo de una Server Action a 1 MB por defecto (`serverActions.bodySizeLimit`, sin configurar en `next.config`). Una foto de un celular suele pesar más.
- **`sharp`** no es dependencia directa del proyecto: llega instalada como dependencia opcional de Next. Procesar imágenes en el servidor exige agregarla, con autorización.
- **Los datos de un cliente** (13.4): la exportación y el vaciado alcanzan las columnas de la base; un test exige que toda columna nulable de `clients` quede vacía ([runbook](../runbooks/datos-de-un-cliente.md)). Una foto de perfil sería un dato personal más.
- **El agente** lee productos por [`read-v1`](../contracts/read-v1.md), que arma cada producto campo por campo con `z.strictObject`; agregarle un campo cambia el contrato (decidido en la 16.6: ruta nueva o v2). El CRM nunca llama al agente ([ADR 0014](0014-el-agente-de-whatsapp-como-consumidor-del-crm.md)).

### Hallazgos

- **H-1. El backup decide el almacenamiento más que el tamaño.** Con 48 GB libres, el disco no es el límite. Lo que cambia entre las opciones es si las imágenes entran en el backup cifrado, en el ejercicio de restauración y en el vaciado, que hoy cubren solo la base.
- **H-2. La foto de perfil del cliente no tiene de dónde salir sola.** Según la referencia del webhook de la API oficial de Meta, un mensaje entrante trae el nombre de perfil y el número, no la foto (**documentado por Meta, sin verificar en esta subfase**). La foto la tendría que subir una persona del negocio, y sería un dato personal con su cobertura en la 13.4, para un uso que nadie pidió todavía.
- **H-3. Que el agente mande la foto de un producto es la razón de negocio más fuerte, y no depende solo del CRM.** La API de Meta acepta una imagen por un enlace público HTTPS o subida antes a Meta (**documentado por Meta, sin verificar**). Si el agente la manda, la lee del CRM y la sube él: el CRM no envía nada (ADR 0014, punto 5). Solo el agente puede confirmar si lo quiere y si puede.

## Decisiones

Cada una lleva una recomendación. El usuario aprueba, cambia o rechaza.

### D-1 — Qué imágenes cubre el ADR

- **(a) Recomendada: solo imágenes de producto.** La foto de perfil del cliente queda **descartada** en el ADR, con el motivo de H-2: un dato personal cargado a mano, sin uso concreto. La ficha conserva el avatar con iniciales. Se reabre con un pedido real.
- (b) Producto y foto de perfil, con la foto cubierta por la exportación y el vaciado.
- (c) Ninguna: el ADR decide no guardar imágenes por ahora.

### D-2 — Cuántas imágenes por producto

- **(a) Recomendada: una principal, con el diseño abierto a varias.** La tabla de imágenes tiene su propia fila por imagen y un orden, pero la primera implementación ofrece una. Es lo que muestran la lista, la ficha y, si llega, el agente.
- (b) Una galería de hasta N desde el principio.

### D-3 — Dónde se guardan

- **(a) Recomendada: en PostgreSQL**, en una tabla propia (`bytea`), separada de `products` para que listar productos no lea los bytes. El backup cifrado, la copia externa, el ejercicio de restauración, el aislamiento por organización y el borrado transaccional las cubren **sin cambiar nada** (H-1). El costo: la base y el dump crecen con las imágenes. Con las imágenes reducidas en el servidor (D-4), mil productos con una imagen son del orden de 200 MB, lo que el droplet y el backup soportan. **El ADR fija el umbral para revisarlo**: si la base supera 2 GB, o el backup o la restauración tardan más del doble de lo medido, se reabre con la opción (c).
- (b) Archivos en el disco del droplet. Exige extender el backup, el cifrado, la copia externa y el ejercicio de restauración a una carpeta, y el borrado deja de ser transaccional con la fila.
- (c) Un bucket privado de Spaces, servido por el CRM. Exige otra credencial con escritura en la aplicación, un servicio externo en el camino de cada imagen, su propio respaldo (el bucket no versiona por defecto) y que el borrado coordine dos sistemas.
- (d) Un bucket público o una CDN. Exige cambiar la CSP y deja cada imagen al alcance de cualquiera con el enlace.

### D-4 — Formatos, tamaño y procesamiento

**Recomendación**:
- se aceptan **JPEG, PNG y WebP**, reconocidos por su contenido y no por la extensión ni por el tipo que declara el navegador. **SVG no**: puede llevar código;
- hasta **5 MB** al subir, y hasta un límite de píxeles para evitar una imagen que se expande al decodificarla;
- el servidor la **reduce** (lado mayor de 1600 px), la **vuelve a codificar** (WebP) y **le quita los metadatos**, entre ellos la ubicación GPS que guardan las fotos de un celular. Guarda solo la versión procesada, más una miniatura para la lista;
- exige agregar `sharp` como dependencia directa, nginx y Next con un límite de cuerpo mayor solo para la ruta que sube, y su autorización en el brief de la implementación.

### D-5 — Cómo se sirven

**Recomendación**: desde el mismo origen, por una ruta del CRM que exige sesión y comprueba que la imagen sea de la organización, con su tipo fijo, `X-Content-Type-Options: nosniff` y una caché por el hash del contenido. La CSP no cambia (`img-src 'self'`).

### D-6 — Quién sube y quién ve

**Recomendación**: como los campos de la 17.2. Un `admin` sube, reemplaza y quita; un `viewer` ve. Cada cambio queda en la auditoría con el id y el hash de la imagen, **nunca los bytes**.

### D-7 — El agente

- **(a) Recomendada: el ADR deja escrito el camino y lo marca pendiente del agente.** Si el agente quiere mandar la foto de un producto, la lee por una **ruta nueva de `read-v1`** (la imagen de un producto, con su credencial y su organización), la sube a Meta y la manda; el CRM no envía nada (ADR 0014). La ruta se implementa **solo** cuando el agente confirme que la usa, con su propio brief y coordinación. Con tu autorización, preparo el pedido al agente, como en la 16.5.
- (b) El agente no lee imágenes; se decide de nuevo si lo pide.
- (c) La ruta se implementa con las imágenes, sin esperar al agente.

### D-8 — Borrado, retención y datos de un cliente

**Recomendación**: quitar una imagen borra su fila; desactivar un producto no la borra. Las copias del backup la conservan lo que dura su retención, como cualquier otro dato. Con D-1 (a), ninguna imagen es un dato de un cliente, y la 13.4 no cambia. El ADR advierte que una foto de producto no debería mostrar personas.

### D-9 — Qué cambia en otros documentos cuando el ADR se acepta

**Recomendación**: el Roadmap (la implementación como subfase nueva, D-10; la foto de perfil, descartada o pendiente según D-1); DataModel (una nota de diseño, sin tabla hasta la implementación); SecurityModel (la superficie nueva prevista y los controles de D-4 y D-5); y Risks (el crecimiento de la base, con el umbral de D-3).

### D-10 — La implementación

**Recomendación**: una subfase nueva de la Fase 17, **17.5 — Imágenes de producto**, con su brief y su revisión independiente, **después de la 17.4**. Vos decidís el orden al aceptar el ADR; si preferís adelantarla a la 17.4, se reordena el Roadmap.

### D-11 — Revisión independiente

**Recomendación**: sí, antes de pedirte la aceptación, con un agente de solo lectura contra este brief, el ADR 0014, SecurityModel, deploy/production/README y el runbook de los datos de un cliente. El ADR fija una dependencia de almacenamiento y una superficie nueva.

### D-12 — Cuándo cierra

**Recomendación**: cuando el ADR está aceptado o rechazado y las enmiendas de D-9 están escritas. Si la respuesta del agente sobre D-7 tarda, la subfase cierra con esa parte pendiente, por tu decisión, como la 16.5.

## Alcance incluido

- `docs/decisions/0018-imagenes-de-producto.md`, nuevo (el nombre sigue a D-1);
- este brief;
- con el ADR aceptado: `docs/planning/Roadmap.md`, `docs/architecture/DataModel.md`, `docs/architecture/SecurityModel.md` y `docs/planning/Risks.md` (D-9);
- el pedido al agente, fuera del repositorio, en el Escritorio, con autorización (D-7);
- en el cierre: `CHANGELOG.md`, `HANDOFF.md` y `docs/decisions/README.md`.

## Alcance excluido

- **Código, migraciones, dependencias, configuración de nginx o Next, y contratos.** Son de la 17.5, con su brief.
- **Las imágenes que mandan los clientes por WhatsApp.** Siguen fuera: el CRM guarda su epígrafe, no el archivo.
- **Documentos, PDF o adjuntos de otro tipo.**
- **Cambios en el agente.** Los hace él, en su repositorio.
- **Leer el repositorio del agente como dependencia técnica.**

## Fuentes de verdad

- El ADR 0014, SecurityModel, deploy/production/README y el runbook de los datos de un cliente.
- El contrato `read-v1` y la decisión de la 16.6 sobre cómo crece.
- El Roadmap §Fase 17 y el brief-15.4, H-1.

## Invariantes

1. **Ninguna prohibición de `CLAUDE.md` cambia**, ni los puntos 1 y 5 del ADR 0014: el CRM no envía imágenes ni llama al agente.
2. **Nada queda fuera del backup cifrado sin que el ADR lo diga** y diga cómo se respalda.
3. **Toda afirmación sobre Meta o sobre el agente lleva su fuente y su nivel.**

## Criterios de aceptación

- **AC-1**: el ADR 0018 responde el almacenamiento, el respaldo, el tamaño, los formatos, quién sube y ve, y el agente, con la decisión, las alternativas descartadas y sus motivos, y las consecuencias.
- **AC-2**: el ADR dice cómo queda cubierto el backup, el ejercicio de restauración y el borrado, y fija el umbral para revisar el almacenamiento.
- **AC-3**: el ADR dice explícitamente que respeta los puntos 1 y 5 del ADR 0014 y que la CSP cambia o no.
- **AC-4**: cada afirmación sobre Meta o sobre el agente lleva su fuente y su nivel; lo del agente figura como pendiente hasta que conteste.
- **AC-5**: hay revisión independiente del ADR antes de pedir la aceptación, con cada hallazgo verificado.
- **AC-6**: con el ADR aceptado, las enmiendas de D-9 están escritas y no se contradicen con el ADR.
- **AC-7**: el usuario acepta o rechaza el ADR, o decide cerrar con una parte pendiente (D-12).

## Pruebas y evidencia requerida

No hay ejecución. La evidencia es documental: el ADR, las mediciones de producción citadas con su fecha, la revisión independiente con sus hallazgos verificados y, si llega, la respuesta del agente.

## Condiciones de detención

Detenerse y avisar si pasa algo de esto:

- el ADR necesita enmendar el ADR 0014 o una prohibición de `CLAUDE.md`;
- hace falta tocar código, un contrato o un archivo fuera de la lista;
- la respuesta del agente contradice una premisa del ADR.

También hay que pedir autorización explícita en su turno **antes de**: pasar la tarea 17.3 a «En proceso» en Notion; mandar el pedido al agente; cada commit y push; y el cierre.

## Resultados

### El ADR propuesto

`docs/decisions/0018-imagenes-de-producto.md`, escrito el 2026-10-08 como **propuesto**. Nivel: diseñado.

### Revisión independiente (D-11, AC-5)

La hizo un agente que no participó del trabajo, con acceso de solo lectura, el 2026-10-08. Fijó la escala antes de mirar. 17 hallazgos: ninguno bloqueante, 7 medios, 6 bajos y 4 notas. Cada uno se verificó contra los archivos citados.

- **R-1**, medio: el ADR agregaba un umbral de disco del 50 % que el brief no aprobó. **Confirmado**; resuelto con R-2.
- **R-2**, medio: la estimación no contaba lo que multiplica el backup (el dump en claro y el cifrado, 7 copias locales, la base del ejercicio de restauración). **Confirmado** contra `crm-backup.sh` y SecurityModel: el disco carga cerca de 16 veces la base, y con el umbral de 2 GB llegaría a unos 32 de 48 GB. **Decisión del usuario del 2026-10-08, con la recomendación**: el umbral pasa a 1 GB de base, con un aviso automático en la 17.5, y salen los criterios de tiempo y de disco.
- **R-3**, medio: ningún instrumento miraba el umbral. **Confirmado y corregido** con la misma decisión: la 17.5 agrega el aviso; hasta entonces, solo la alerta de disco al 80 %, declarado.
- **R-4**, medio: «más del doble» del tiempo del backup se comparaba contra una base casi vacía. **Confirmado** con el journal: el backup tarda menos de un segundo y la restauración unos dos. Sale, por la decisión de R-2.
- **R-5**, medio: en Next, el límite de cuerpo de una Server Action es global, no por ruta. **Confirmado** en `config-shared.d.ts`. **Corregido**: el brief de la 17.5 elige entre la Server Action con el límite global o un Route Handler con la verificación de `Origin`.
- **R-6**, medio: faltaban alternativas descartadas de D-1 (c), D-2 (b) y D-7 (b) y (c). **Confirmado y corregido.**
- **R-7**, medio: «el formulario lo dice» era una decisión de pantalla, y «ninguna imagen es un dato de un cliente» era categórica. **Confirmado y corregido**: queda como premisa con su límite, y el aviso en pantalla pasa a la 17.5.
- **R-8**, bajo: una referencia al punto 8 era al 9. **Corregido.**
- **R-9**, bajo: la ruta del agente no encaja tal cual en `read-v1` (respuestas JSON, `no-store`, saber si hay imagen, el significado del `404`). **Confirmado** contra el contrato; **quedan como preguntas abiertas** en el punto 7.
- **R-10**, bajo: la caché no decía que fuera privada. **Corregido**: `Cache-Control: private`, con su límite.
- **R-11**, bajo: faltaban riesgos de procesamiento (concurrencia en 1 CPU, límite de tasa, imágenes animadas). **Corregido**: quedan para el brief de la 17.5.
- **R-12**, bajo: los 78 MB de `crm-backup.sh` contra los 9,9 MB medidos. **Explicado**: son la base de medición de la 13.2, con datos sintéticos.
- **R-13**, bajo: el 1 MB de nginx salía solo del archivo versionado. **Corregido**: se declara la fuente.
- **R-14**, bajo: no se sabía dónde vive la miniatura. **Corregido**: en la misma fila.
- **R-15**, nota: la fuente de Meta era genérica. **Corregido**: se nombra qué parte y que no se consultó con fecha; lo verifica el agente.
- **R-16**, nota: el ADR no declaraba su nivel. **Corregido**: diseñado.
- **R-17**, nota: `.claude/settings.json` sin seguimiento. No entra en ningún commit.

Fuera de alcance, registrado: `deploy/production/README.md` exige recuentos en cero de `clients` y otras tablas después de desplegar, y producción tiene datos desde la 13.5. Puede estar desactualizado.

Las correcciones son autoevaluación: el revisor no las vio.

### La decisión del usuario (AC-7) y el pedido al agente (D-7)

El 2026-10-08 el usuario **aceptó el ADR 0018**, con el punto 7 pendiente del agente, y **autorizó el pedido**. La 17.5 queda después de la 17.4, como recomendaba D-10. El pedido está en el Escritorio del usuario, `Pedido-17.3-CRM-al-Agente.md`, con seis preguntas: si quiere mandar fotos de producto, cómo las sube a Meta, el formato y el tamaño, cómo sabe si un producto tiene imagen, la caché y los límites de su lado.

Las enmiendas de D-9 están escritas (AC-6): Roadmap (la 17.5 y la candidata resuelta), DataModel (la tabla diseñada, sin crear), SecurityModel (la superficie prevista y el respaldo), Risks (el crecimiento de la base, con el umbral de 1 GB) y el índice de decisiones.

### La respuesta del agente (D-7)

Respuesta del mismo día, `Respuesta-17.3-Agente-al-CRM.md`, en el Escritorio del usuario; quedó resumida en el ADR, §Lo que contestó el agente. El agente contestó sobre el resumen del pedido, sin leer el ADR.

- **Usaría la ruta**, solo cuando el cliente pide la foto; la sube a Meta y la manda por id, sin enlace público.
- **Necesita JPEG**: según la referencia de media de la Cloud API, que verificó el agente, una imagen se manda en JPEG o PNG, y el WebP vale solo para stickers. **No contradice una premisa del ADR** (condición de detención): agrega un requisito a la ruta. El ADR lo registra en los puntos 4 y 7, y el brief de la 17.5 decide si la versión guardada pasa a ser JPEG.
- Le alcanza con pedir la imagen, sin campo nuevo; propone `ETag`, `304` con `If-None-Match` y un código propio para «sin imagen». Se decide en el brief de la ruta.
- La ruta queda como **subfase posterior a la 17.5**, sin número; no hace falta adelantar la 17.5.

## Cierre

Cerrada el 2026-10-08 por el usuario.

- **Criterios**: AC-1 a AC-7 cumplidos.
- **Nivel**: diseñado. No hay código ni ejecución.
- **Decisiones del usuario**: el brief con D-1 a D-12; el umbral de 1 GB con aviso automático (R-2); el pedido al agente; aceptar el ADR 0018; la 17.5 después de la 17.4; y el cierre después de la respuesta del agente.
- **Revisión**: independiente para el ADR propuesto, con 17 hallazgos. Las correcciones, la aceptación y la incorporación de la respuesta del agente, autoevaluación declarada.
- **Notion**: la tarea 17.3 en «Completado» y la 17.5 creada en «Esperando».
- **Queda para la 17.5**: el formato guardado (WebP o JPEG), Server Action o Route Handler para subir, el aviso del umbral, la concurrencia, el límite de tasa, las imágenes animadas y si el ejercicio de restauración compara hashes.
