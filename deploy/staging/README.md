# Despliegue de staging

Configuración versionada del entorno `staging.vixoraai.app` ([brief-9.1](../../docs/decisions/brief-9.1-infraestructura-de-staging.md)).

**Por qué existe este directorio.** Hasta el 2026-09-22 esta configuración vivía solo en el servidor. La revisión independiente de la 9.1 lo señaló como hallazgo **mayor** (H-1): toda la resolución de H-3 descansa en que nginx **reemplace** `x-forwarded-for` en vez de agregarlo, y esa premisa no se podía auditar ni detectar su regresión. Re-aprovisionar la máquina o poner algo delante —Cloudflare, un balanceador— reintroduce H-3 **en silencio y pasando en verde**.

Los archivos de acá son la fuente de verdad. `tests/guards/staging-proxy-config.test.ts` los fija con casos de fallo.

## Archivos

| Archivo | Destino en el servidor |
| --- | --- |
| `nginx-crm-staging.conf` | `/etc/nginx/sites-available/crm-staging`, enlazado en `sites-enabled/` |
| `crm-staging.service` | `/etc/systemd/system/crm-staging.service` |

Las líneas marcadas `# managed by Certbot` las escribió `certbot --nginx` y **no se editan a mano**: se regeneran al renovar.

## Lo que NO está acá, a propósito

Los secretos. Viven en `/etc/crm-staging/`, con permisos `0600` de `root`, fuera del repositorio y fuera de CI (D-8):

| Archivo | Para qué |
| --- | --- |
| `app.env` | El que lee `systemd`. `DATABASE_URL` con el rol de aplicación, `TRUSTED_PROXY=true`, `NODE_ENV=production` |
| `migrate.env` | `DATABASE_URL` con el rol dueño. Solo para migraciones |
| `seed.env` | `SEED_USER_PASSWORD` de los usuarios sintéticos |

**Límite declarado**: un `EnvironmentFile` `0600` protege contra otro usuario del sistema, **no** contra quien tenga `root` ni contra un respaldo de disco sin cifrar. Alcanza para un entorno sin datos reales y **no** es lo que se lleva a producción sin volver a decidirlo.

## Aprovisionamiento

Orden importante. Los pasos 4 y 5 son los que el primer despliegue reveló.

1. **Swap antes que nada.** `next build` en 1 núcleo con 961 MB y sin swap muere por memoria, y el síntoma es un proceso muerto sin mensaje claro. 2 GB en `/swapfile`, con `vm.swappiness=10`: si el entorno usa swap en régimen normal, eso es un hallazgo, no un éxito.
2. **Node 24** (NodeSource) y **PostgreSQL 18.6** con `postgresql-contrib` — `contrib` trae `unaccent`, de la que depende la 9.0.2. La versión de PostgreSQL de Ubuntu 24.04 es la 16: hace falta el repositorio `pgdg`.
3. **Base y rol dueño**: `crm_staging`, propiedad de `crm_owner`.
4. **Crear el rol `crm_app` con el superusuario, antes de migrar.** La migración `0003` lo crea si no existe, pero crear un rol es un objeto **del servidor** y exige `CREATEROLE`, que el rol dueño no tiene. En desarrollo nunca falla porque el usuario de `docker-compose` es superusuario.
   > **Cuidado**: si se omite este paso, `drizzle-kit migrate` sale con **código 1 sin imprimir ningún error**. Cero tablas y ningún mensaje. Si las migraciones "no hacen nada", empezar por acá.
   >
   > Se resuelve así, y no otorgándole `CREATEROLE` al rol dueño, por menor privilegio: el `IF NOT EXISTS` de la migración lo saltea y el resto de sus `GRANT` corre normal.
5. **Migrar** con `migrate.env`, después **crear el rol con login miembro de `crm_app`** y recién entonces escribir `app.env`. Las migraciones siguen corriendo con el dueño; la aplicación nunca.
6. **nginx y certbot.** TLS antes del primer intento de ingreso, **no después**: con `NODE_ENV=production` la cookie de sesión pasa a `__Host-` con `Secure`, y sobre HTTP el navegador la descarta. El síntoma parece un fallo de autenticación y no lo es.
7. **UFW**: solo `OpenSSH` y `Nginx Full`. El puerto 3000 nunca se abre.

## Desplegar un cambio

```
cd /srv/crm-staging
git fetch && git reset --hard origin/main
npm ci --no-audit --no-fund
set -a && . /etc/crm-staging/app.env && set +a
npm run build
sudo systemctl restart crm-staging
```

Si el cambio trae migraciones, correrlas con `migrate.env` **antes** del `build`.

## Verificar después de desplegar

Los dos primeros comprueban lo que ninguna guarda puede: que el servidor tenga lo que el repositorio dice.

1. **Que la configuración desplegada sea la versionada.** Es el único paso que cierra el hueco de H-1, y es manual a propósito: un test que fingiera comprobarlo sería peor que no tenerlo.
   ```
   ssh crm-staging 'sudo cat /etc/nginx/sites-available/crm-staging' | diff - deploy/staging/nginx-crm-staging.conf
   ssh crm-staging 'sudo cat /etc/systemd/system/crm-staging.service' | diff - deploy/staging/crm-staging.service
   ```
2. **Que siga habiendo un solo salto de proxy.** Si alguna vez hay dos, `session-cookie.ts` lee una IP interna idéntica para todas las peticiones y H-3 vuelve sin que nada falle.
3. **HSTS presente sobre HTTPS y ausente sobre HTTP**: `curl -I https://staging.vixoraai.app/login` y `curl -I http://staging.vixoraai.app/login`. El segundo es el que da valor al primero.
4. **La aplicación solo en loopback**: `sudo ss -tlnp | grep 3000` tiene que decir `127.0.0.1:3000`. `next start` **ignora la variable `HOSTNAME`**; el enlace depende del flag `-H` de la unidad.
5. **El rol de la aplicación no es el dueño**: `DELETE FROM audit_logs` con la conexión de `app.env` tiene que responder `permission denied`.
