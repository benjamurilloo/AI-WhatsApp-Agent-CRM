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
