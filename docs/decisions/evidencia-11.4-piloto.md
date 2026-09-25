# Evidencia 11.4 — Piloto en staging

Salidas crudas de la subfase 11.4 ([brief-11.4](brief-11.4-piloto-en-staging.md)). Se escribe a medida que se mide; lo que no está acá **no está medido**. Ningún token aparece en este documento.

## N-5 — `LC_CTYPE` de `crm_staging` (D-9, AC-5)

Medido el 2026-09-25 a las 02:38 UTC, **antes** de desplegar y de migrar. Es de solo lectura.

```
$ ssh crm-staging "date -u +%FT%TZ; sudo -u postgres psql -d crm_staging -tAc \"select datname, datcollate, datctype, pg_encoding_to_char(encoding) from pg_database where datname = 'crm_staging'\"; sudo -u postgres psql -d crm_staging -tAc \"select lower('ÁÉÑ'), upper('áéñ')\"; cd /srv/crm-staging && git rev-parse HEAD"
2026-09-25T02:38:01Z
crm_staging|C.UTF-8|C.UTF-8|UTF8
áéñ|ÁÉÑ
c2edbb55cf2f284d5f23b9810ece17547d6d226e
```

- **`LC_CTYPE` es `C.UTF-8`**, y `lower()` convierte letras fuera de ASCII. La condición de detención de D-9 (una base `C` o `POSIX`) **no se cumple**: se sigue.
- **Lo que no se esperaba**: la *collation* también es `C.UTF-8`. Las bases locales usan `en_US.utf8`. Con `C.UTF-8`, `ORDER BY` compara por código de carácter: «Ávila» va después de «Zapata», y una mayúscula antes que cualquier minúscula. Las listas que ordenan por `lower(nombre)` no sufren lo segundo, pero sí lo primero. **No es bloqueante**; queda como observación para el triage del piloto, con la pregunta de si el orden de las listas en staging coincide con el que el operador espera.
- Staging corría `c2edbb5` en ese momento.

## Etapa 11.4.2 — Despliegue y verificación, 2026-09-25

El usuario la autorizó el 2026-09-24, junto con la ejecución de la 11.4.1: «Autorizo también el push y cualquier paso sobre staging». Se ejecutó después de leer el CI de `f241f62`: `success`, run `36090109504`. Las horas están en UTC. Los comandos se transcriben sin los valores secretos, y ninguno de esos valores se imprimió.

### AC-6 — Backup previo

```
$ ssh crm-staging 'date -u +%FT%TZ; cd /srv/crm-staging && git rev-parse HEAD && git status --short | head; systemctl is-active crm-staging; ...'
2026-09-25T13:11:07Z
c2edbb55cf2f284d5f23b9810ece17547d6d226e
active

$ ssh crm-staging 'sudo systemctl start crm-backup.service; echo "exit=$?"; systemctl show crm-backup.service -p Result -p ExecMainStatus; sudo journalctl -u crm-backup.service --since "-3min" --no-pager | tail -8'
exit=0
Result=success
ExecMainStatus=0
Sep 25 13:11:21 ubuntu-s-1vcpu-1gb-nyc1 crm-backup.sh[63222]: backup: /var/backups/crm-staging/crm_staging-20260925T131120Z.dump
Sep 25 13:11:21 ubuntu-s-1vcpu-1gb-nyc1 crm-backup.sh[63222]: tamano: 55997 bytes
Sep 25 13:11:21 ubuntu-s-1vcpu-1gb-nyc1 crm-backup.sh[63222]: sha256: c2b1dabc766b4d81f9b26f9033e72554ba87f734d3775f0cb7dba9bbb2cecca9
Sep 25 13:11:21 ubuntu-s-1vcpu-1gb-nyc1 crm-backup.sh[63222]: rotado: /var/backups/crm-staging/crm_staging-20260922T205401Z.dump

$ ssh crm-staging 'sudo -u postgres psql -d crm_staging -tAc "select count(*), max(created_at) from drizzle.__drizzle_migrations"; ls /srv/crm-staging/drizzle/*.sql | wc -l'
16|1790016854728
16
```

- **Backup**: `crm_staging-20260925T131120Z.dump`, de **55 997 bytes**. Es la vuelta atrás de las migraciones (D-10). No contiene el seed del piloto, porque se tomó antes.
- La rotación borró el backup de `20260922T205401Z`. Es la política de retención de la 9.2, no un efecto de esta etapa.
- Antes de migrar, la base tenía **16** migraciones, de `0000` a `0015`.

### AC-6 — Código, dependencias y migraciones

```
$ ssh crm-staging 'cd /srv/crm-staging && git fetch --quiet && git reset --hard origin/main && git rev-parse HEAD && ls drizzle/*.sql | wc -l && npm ci --no-audit --no-fund 2>&1 | tail -3'
HEAD is now at f241f62 Implementar la etapa 11.4.1 — Preparación del piloto
f241f62e2d7ca199fcb4f9e1205d2bdb37677b7c
21
npm warn install-scripts   esbuild@0.28.2 (postinstall: node install.js)
npm warn install-scripts
npm warn install-scripts Run `npm install-scripts ls` to review, or `npm install-scripts approve <pkg>` to allow.

$ ssh crm-staging 'cd /srv/crm-staging && npm ci --no-audit --no-fund >/tmp/npmci.log 2>&1; echo "npm ci exit=$?"; grep -ciE "ERR!" /tmp/npmci.log; npx tsx --version; node -e "require(\"esbuild\").transformSync(...)"'
npm ci exit=0
0
tsx v4.23.13
node v24.21.0
esbuild ok
```

El aviso de `npm ci` dice que no corrió el `postinstall` de esbuild. Se comprobó que no importa: `npm ci` sale con 0, y esbuild transforma TypeScript, que es lo que usan `tsx` y el migrador.

**Primer intento de migrar, fallido y sin efecto**:

```
$ ssh crm-staging 'cd /srv/crm-staging && bash -c "set -a && . /etc/crm-staging/migrate.env && set +a && npm run db:migrate" 2>&1 | tail -5; ...'
bash: line 1: /etc/crm-staging/migrate.env: Permission denied
exit=1
16
```

El comando del README corre como el usuario del ssh, y los archivos de `/etc/crm-staging/` son `0600` de `root` (D-8 de la 9.1). No llegó a conectarse a la base: siguen **16** migraciones. **No es la condición de detención de D-10**, que es un fallo de la migración. Es un defecto del README y queda para el triage (E-1).

Se corrió de otra manera: `root` lee el archivo y le pasa a `npm` **solo** las variables que nombra el comando. `npm` sigue corriendo como `benja`, el dueño de `/srv/crm-staging`. Antes se listaron los nombres de las variables de cada archivo, sin sus valores:

```
$ ssh crm-staging 'for f in migrate seed app; do echo "$f:"; sudo sed -E "s/=.*//" /etc/crm-staging/$f.env; done'
migrate:
DATABASE_URL
seed:
SEED_USER_PASSWORD
app:
NODE_ENV
PORT
HOSTNAME
DATABASE_URL
TRUSTED_PROXY
INGESTION_ENABLED
INGESTION_ALLOWED_CREDENTIALS

$ ssh crm-staging 'sudo bash -c "set -a && . /etc/crm-staging/migrate.env && set +a && cd /srv/crm-staging && exec sudo -u benja --preserve-env=DATABASE_URL npm run db:migrate" 2>&1 | tail -4; echo "exit=${PIPESTATUS[0]}"; sudo -u postgres psql -d crm_staging -tAc "select count(*) from drizzle.__drizzle_migrations"; find /srv/crm-staging -user root | head -3'
> ai-whatsapp-agent-crm@0.1.0 db:migrate
> tsx scripts/migrar.ts

Migraciones aplicadas.
exit=0
21
```

`find` no encontró ningún archivo de `root` en el repositorio.

### Build y reinicio

```
$ ssh crm-staging 'sudo bash -c "set -a && . /etc/crm-staging/app.env && set +a && cd /srv/crm-staging && exec sudo -u benja --preserve-env=NODE_ENV,PORT,HOSTNAME,DATABASE_URL,TRUSTED_PROXY,INGESTION_ENABLED,INGESTION_ALLOWED_CREDENTIALS npm run build" > /tmp/build.log 2>&1; echo "build exit=$?"; tail -4 /tmp/build.log; grep -ciE "error" /tmp/build.log; sudo systemctl restart crm-staging; sleep 4; systemctl is-active crm-staging; curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/login; free -m | sed -n 2p'
build exit=0
ƒ Proxy (Middleware)

ƒ  (Dynamic)  server-rendered on demand

0
active
200
Mem:             961         381         479           5         263         580
```

### AC-7 — Comprobaciones posteriores al despliegue

Pasos 1, 3, 4 y 5 del README, más HEAD y las migraciones. Se corrieron en una sola invocación desde la máquina local, con los comandos del README.

```
== 1. diff de los nueve
nginx OK
crm-staging.service OK
crm-backup.sh OK
crm-restore-check.sh OK
crm-backup.service OK
crm-backup.timer OK
crm-restore-check.service OK
crm-restore-check.timer OK
postgresql OK
9
== 3. HSTS
HTTP/1.1 200 OK
strict-transport-security: max-age=31536000; includeSubDomains
-- http:
HTTP/1.1 301 Moved Permanently
Location: https://staging.vixoraai.app/login
== 4. loopback
LISTEN 0      511        127.0.0.1:3000      0.0.0.0:*    users:(("next-server (v1",pid=64126,fd=21))
== 5. rol
BEGIN
ERROR:  permission denied for table audit_logs
== HEAD y migraciones
f241f62e2d7ca199fcb4f9e1205d2bdb37677b7c
27|b62f7adce93e2f252676ddecc9739c88c12d9a2e92d30dd65c34e68699430423|1790284916335
26|9d237e5adf3cff5e6eee7405a4f4772c881d4c6e0fb66214589b1c0502ce8a77|1790278993127
25|93bea1bc1f765785caddd134f198f3f3685a138964b44bd05782c066be615952|1790278985243
24|17d093f9b169d6e747dbd54231c0958d11863a0ea6faf358c8266afb16aec306|1790261310160
23|571899fa646288ece5002535d7a618757c5bb2a3b97e4b8584184134185ce5aa|1790258321643
```

- **1.** Los nueve archivos, sin ninguna diferencia. `ls deploy/staging/ | grep -v README | wc -l` da 9, igual que las filas de la tabla.
- **3.** Sobre HTTP no hay HSTS: la respuesta es una redirección `301` a HTTPS.
- **4.** Escucha solo en `127.0.0.1:3000`.
- **5.** El comando fue `sudo bash -c 'set -a; . /etc/crm-staging/app.env; set +a; psql "$DATABASE_URL" -c "begin; delete from audit_logs where false; rollback;"'`, con la conexión de `app.env`.
  - `where false` hace que no se borre ninguna fila, y `begin … rollback` deshace cualquier efecto.
  - PostgreSQL comprueba el permiso al planificar la sentencia, así que el rechazo no depende de que haya filas.
- **Migraciones**: hay 21 filas. Las cinco de arriba son las nuevas, de `0016` a `0020`. Los ids de `__drizzle_migrations` salen de una secuencia y no coinciden con el número del archivo.

**Paso 2: un solo salto de proxy.** El ingreso fallido se provocó desde la máquina local con Chromium sin interfaz, a través de Playwright. Es un navegador real, así que la Server Action corre como en uso normal. El usuario `control-proxy@example.com` no existe.

```
$ node -e '… chromium.launch() … fill("control-proxy@example.com") … fill("incorrecta-a-proposito") … click(ingresar) …'
url: https://staging.vixoraai.app/login
alerta:
== key_hash
362e48d25936a0713f2b6f6f12292449e7168e21f1d40c249d4ff67303058d3e|2026-09-25 13:17:11.141+00
== sha256(ip pública)
362e48d25936a0713f2b6f6f12292449e7168e21f1d40c249d4ff67303058d3e
```

**Control**: lo mismo por un túnel SOCKS (`ssh -f -N -D 1080 crm-staging`), que sale con la IP del droplet.

```
== key_hash
b9e00b76e068f403be7357635f19fbc47fdb5f094c1ddbad14205489c34b337f|2026-09-25 13:17:32.817+00
362e48d25936a0713f2b6f6f12292449e7168e21f1d40c249d4ff67303058d3e|2026-09-25 13:17:11.141+00
== sha256(ip del túnel)
b9e00b76e068f403be7357635f19fbc47fdb5f094c1ddbad14205489c34b337f
```

En los dos casos, la clave sigue a la IP del cliente: hay un solo salto de proxy. Después se cerró el túnel y se comprobó que el puerto 1080 quedó libre.

**Lo que no mide**: `alerta:` salió vacío. El script lee `role=alert`, y el aviso de credenciales inválidas no usa ese rol o no apareció en 3 s. La prueba no depende del aviso, sino de la fila en `login_attempts`.

### Seed del piloto

`seed.env` trae solo la contraseña, así que la conexión es la de `app.env`: el **rol de la aplicación**, el de menor privilegio. Alcanzó.

```
$ ssh crm-staging 'sudo bash -c "set -a && . /etc/crm-staging/app.env && . /etc/crm-staging/seed.env && set +a && cd /srv/crm-staging && exec sudo -u benja --preserve-env=DATABASE_URL,SEED_USER_PASSWORD npm run db:seed:pilot" 2>&1 | tail -15; echo "exit=${PIPESTATUS[0]}"'
> ai-whatsapp-agent-crm@0.1.0 db:seed:pilot
> tsx seeds/pilot.ts

Seed del piloto aplicado: piloto-admin@example.com, piloto-lectura@example.com; 60 productos, 15 entradas, 30 clientes y 40 conversaciones.
exit=0

$ ssh crm-staging 'sudo -u postgres psql -d crm_staging -f /tmp/q.sql'   # recuentos por organización
          name           | prod | inact | ent | cli | conv | msg | miem
-------------------------+------+-------+-----+-----+------+-----+------
 Organización de ejemplo |    0 |     0 |   0 |   6 |   10 |  26 |    3
 Organización del piloto |   60 |     5 |  15 |  30 |   40 | 160 |    2
(2 rows)

  ?column?  | count
------------+-------
 audit_logs |     0
(1 row)
```

**Segunda corrida**: misma salida y los **mismos recuentos**, fila por fila. La organización de ejemplo no cambió (6 clientes, 10 conversaciones, 0 productos), y el seed no escribió en `audit_logs`.

### AC-8 — Las 13 pantallas, con el usuario `admin` del piloto

La contraseña se leyó de `seed.env` a una variable de entorno local, sin imprimirla (`contraseña cargada (28 caracteres)`). Aparece **0 veces** en las dos salidas.

```
$ CRM_BASE_URL=https://staging.vixoraai.app CRM_EMAIL=piloto-admin@example.com CRM_PASSWORD=… npx tsx scripts/recorrer-pantallas.ts
recorrido exit=0

## Recorrido de las 13 pantallas — https://staging.vixoraai.app

| # | Pantalla | Ruta | Carga | Contenido |
| --- | --- | --- | --- | --- |
| 1 | Inicio de sesión | /login | — | ingreso correcto |
| 2 | Dashboard | `/` | 545 ms | ok |
| 3 | Lista de productos | `/productos` | 841 ms | ok |
| 4 | Detalle de producto | `/productos/5eed0000-0000-4000-9000-020000000001` | 683 ms | ok |
| 5 | Historial de movimientos | `/productos/5eed0000-0000-4000-9000-020000000001/movimientos` | 712 ms | ok |
| 5b | Precios de un producto | `/productos/5eed0000-0000-4000-9000-020000000001/precios` | 693 ms | ok |
| 6 | Lista de clientes | `/clientes` | 563 ms | ok |
| 7 | Detalle de cliente | `/clientes/5eed0000-0000-4000-9000-070000000001` | 707 ms | ok |
| 8 | Lista de conversaciones | `/conversaciones` | 499 ms | ok |
| 9 | Detalle de conversación | `/conversaciones/5eed0000-0000-4000-9000-080000000031` | 620 ms | ok |
| 10 | Usuarios y roles | `/usuarios` | 544 ms | ok |
| 11 | Información del negocio | `/informacion` | 780 ms | ok |
| 12 | Detalle de una entrada | `/informacion/5eed0000-0000-4000-9000-060000000011` | 957 ms | ok |

**Problemas registrados: 0** (consola, excepción, red, http, contenido y navegación).

Sesión cerrada: la cookie anterior ya no entra.

$ CRM_CONTROL=1 … npx tsx scripts/recorrer-pantallas.ts
control exit=0

## Control negativo — una detección por provocación

- consola «control negativo: error de consola provocado»: detectada
- excepción «control negativo: excepción provocada»: detectada
- red «/control-negativo-red»: detectada
- http «/ruta-que-no-existe-control»: detectada
- contenido «Encabezado que no existe en ninguna pantalla»: detectada
- contenido «tarjetas en error en /control-tarjeta-en-error»: detectada
- contenido «no terminaron de cargar en /control-tarjeta-cargando»: detectada
- texto «No se pudo calcular.» en src/app/(autenticado)/_dashboard/messages.ts: sí
- texto «░░░░» en src/app/(autenticado)/_dashboard/metric-card.tsx: sí
  - [consola] control: consola: control negativo: error de consola provocado
  - [excepción] control: excepción: control negativo: excepción provocada
  - [red] control: red: net::ERR_FAILED https://staging.vixoraai.app/control-negativo-red
  - [consola] control: http: Failed to load resource: net::ERR_FAILED
  - [http] control: http: 404 https://staging.vixoraai.app/ruta-que-no-existe-control
  - [consola] 2. control: contenido: Failed to load resource: the server responded with a status of 404 (Not Found)
  - [contenido] 2. control: contenido: no apareció encabezado «Encabezado que no existe en ninguna pantalla» en /
  - [contenido] 2. control: /control-tarjeta-en-error: 1 tarjetas en error en /control-tarjeta-en-error
  - [contenido] 2. control: /control-tarjeta-cargando: hay tarjetas que no terminaron de cargar en /control-tarjeta-cargando

Control en verde: cada provocación se detectó en su clase.

Sesión cerrada: la cookie anterior ya no entra.
```

**Lo que no mide**: que las pantallas sean usables; solo que cargan con su contenido. La usabilidad es de la 11.4.3. Además, el recorrido se hizo solo con `admin`; el `viewer` entra en la ventana.

### AC-9 — La API de lectura en staging

La credencial se creó con el rol de la aplicación. La salida completa fue a `cred.out`, un archivo local del directorio temporal de la sesión, **fuera del repositorio**. De ahí se sacaron el id y el token: el token fue a otro archivo, que nunca se imprimió. `cred.out` se borró en ese mismo comando, y el archivo del token, al terminar la etapa.

**Lo de abajo no es la salida cruda de `create`**: es la de ese comando, que imprime el id, el tamaño del token y las líneas de `cred.out` salvo la del token. «53 bytes» incluye el salto de línea final que agrega `sed`: el token tiene el formato `crm_read_` más 43 caracteres, 52 en total.

**Desvío del README, registrado**: `deploy/staging/README.md` dice que el token «se copia a un gestor local y nunca a un archivo del repositorio, a la evidencia ni a un mensaje». Nunca entró al repositorio, a la evidencia ni a un mensaje, pero sí pasó por dos archivos locales temporales. Se hizo para no imprimirlo nunca en la terminal. Los dos archivos se borraron.

```
$ ssh crm-staging 'sudo bash -c "set -a && . /etc/crm-staging/app.env && set +a && cd /srv/crm-staging && exec sudo -u benja --preserve-env=DATABASE_URL npm run --silent ingestion:credential -- create --org 5eed0000-0000-4000-9000-000000000001 --source piloto-11-4 --scope read"' > cred.out
exit=0
id: 38bf78e9-3bdb-4e0d-9fb7-9800d32617f4
token: 53 bytes (no se imprime)
Credencial creada: 38bf78e9-3bdb-4e0d-9fb7-9800d32617f4
Para aceptarla, sumá el id a READ_API_ALLOWED_CREDENTIALS y poné READ_API_ENABLED=true.
```

**Encendido**: primero una copia, `app.env.pre-11.4`, con `cp -p`; después, las dos líneas, agregadas con `sudo tee -a`. El `0` es el número de líneas `READ_API` que había antes en `app.env`.

```
antes: 404
0
NODE_ENV
PORT
HOSTNAME
DATABASE_URL
TRUSTED_PROXY
INGESTION_ENABLED
INGESTION_ALLOWED_CREDENTIALS
READ_API_ENABLED
READ_API_ALLOWED_CREDENTIALS
600 root
active
después: 401
```

**La prueba**. `CRM_READ_TOKEN` se leyó del archivo, sin imprimirlo:

```
$ CRM_BASE_URL=https://staging.vixoraai.app CRM_READ_TOKEN=… npx tsx scripts/probar-api-lectura.ts
exit=0
apariciones del token: 0
2026-09-25T13:20:58Z
# Prueba de la API de lectura v1 — https://staging.vixoraai.app
Correlación de esta corrida: piloto-11-4-807bca58-2539-4980-8c1c-eada65b530a5

GET /products?q=reacondicionado&limit=10 → 200 (request_id 5c7cd529-3cce-48df-bf16-75e6a4433819)
  10 productos:
  - Aria 5 (2da gen.) reacondicionado · Brisa · Celulares · refurbished · 294000.00 ARS · disponible
  - Atlas Pro (2da gen.) reacondicionado · Novatek · Notebooks · refurbished · sin precio · bajo_stock
  - Bass 2 reacondicionado · Brisa · Auriculares · refurbished · 44100.00 ARS · disponible
  - Eco Buds (2da gen.) reacondicionado · Novatek · Auriculares · refurbished · 31500.00 ARS · bajo_stock
  - Folio Kids reacondicionado · Brisa · Tablets · refurbished · 280000.00 ARS · disponible
  - Hora One reacondicionado · Novatek · Relojes inteligentes · refurbished · 134400.00 ARS · bajo_stock
  - Libra 16 reacondicionado · Arkon · Notebooks · refurbished · 721000.00 ARS · disponible
  - Power bank 10000 (2da gen.) reacondicionado · Kalma · Accesorios · refurbished · sin precio · sin_stock
  - Pulse Mini (2da gen.) reacondicionado · Novatek · Celulares · refurbished · 388500.00 ARS · bajo_stock
  - Pulse X reacondicionado · Arkon · Celulares · refurbished · 357000.00 ARS · disponible

GET /products?q=Aria&limit=10 → 200 (request_id 64a2a894-60cf-409d-a1b2-a1af7ac8bf3f)
  4 productos:
  - Aria 5 · Novatek · Celulares · new · 420000.00 ARS · disponible
  - Aria 5 (2da gen.) reacondicionado · Brisa · Celulares · refurbished · 294000.00 ARS · disponible
  - Aria 7 · Veltra · Celulares · new · 465000.00 ARS · disponible
  - Aria 7 (2da gen.) · Kalma · Celulares · new · 465000.00 ARS · disponible

GET /products?q=auriculares&limit=10 → 200 (request_id 35d1e0b9-e4a5-485e-bb1e-4b267278a351)
  10 productos:
  - Bass 2 (2da gen.) · Arkon · Auriculares · new · 63000.00 ARS · disponible
  - Bass 2 reacondicionado · Brisa · Auriculares · refurbished · 44100.00 ARS · disponible
  - Eco Buds · Orbis · Auriculares · new · sin precio · bajo_stock
  - Eco Buds (2da gen.) reacondicionado · Novatek · Auriculares · refurbished · 31500.00 ARS · bajo_stock
  - Eco Over · Sonora · Auriculares · new · 54000.00 ARS · sin_stock
  - Eco Over (2da gen.) · Veltra · Auriculares · new · sin precio · sin_stock
  - Run Fit · Lumen · Auriculares · new · 81000.00 ARS · disponible
  - Run Fit (2da gen.) · Sonora · Auriculares · new · 81000.00 ARS · disponible
  - Studio One · Kalma · Auriculares · new · 72000.00 ARS · disponible
  - Studio One (2da gen.) reacondicionado · Orbis · Auriculares · refurbished · sin precio · disponible

GET /products?q=Novatek&limit=10 → 200 (request_id 102a2f38-d12d-48be-9be6-cec09f50f62b)
  7 productos:
  - Aria 5 · Novatek · Celulares · new · 420000.00 ARS · disponible
  - Atlas Pro (2da gen.) reacondicionado · Novatek · Notebooks · refurbished · sin precio · bajo_stock
  - Eco Buds (2da gen.) reacondicionado · Novatek · Auriculares · refurbished · 31500.00 ARS · bajo_stock
  - Hora One reacondicionado · Novatek · Relojes inteligentes · refurbished · 134400.00 ARS · bajo_stock
  - Pulse Mini (2da gen.) reacondicionado · Novatek · Celulares · refurbished · 388500.00 ARS · bajo_stock
  - Soporte de escritorio reacondicionado · Novatek · Accesorios · refurbished · sin precio · bajo_stock
  - Tabla 8 (2da gen.) reacondicionado · Novatek · Tablets · refurbished · 238000.00 ARS · bajo_stock

GET /products/5eed0000-0000-4000-9000-020000000031 → 200 (request_id 8d3cc439-fcf9-4823-aedd-5bb8f886bf54)
  detalle: Aria 5 (2da gen.) reacondicionado

GET /products/5eed0000-0000-4000-9000-020000000006 (con credencial) → 404

GET /products/6e833295-dca8-4b2b-b9a2-20a3c4002bfa (con credencial) → 404

GET /products?q=cafe (sin credencial) → 401

GET /knowledge?limit=50 → 200 (request_id 99c4729b-0406-4c05-bd6a-aba4e06ccd42)
  12 entradas:
  - [Devoluciones] Cambios y devoluciones: Aceptamos cambios dentro de los 10 días de la compra, con el producto sin uso y en su caja original.
  - [Envíos] Costo de envío: El envío es gratis en compras de más de 150.000 pesos. Por debajo de ese monto se cotiza según el código postal.
  - [Envíos] Envíos a domicilio: Enviamos a todo el país por correo. En la ciudad, el envío llega en 24 a 48 h hábiles.
  - [Garantía] Garantía de productos nuevos: Los productos nuevos tienen 12 meses de garantía oficial del fabricante, con la factura de compra.
  - [Garantía] Garantía de reacondicionados: Los reacondicionados tienen 6 meses de garantía del local. Se revisan y se prueban antes de la venta.
  - [Garantía] Servicio técnico: El servicio técnico recibe equipos de lunes a viernes de 10 a 17 h. El diagnóstico tarda hasta 72 h.
  - [Horarios] Horario de atención: Atendemos de lunes a viernes de 10 a 19 h y los sábados de 10 a 14 h. Domingos y feriados, cerrado.
  - [Horarios] Horario de atención por WhatsApp: Respondemos mensajes de lunes a sábado de 9 a 21 h. Fuera de ese horario contestamos al día siguiente.
  - [Medios de pago] Cuotas sin interés: Tres cuotas sin interés con tarjetas de crédito bancarias en celulares y notebooks nuevos.
  - [Medios de pago] Medios de pago: Aceptamos efectivo, transferencia bancaria, tarjetas de débito y tarjetas de crédito de todas las marcas.
  - [Ubicación] Dirección del local: Estamos en Avenida Siempreviva 742, local 3, a dos cuadras de la estación. Hay estacionamiento medido en la cuadra.
  - [Ubicación] Retiro en el local: Las compras se pueden retirar en el local desde el día hábil siguiente, con el número de pedido y el DNI del titular.

GET /knowledge?q=envios → 200 (request_id 2ba9d489-b6bc-4d16-aef4-e81169e2ea3e)
  2 entradas:
  - [Envíos] Envíos a domicilio: Enviamos a todo el país por correo. En la ciudad, el envío llega en 24 a 48 h hábiles.
  - [Envíos] Costo de envío: El envío es gratis en compras de más de 150.000 pesos. Por debajo de ese monto se cotiza según el código postal.

GET /knowledge?q=garantia → 200 (request_id 68df7a90-90b8-4790-8508-98900e38b3cf)
  3 entradas:
  - [Garantía] Garantía de productos nuevos: Los productos nuevos tienen 12 meses de garantía oficial del fabricante, con la factura de compra.
  - [Garantía] Garantía de reacondicionados: Los reacondicionados tienen 6 meses de garantía del local. Se revisan y se prueban antes de la venta.
  - [Garantía] Servicio técnico: El servicio técnico recibe equipos de lunes a viernes de 10 a 17 h. El diagnóstico tarda hasta 72 h.

GET /knowledge?q=horario → 200 (request_id 7c06bbce-ee1d-42b0-ae90-20f32a8d3845)
  2 entradas:
  - [Horarios] Horario de atención por WhatsApp: Respondemos mensajes de lunes a sábado de 9 a 21 h. Fuera de ese horario contestamos al día siguiente.
  - [Horarios] Horario de atención: Atendemos de lunes a viernes de 10 a 19 h y los sábados de 10 a 14 h. Domingos y feriados, cerrado.

**Fallas: 0**
```

**El log de staging**: las líneas con la correlación de la corrida, en crudo.

```
$ ssh crm-staging "sudo journalctl -u crm-staging --since '-10min' --no-pager -o cat | grep -F 'piloto-11-4-807bca58-2539-4980-8c1c-eada65b530a5'"
{"time":"2026-09-25T13:21:08.661Z","level":"info","request_id":"5c7cd529-3cce-48df-bf16-75e6a4433819","route":"/api/read/v1/products","code":"OK","organization_id":"5eed0000-0000-4000-9000-000000000001","source":"piloto-11-4","correlation_id":"piloto-11-4-807bca58-2539-4980-8c1c-eada65b530a5","duration_ms":91}
{"time":"2026-09-25T13:21:09.224Z","level":"info","request_id":"64a2a894-60cf-409d-a1b2-a1af7ac8bf3f","route":"/api/read/v1/products","code":"OK","organization_id":"5eed0000-0000-4000-9000-000000000001","source":"piloto-11-4","correlation_id":"piloto-11-4-807bca58-2539-4980-8c1c-eada65b530a5","duration_ms":19}
{"time":"2026-09-25T13:21:09.448Z","level":"info","request_id":"35d1e0b9-e4a5-485e-bb1e-4b267278a351","route":"/api/read/v1/products","code":"OK","organization_id":"5eed0000-0000-4000-9000-000000000001","source":"piloto-11-4","correlation_id":"piloto-11-4-807bca58-2539-4980-8c1c-eada65b530a5","duration_ms":24}
{"time":"2026-09-25T13:21:09.641Z","level":"info","request_id":"102a2f38-d12d-48be-9be6-cec09f50f62b","route":"/api/read/v1/products","code":"OK","organization_id":"5eed0000-0000-4000-9000-000000000001","source":"piloto-11-4","correlation_id":"piloto-11-4-807bca58-2539-4980-8c1c-eada65b530a5","duration_ms":12}
{"time":"2026-09-25T13:21:09.852Z","level":"info","request_id":"8d3cc439-fcf9-4823-aedd-5bb8f886bf54","route":"/api/read/v1/products/{product_id}","code":"OK","organization_id":"5eed0000-0000-4000-9000-000000000001","source":"piloto-11-4","correlation_id":"piloto-11-4-807bca58-2539-4980-8c1c-eada65b530a5","duration_ms":19}
{"time":"2026-09-25T13:21:10.040Z","level":"warn","request_id":"ae12a765-19a0-4b64-be8c-cf3f0bedb393","route":"/api/read/v1/products/{product_id}","code":"NOT_FOUND","organization_id":"5eed0000-0000-4000-9000-000000000001","source":"piloto-11-4","correlation_id":"piloto-11-4-807bca58-2539-4980-8c1c-eada65b530a5","duration_ms":10}
{"time":"2026-09-25T13:21:10.230Z","level":"warn","request_id":"9ab77afa-e8d6-4b7e-9499-a29970c0a8bf","route":"/api/read/v1/products/{product_id}","code":"NOT_FOUND","organization_id":"5eed0000-0000-4000-9000-000000000001","source":"piloto-11-4","correlation_id":"piloto-11-4-807bca58-2539-4980-8c1c-eada65b530a5","duration_ms":11}
{"time":"2026-09-25T13:21:10.608Z","level":"info","request_id":"99c4729b-0406-4c05-bd6a-aba4e06ccd42","route":"/api/read/v1/knowledge","code":"OK","organization_id":"5eed0000-0000-4000-9000-000000000001","source":"piloto-11-4","correlation_id":"piloto-11-4-807bca58-2539-4980-8c1c-eada65b530a5","duration_ms":16}
{"time":"2026-09-25T13:21:10.796Z","level":"info","request_id":"2ba9d489-b6bc-4d16-aef4-e81169e2ea3e","route":"/api/read/v1/knowledge","code":"OK","organization_id":"5eed0000-0000-4000-9000-000000000001","source":"piloto-11-4","correlation_id":"piloto-11-4-807bca58-2539-4980-8c1c-eada65b530a5","duration_ms":9}
{"time":"2026-09-25T13:21:10.982Z","level":"info","request_id":"68df7a90-90b8-4790-8508-98900e38b3cf","route":"/api/read/v1/knowledge","code":"OK","organization_id":"5eed0000-0000-4000-9000-000000000001","source":"piloto-11-4","correlation_id":"piloto-11-4-807bca58-2539-4980-8c1c-eada65b530a5","duration_ms":11}
{"time":"2026-09-25T13:21:11.166Z","level":"info","request_id":"7c06bbce-ee1d-42b0-ae90-20f32a8d3845","route":"/api/read/v1/knowledge","code":"OK","organization_id":"5eed0000-0000-4000-9000-000000000001","source":"piloto-11-4","correlation_id":"piloto-11-4-807bca58-2539-4980-8c1c-eada65b530a5","duration_ms":10}
```

```
$ ssh crm-staging "sudo journalctl -u crm-staging --since '2026-09-25 13:21:05' --until '2026-09-25 13:21:15' --no-pager -o cat | grep -v -F piloto-11-4-807bca58"
{"time":"2026-09-25T13:21:10.409Z","level":"warn","request_id":"8a42b877-d4fd-4c85-bac6-1753880b5f41","route":"/api/read/v1/products","code":"UNAUTHENTICATED","duration_ms":1}
```

- **12 pedidos, 12 líneas**: 11 llevan la correlación, y la del `401` no.
  - Es deliberado: `serve.ts` lee `X-Correlation-Id` recién **después** de autenticar (líneas 125 a 132).
  - Por eso un pedido sin credencial no registra ni organización, ni `source`, ni correlación.
  - El contrato dice que se registran «cuando se conocen». Queda como observación de redacción (E-3), no como defecto.
- **Token en el journal**: 0 apariciones en los últimos 10 minutos.
- **Texto buscado e ids en el journal**, en la ventana de 13:20:50 a 13:21:20: **0** apariciones de cada uno de estos términos:
  - las búsquedas `reacondicionado`, `Aria`, `auriculares`, `Novatek`, `envios`, `garantia`, `horario` y `cafe`;
  - los nombres de parámetro `"q"` y `limit`;
  - los fragmentos de id `020000000031`, `020000000006` y `6e833295`.

**Apagado y revocación**:

```
$ ssh crm-staging "sudo sed -i '/^READ_API_ENABLED=/d;/^READ_API_ALLOWED_CREDENTIALS=/d' /etc/crm-staging/app.env && sudo cmp /etc/crm-staging/app.env /etc/crm-staging/app.env.pre-11.4 && echo 'app.env idéntico al previo' && sudo rm /etc/crm-staging/app.env.pre-11.4 && sudo stat -c '%a %U' /etc/crm-staging/app.env && sudo systemctl restart crm-staging && sleep 5 && systemctl is-active crm-staging"
app.env idéntico al previo
600 root
active
GET knowledge: 404
Credencial revocada: 38bf78e9-3bdb-4e0d-9fb7-9800d32617f4
38bf78e9-3bdb-4e0d-9fb7-9800d32617f4|piloto-11-4|read|5eed0000-0000-4000-9000-000000000001|2026-09-25 13:22:11.512022+00
```

`cmp` confirma que `app.env` quedó **byte a byte** igual que antes de encender la API. `revoked_at` no es nulo, y el archivo local del token se borró.

**Lo que no mide**:
- el consumidor real, que llega en la 12.3;
- un `401` con el token revocado. No se probó porque, con la API apagada, todo responde `404`, que es lo que exige D-6.

### Estado al terminar la etapa

```
$ ssh crm-staging 'date -u +%FT%TZ; free -m | sed -n "2,3p"; systemctl is-active crm-staging; cd /srv/crm-staging && git rev-parse --short HEAD && git status --short | wc -l'
2026-09-25T13:22:21Z
Mem:             961         419         288          11         423         542
Swap:           2047         177        1870
active
f241f62
0

$ ssh crm-staging 'vmstat 2 4 | awk "{print \$7, \$8}"; grep VmSwap /proc/$(pgrep -f next-server | head -1)/status; cat /proc/sys/vm/swappiness'
si so
1 3
0 0
0 0
0 0
VmSwap:	       0 kB
10
```

Los 177 MB de swap los dejó el `build`. En régimen normal, `si` y `so` quedan en 0, y el proceso de la aplicación no tiene nada en swap. No es el hallazgo del paso 1 del aprovisionamiento («si el entorno usa swap en régimen normal»), pero queda anotado (E-4).

### Hallazgos de la etapa, para el triage

Se registran acá y se clasifican en el triage de la 11.4.3, con la escala de D-5. No se corrigió ninguno.

- **E-1 — El procedimiento de despliegue del README no corre tal como está escrito.**
  - `set -a && . /etc/crm-staging/migrate.env` falla con `Permission denied`, porque los archivos son `0600` de `root`. Pasa lo mismo con `app.env`, tanto en el `build` como en la creación de la credencial.
  - Se corrió con `sudo bash -c "… exec sudo -u benja --preserve-env=<variables> npm run …"`.
  - El README tiene que decir cómo se corre, y qué variables pasa cada comando.
- **E-2 — La collation de `crm_staging` es `C.UTF-8`** (§N-5), así que «Ávila» se ordena después de «Zapata». Se observa en la ventana.
- **E-3 — El log de un `401` no lleva `correlation_id`**, aunque el pedido la mande. Es deliberado (ver AC-9). Queda por decidir si el contrato tiene que decirlo con más claridad.
- **E-4 — Swap residual después del build** (ver arriba). No hay actividad de swap en régimen normal.

### Contraste por criterio (etapa 11.4.2, autoevaluación)

- **AC-5 (N-5)** — cumplido (§N-5).
- **AC-6 (despliegue)** — cumplido:
  - el backup `crm_staging-20260925T131120Z.dump`, de 55 997 bytes;
  - `Migraciones aplicadas.`, con 21 filas en `__drizzle_migrations`, contra 16 antes;
  - HEAD en `f241f62`.
- **AC-7 (comprobaciones posteriores)** — cumplido. Dieron lo esperado las cinco, con el control del paso 2.
- **AC-8 (pantallas)** — cumplido. Las 13 pantallas dieron **0 problemas**, y el control detectó cada clase.
- **AC-9 (API en staging)** — cumplido:
  - 0 fallas, y el token no aparece en la salida;
  - una línea de log por pedido, sin el token ni `q`;
  - al terminar, la API responde `404` y la credencial figura revocada.
- **Nivel**:
  - **El despliegue y las 13 pantallas**: validados en staging (`isolated-runtime`), sobre el seed del piloto.
  - **La API de lectura**: validada localmente y en CI, **más una corrida en staging** con evidencia `isolated-runtime`: el borde real (nginx, TLS, `TRUSTED_PROXY`) con un script sintético. **No está validada en integración**, porque ningún agente la consumió. Por eso no se la llama «validada en staging»: en la escala de `CLAUDE.md`, ese nivel está por encima de «validado en integración», y un nivel superior no se infiere de uno inferior.
  - Esto sigue al Roadmap (§Fase 11, gate de salida) y se aparta de D-6, que decía «validado en staging». La discrepancia está en el brief, §Resultados — etapa 11.4.2 (H-1 de la revisión independiente).
  - **No** es `authenticated-end-to-end`: ese nivel lo da la ventana de la 11.4.3, hecha por una persona.
