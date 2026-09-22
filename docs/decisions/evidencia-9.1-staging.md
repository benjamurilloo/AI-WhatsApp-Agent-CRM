# Evidencia de runtime — subfase 9.1

Salidas de la verificación de `https://staging.vixoraai.app`, con el comando que las produjo. Existe por el hallazgo **H-9** de la revisión independiente del 2026-09-22: el brief comprometía «capturar y versionar la evidencia de cada AC, con fecha y comando» y lo versionado era una tabla en prosa, así que la revisión no tenía nada que auditar salvo la narración del autor.

**Qué es esto y qué no.** Es una captura, no una prueba automatizada: se reproduce corriendo los comandos, no corre sola en CI. Nada de acá sube el nivel de validación de nada; el nivel lo fija [brief-9.1](brief-9.1-infraestructura-de-staging.md).

**Crudo y transcrito no son lo mismo.** La versión anterior de este documento se presentaba entera como «salidas crudas» y tres bloques no lo eran: estaban compuestos a mano a partir de varias corridas. Lo señaló el hallazgo **N-8** de la segunda revisión independiente, y es un defecto de la misma familia que el documento venía a corregir — declarar un nivel de evidencia por encima del real. Desde acá, cada bloque transcrito está marcado **`[transcrito]`** y dice qué se elidió; lo que no lleva marca es copia literal de la terminal.

- **Capturado**: 2026-09-22
- **Ref desplegado**: `1545040`. Desde ese ref, lo único que cambió bajo `src/` son archivos de prueba (`git diff --name-only 1545040 HEAD -- src/` devuelve `src/proxy.test.ts`), así que el código que corre en el servidor es el mismo. La redacción anterior —«no cambiaron `src/`»— era falsa (N-5).
- **IP del cliente durante la medición**: `186.182.26.146`

---

## Recapturado al cerrar los hallazgos de la revisión

```
### AC-1 — https responde 200
$ curl -s -o /dev/null -w "%{http_code} %{remote_ip}\n" https://staging.vixoraai.app/login
200 134.209.70.162

### AC-2 — certificado
$ echo | openssl s_client -connect staging.vixoraai.app:443 -servername staging.vixoraai.app | openssl x509 -noout -subject -issuer -dates
subject=CN=staging.vixoraai.app
issuer=C=US, O=Let's Encrypt, CN=YE2
notBefore=Sep 22 13:26:52 2026 GMT
notAfter=Dec 21 13:26:51 2026 GMT

### AC-3 — HSTS sobre HTTPS
$ curl -sI https://staging.vixoraai.app/login
HTTP/1.1 200 OK
cross-origin-opener-policy: same-origin
permissions-policy: camera=(), microphone=(), geolocation=()
referrer-policy: same-origin
strict-transport-security: max-age=31536000; includeSubDomains
x-content-type-options: nosniff

### AC-3 (control) — sobre HTTP NO debe estar
$ curl -sI http://staging.vixoraai.app/login
HTTP/1.1 301 Moved Permanently
Location: https://staging.vixoraai.app/login
(sin strict-transport-security en la respuesta 301: es el control que le da valor al caso anterior)

### AC-7 — la aplicación no se conecta con el rol dueño
$ psql "$DATABASE_URL" -tAc "SELECT current_user;"
crm_staging_app
$ psql "$DATABASE_URL" -c "DELETE FROM audit_logs;"
ERROR:  permission denied for table audit_logs
$ psql "$DATABASE_URL" -c "UPDATE clients SET updated_at = updated_at WHERE false;"
UPDATE 0
[transcrito] Lo que consta de esta comprobación es el resultado, no su salida literal: sobre
`audit_logs`, el rol de la aplicación tiene INSERT y no tiene DELETE. La línea de abajo está
escrita con forma de comando y no lo es, y la salida literal de psql no se conservó. Se
reproduce con:
  psql "$DATABASE_URL" -tAc "SELECT has_table_privilege('crm_staging_app','audit_logs','INSERT'),
                                    has_table_privilege('crm_staging_app','audit_logs','DELETE');"
Los dos comandos de arriba, que sí son copia literal, ya muestran lo mismo por consecuencia.

### AC-9 — permisos de los archivos de secretos
$ sudo ls -l /etc/crm-staging/
total 12
-rw------- 1 root root 225 Sep 22 14:28 app.env
-rw------- 1 root root  94 Sep 22 14:19 migrate.env
-rw------- 1 root root  48 Sep 22 15:30 seed.env

### AC-10 — el servicio arranca solo y escucha en loopback
[transcrito] Resultado de consultar `systemctl is-active` e `is-enabled` para los tres
servicios, condensado en tres líneas. La salida literal no se conservó; se reproduce con
`systemctl is-active crm-staging postgresql nginx` y lo mismo con `is-enabled`.
crm-staging: active / enabled
postgresql: active / enabled
nginx: active / enabled

[transcrito] De la salida de `ss` se conservó el estado y la dirección local, que es lo que
decide el AC; las demás columnas no se conservaron. Lo que importa y sí consta: la dirección
es `127.0.0.1`, no `0.0.0.0` ni `*`.
$ sudo ss -tlnp | grep 3000
LISTEN 127.0.0.1:3000
```

---

## Registrado durante la medición original, no recapturable sin repetir la prueba

Los dos criterios de abajo dejan a una IP bloqueada 15 minutos, así que su salida es la de la corrida del 2026-09-22 y no se volvió a ejecutar al cerrar los hallazgos.

### AC-5 — la aplicación ve la IP real y una cabecera falsificada no la cambia

La clave del límite es `sha256(ip ?? "sin-proxy")` sin sal ni prefijo (`src/modules/auth/service.ts:126`), así que comparar contra tres cadenas conocidas discrimina de verdad.

```
$ node -e 'const{createHash}=require("node:crypto");const h=v=>createHash("sha256").update(v).digest("hex");
           console.log("mi_ip_real "+h("186.182.26.146"));
           console.log("ip_falsa   "+h("203.0.113.9"));
           console.log("sin-proxy  "+h("sin-proxy"));'
mi_ip_real   362e48d25936a0713f2b6f6f12292449e7168e21f1d40c249d4ff67303058d3e
ip_falsa     d861b7e91033ebc1c1e8e7af3929010158b3241b54ca87ef73e79c32f26400ec
sin-proxy    8a7b67f1679fdd7e92d61f0fc54701f4d674b0e1ed9fa4de351500e5d58fa1b2

$ sudo -u postgres psql -d crm_staging -tAc \
    "SELECT scope, key_hash, count(*) FROM login_attempts GROUP BY scope, key_hash ORDER BY scope;"
ip|362e48d25936a0713f2b6f6f12292449e7168e21f1d40c249d4ff67303058d3e|3
```

La fila almacenada coincide con el hash de la IP pública real. **No** coincide con el de la cabecera falsificada, ni con el de `"sin-proxy"`, que es la firma de H-3.

> **Precisión sobre el método, agregada al cerrar el hallazgo H-11.** La cabecera falsificada **no** la envió un navegador en una navegación normal —un navegador no permite fijar `x-forwarded-for`—: se inyectó con `extraHTTPHeaders: { "x-forwarded-for": "203.0.113.9" }` al crear el contexto de Playwright, que la agrega a cada petición del contexto. Eso es equivalente a un cliente hostil, que es el actor del criterio, y **más favorable al atacante** que un navegador real.

### AC-6 — 20 fallos desde una IP no dejan sin ingreso a otra

Segundo intento del criterio. El primero usó un solo correo y, con `ACCOUNT_FAILURE_LIMIT = 5` contra `IP_FAILURE_LIMIT = 20`, el límite por cuenta saltaba antes y el de IP no podía alcanzarse: las dos IPs quedaban bloqueadas y parecía H-3. La corrección usa **20 correos distintos**, de modo que ninguna cuenta llega a 5 y lo único que puede dispararse es el límite por IP; el ingreso final usa `lectura@example.com`, una cuenta que nunca falló, probada **desde las dos IPs**.

El segundo origen sale por un túnel SOCKS hacia el droplet, así que su IP de origen es la del servidor:

```
$ ssh -f -N -D 1080 crm-staging
$ curl -s --socks5-hostname 127.0.0.1:1080 https://api.ipify.org
134.209.70.162

MI_IP   ingreso=false :: Iniciar sesión ... Demasiados intentos. Probá de nuevo en 12 minutos.
OTRA_IP ingreso=true  :: O Organización de ejemplo Dashboard Productos Clientes Conversaciones
                          Lectura de ejemplo (viewer) Sistema Clar

$ sudo -u postgres psql -d crm_staging -tAc \
    "SELECT scope, count(DISTINCT key_hash), count(*) FROM login_attempts GROUP BY scope;"
account|13|17
ip|1|20
```

Misma cuenta, misma contraseña, mismo momento; lo único distinto es la IP de origen.

> `login_attempts` se vació después de esta medición, para poder seguir verificando desde la misma IP sin esperar la ventana de 15 minutos. Son filas sintéticas de una prueba propia, sin valor de auditoría, pero queda dicho porque el estado actual de esa tabla ya no refleja lo medido.

### AC-4 — la cookie de sesión

```
COOKIE={"nombre":"__Host-crm_session","secure":true,"httpOnly":true,
        "sameSite":"Lax","path":"/","domain":"staging.vixoraai.app"}
```

`domain` es el host al que Playwright la tiene asociada, **no** el atributo `Domain` del `Set-Cookie`. Que Chromium **acepte** el prefijo `__Host-` es la prueba de que no viajó `Domain`: el navegador rechaza esa cookie si lo lleva. Es inferencia a partir de una regla que el navegador hace cumplir, no lectura directa de la cabecera cruda que el AC-4 pide; queda declarado como tal, porque la revisión independiente señaló con razón que el método no es el que el criterio enuncia.

### AC-11 — las pantallas

Doce rutas, todas `200` y **cero errores de consola**:

```
PANTALLA /                 -> 200 errores=0
PANTALLA /clientes         -> 200 errores=0
PANTALLA /clientes/nuevo   -> 200 errores=0
PANTALLA /clientes/[id]    -> 200 errores=0
PANTALLA /productos        -> 200 errores=0
PANTALLA /productos/nuevo  -> 200 errores=0
PANTALLA /conversaciones   -> 200 errores=0
PANTALLA /conversaciones/[id] -> 200 errores=0
PANTALLA /usuarios         -> 200 errores=0
PANTALLA /usuarios/nuevo   -> 200 errores=0
PANTALLA /usuarios/[id]    -> 200 errores=0
PANTALLA /cambiar-contrasena -> 200 (redirige a / para un usuario sin contraseña pendiente)
```

**Sin cubrir**: `/productos/[id]` y `/productos/[id]/movimientos`, porque el seed básico no crea productos. Se cubren en la 9.3.

### AC-10 — el reinicio

```
$ sudo systemctl reboot
$ for i in ...; do curl -s -o /dev/null -w "%{http_code}" https://staging.vixoraai.app/login; done
intento 1: 000   (servidor caído)
intento 2: 502   (nginx arriba, aplicación todavía no)
intento 3: 200   (aplicación de vuelta, sin intervención)
```
