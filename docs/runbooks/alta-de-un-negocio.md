# Alta de un negocio en producción

Cómo se da de alta un negocio en `crm.vixoraai.app`, se cargan sus datos y se encienden la ingestión y la lectura **solo para él**, detrás del modo de prueba. Y cómo se apaga, que es la vuelta atrás. Escrito para el primer negocio ([brief-13.5](../decisions/brief-13.5-primer-cliente.md)), y vale para cualquiera.

**Quién hace cada paso.** Cada paso en el servidor lo autoriza el usuario en su turno. Los que imprimen una contraseña o un token **los corre el operador en su propia terminal**, porque esos valores no pueden pasar por una conversación con un asistente ni quedar en un archivo. Los comandos piden cada valor con `read`, sin marcadores: un `<correo>` lo interpreta la shell como una redirección ([deploy/production](../../deploy/production/README.md), paso 10).

**Qué no se escribe nunca**, ni en el ticket, ni en la evidencia, ni en un mensaje: tokens, contraseñas, teléfonos, nombres de clientes del negocio, identificadores de mensajes (`wamid`) e IPs. Los ids de la organización y de las credenciales **sí** se registran: no dan acceso a nada.

**Cómo llega un valor al script sin quedar en un log.** `sudo` registra en su log, `/var/log/auth.log` y el journal, la línea de comandos **y el valor de toda variable que se le pasa**, sea como `sudo VAR=…` o con `--preserve-env`. Se comprobó en staging el 2026-10-01 ([evidencia-13.5](../decisions/evidencia-13.5-primer-cliente.md)). Por eso todos los comandos de este runbook siguen la misma forma:

- un único `sudo bash -c '…'`, cuyo texto lleva solo nombres de variables, nunca valores;
- adentro, el shell de root lee `app.env` y pide con `read` lo que tipea el operador;
- cambia al usuario `crm` con `runuser`, que no pasa por `sudo` ni registra el entorno.

## 0. Antes de empezar

Todo esto tiene que estar registrado con su fecha (brief-13.5, AC-8):

- el negocio confirmado por el usuario;
- la API oficial de WhatsApp montada para ese negocio;
- el agente listo para apuntar a producción, según su respuesta escrita;
- la decisión del usuario sobre el acuerdo con el negocio y el aviso a sus clientes (brief-13.5, D-10);
- producción en un SHA con la CI en `success`, y su salud: `curl -sI https://crm.vixoraai.app/login` da `200`;
- **ese SHA trae la verificación del paso 6 en su versión corregida**. Con un id que no es un uuid tiene que salir con `3`; una versión anterior sale con `1`, o no existe:

  ```
  sudo bash -c '. /etc/crm-production/app.env && export DATABASE_URL && cd /srv/crm-production && exec runuser -u crm -- npx tsx scripts/verificar-identificadores.ts --org no-es-un-uuid'; echo "código: $?"
  ```

- los recuentos de `crm_production`, como en la 13.4 ([evidencia-13.4](../decisions/evidencia-13.4-retencion-y-borrado.md), AC-9).

## 1. La organización y su `admin`

En el servidor (`ssh crm-production`), con la conexión de `app.env`. El `admin` es el dueño del negocio si carga él los datos, o el operador si los carga en su nombre (brief-13.5, D-3). El nombre y el correo del `admin` son de un tercero, así que llegan a `org:create` por el entorno, no como argumentos:

```
sudo bash -c 'read -r -p "Organización: " CREAR_ORG_NOMBRE; read -r -p "Nombre del admin: " CREAR_ORG_ADMIN_NOMBRE; read -r -p "Correo del admin: " CREAR_ORG_ADMIN_CORREO; export CREAR_ORG_NOMBRE CREAR_ORG_ADMIN_NOMBRE CREAR_ORG_ADMIN_CORREO; . /etc/crm-production/app.env && export DATABASE_URL && cd /srv/crm-production && exec runuser -u crm -- npm run --silent org:create'
```

Imprime el id de la organización, el del `admin` y la contraseña inicial **una sola vez**. La contraseña se le entrega al `admin` por un canal acordado, y la cambia en su primer ingreso. Se registra el id de la organización.

## 1b. Un rubro con capacidades, si el negocio lo usa

*Desde la 29.2* ([brief-29.2](../decisions/brief-29.2-capacidades-y-variantes.md), [ADR 0024](../decisions/0024-rubros-y-capacidades.md)). Solo para un negocio cuyo rubro tiene un perfil, como una tienda de iPhone. **Un negocio sin capacidades se salta este paso** y no cambia en nada.

`org:capability` activa la capacidad y, con `--profile`, copia los atributos del perfil (para `iphone`: Capacidad, Color y Trae caja) **en la misma transacción**, auditada con el `admin` como autor. Activarla dos veces no hace nada y lo dice. **No se desactiva**: no hay comando.

*Desde la 29.5* ([brief-29.5](../decisions/brief-29.5-las-unidades.md)), el perfil `iphone` activa también **`serialized_units`**, las unidades con IMEI, y al activarla copia los grados A, B y C. **Siempre con `--profile iphone`**: con `--capability serialized_units` no se copian los grados, y una corrida posterior con `--profile` tampoco los copia, porque la capacidad ya está activa (lo dice la salida); quedan para crearlos en la pantalla Grados. Una organización que ya tenía `variants` corre el mismo comando: dice que `variants` ya estaba activa, activa `serialized_units` y copia los grados. Así se activó en «iPhone Demo» el 2026-10-20.

El correo del `admin` llega por el entorno:

```
sudo bash -c 'read -r -p "Id de la organización: " ORG_ID; read -r -p "Correo del admin: " CAPACIDAD_ADMIN_CORREO; export CAPACIDAD_ADMIN_CORREO; . /etc/crm-production/app.env && export DATABASE_URL && cd /srv/crm-production && exec runuser -u crm -- npm run --silent org:capability -- --organization "$ORG_ID" --profile iphone'
```

**Solo para una organización demo**, nunca para un negocio real: `demo:catalog` carga el catálogo de ejemplo de iPhone (12 modelos y 35 productos con capacidad, color y un precio de ejemplo en USD) por los servicios del catálogo, con sus reglas y su auditoría. Se niega si la organización no tiene la capacidad o si tiene productos o modelos que no son del catálogo de ejemplo. **Si se corta a mitad de camino**, cada modelo, producto y precio ya cargado queda, y nada se borra: se vuelve a correr el mismo comando, que retoma, saltea lo cargado y fija los precios que faltaron. No se corre dos veces a la vez:

```
sudo bash -c 'read -r -p "Id de la organización demo: " ORG_ID; read -r -p "Correo del admin: " CAPACIDAD_ADMIN_CORREO; export CAPACIDAD_ADMIN_CORREO; . /etc/crm-production/app.env && export DATABASE_URL && cd /srv/crm-production && exec runuser -u crm -- npm run --silent demo:catalog -- --organization "$ORG_ID"'
```

Los modelos y los atributos se ajustan después en **Modelos** y **Modelos → Atributos**, desde la UI.

## 1c. La moneda principal, si el negocio cobra en dos monedas

*Desde la 29.4* ([brief-29.4](../decisions/brief-29.4-el-tipo-de-cambio.md), [ADR 0025](../decisions/0025-tipo-de-cambio.md)). Solo para un negocio que publica en una moneda y cobra también en otra, como una tienda de iPhone que vende en dólares y acepta pesos. **Un negocio de una sola moneda se salta este paso** y no cambia en nada.

`org:currency` fija la moneda principal y la otra moneda de la cotización **en la misma transacción**, auditadas con el `admin` como autor. Se fija **una sola vez**: fijarla con datos se permite, cambiarla no, y no hay comando para quitarla. La moneda principal tiene que valer más que la otra (1 USD = 1.565 ARS), porque la cotización es al menos 1. El correo del `admin` llega por el entorno:

```
sudo bash -c 'read -r -p "Id de la organización: " ORG_ID; read -r -p "Correo del admin: " MONEDA_ADMIN_CORREO; export MONEDA_ADMIN_CORREO; . /etc/crm-production/app.env && export DATABASE_URL && cd /srv/crm-production && exec runuser -u crm -- npm run --silent org:currency -- --organization "$ORG_ID" --main USD --quote ARS'
```

**La primera cotización la carga un `admin`** en **Caja → Cotización**. Hasta la 29.4.2, la cotización es solo manual.

## 2. La carga de los datos, por la UI

El `admin` ingresa en `https://crm.vixoraai.app/login` y carga, desde las pantallas del CRM:

- los productos, con su precio, marca, categoría y condición;
- la información del negocio que el agente va a leer;
- el stock inicial, si lo usa;
- los usuarios `viewer`, si hacen falta.

Los clientes **no** se cargan a mano: los crea la ingestión cuando escriben.

**Si después el negocio agrega un cliente desde la pantalla, un celular argentino va con el `9`: `+54 9 11 …`.** El CRM guarda el teléfono tal como llega y no agrega ni quita el `9` ([phone.ts](../../src/modules/crm/phone.ts)). El agente lo manda con el `9` (aviso del agente del 2026-10-02). Si el negocio lo carga como `+54 11 …`, cuando esa persona escriba, la ingestión no la encuentra y crea un segundo cliente para la misma persona. Se le dice al `admin` al entregarle el acceso.

Nada de lo cargado se copia al repositorio ni a la evidencia; se registra solo cuántos productos y cuántas entradas de información hay.

## 3. Las credenciales

Tres, una por alcance: `ingest` para la ingestión, `read` para el catálogo y la información, `context` para el historial. El `source` es el nombre con que el agente se identifica, acordado con él. **Las crea el operador en su terminal**, y cada token va directo a la configuración del agente:

```
sudo bash -c 'read -r -p "Id de la organización: " ORG_ID; read -r -p "Source del agente: " SRC; . /etc/crm-production/app.env && export DATABASE_URL && cd /srv/crm-production && for SCOPE in ingest read context; do runuser -u crm -- npm run --silent ingestion:credential -- create --org "$ORG_ID" --source "$SRC" --scope "$SCOPE"; done'
```

Cada una imprime su id y su token. Se registran los tres ids, nunca los tokens.

**Dos credenciales de control**, para comprobar que la allowlist rechaza lo ajeno: en la organización del operador, con `source` `control-allowlist`, una de `read` y otra de `ingest`:

```
sudo bash -c 'read -r -p "Id de la organización del operador: " ORG_ID; . /etc/crm-production/app.env && export DATABASE_URL && cd /srv/crm-production && for SCOPE in read ingest; do runuser -u crm -- npm run --silent ingestion:credential -- create --org "$ORG_ID" --source control-allowlist --scope "$SCOPE"; done'
```

Se revocan en el paso 5. Sus tokens se guardan **rotulados como de control**, aparte de los tres del negocio: en el ensayo de staging del 2026-10-01 se probó la allowlist con un token del negocio por error, y el código HTTP solo no lo delató ([evidencia-13.5](../decisions/evidencia-13.5-primer-cliente.md)).

## 4. Encender la lectura

La lectura no guarda nada del emisor, así que puede encenderse antes que la ingestión (brief-13.5, D-4). En el servidor:

```
read -r -p "Id de la credencial read: " ID_READ; read -r -p "Id de la credencial context: " ID_CTX
sudo sed -i '/^READ_API_/d' /etc/crm-production/app.env
printf 'READ_API_ENABLED=true\nREAD_API_ALLOWED_CREDENTIALS=%s,%s\n' "$ID_READ" "$ID_CTX" | sudo tee -a /etc/crm-production/app.env > /dev/null
sudo systemctl restart crm-production
```

Los ids van por la tubería, no como argumentos de `sudo`; tampoco son secretos.

Comprobaciones, desde la máquina del operador:

```
curl -s -o /dev/null -w '%{http_code}\n' https://crm.vixoraai.app/api/read/v1/knowledge
read -r -s -p "Token de CONTROL (read): " T; echo
curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $T" https://crm.vixoraai.app/api/read/v1/knowledge; unset T
```

La primera tiene que dar `401`, que es la API encendida; con `404` sigue apagada. La segunda tiene que dar **`403`**: una credencial válida que no está en la allowlist. Si da `200`, se apaga en el acto (paso 8) y se detiene.

**El código no alcanza: se confirma de quién era el token.** Un token del negocio pegado por error da `200` y se lee como un agujero; uno de otra organización que también esté en la allowlist daría el mismo `403` sin probar nada. Los rechazos de los últimos 10 minutos, con la organización y el `source` de su credencial:

```
ssh crm-production "sudo journalctl -u crm-production -o cat --since '-10 min' | jq -Rc 'fromjson? | select(type == \"object\" and .code == \"FORBIDDEN\") | {time, route, organization_id, source}'"
```

La línea de la hora del pedido tiene que decir la organización del operador y `source` `control-allowlist`. **Solo el `403` de la allowlist lleva la organización**: uno con `organization_id` nulo es un token de otro alcance (el de `ingest` en una ruta de lectura, por ejemplo) o revocado, y no prueba la allowlist. Si dice la organización del negocio, el token era del negocio. En los dos casos se repite con el token correcto antes de decidir nada.

El agente prueba su lectura con sus credenciales, y confirma `200`.

## 5. Encender la ingestión y comprobar su allowlist

Solo con la credencial `ingest` del negocio:

```
read -r -p "Id de la credencial ingest: " ID_ING
sudo sed -i '/^INGESTION_/d' /etc/crm-production/app.env
printf 'INGESTION_ENABLED=true\nINGESTION_ALLOWED_CREDENTIALS=%s\n' "$ID_ING" | sudo tee -a /etc/crm-production/app.env > /dev/null
sudo systemctl restart crm-production
```

Desde la máquina del operador, **antes del mensaje controlado y de abrir al negocio**, con el log todavía sin tráfico del agente:

```
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://crm.vixoraai.app/api/ingestion/v2/events
read -r -s -p "Token de CONTROL (ingest): " T; echo
curl -s -o /dev/null -w '%{http_code}\n' -X POST -H "Authorization: Bearer $T" -H 'Content-Type: application/json' -d '{}' https://crm.vixoraai.app/api/ingestion/v2/events; unset T
```

La primera tiene que dar `401`. La segunda, **`403`**, confirmado en el log con el comando del paso 4. La allowlist se mira antes que el cuerpo, así que el `{}` no cambia el resultado: un `400` quiere decir que el token estaba en la allowlist, y se apaga (paso 8).

Con las dos comprobaciones hechas, se revocan las dos credenciales de control:

```
sudo bash -c '. /etc/crm-production/app.env && export DATABASE_URL && cd /srv/crm-production && for i in 1 2; do read -r -p "Id de una credencial de control: " ID; runuser -u crm -- npm run --silent ingestion:credential -- revoke --id "$ID"; done'
```

## 6. H-4: el primer mensaje controlado

**Antes de cualquier cliente del negocio** (brief-13.5, D-5). Si el identificador de un evento lleva un teléfono, queda para siempre en `ingestion_events`, que no se puede vaciar. Por eso el primero sale de un teléfono cuyo dueño lo consiente, el del usuario.

1. El usuario manda **un** mensaje desde su teléfono al número del negocio, por la API oficial, y espera la respuesta del agente.

2. El operador corre la verificación **en su terminal**. El teléfono se pide dos veces y sin eco, dentro del shell de root, y llega al script por el entorno: ni en los argumentos, que se ven con `ps`, ni en una variable de `sudo`, que queda en su log.

   ```
   sudo bash -c 'read -r -p "Id de la organización: " ORG_ID; read -r -s -p "Tu teléfono, en E.164: " VERIFICAR_TELEFONO; echo; read -r -s -p "Otra vez: " OTRA; echo; [ "$VERIFICAR_TELEFONO" = "$OTRA" ] || { echo "No coinciden. No se corrió nada."; exit 3; }; unset OTRA; export VERIFICAR_TELEFONO; . /etc/crm-production/app.env && export DATABASE_URL && cd /srv/crm-production && exec runuser -u crm -- npx tsx scripts/verificar-identificadores.ts --org "$ORG_ID"'; echo "código: $?"
   ```

   Imprime solo recuentos. **Lo que tiene que mostrar** con el primer mensaje:

   - `ingestion_events` con **1 o más** identificadores: el mensaje entró. Con 0, el script sale con `2`;
   - «Teléfonos buscados: N (uno de VERIFICAR_TELEFONO)», con N igual a la cantidad de clientes con teléfono: el del usuario, si es el único, da **1**. Si da uno más, el número tecleado no es el de ningún cliente: un dígito equivocado, o el agente guardó otro número. Se repite antes de decidir nada;
   - «Ningún identificador lleva un teléfono buscado.» y código `0`.

   Los códigos:

   - **`1`**: un identificador lleva un teléfono. Se apaga la ingestión en el acto (paso 8) y se detiene (brief-13.5, condición de detención 2). Se eleva al usuario y al agente. El evento queda guardado, y es el único;
   - **`2`**: el resultado no prueba nada. No hay teléfonos para buscar, o la organización no tiene eventos de ingestión: un id equivocado, o el mensaje no llegó. Se revisa y se repite; **no** se abre al negocio;
   - **`3`**: un error, como un argumento inválido, la base caída o los dos teléfonos distintos. No es un hallazgo: se corrige y se repite.

## 7. Abrir al negocio

Con el paso 6 en `0`, el agente empieza a atender a los clientes del negocio. Técnicamente no cambia nada en el CRM: la allowlist ya admite solo esa credencial. Se registra la hora en que el agente confirma que empezó.

## 8. Apagar: la vuelta atrás

Apagar una superficie es borrar sus líneas de `app.env` y reiniciar. Los datos que ya entraron se quedan.

```
sudo sed -i '/^INGESTION_/d' /etc/crm-production/app.env    # la ingestión
sudo sed -i '/^READ_API_/d' /etc/crm-production/app.env     # la lectura
sudo systemctl restart crm-production
```

El `POST` y el `GET` sin credencial de los pasos 4 y 5 tienen que volver a dar `404`. Si el apagado es definitivo, además se revocan las tres credenciales del negocio, `ingest`, `read` y `context`, y se comprueba:

```
sudo bash -c '. /etc/crm-production/app.env && export DATABASE_URL && cd /srv/crm-production && for i in 1 2 3; do read -r -p "Id de una credencial del negocio: " ID; runuser -u crm -- npm run --silent ingestion:credential -- revoke --id "$ID"; done'
read -r -p "Id de la organización: " ORG_ID
ssh crm-production "sudo -u postgres psql -d crm_production -XA -F ' | ' -c \"select id, scope, source, revoked_at is not null as revocada from ingestion_credentials where organization_id = '$ORG_ID' order by created_at\""
```

Todas las de la organización tienen que decir `revocada` `t`.

`app.env` no está versionado, así que ninguna guarda ve si una superficie quedó encendida: se comprueba con esos pedidos.

## 9. Qué se registra

En la evidencia de la subfase o en el ticket del alta, con la fecha y la hora de cada paso:

- los ids de la organización, del `admin` y de las credenciales;
- cuántos productos y cuántas entradas de información se cargaron, y quién los cargó;
- el resultado de cada comprobación: `401`, `403` y `404`, y el del paso 6 con sus recuentos;
- la hora de apertura al negocio;
- los recuentos de `crm_production` antes y después del alta.
