# Alta de un negocio en producción

Cómo se da de alta un negocio en `crm.vixoraai.app`, se cargan sus datos y se encienden la ingestión y la lectura **solo para él**, detrás del modo de prueba. Y cómo se apaga, que es la vuelta atrás. Escrito para el primer negocio ([brief-13.5](../decisions/brief-13.5-primer-cliente.md)), y vale para cualquiera.

**Quién hace cada paso.** Cada paso en el servidor lo autoriza el usuario en su turno. Los que imprimen una contraseña o un token **los corre el operador en su propia terminal**, porque esos valores no pueden pasar por una conversación con un asistente ni quedar en un archivo. Los comandos piden cada valor con `read`, sin marcadores: un `<correo>` lo interpreta la shell como una redirección ([deploy/production](../../deploy/production/README.md), paso 10).

**Qué no se escribe nunca**, ni en el ticket, ni en la evidencia, ni en un mensaje: tokens, contraseñas, teléfonos, nombres de clientes del negocio, identificadores de mensajes (`wamid`) e IPs. Los ids de la organización y de las credenciales **sí** se registran: no dan acceso a nada.

## 0. Antes de empezar

Todo esto tiene que estar registrado con su fecha (brief-13.5, AC-8):

- el negocio confirmado por el usuario;
- la API oficial de WhatsApp montada para ese negocio;
- el agente listo para apuntar a producción, según su respuesta escrita;
- la decisión del usuario sobre el acuerdo con el negocio y el aviso a sus clientes (brief-13.5, D-10);
- producción en un SHA con la CI en `success`, y su salud: `curl -sI https://crm.vixoraai.app/login` da `200`;
- los recuentos de `crm_production`, como en la 13.4 ([evidencia-13.4](../decisions/evidencia-13.4-retencion-y-borrado.md), AC-9).

## 1. La organización y su `admin`

En el servidor (`ssh crm-production`), con la conexión de `app.env`. El `admin` es el dueño del negocio si carga él los datos, o el operador si los carga en su nombre (brief-13.5, D-3):

```
read -r -p "Organización: " ORG; read -r -p "Nombre del admin: " NOMBRE; read -r -p "Correo del admin: " CORREO
sudo ORG="$ORG" NOMBRE="$NOMBRE" CORREO="$CORREO" bash -c 'set -a && . /etc/crm-production/app.env && set +a && cd /srv/crm-production && exec sudo -u crm --preserve-env=DATABASE_URL npm run --silent org:create -- --name "$ORG" --admin-name "$NOMBRE" --admin-email "$CORREO"'
```

Imprime el id de la organización, el del `admin` y la contraseña inicial **una sola vez**. La contraseña se le entrega al `admin` por un canal acordado, y la cambia en su primer ingreso. Se registra el id de la organización.

## 2. La carga de los datos, por la UI

El `admin` ingresa en `https://crm.vixoraai.app/login` y carga, desde las pantallas del CRM:

- los productos, con su precio, marca, categoría y condición;
- la información del negocio que el agente va a leer;
- el stock inicial, si lo usa;
- los usuarios `viewer`, si hacen falta.

Los clientes **no** se cargan a mano: los crea la ingestión cuando escriben. Nada de lo cargado se copia al repositorio ni a la evidencia; se registra solo cuántos productos y cuántas entradas de información hay.

## 3. Las credenciales

Tres, una por alcance: `ingest` para la ingestión, `read` para el catálogo y la información, `context` para el historial. El `source` es el nombre con que el agente se identifica, acordado con él. **Las crea el operador en su terminal**, y cada token va directo a la configuración del agente:

```
read -r -p "Id de la organización: " ORG_ID; read -r -p "Source del agente: " SRC
for SCOPE in ingest read context; do
  sudo ORG_ID="$ORG_ID" SRC="$SRC" SCOPE="$SCOPE" bash -c 'set -a && . /etc/crm-production/app.env && set +a && cd /srv/crm-production && exec sudo -u crm --preserve-env=DATABASE_URL npm run --silent ingestion:credential -- create --org "$ORG_ID" --source "$SRC" --scope "$SCOPE"'
done
```

Cada una imprime su id y su token. Se registran los tres ids, nunca los tokens.

**Una credencial de control**, para comprobar que la allowlist rechaza lo ajeno: en la organización del operador, con `--source control-allowlist`, una de `read` y otra de `ingest`. Se revocan en el paso 7.

## 4. Encender la lectura

La lectura no guarda nada del emisor, así que puede encenderse antes que la ingestión (brief-13.5, D-4). En el servidor:

```
read -r -p "Id de la credencial read: " ID_READ; read -r -p "Id de la credencial context: " ID_CTX
sudo sed -i '/^READ_API_/d' /etc/crm-production/app.env
printf 'READ_API_ENABLED=true\nREAD_API_ALLOWED_CREDENTIALS=%s,%s\n' "$ID_READ" "$ID_CTX" | sudo tee -a /etc/crm-production/app.env > /dev/null
sudo systemctl restart crm-production
```

Comprobaciones, desde la máquina del operador:

```
curl -s -o /dev/null -w '%{http_code}\n' https://crm.vixoraai.app/api/read/v1/knowledge
read -r -s -p "Token de control (read): " T; echo
curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $T" https://crm.vixoraai.app/api/read/v1/knowledge; unset T
```

La primera tiene que dar `401`, que es la API encendida; con `404` sigue apagada. La segunda tiene que dar **`403`**: una credencial válida que no está en la allowlist. Si da `200`, se apaga en el acto (paso 8) y se detiene.

El agente prueba su lectura con sus credenciales, y confirma `200`.

## 5. H-4: el primer mensaje controlado

**Antes de cualquier cliente del negocio** (brief-13.5, D-5). Si el identificador de un evento lleva un teléfono, queda para siempre en `ingestion_events`, que no se puede vaciar. Por eso el primero sale de un teléfono cuyo dueño lo consiente, el del usuario.

1. Encender la ingestión solo con la credencial `ingest` del negocio:

   ```
   read -r -p "Id de la credencial ingest: " ID_ING
   sudo sed -i '/^INGESTION_/d' /etc/crm-production/app.env
   printf 'INGESTION_ENABLED=true\nINGESTION_ALLOWED_CREDENTIALS=%s\n' "$ID_ING" | sudo tee -a /etc/crm-production/app.env > /dev/null
   sudo systemctl restart crm-production
   ```

   `curl -s -o /dev/null -w '%{http_code}\n' -X POST https://crm.vixoraai.app/api/ingestion/v2/events` tiene que dar `401`.

2. El usuario manda **un** mensaje desde su teléfono al número del negocio, por la API oficial, y espera la respuesta del agente.

3. El operador corre la verificación **en su terminal**. El teléfono se pide sin eco y viaja en el entorno, no en los argumentos: un `sudo VERIFICAR_TELEFONO=…` lo dejaría en la línea de comandos, que cualquier usuario del servidor lee con `ps` (revisión independiente de la 13.3, hallazgo 6).

   ```
   read -r -p "Id de la organización: " ORG_ID; read -r -s -p "Tu teléfono, en E.164: " VERIFICAR_TELEFONO; echo; export VERIFICAR_TELEFONO
   sudo --preserve-env=VERIFICAR_TELEFONO ORG_ID="$ORG_ID" bash -c 'set -a && . /etc/crm-production/app.env && set +a && cd /srv/crm-production && exec sudo -u crm --preserve-env=DATABASE_URL,VERIFICAR_TELEFONO npx tsx scripts/verificar-identificadores.ts --org "$ORG_ID"'; unset VERIFICAR_TELEFONO
   ```

   Imprime solo recuentos. Tiene que terminar con «Ningún identificador lleva un teléfono buscado.» y código `0`.

   - **Con código `1`**: se apaga la ingestión en el acto (paso 8) y se detiene (brief-13.5, condición de detención 2). Se eleva al usuario y al agente. El evento queda guardado, y es el único.
   - **Con código `2`**: no había teléfonos para buscar, y no prueba nada. Se revisa que el teléfono se haya ingresado.

## 6. Abrir al negocio

Con H-4 en `0`, el agente empieza a atender a los clientes del negocio. Técnicamente no cambia nada en el CRM: la allowlist ya admite solo esa credencial. Se registra la hora en que el agente confirma que empezó.

## 7. Comprobar que la allowlist rechaza lo ajeno

```
read -r -s -p "Token de control (ingest): " T; echo
curl -s -o /dev/null -w '%{http_code}\n' -X POST -H "Authorization: Bearer $T" -H 'Content-Type: application/json' -d '{}' https://crm.vixoraai.app/api/ingestion/v2/events; unset T
```

Tiene que dar **`403`**. Después se revocan las dos credenciales de control:

```
for i in 1 2; do read -r -p "Id de una credencial de control: " ID
  sudo ID="$ID" bash -c 'set -a && . /etc/crm-production/app.env && set +a && cd /srv/crm-production && exec sudo -u crm --preserve-env=DATABASE_URL npm run --silent ingestion:credential -- revoke --id "$ID"'
done
```

## 8. Apagar: la vuelta atrás

Apagar una superficie es borrar sus líneas de `app.env` y reiniciar. Los datos que ya entraron se quedan.

```
sudo sed -i '/^INGESTION_/d' /etc/crm-production/app.env    # la ingestión
sudo sed -i '/^READ_API_/d' /etc/crm-production/app.env     # la lectura
sudo systemctl restart crm-production
```

El `POST` y el `GET` sin credencial de los pasos 4 y 5 tienen que volver a dar `404`. Si el apagado es definitivo, además se revocan las tres credenciales del negocio, como las de control del paso 7, y `select revoked_at from ingestion_credentials where id = '...'` no puede ser nulo.

`app.env` no está versionado, así que ninguna guarda ve si una superficie quedó encendida: se comprueba con esos pedidos.

## 9. Qué se registra

En la evidencia de la subfase o en el ticket del alta, con la fecha y la hora de cada paso:

- los ids de la organización, del `admin` y de las credenciales;
- cuántos productos y cuántas entradas de información se cargaron, y quién los cargó;
- el resultado de cada comprobación: `401`, `403` y `404`, y el del paso 5 con sus recuentos;
- la hora de apertura al negocio;
- los recuentos de `crm_production` antes y después del alta.
