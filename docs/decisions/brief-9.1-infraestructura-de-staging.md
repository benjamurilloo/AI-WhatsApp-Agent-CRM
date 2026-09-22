# Brief 9.1 — Infraestructura de staging

- **Contrato**: `task-brief.v1`
- **Tipo de tarea**: `runtime-validation`
- **Nivel de evidencia objetivo**: `authenticated-end-to-end`
- **Nivel de validación alcanzable**: **validado en staging**, y solo para lo que se ejercite con evidencia capturada. Nada de esta subfase sube a *preparado para producción*: faltan backups probados (9.2), volumen (9.3) y piloto (9.4).
- **Orden**: primera subfase después de la **9.0**, que quedó cerrada completa el 2026-09-21.
- **Abre gate.** Por [ExecutionProtocol](../development/ExecutionProtocol.md) paso 4b, **no se cierra con autoevaluación**: necesita revisión de un agente que no haya participado del trabajo, con la escala de severidad fijada **antes** de empezar.
- **Precondición bloqueante**: H-3. No se levanta ningún entorno compartido sin `TRUSTED_PROXY=true` contra un proxy real, o con el límite por IP del ingreso desactivado ([Roadmap](../planning/Roadmap.md) §Fase 9).

## Objetivo

Levantar un entorno equivalente a producción, sin tráfico real, y **usarlo para verificar las cinco afirmaciones del modelo de seguridad que hoy están declaradas como `no-verificable-aquí`** — no para tener un sitio andando. El entorno es el instrumento; la evidencia es el entregable.

## Lo que se verificó antes de escribir este brief

Todo lo de esta sección se midió el 2026-09-22 contra la máquina y contra el código, no contra documentación.

### El servidor existe y está endurecido

Medido por SSH sobre el droplet:

| Qué | Valor real |
| --- | --- |
| Sistema | Ubuntu 24.04.4 LTS, kernel 6.8.0-124 |
| CPU | **1 núcleo** |
| RAM | **961 MB** |
| Swap | **0 MB** |
| Disco | 22 GB libres de 24 GB |
| Node, Docker, Nginx, PostgreSQL | **ninguno instalado** |
| UFW | activo, solo `OpenSSH`; 80 y 443 **cerrados** |

Acceso por clave, `root` rechazado, `unattended-upgrades` activo. La clave privada `~/.ssh/id_ed25519_crm_staging` no salió nunca de la máquina del usuario.

**Limitación declarada del aprovisionamiento**: la clave de host SSH se aceptó con `StrictHostKeyChecking=accept-new`, sin verificación fuera de banda contra la consola de DigitalOcean. Es una confianza en el primer uso, no una verificación.

### El dominio resuelve al servidor, verificado por efecto

`staging.vixoraai.app` → `134.209.70.162` desde **dos resolvers independientes** (`8.8.8.8` y `1.1.1.1`), o sea la IP del droplet y no una anycast de Cloudflare. Y la huella ED25519 de la clave de host es idéntica consultada por nombre y por IP (`SHA256:cjtiV3cu0trab89xlISAfS+AQshaVp8AwEghzoYsgzc`), lo que prueba que el nombre llega **a la misma máquina**, no solo a la misma dirección. El registro `A` está en *DNS only*: Cloudflare no está en el camino.

**Limitación aceptada declarada**: el TLD `.app` está **precargado en la lista HSTS** de los navegadores. El navegador va a forzar HTTPS aunque el servidor no emita `Strict-Transport-Security`, así que **deja de servir como testigo independiente** de esa cabecera. La verificación del AC-3 se hace con `curl`, que sí ve la cabecera cruda. Es una limitación de método, no de seguridad: en producción el precargado juega a favor.

### El código: lo que ya está y lo que no

**No existe ningún `Dockerfile`.** Verificado: `docker-compose.yml` levanta **solo PostgreSQL** para desarrollo local, y su comentario de cabecera lo dice. No hay ninguna pieza de empaquetado de la aplicación en el repositorio.

**HSTS no está implementado.** `src/proxy.ts:48-49` no define la cabecera: tiene un **comentario** que explica por qué no se emite. La lista `SECURITY_HEADERS` (`src/proxy.ts:43-50`) tiene cuatro entradas y ninguna es `Strict-Transport-Security`.

> **Contradicción registrada, para resolver en esta subfase.** [`SecurityModel.md:119`](../architecture/SecurityModel.md) dice que `Strict-Transport-Security` «está definido pero **no se emite**». En el código no está definido: no hay valor, no hay constante, no hay rama apagada — hay un comentario. La afirmación sobrevive porque «definido» se puede leer como «definido en este documento». No cambia ninguna conclusión de seguridad, pero un lector que busque el valor para cambiarlo no lo va a encontrar. Se corrige el texto cuando la cabecera exista de verdad (AC-3).

**La cookie cambia de nombre sola, y eso es un riesgo de secuencia.** `src/modules/auth/session-cookie.ts:9-15`: `isSecureEnvironment` devuelve `true` con `NODE_ENV === "production"`, y entonces la cookie pasa a `__Host-crm_session` con `Secure`. `next start` corre en producción. **Consecuencia operativa: si el entorno se levanta sobre HTTP, el ingreso queda roto** —el navegador descarta una cookie `Secure` sobre texto plano— y el síntoma va a parecer un fallo de autenticación, no de TLS. Por eso TLS se monta **antes** del primer intento de ingreso, no después.

**`x-forwarded-for` se lee por la última entrada.** `src/modules/auth/session-cookie.ts:29-39` devuelve `entries.at(-1)`, y solo con `TRUSTED_PROXY=true`. Eso es correcto **con exactamente un proxy que agregue**. Con dos saltos, la última entrada es una IP interna de la plataforma, idéntica para todas las peticiones, y H-3 se reproduce en silencio — pasando en verde. El despliegue elegido tiene un solo salto (nginx en la misma máquina), así que la lectura es correcta, pero **eso hay que demostrarlo, no suponerlo**.

**`crm_app` existe y la aplicación no lo usa.** El rol se crea `NOLOGIN` en `drizzle/0003_crm_app_role_and_audit_insert_only.sql:6-7`, y cinco migraciones le otorgan privilegios tabla por tabla. El [ADR 0013](0013-rol-de-aplicacion-y-tablas-de-solo-insercion.md) punto 5 difiere explícitamente a esta subfase la conexión con un rol con login miembro de `crm_app`. Hoy la aplicación se conecta con el rol dueño y la defensa efectiva es el trigger — limitación ya aceptada en `SecurityModel.md:157`.

**No hay gestor de secretos, y el elegido ya no aplica.** `SecurityModel.md:132` dice que en staging se usará «un gestor de secretos del proveedor de hosting elegido (a definir en la subfase 9.1)». El proveedor elegido es un VPS desnudo: **no hay gestor de secretos de proveedor**. La decisión no es cuál usar sino qué lo reemplaza, y es una de las decisiones pendientes de abajo.

## Decisiones ya tomadas

**D-1. El hosting es un droplet propio de DigitalOcean, no una plataforma gestionada.** Decidido por el usuario el 2026-09-21 tras comparar con Vercel. El motivo que pesa no es técnico sino de licencia y costo: el plan Hobby de Vercel excluye uso comercial y el Pro cuesta unas tres veces el droplet. Cierra el pendiente «hosting de staging» del Roadmap §Fase 9, que **no tiene id registrado en ningún documento**; una sesión anterior lo llamó «P-2» sin que esa etiqueta exista.

**D-2. El dominio es `vixoraai.app`, con `staging.vixoraai.app` para este entorno.** Registrado por el usuario el 2026-09-22. Con la limitación de HSTS precargado ya declarada arriba.

**D-3. El hostname no vive en el código.** Es lo que hace que cambiar de dominio sea una línea de configuración y no una búsqueda por todo el repositorio. Se verifica con una guarda, no con una promesa (AC-8).

> **Precisión agregada al cerrar el hallazgo H-10.2.** El brief decía «vive en variable de entorno», y eso describe un mecanismo que no existe: **la aplicación nunca necesita su propio hostname** —no hay ningún `APP_HOSTNAME`, `BASE_URL` ni equivalente en `src/`, comprobado el 2026-09-22—. El único lugar donde el nombre aparece es la configuración de nginx, ahora versionada en `deploy/staging/` (D-10). La decisión se cumple; la razón por la que se cumple es más simple que la escrita, y se corrige en vez de dejar en pie una variable inventada.

**D-4. TLS termina en el servidor, no en Cloudflare.** Registro `A` en *DNS only*. Si Cloudflare terminara el TLS, los AC-2, AC-3 y AC-4 medirían el certificado y las cabeceras **de Cloudflare** y pasarían en verde sin haber verificado nada del servidor; además el salto extra rompería el conteo de `x-forwarded-for` del AC-5.

**D-5. La aplicación corre como `next start` bajo una unidad `systemd`, sin contenedor.** Aprobado por el usuario el 2026-09-22. No hay `Dockerfile`, así que la opción de contenedor **empezaba por escribir uno**, y eso es trabajo real y no configuración. Una subfase que abre gate debe introducir la menor cantidad de mecanismos nuevos posible: un `Dockerfile` mal hecho produce defectos que después se confunden con defectos de la aplicación. **Condición de reapertura**: si la 9.2 o la 9.4 necesitan reproducir el entorno en otra máquina, el empaquetado vuelve a evaluarse con esa necesidad demostrada, no antes.

**D-6. Se agregan 2 GB de swap y se compila en el servidor.** Aprobado por el usuario el 2026-09-22. `next build` en 1 núcleo con 961 MB y sin swap tiene probabilidad alta de morir por falta de memoria, con un proceso muerto sin mensaje claro como síntoma típico. Las alternativas eran compilar en CI y subir el artefacto, o agrandar el droplet; las dos cuestan más y ninguna es reversible con un comando. **El swap no es una solución de rendimiento**: compensa un pico de memoria de la compilación, y si el entorno lo usa en régimen normal eso es un hallazgo, no un éxito.

**D-7. PostgreSQL corre en el mismo droplet.** Aprobado por el usuario el 2026-09-22. La alternativa gestionada de DigitalOcean cuesta unos 15 USD/mes e incluye backups que la 9.2 podría aprovechar. **Condición de reapertura explícita**: la decisión se vuelve a mirar en la **9.2**, con la medición de backups delante, que es cuando el argumento a favor de la gestionada deja de ser hipotético.

**D-8. Los secretos viven en un `EnvironmentFile` de `systemd` con permisos `0600` de `root`.** Aprobado por el usuario el 2026-09-22, en reemplazo del «gestor de secretos del proveedor» que `SecurityModel.md:132` daba por supuesto y que un VPS desnudo no tiene. La alternativa era cifrarlos versionados con `sops`/`age`, que agrega una herramienta y una clave más que custodiar para un entorno sin datos reales. **Límite declarado**: un `EnvironmentFile` protege contra otro usuario del sistema, **no** contra quien tenga `root` ni contra un respaldo del disco sin cifrar. Es suficiente para staging y **no** es lo que se lleva a producción sin volver a decidirlo. Bajo ninguna opción es aceptable que un secreto de staging quede en el repositorio o en la configuración de CI en texto plano (AC-9).

**D-9. nginx REEMPLAZA `x-forwarded-for` con `$remote_addr`, no lo agrega a la cadena.** Con `$proxy_add_x_forwarded_for`, una cabecera falsificada por el cliente sobrevive en la cadena y solo queda tapada por la IP real que nginx añade al final; la lectura de la aplicación seguiría siendo correcta, pero la superficie de falsificación existiría. Al reemplazar hay **exactamente una entrada** y es la IP que vio nginx. Esta decisión existía en el bloque de nginx desde el despliegue y se cita ahí, pero **no estaba registrada en este brief**: la agregó el cierre del hallazgo H-10 de la revisión independiente, que encontró la referencia colgada.

**D-10. La configuración de nginx y de `systemd` se versiona en `deploy/staging/`.** Cierra el hallazgo **H-1** de la revisión independiente: la premisa de la que dependen el AC-3, el AC-5 y la resolución de H-3 vivía solo en el servidor, donde nadie podía auditarla ni detectar su regresión. `tests/guards/staging-proxy-config.test.ts` la fija con casos de fallo. **Límite declarado, y es el que importa**: la guarda comprueba el archivo **versionado**, no el del servidor — ningún test puede leer la máquina. La comparación entre lo versionado y lo desplegado es un paso manual del procedimiento de [`deploy/staging/README.md`](../../deploy/staging/README.md). Una guarda que fingiera comprobarlo sería peor que no tenerla.

## Escala de severidad, fijada antes de empezar

Esta subfase abre gate. La escala se fija **ahora**, antes de mirar nada, porque fijarla después es elegir el umbral que deja pasar lo que ya se encontró. Se adopta la **D-2 del [brief-8.4](brief-8.4-revision-de-seguridad.md) con su enmienda de disponibilidad del 2026-09-18**, sin inventar una nueva:

- **Crítico (bloquea el gate)**: permite acceso o modificación de datos de otra organización; permite a un `viewer` una operación de `admin`; expone credenciales, tokens o contraseñas; permite operar sin sesión válida algo que exige sesión; **o** permite a un actor no autenticado impedir el uso del sistema a todos los usuarios de una organización, a costo despreciable y de forma renovable.
- **Mayor**: debilita una defensa declarada sin abrir por sí solo un acceso indebido.
- **Menor**: documentación que no coincide con el código, sin consecuencia de seguridad.

Con sus dos reglas de aplicación, que también vienen de la 8.4 y no se reescriben acá: **un hallazgo crítico detiene el trabajo y se reporta de inmediato**, en vez de anotarse y seguir; y **la severidad se evalúa contra los entornos que existen**, declarándola condicional cuando dependa del entorno en vez de elegir el número cómodo.

**Lo que cambia al existir staging**: hasta hoy H-3 era `mayor` porque el único entorno era una máquina de desarrollo de un solo usuario. En cuanto este entorno exista y sea compartido, H-3 es `crítico` por la quinta cláusula. Esa es exactamente la razón por la que es precondición bloqueante y no una tarea más del alcance.

## Alcance incluido

0. **Preparar la máquina**: 2 GB de swap (D-6), Node 24, PostgreSQL 18.6 local (D-7) y nginx. Nada de esto está instalado hoy.
1. **Resolver H-3 y demostrarlo.** Un solo salto de proxy, `TRUSTED_PROXY=true`, y evidencia de que dos clientes distintos obtienen claves de límite distintas.
2. **nginx como proxy inverso** delante de la aplicación, con TLS de Let's Encrypt para `staging.vixoraai.app` y renovación automática.
3. **Abrir 80 y 443 en UFW**, y solo esos dos además de SSH.
4. **Emitir `Strict-Transport-Security`** desde `src/proxy.ts`, condicionado a TLS.
5. **Un rol de base con login, miembro de `crm_app`**, y que la aplicación se conecte con él. Las migraciones siguen corriendo con el dueño.
6. **Gestión de secretos** según la D-8, con `.env.example` actualizado.
7. **La aplicación corriendo** como servicio que sobrevive a un reinicio del servidor.
8. **Reevaluar `src/proxy.ts`** con más rutas protegidas, como pide el Roadmap §9.1.
9. **Capturar y versionar la evidencia** de cada AC, con fecha y comando, para que la revisión independiente tenga qué auditar.
10. **Corregir las dos afirmaciones desactualizadas** de `SecurityModel.md` (líneas 119 y 132).

## Alcance excluido

- **Backups y restauración**: es la 9.2 completa, incluida la retención de `messages`.
- **Datos de volumen y medición de rendimiento**: es la 9.3.
- **Cualquier usuario real o dato real**: es la 9.4, y tiene su propia disciplina de ventana de observación.
- **Producción.** Esta subfase no despliega producción ni prepara para producción.
- **APM y tracing**: reevaluación asignada a la 9.4.
- **Protección de rama**: 9.4.
- **La sexta afirmación `no-verificable-aquí`**, que el Roadmap deja fuera de las cinco que absorbe la 9.1.
- **Automatizar el despliegue.** Un despliegue manual y documentado alcanza para staging; automatizarlo antes de haberlo hecho a mano una vez es construir sobre supuestos.

## Criterios de aceptación

Cada uno se cumple con evidencia capturada y versionada, no con una afirmación.

- **AC-1.** `https://staging.vixoraai.app` responde `200` con la aplicación real, desde fuera de la red del servidor.
- **AC-2.** El certificado es válido, emitido para ese nombre, y `curl` sin `-k` no protesta. La renovación automática está probada con una corrida en seco, no solo instalada.
- **AC-3.** `curl -I` sobre HTTPS muestra `Strict-Transport-Security` con su `max-age`. Se captura la salida cruda, porque el navegador no sirve de testigo en un TLD precargado.
- **AC-4.** Tras un ingreso exitoso, la cookie se llama **`__Host-crm_session`** y viaja con `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/` y **sin** `Domain`. Se verifica sobre el `Set-Cookie` crudo.
- **AC-5.** `TRUSTED_PROXY=true` y la IP del cliente es la real. **Se demuestra con dos mediciones, no con una**: (a) dos clientes con IP distinta producen claves de límite distintas; (b) un cliente que **falsifica** `x-forwarded-for` no logra cambiar la IP que ve la aplicación. Sin (b), el criterio no distingue una lectura correcta de una que confía en el cliente.
- **AC-6.** 20 ingresos fallidos desde una IP **no** bloquean el ingreso desde otra. Es H-3 medido por su consecuencia, que es como se descubrió.
- **AC-7.** La aplicación se conecta con un rol con login miembro de `crm_app` y **no** con el dueño. Se demuestra por efecto: un `DELETE` sobre `audit_logs` desde la conexión de la aplicación es rechazado por privilegios.
- **AC-8.** Ningún hostname de staging aparece escrito en `src/`. Se fija con una guarda versionada con su caso de fallo, según el estándar del proyecto.
- **AC-9.** Ningún secreto de staging está en el repositorio ni en la configuración de CI en texto plano.
- **AC-10.** El servicio sobrevive a `reboot`: el servidor se reinicia de verdad y la aplicación vuelve sola.
- **AC-11.** Las 10 pantallas cargan sin error de consola sobre el entorno desplegado. Sin volumen: eso es la 9.3.
- **AC-12.** `SecurityModel.md` no contiene ninguna afirmación que el entorno desplegado contradiga, y las cinco `no-verificable-aquí` que esta subfase absorbe pasaron a `verificado` citando su evidencia.

## Condiciones de detención

Se para y se consulta, no se sigue con una solución alternativa:

1. **Si `next build` muere por memoria** y agregar swap no lo resuelve. Cambiar de estrategia de compilación es la D-6 y su cambio lo decide el usuario.
2. **Si Let's Encrypt no emite** el certificado tras dos intentos. Hay límites de tasa y reintentar a ciegas los consume.
3. **Si el AC-5 (b) falla** —o sea, si un cliente puede falsificar su IP—. Eso es H-3 con otra cara y detiene la fase igual.
4. **Si aparece cualquier dato real** de un cliente o de una conversación real. Este entorno no los recibe hasta la 9.4.
5. **Si para cumplir un AC hay que tocar lógica de negocio.** Esta subfase toca infraestructura, cabeceras y conexión a la base. Un cambio en un servicio de dominio es otra subfase con su brief.
6. **Si el costo mensual supera lo aprobado** por el usuario.

## Qué no certifica esta subfase

- **Que el sistema esté listo para producción.** Faltan backups probados, volumen y piloto: tres subfases enteras.
- **Que el entorno resista carga.** No se mide rendimiento acá; eso es la 9.3, y medirlo en 1 núcleo con 961 MB daría un número que no significa nada para producción.
- **Que no haya defectos de seguridad.** Certifica que cinco afirmaciones concretas del modelo pasaron de declaradas a verificadas, cada una con su evidencia a la vista.
- **Que esta autoevaluación sea correcta.** Abre gate: lo que quede en pie es lo que sobreviva a la revisión independiente, no lo que esta subfase declare.

## Evidencia de runtime (2026-09-22)

> Las salidas **crudas**, con su comando, están en [evidencia-9.1-staging.md](evidencia-9.1-staging.md). Esta sección las resume; la de allá es la que se audita.

El entorno está en `https://staging.vixoraai.app`, sobre el droplet `134.209.70.162`. Todo lo de abajo se midió contra ese entorno, desde fuera, y se reproduce con los comandos indicados.

### Entorno desplegado

| Pieza | Versión / estado |
| --- | --- |
| Ubuntu | 24.04.4 LTS, kernel 6.8.0-124 |
| Node | **24.21.0** (local: 24.15.0 — misma línea mayor, dentro de `>=24 <25` de `package.json`) |
| PostgreSQL | **18.6** (`18.6-1.pgdg24.04+2`), la misma de CI |
| nginx | 1.24.0, proxy inverso con TLS |
| Aplicación | `next start` bajo `systemd`, `enabled`, enlazada a `127.0.0.1:3000` |
| Swap | 2 GB, `vm.swappiness=10` |

### Criterios verificados

| AC | Cómo se verificó | Resultado |
| --- | --- | --- |
| **AC-1** | `curl https://staging.vixoraai.app/login` desde fuera | `200` con la aplicación real |
| **AC-2** | `openssl s_client` + `certbot renew --dry-run` | `CN=staging.vixoraai.app`, emisor Let's Encrypt, vence 2026-12-21. **Cumplido a medias**: la corrida en seco de `certbot` y el estado de `certbot.timer` no tienen salida capturada (T-8), y el criterio los exige explícitamente |
| **AC-3** | `curl -I` sobre HTTPS **y sobre HTTP** | HTTPS: `strict-transport-security: max-age=31536000; includeSubDomains`. HTTP: `301` de nginx **sin** la cabecera. El control es lo que le da valor: si saliera en las dos, verla no probaría nada |
| **AC-4** | Ingreso real con Chromium | Cookie `__Host-crm_session`, `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/`. Que el navegador **acepte** el prefijo `__Host-` es en sí la prueba de que no viajó `Domain`: el navegador rechaza esa cookie si lo lleva |
| **AC-5** | Hash de la clave del límite por IP contra tres candidatos | La fila almacenada es `sha256("186.182.26.146")` = la IP pública real del cliente. **No** es `sha256("203.0.113.9")`, la cabecera falsificada que el navegador envió; **no** es `sha256("sin-proxy")`, la firma de H-3 |
| **AC-6** | 20 fallos desde una IP, ingreso desde otra | Desde la IP saturada: *«Demasiados intentos»*. Desde la IP del droplet, misma cuenta y misma contraseña en el mismo momento: **ingresó** |
| **AC-7** | Operaciones reales con la conexión de la aplicación | `DELETE FROM audit_logs` → `permission denied`; `SELECT` → `0`; `UPDATE clients` → `UPDATE 0`; `has_table_privilege` sobre `audit_logs`: `INSERT=t`, `DELETE=f` |
| **AC-9** | Lectura de `.env.example` y de `.github/workflows/ci.yml`, más `ls -l /etc/crm-staging/` | Ni el repositorio ni la configuración de CI contienen un secreto de staging: `.env.example` solo trae valores locales y el workflow solo `crm_ci_ephemeral`. El `ls` prueba **dónde** están los secretos (`0600`, `root:root`), no la negación que el criterio afirma — las dos cosas juntas sí. Lo separó el hallazgo H-10.3 de la revisión |
| **AC-10** | `systemctl reboot` real | Secuencia `000` → `502` → `200` sin intervención. HSTS sigue presente después |

### Lo que el AC-5 demuestra y lo que no

Demuestra que **la aplicación ve la IP real del cliente** y que **falsificar `x-forwarded-for` no la cambia**, porque la comparación es contra el hash exacto de tres cadenas conocidas y solo una coincide. No demuestra que la lectura siga siendo correcta si algún día se agrega **otro** proxy delante: con dos saltos la última entrada dejaría de ser la IP del cliente. Esa premisa quedó escrita en el bloque de nginx, al lado de la directiva de la que depende.

### El AC-6: el primer intento estuvo mal diseñado

El primer intento usó **un solo correo** en los 20 fallos. Con `ACCOUNT_FAILURE_LIMIT = 5` y `IP_FAILURE_LIMIT = 20`, el límite por cuenta salta a los 5 y **el límite por IP no puede alcanzarse nunca**. El resultado fue que las dos IPs quedaron bloqueadas, y leído de apuro parecía H-3 reproduciéndose. No lo era: la base mostró 5 filas de alcance `account` bajo el hash del correo y solo 8 de alcance `ip`, muy por debajo de 20.

El segundo intento repartió los fallos entre varios correos para que el límite por cuenta no se disparara, y cerró con `lectura@example.com` probada desde las dos IPs. Ahí sí: bloqueada una IP, la otra ingresó. Lo que hace concluyente a esa medición no es el relato del reparto —que la evidencia capturada **no sostiene**, ver T-3 en [evidencia-9.1](evidencia-9.1-staging.md)— sino que el límite por cuenta es independiente de la IP: si la cuenta del ingreso final hubiera estado bloqueada por cuenta, habría fallado también desde la segunda IP, y no falló.

Queda registrado porque el diseño confundido es el hallazgo: **una prueba que no puede distinguir dos causas no es evidencia de ninguna**, y esta pasaba por evidencia de la peor de las dos.

### Hallazgos del despliegue

Ninguno alcanza el umbral de crítico de la escala fijada: no abren acceso indebido ni permiten denegar el servicio.

1. **La migración `0003` no corre con un rol sin `CREATEROLE`** (`mayor`). Crea el rol `crm_app`, que es un objeto del servidor. En desarrollo nunca falló porque el usuario de `docker-compose` es superusuario. Agravante: **`drizzle-kit migrate` salió con código 1 sin imprimir ningún error** — cero tablas y ningún mensaje. Resuelto creando `crm_app` con el superusuario y dejando que el `IF NOT EXISTS` de la migración lo saltee, en vez de otorgar `CREATEROLE` al rol dueño. **Queda pendiente decidir** si el procedimiento se documenta en `Environments.md` o si la migración deja de crear roles.
2. **`next start` ignoró la variable `HOSTNAME`** y se enlazó a `*:3000` (`mayor`). En silencio. Se comprobó desde fuera que UFW lo bloqueaba, así que no estuvo expuesto, pero **el cortafuegos era la única barrera**. Corregido con `-H 127.0.0.1` explícito en la unidad de `systemd`.
3. **`SecurityModel.md:119` y `:132`** decían cosas que el código no sostenía. Ya documentado arriba; se corrige en el AC-12.

### Limitaciones declaradas de esta verificación

- **El AC-11 está cubierto salvo dos rutas.** Se recorrieron **12**: `/`, `/clientes`, `/clientes/nuevo`, `/clientes/[id]`, `/productos`, `/productos/nuevo`, `/conversaciones`, `/conversaciones/[id]`, `/usuarios`, `/usuarios/nuevo`, `/usuarios/[id]` y `/cambiar-contrasena`. Todas devolvieron `200` con **cero errores de consola**; `/cambiar-contrasena` redirige a `/` para un usuario sin contraseña pendiente, que es lo correcto. **Quedan sin cubrir `/productos/[id]` y `/productos/[id]/movimientos`**, porque el seed básico no crea productos y en staging no hay ninguno: visitarlas exigiría dar de alta un producto, que es una escritura fuera del alcance de esta subfase. Se cubren en la **9.3**, que carga datos de volumen.
- **La suite e2e del proyecto no corrió contra staging.** Arranca dos servidores locales propios y su `global-setup` repone la base directamente, así que apuntarla acá exigiría un túnel hasta el PostgreSQL del droplet y cambiar su configuración. Se verificó con un recorrido escrito para esta subfase, que es menos cobertura que la suite.
- **Los intentos de ingreso se borraron de `login_attempts` después de medir el AC-6**, para poder seguir verificando desde la misma IP sin esperar la ventana de 15 minutos. Son filas sintéticas de una prueba propia, sin valor de auditoría, pero queda dicho porque el estado de esa tabla ya no refleja lo que se midió.
- **La prueba de integración del seed no corrió localmente**: Docker no estaba levantado. Corrió en CI, en verde, sobre el commit `1545040`.
- **El aprovisionamiento aceptó la clave de host SSH con `StrictHostKeyChecking=accept-new`**, sin verificación fuera de banda. Confianza en el primer uso.
- **Lo medido vale para el commit desplegado.** No dice nada sobre carga, ni sobre volumen, ni sobre backups: son la 9.2 y la 9.3.

## Reevaluación de `proxy.ts` con más rutas protegidas (punto 8 del alcance)

El Roadmap §9.1 pedía volver sobre la decisión del [brief-3.5](brief-3.5-pantalla-de-inicio-de-sesion.md) D-6 —`proxy.ts` no valida sesión, no lee la base y no redirige— ahora que hay muchas más rutas protegidas que cuando se tomó.

**Lo que se midió** (2026-09-22): hay **13 páginas** bajo `src/app/(autenticado)/`, y **las 13 llaman a `requireSession` o a `getAuthContext` por sí mismas**, además del `layout.tsx` del grupo, que también lo hace. No hay ninguna que dependa del layout para protegerse.

**Decisión: la D-6 se mantiene. `proxy.ts` sigue sin validar sesión.** Tres razones, en orden de peso:

1. **La defensa ya está donde se accede al dato, no en una puerta previa.** Mover la comprobación al proxy no agregaría una defensa: agregaría una **segunda** donde equivocarse, y las dos tendrían que coincidir para siempre.
2. **Un chequeo en el middleware invita a relajar el de la página.** Ese es el modo de falla real: no que el middleware falle, sino que alguien lo vea y concluya que la página ya no necesita comprobar. La guarda `exposed-surface` fija la superficie; nada fijaría esa expectativa.
3. **El middleware de Next tiene antecedentes de ser evadible.** CVE-2025-29927 permitía saltear el middleware con una cabecera; la versión en uso no es vulnerable, pero el episodio dice algo sobre la clase de componente: un punto único de control que se puede esquivar es peor que no tenerlo, porque produce confianza sin sostenerla.

**Condición de reapertura**: si alguna vez existe una ruta protegida que **no** pueda comprobar la sesión por sí misma —por ejemplo un Route Handler de streaming, o un recurso estático que deba quedar tras la sesión—, la decisión se vuelve a mirar para esa ruta, no para todas.

**Lo que esta reevaluación no hace**: no comprueba que las 13 páginas autoricen **bien**. Comprueba que cada una lo hace por sí misma. La corrección de cada autorización se revisó punto por punto en la 8.4 y su superficie está fijada por una guarda.

## Cierre de los hallazgos de la revisión independiente (2026-09-22)

Un agente que no participó del trabajo revisó la subfase contra este brief y contra las reglas vigentes. Informó **11 hallazgos**: 0 críticos, 1 mayor, 8 menores y 2 de proceso. Cada uno se verificó contra el código antes de aceptarse; los 11 resultaron reales.

> **Nota sobre la verificación.** Dos hallazgos citaban texto que mi primera comprobación no encontró, y estuve a punto de descartarlos. El error era mío: `HANDOFF.md` y `SecurityModel.md` tienen líneas de miles de caracteres y los estaba truncando a 400. Aparecieron al buscar dentro de la línea completa. **Ningún hallazgo del revisor resultó falso.**

| Hallazgo | Qué era | Cómo se cerró |
| --- | --- | --- |
| **H-1** (mayor) | La configuración de nginx y `systemd` vivía solo en el servidor. La premisa de la que dependen AC-3, AC-5 y la resolución de H-3 no era auditable ni tenía detector de regresión | `deploy/staging/` versionado (D-10) + guarda `staging-proxy-config` con 9 casos y 3 mutaciones ejecutadas |
| **H-2** | `SecurityModel` prometía backup diario «desde que exista un entorno persistente», que ya existe | Declarado **incumplido** con su motivo y su destino (9.2) |
| **H-3** | `SecurityModel` difería a la Fase 4 la reevaluación de `proxy.ts` que la 9.1 ya hizo | Resultado incorporado al documento de nivel 2 |
| **H-4** | `Risks.md` decía en presente que H-3 seguía abierto y los secretos sin decidir | Las dos filas actualizadas, con el alcance exacto de la resolución |
| **H-5** | Recuento de guardas: `HANDOFF` decía «cinco» y «siete» en el mismo archivo | Ocho, enumeradas, en `HANDOFF` y en `EngineeringStandards` |
| **H-6** | `HANDOFF` desactualizado en el commit que lo actualizaba: «Nada está desplegado», nivel `diseñado` para lo ya medido, `git_ref` viejo, sin ids de corrida | Las cuatro corregidas, con los cinco run id |
| **H-7** | Borrar el `if` que emite HSTS no hacía fallar ningún test: los casos probaban el predicado, no el cableado | 4 casos que ejercitan `proxy()` real. **Mutación ejecutada**: borrar el bloque hace fallar |
| **H-8** | El detector de nombres de despliegue no veía IPv6, tenía lista cerrada de TLD, dependía de la marca actual, y un caso «permitido» sin poder discriminante | Reescrito: URLs absolutas a hosts no locales, IPv4 e IPv6. **Sobrevive a un cambio de dominio**, que es lo que la D-3 quiere |
| **H-9** | El punto 9 del alcance prometía evidencia cruda versionada y lo versionado era prosa | [evidencia-9.1-staging.md](evidencia-9.1-staging.md) |
| **H-10** | `DP-4`, `DP-2` y `D-9` colgados; `.env.example` sin actualizar; AC-9 evidenciado con lo que no toca; brief ausente del índice | Todo corregido. D-9 y D-10 registradas |
| **H-11** | Afirmaciones que el revisor no pudo sostener por lectura | Método del AC-5(b) precisado; run id agregados |

### Las mutaciones, ejecutadas y no supuestas

| Instrumento | Mutación | Resultado |
| --- | --- | --- |
| `deployment-hostnames` | Escribir `https://staging.vixoraai.app` en `src/proxy.ts` | Falla nombrando `src/proxy.ts:1 → staging.vixoraai.app` |
| `deployment-hostnames` | Escribir la IPv6 del droplet en `src/proxy.ts` | Falla nombrando `2604:a880:400:d0` |
| `proxy.test.ts` | Cambiar `split(",")[0]` por `.at(-1)` | Fallan los 2 casos que existen para eso, y solo esos |
| `proxy.test.ts` | **Borrar** el bloque que emite HSTS | Falla «la emite cuando el cliente llegó por https» |
| `staging-proxy-config` | `$remote_addr` → `$proxy_add_x_forwarded_for` | Fallan 2 casos |
| `staging-proxy-config` | **Comentar** la directiva en vez de borrarla | Falla: los comentarios no cuentan como presencia |
| `staging-proxy-config` | Quitar `-H 127.0.0.1` de la unidad | Falla «enlaza la aplicación solo a loopback» |

Dos falsos positivos aparecieron al ampliar el barrido del detector, los dos sobre el repositorio real y no imaginados: el cast `d::date` de PostgreSQL en `analytics/repository.ts`, que parece una IPv6 comprimida, y las URL de la licencia de la tipografía en `src/app/_fonts/OFL.txt`. **Se resolvieron de formas distintas, y conviene no confundirlas** (T-6 de la tercera revisión): el del cast se arregló afinando el detector y quedó con su caso versionado y con su par discriminante; el de la tipografía se resolvió **excluyendo `src/app/_fonts/` del barrido**, que no es un caso sino una exención, y como toda exención tiene el defecto de que lo que se meta ahí deja de mirarse. Es aceptable porque son activos de terceros que no se editan, pero la cabecera de la guarda, que dice recorrer «todo archivo versionado de `src/` que no sea un test», tiene ahí una excepción que ahora está escrita.

### Lo que esta ronda de correcciones **no** resuelve

- **Que el servidor tenga lo que el repositorio dice.** La guarda fija el archivo versionado; nadie puede leer la máquina desde un test. La comparación es un paso manual de `deploy/staging/README.md`. Es una mitigación de H-1, no su desaparición.
- **Un hostname armado por concatenación o partido en dos líneas** sigue escapándosele al detector, y ahora está declarado en su cabecera en vez de quedar implícito.
- **Un hostname sin esquema** —`staging.ejemplo.app` suelto, sin `https://` delante— tampoco se detecta. Lo detectaba la versión anterior del detector y la reescritura lo perdió; es una pérdida real de cobertura a cambio de dejar de depender de la marca, y el motivo es que buscarlo por forma marcaría `next.config`, `package.json` y cualquier llamada con punto. Estaba declarado en la cabecera de la guarda pero no acá (N-7 de la segunda revisión).
- **El AC-4 sigue verificándose por inferencia**, no sobre el `Set-Cookie` crudo como el criterio enuncia.
- **La suite e2e del proyecto sigue sin correr contra staging.**

## Segunda revisión independiente (2026-09-22)

Un segundo agente, que tampoco participó del trabajo, revisó **la ronda de correcciones anterior**. Informó **11 hallazgos** —0 críticos, 1 mayor, 8 menores, 2 de proceso— y **no aprobó el cierre**. Los 11 se verificaron contra el código y los 11 resultaron reales.

El resultado que importa no es el recuento: **tres de las correcciones no cerraron su hallazgo, y dos de ellas lo empeoraron**. La ronda que cerraba H-5 creó una contradicción nueva de recuento; la que cerraba H-6 dejó el `git_ref` desactualizado otra vez, en el mismo commit que lo corregía; y la que cerraba H-8 metió en el filtro dos exenciones que ningún falso positivo pedía. Ninguna autoevaluación de esa ronda lo vio, y la ronda había sido escrita sabiendo que una revisión previa había encontrado exactamente esta clase de defecto.

| Hallazgo | Qué era | Cómo se cerró |
| --- | --- | --- |
| **N-1** (mayor) | La guarda de `deploy/staging/` comprobaba **presencia de subcadenas** sobre el archivo entero, sin noción de bloques. Dos regresiones plausibles pasaban en verde: una **segunda** directiva `X-Forwarded-For` después de la correcta, y un `location` nuevo con `proxy_pass` y sin la cabecera | Reescrita como analizador: parsea bloques y calcula las cabeceras efectivas por contexto que proxea, con la regla de herencia real de nginx (`proxy_set_header` se hereda solo si el nivel actual no declara **ninguno**). **Las dos regresiones ejecutadas sobre el archivo real**: las dos en rojo |
| **N-2** | `HANDOFF` decía «siete guardas» en una línea y «ocho» en otra: la corrección de H-5 creó la contradicción siguiente | Ocho, contadas contra `ls tests/guards/`, en un solo lugar |
| **N-3** | `HANDOFF` citaba dos hashes distintos y ninguno era el HEAD real: H-6 recurrió en el commit que lo cerraba | El hash vive **solo** en la cabecera; el paso «al retomar» ahora remite a ella en vez de repetirlo |
| **N-4** | Dos líneas de `HANDOFF` seguían declarando H-3 abierto; la corrección solo tocó una sección | Las dos actualizadas, contra la fila real de `Risks.md` |
| **N-5** | «Los refs posteriores no cambiaron `src/`» era literalmente falso: `src/proxy.test.ts` cambió | Reemplazado por lo que el comando devuelve, con el comando escrito al lado |
| **N-6** | La corrección de H-8 agregó al filtro de hosts locales `schemas?\..*` y `www\.w3\.org`, que **ningún falso positivo pedía**, y `.*\.?example\.` no anclaba el subdominio. Quedaban exentos `schema.staging.vixoraai.app`, `schemas.vixoraai.app`, `notexample.com` y `fooexample.net` | Filtro reducido a lo que reservan la RFC 2606 y la RFC 6761, con el punto obligatorio. **Quitar las dos ramas no produjo ningún falso positivo sobre `src/`**, que es la medición que demuestra que sobraban |
| **N-7** | La reescritura del detector perdió la detección del host sin esquema y el brief no lo declaraba | Declarado arriba, en las limitaciones |
| **N-8** | `evidencia-9.1-staging.md` se presentaba entera como «salidas crudas» y tres bloques estaban compuestos a mano | Cada bloque transcrito va marcado `[transcrito]` y dice qué no se conservó. Donde no consta la salida literal, se dice que no consta en vez de reconstruirla |
| **N-9** | `HANDOFF` atribuía a «un tercero» la revisión de mediciones de runtime que ninguna revisión por lectura puede confirmar | Atribuido a quien las hizo, con enlace a la evidencia |
| **N-10** | El patrón del seed admitía `_staging` y el mensaje de `conversations.ts` seguía diciendo «_dev, _test o _e2e» | Patrón y mensaje derivados de **una sola lista**, con un caso que falla si vuelven a separarse |
| **N-11** | Líneas de método envejecidas en `EngineeringStandards` y en el propio brief | Actualizadas |

### Las mutaciones de esta ronda, ejecutadas sobre los archivos reales

| Instrumento | Mutación | Resultado |
| --- | --- | --- |
| `staging-proxy-config` | Agregar una **segunda** `X-Forwarded-For` con `$http_x_forwarded_for` después de la correcta | Antes: **9/9 en verde**. Ahora: 6 casos en rojo, nombrando «fija x-forwarded-for 2 veces» |
| `staging-proxy-config` | Agregar `location /api` con `proxy_pass` y sin la cabecera | Antes: **9/9 en verde**. Ahora: 6 casos en rojo, nombrando el `location` |
| `staging-proxy-config` | Restaurar el archivo | Verde, y `git diff` vacío |
| `deployment-hostnames` | Quitar las ramas `schemas?\.` y `www\.w3\.org` del filtro | El barrido de `src/` sigue en verde: no eximían ningún caso real |

### Por qué se repite, y qué cambia

**Cuatro** detectores del proyecto nacieron viendo **una sola forma sintáctica** de lo que debían prohibir: superficie expuesta (8.4), punto de entrada del resumen de usuarios (9.0.1), nombres de despliegue (9.1) y configuración del proxy de staging (9.1). Las cuatro veces lo encontró una revisión independiente. La cuarta —la de N-1— la escribí **un día después** de dejar registrado ese mismo modo de falla en la cabecera de la tercera. Declararlo no lo evitó, y conocerlo tampoco.

Lo único que sí lo encontró, las cuatro veces, fue **ejecutar la mutación**. De acá en adelante, un detector nuevo no se da por escrito hasta que exista al menos una mutación ejecutada por **cada forma sintáctica** que el detector dice cubrir —no una por detector—, y la tabla de mutaciones se escribe con el resultado *antes* y *después*, porque «falla» sin el «antes pasaba» no distingue una guarda que sirve de una que siempre estuvo en rojo.

### Lo que esta segunda ronda **no** resuelve

- **Nada de lo anterior deja de valer**: el servidor sigue sin poder leerse desde un test, el AC-4 sigue verificándose por inferencia y la suite e2e sigue sin correr contra staging.
- **El analizador de nginx no resuelve `include`, `map` ni `set`**, y compara valores literales. Una directiva traída de otro archivo le es invisible.
- **Las salidas literales que no se conservaron no se recuperaron**: quedan marcadas como transcritas, con el comando para reproducirlas. Marcar no es recapturar.
- **Esta ronda es, otra vez, trabajo propio.** Que haya cerrado 11 hallazgos no dice nada sobre lo que introdujo, que es exactamente lo que pasó la vez anterior. Antes de cerrar la 9.1 corresponde una tercera revisión independiente.

## Tercera revisión independiente (2026-09-22)

Un tercer agente, que tampoco participó del trabajo, revisó la segunda ronda de correcciones. Informó **9 hallazgos** —ninguno alcanza el umbral de crítico de la D-2— y **no aprobó el cierre**. Los 9 se verificaron contra el código y los 9 resultaron reales.

**Una atribución del informe no se aceptó.** El informe presentaba T-2 como estado falso *introducido* por la ronda anterior. No lo es: `git show 21d85ab:HANDOFF.md` ya contenía las dos frases y el commit no las tocó, y `CHANGELOG.md:75` muestra que eran falsas desde la 9.0.1. El defecto es real —dos líneas afirmaban que la revisión independiente nunca se había usado dentro del ciclo— pero es N-4 repitiéndose, no una regresión nueva. Se registra la diferencia porque un hallazgo se acepta por lo que se comprueba, no por cómo viene redactado.

| Hallazgo | Qué era | Cómo se cerró |
| --- | --- | --- |
| **T-1** | El analizador de nginx no contemplaba el módulo `realip`. Con `set_real_ip_from` y `real_ip_header`, `$remote_addr` pasa a derivarse de una cabecera del cliente y la directiva que la guarda inspecciona **no cambia**: queda en verde reenviando un valor falsificable. Es la configuración que se agrega al poner Cloudflare delante, o sea el escenario que motiva todo el directorio | La guarda **rechaza** cualquier directiva de `realip`, aunque esté bien configurada: el momento de revisar H-3 es antes de desplegar ese cambio, y la guarda en rojo es lo que fuerza esa revisión. **Mutación ejecutada** sobre el archivo real con un rango de Cloudflare: 8 casos en rojo |
| **T-2** | `HANDOFF` decía en dos líneas que la revisión independiente «todavía no se usó dentro del ciclo», con cuatro usos ya ocurridos | Las **cuatro** líneas del archivo que hablan del estado de la revisión, no una. El texto ahora dice lo que esos cuatro usos midieron |
| **T-3** | La evidencia del AC-6 contradecía su propio método: «20 correos distintos» contra `account\|13\|17`, cuando cada fallo escribe una fila de cada alcance | Se dice que la diferencia **no se puede reconstruir**, en vez de explicarla. La conclusión del AC-6 se reapoyó en un argumento que la salida sí cierra: el límite por cuenta es independiente de la IP, así que el ingreso exitoso desde la segunda IP prueba que el bloqueo de la primera fue del alcance `ip` |
| **T-4** | El procedimiento nuevo del paso 2 del README no era ejecutable: `ssh … "psql \"$DATABASE_URL\""` expande la variable **en el servidor**, donde no existe por D-8, y `psql ""` se conecta a otra base sin avisar | Corregido a `sudo -u postgres psql -d crm_staging`, que es la forma con la que se midió el AC-5, con el motivo escrito al lado. También el ` -` que `sha256sum` agrega a su salida |
| **T-5** | Tres bloques más de la evidencia sin marca `[transcrito]`, contra la regla escrita en la línea 7 de ese mismo archivo una ronda antes | Los tres marcados, diciendo qué se realineó y qué no consta |
| **T-6** | El brief decía que los dos falsos positivos quedaron «con su caso versionado»; el de la tipografía se resolvió excluyendo el directorio, que es una exención y no un caso | Distinguidas las dos formas, en el brief y en la cabecera de la guarda |
| **T-7** | El caso «no marca una hora» probaba `08:30` y `12:34`, formas de dos grupos que el patrón no puede marcar, y afirmaba una cobertura que el detector no tiene: `02:59:59` **sí** se marca | Caso renombrado y agregado su par honesto, que fija la limitación medida |
| **T-8** | La mitad del AC-2 —`certbot renew --dry-run` y `certbot.timer`— no tenía salida capturada en ninguna parte, aunque el brief la afirmaba | Declarado **cumplido a medias**, con la corrida pendiente. No se reconstruyó de memoria |
| **T-9** | `Risks.md` describía el riesgo del agente único sin la obligación vigente, y dos títulos de test conservaban la lista de sufijos vieja | Fila actualizada con lo que las tres revisiones midieron; títulos sin la lista embebida |

### Lo que esta tercera ronda **no** resuelve

- **La corrida en seco de `certbot` sigue sin capturarse** (T-8). Es un efecto sobre un servicio externo y no se ejecutó sin autorización explícita.
- **El rechazo de `realip` cubre la forma escrita en este archivo**, no un `include` que la traiga de otro. Declarado en la cabecera de la guarda.
- **`account|13|17` sigue sin explicación.** Queda dicho que no consta, que es el criterio, pero no deja de ser evidencia que no se puede reconstruir.
- **Las tres rondas de correcciones fueron trabajo propio y ninguna resultó limpia.** Esta tampoco se da por buena sin revisarla.

## Cuarta revisión independiente, acotada (2026-09-22)

Las tres primeras revisaron la subfase entera. Esta no: se acotó **a propósito** a la única lógica que la tercera ronda agregó al instrumento del que depende H-3, con dos preguntas —¿la guarda promete más de lo que cubre? ¿el cambio es estrictamente aditivo?— y con la **regla de parada fijada antes de lanzarla**: cerrar salvo que aparezca un hallazgo mayor o superior, o uno que afecte al instrumento del gate.

La regla existe porque el recuento de las tres rondas (11, 11, 9) no bajaba, y la razón no era que el trabajo no mejorara sino que **cada ronda escribía cosas nuevas sobre las que revisar**. Con la regla «cerrar cuando una revisión no encuentre nada» no se cierra nunca: sobre documentación siempre hay algo. Lo que valida esta regla es que aplicada hacia atrás da las decisiones que efectivamente se tomaron: ronda 1 con un mayor (H-1) → no cerrar; ronda 2 con un mayor (N-1) → no cerrar; ronda 3 sin críticos pero con T-1 tocando la guarda del gate → no cerrar.

**Resultado: 2 hallazgos, los dos menores, los dos de la misma familia** —prosa que promete una clase más ancha que la que el código detecta—. Ninguno mayor. Se corrigieron igual, porque eran baratos:

| Hallazgo | Qué era | Cómo se cerró |
| --- | --- | --- |
| **C-1** | La cabecera decía rechazar «cualquier directiva del módulo `realip`» y la constante tenía **dos de las tres**: faltaba `real_ip_recursive` | Agregada la tercera. **Mutación ejecutada** sobre el archivo real con `real_ip_recursive` **sola**, que es la forma que antes pasaba en verde: 8 casos en rojo. No debilitaba la defensa —sin `set_real_ip_from` el módulo no actúa, así que ninguna configuración con realip activo podía pasar—, pero la afirmación de clase completa era falsa |
| **C-2** | «Toda la resolución de H-3 descansa en» enumeraba **dos de tres patas**: faltaba `TRUSTED_PROXY=true`, sin la cual la aplicación ignora la cabecera y todas las peticiones vuelven a compartir clave, con esta guarda en verde | Las tres patas enumeradas en la cabecera, diciendo cuáles fija este archivo y cuál **ninguna guarda puede comprobar**, porque vive en un archivo no versionado |

La revisión confirmó por lectura del flujo de control que el rechazo de `realip` es **estrictamente aditivo**: el único `return` temprano de `revisarProxy` es el de «ningún `proxy_pass`», anterior a esta lógica, y en ese estado no hay ninguna comprobación de cabeceras que suprimir. Registró un matiz que no es defecto y conviene conservar: los mensajes de realip se **anteponen**, así que «aditivo» significa aditivo en contenido, no que una expectativa anterior siga siendo prefijo del resultado.

### Con esto se cierra la 9.1

Cuatro revisiones independientes, 11 + 11 + 9 + 2 = **33 hallazgos, todos verificados contra el código y todos reales**. Lo que la subfase deja medido, y que vale más que el recuento: **ninguna de las cuatro rondas de correcciones propias resultó limpia**, y dos introdujeron defectos nuevos mientras corregían. Está registrado en [Risks.md](../planning/Risks.md) como riesgo de probabilidad **alta**, medida y no estimada.

Lo que queda abierto y no lo tapa el cierre: la corrida en seco de `certbot` sin capturar (T-8), `account|13|17` sin explicación (T-3), el AC-4 verificado por inferencia, el AC-11 con dos rutas sin recorrer, y que el servidor sigue sin poder leerse desde un test.
