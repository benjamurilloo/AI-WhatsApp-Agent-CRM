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

**D-3. El hostname vive en variable de entorno, nunca escrito en el código.** Es lo que hace que cambiar de dominio sea una línea de configuración y no una búsqueda por todo el repositorio. Se verifica con una guarda, no con una promesa (AC-8).

**D-4. TLS termina en el servidor, no en Cloudflare.** Registro `A` en *DNS only*. Si Cloudflare terminara el TLS, los AC-2, AC-3 y AC-4 medirían el certificado y las cabeceras **de Cloudflare** y pasarían en verde sin haber verificado nada del servidor; además el salto extra rompería el conteo de `x-forwarded-for` del AC-5.

**D-5. La aplicación corre como `next start` bajo una unidad `systemd`, sin contenedor.** Aprobado por el usuario el 2026-09-22. No hay `Dockerfile`, así que la opción de contenedor **empezaba por escribir uno**, y eso es trabajo real y no configuración. Una subfase que abre gate debe introducir la menor cantidad de mecanismos nuevos posible: un `Dockerfile` mal hecho produce defectos que después se confunden con defectos de la aplicación. **Condición de reapertura**: si la 9.2 o la 9.4 necesitan reproducir el entorno en otra máquina, el empaquetado vuelve a evaluarse con esa necesidad demostrada, no antes.

**D-6. Se agregan 2 GB de swap y se compila en el servidor.** Aprobado por el usuario el 2026-09-22. `next build` en 1 núcleo con 961 MB y sin swap tiene probabilidad alta de morir por falta de memoria, con un proceso muerto sin mensaje claro como síntoma típico. Las alternativas eran compilar en CI y subir el artefacto, o agrandar el droplet; las dos cuestan más y ninguna es reversible con un comando. **El swap no es una solución de rendimiento**: compensa un pico de memoria de la compilación, y si el entorno lo usa en régimen normal eso es un hallazgo, no un éxito.

**D-7. PostgreSQL corre en el mismo droplet.** Aprobado por el usuario el 2026-09-22. La alternativa gestionada de DigitalOcean cuesta unos 15 USD/mes e incluye backups que la 9.2 podría aprovechar. **Condición de reapertura explícita**: la decisión se vuelve a mirar en la **9.2**, con la medición de backups delante, que es cuando el argumento a favor de la gestionada deja de ser hipotético.

**D-8. Los secretos viven en un `EnvironmentFile` de `systemd` con permisos `0600` de `root`.** Aprobado por el usuario el 2026-09-22, en reemplazo del «gestor de secretos del proveedor» que `SecurityModel.md:132` daba por supuesto y que un VPS desnudo no tiene. La alternativa era cifrarlos versionados con `sops`/`age`, que agrega una herramienta y una clave más que custodiar para un entorno sin datos reales. **Límite declarado**: un `EnvironmentFile` protege contra otro usuario del sistema, **no** contra quien tenga `root` ni contra un respaldo del disco sin cifrar. Es suficiente para staging y **no** es lo que se lleva a producción sin volver a decidirlo. Bajo ninguna opción es aceptable que un secreto de staging quede en el repositorio o en la configuración de CI en texto plano (AC-9).

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
6. **Gestión de secretos** según DP-4, con `.env.example` actualizado.
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

1. **Si `next build` muere por memoria** y agregar swap no lo resuelve. Cambiar de estrategia de compilación es DP-2 y la decide el usuario.
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
| **AC-2** | `openssl s_client` + `certbot renew --dry-run` | `CN=staging.vixoraai.app`, emisor Let's Encrypt, vence 2026-12-21; renovación simulada con éxito y `certbot.timer` activo |
| **AC-3** | `curl -I` sobre HTTPS **y sobre HTTP** | HTTPS: `strict-transport-security: max-age=31536000; includeSubDomains`. HTTP: `301` de nginx **sin** la cabecera. El control es lo que le da valor: si saliera en las dos, verla no probaría nada |
| **AC-4** | Ingreso real con Chromium | Cookie `__Host-crm_session`, `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/`. Que el navegador **acepte** el prefijo `__Host-` es en sí la prueba de que no viajó `Domain`: el navegador rechaza esa cookie si lo lleva |
| **AC-5** | Hash de la clave del límite por IP contra tres candidatos | La fila almacenada es `sha256("186.182.26.146")` = la IP pública real del cliente. **No** es `sha256("203.0.113.9")`, la cabecera falsificada que el navegador envió; **no** es `sha256("sin-proxy")`, la firma de H-3 |
| **AC-6** | 20 fallos desde una IP, ingreso desde otra | Desde la IP saturada: *«Demasiados intentos»*. Desde la IP del droplet, misma cuenta y misma contraseña en el mismo momento: **ingresó** |
| **AC-7** | Operaciones reales con la conexión de la aplicación | `DELETE FROM audit_logs` → `permission denied`; `SELECT` → `0`; `UPDATE clients` → `UPDATE 0`; `has_table_privilege` sobre `audit_logs`: `INSERT=t`, `DELETE=f` |
| **AC-9** | `ls -l /etc/crm-staging/` | `app.env` y `migrate.env`, `0600`, `root:root`, fuera del repositorio y fuera de CI |
| **AC-10** | `systemctl reboot` real | Secuencia `000` → `502` → `200` sin intervención. HSTS sigue presente después |

### Lo que el AC-5 demuestra y lo que no

Demuestra que **la aplicación ve la IP real del cliente** y que **falsificar `x-forwarded-for` no la cambia**, porque la comparación es contra el hash exacto de tres cadenas conocidas y solo una coincide. No demuestra que la lectura siga siendo correcta si algún día se agrega **otro** proxy delante: con dos saltos la última entrada dejaría de ser la IP del cliente. Esa premisa quedó escrita en el bloque de nginx, al lado de la directiva de la que depende.

### El AC-6: el primer intento estuvo mal diseñado

El primer intento usó **un solo correo** en los 20 fallos. Con `ACCOUNT_FAILURE_LIMIT = 5` y `IP_FAILURE_LIMIT = 20`, el límite por cuenta salta a los 5 y **el límite por IP no puede alcanzarse nunca**. El resultado fue que las dos IPs quedaron bloqueadas, y leído de apuro parecía H-3 reproduciéndose. No lo era: la base mostró 5 filas de alcance `account` bajo el hash del correo y solo 8 de alcance `ip`, muy por debajo de 20.

El segundo intento usó **20 correos distintos**, de modo que ninguna cuenta llega a 5 y lo único que puede dispararse es el límite por IP, y cerró con una cuenta que nunca había fallado. Ahí sí: bloqueada una IP, la otra ingresó.

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
