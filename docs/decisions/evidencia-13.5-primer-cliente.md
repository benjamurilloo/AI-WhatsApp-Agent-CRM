# Evidencia — 13.5: primer cliente

Salidas de la subfase 13.5 ([brief-13.5](brief-13.5-primer-cliente.md)). Cada bloque es la salida literal del comando que lo precede, salvo los marcados `[transcrito]`. Los tiempos por test se quitaron. **Autoevaluación**: lo ejecutó y lo registra el mismo agente que implementó. Ningún teléfono real, `wamid` real, IP, token ni dato de un negocio aparece en este archivo: los teléfonos son del rango ficticio del proyecto.

## Etapa 13.5.1 — preparación, sin el cliente

### AC-2: el instrumento de H-4

`scripts/verificar-identificadores.ts` busca en `ingestion_events.external_ref`, `conversations.external_ref` y `messages.external_ref` de una organización los últimos 8 dígitos del teléfono de cada cliente, en claro, en base64 desde los cuatro desplazamientos y en hexadecimal. Informa solo recuentos. Sale con 1 si encuentra un teléfono y con 2 si no tiene teléfonos para buscar.

Los identificadores con forma de `wamid` del test se arman en el propio test: base64 de una estructura binaria con los dígitos en ASCII, que es la forma pública del `wamid`. **No se usó ningún `wamid` real**, y la forma no se verificó contra la API oficial, que no está montada (H-2).

```
npx vitest run --project integration tests/integration/verificar-identificadores.test.ts
      Tests  16 passed (16)
```

`[transcrito]`, los 16 casos:

1. busca los últimos 8 dígitos;
2. en claro, como en un remoteJid;
3. en base64, como en un wamid, sin aparecer en claro;
4. en base64 url-safe;
5. en base64 corrido por un prefijo del mismo alfabeto;
6. en hexadecimal;
7. sin el 9 de los móviles;
8. ningún falso positivo con identificadores sin teléfono: HMAC en hexadecimal y en base64url, un hash, un uuid y los identificadores sintéticos del proyecto;
9. cuenta por tabla y por forma, solo en la organización pedida;
10. una organización con identificadores limpios da limpio;
11. un teléfono que no es de un cliente se busca si se lo pasa aparte;
12. ignora los identificadores vaciados por la 13.4;
13. el script sale con 1 si hay un teléfono, y no imprime ningún identificador ni teléfono;
14. sale con 0 si está limpio;
15. sale con 2 si no hay teléfonos que buscar;
16. `VERIFICAR_TELEFONO` inválido se rechaza sin repetir el valor.

**Dos correcciones del autor, antes de las mutaciones:**

- El test 4 falló la primera vez por el test y no por el script: el `wamid` de prueba no tenía ningún carácter que difiera entre base64 estándar y url-safe, así que los dos eran el mismo texto. Su precondición (`toMatch(/[-_]/)`) lo detectó. Se agregaron bytes que en base64 se escriben `++//`.
- El script convertía `-` y `_` a `+` y `/` antes de decodificar. Se comprobó que Node decodifica con `"base64"` los dos alfabetos (`Buffer.from(u, "base64")` de un texto url-safe devuelve los bytes originales), así que la conversión era código muerto: se sacó, con el motivo en un comentario.

**Mutaciones sobre el archivo real**, con el método de bytes guardados de la 13.4. Las diez en rojo:

```
== M1 (busca en claro) — scripts/verificar-identificadores.ts
     × 2. en claro, como en un remoteJid
     × 7. sin el 9 de los móviles
     × 9. cuenta por tabla y por forma, solo en la organización pedida
      Tests  3 failed | 13 passed (16)
código de salida: 1
restaurado: bytes idénticos
== M2 (busca en base64) — scripts/verificar-identificadores.ts
     × 3. en base64, como en un wamid, sin aparecer en claro
     × 4. en base64 url-safe
     × 5. en base64 corrido por un prefijo del mismo alfabeto
     × 9. cuenta por tabla y por forma, solo en la organización pedida
     × 11. un teléfono que no es de un cliente se busca si se lo pasa aparte
      Tests  5 failed | 11 passed (16)
código de salida: 1
restaurado: bytes idénticos
== M3 (prueba los cuatro desplazamientos del base64) — scripts/verificar-identificadores.ts
     × 5. en base64 corrido por un prefijo del mismo alfabeto
      Tests  1 failed | 15 passed (16)
código de salida: 1
restaurado: bytes idénticos
== M4 (busca en hexadecimal) — scripts/verificar-identificadores.ts
     × 6. en hexadecimal
     × 9. cuenta por tabla y por forma, solo en la organización pedida
      Tests  2 failed | 14 passed (16)
código de salida: 1
restaurado: bytes idénticos
== M5 (busca los últimos 8 dígitos, no el número entero) — scripts/verificar-identificadores.ts
     × 1. busca los últimos 8 dígitos
     × 7. sin el 9 de los móviles
      Tests  2 failed | 14 passed (16)
código de salida: 1
restaurado: bytes idénticos
== M6 (solo la organización pedida) — scripts/verificar-identificadores.ts
     × 9. cuenta por tabla y por forma, solo en la organización pedida
      Tests  1 failed | 15 passed (16)
código de salida: 1
restaurado: bytes idénticos
== M7 (sin teléfonos que buscar no es un pase) — scripts/verificar-identificadores.ts
     × 15. sale con 2 si no hay teléfonos que buscar
      Tests  1 failed | 15 passed (16)
código de salida: 1
restaurado: bytes idénticos
== M8 (el error de VERIFICAR_TELEFONO no repite el valor) — scripts/verificar-identificadores.ts
     × 16. VERIFICAR_TELEFONO inválido se rechaza sin repetir el valor
      Tests  1 failed | 15 passed (16)
código de salida: 1
restaurado: bytes idénticos
file:///C:/Users/benja/AppData/Local/Temp/claude/c--Users-benja-OneDrive-Escritorio-Developer-Software-AI-WhatsApp-Agent-CRM/945bdc60-6f4a-4459-8005-ea7b7072aefb/scratchpad/mutar-13.5-b.mjs:14
    desde: "      sql`select external_ref from conversations
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

SyntaxError: Invalid or unexpected token
    at compileSourceTextModule (node:internal/modules/esm/utils:318:16)
    at ModuleLoader.moduleStrategy (node:internal/modules/esm/translators:90:18)
    at #translate (node:internal/modules/esm/loader:451:20)
    at afterLoad (node:internal/modules/esm/loader:507:29)
    at ModuleLoader.loadAndTranslate (node:internal/modules/esm/loader:512:12)
    at #getOrCreateModuleJobAfterResolve (node:internal/modules/esm/loader:555:36)
    at afterResolve (node:internal/modules/esm/loader:603:52)
    at ModuleLoader.getOrCreateModuleJob (node:internal/modules/esm/loader:609:12)
    at node:internal/modules/esm/loader:628:32
    at TracingChannel.tracePromise (node:diagnostics_channel:362:14)

Node.js v24.15.0
== M9 (solo la organización pedida, en conversations) — scripts/verificar-identificadores.ts
     × 9. cuenta por tabla y por forma, solo en la organización pedida
      Tests  1 failed | 15 passed (16)
código de salida: 1
restaurado: bytes idénticos
== M10 (solo la organización pedida, en messages) — scripts/verificar-identificadores.ts
     × 9. cuenta por tabla y por forma, solo en la organización pedida
      Tests  1 failed | 15 passed (16)
código de salida: 1
restaurado: bytes idénticos
```

**Límite**: que la salida del script no lleva valores se prueba por efecto en el test 13, buscando en la salida los dígitos y los identificadores. No hay mutación que lo rompa sin cambiar la estructura del script, porque `main` nunca recibe un identificador ni un teléfono: solo recuentos.

### AC-1 y AC-4: los runbooks

- [alta de un negocio](../runbooks/alta-de-un-negocio.md): las precondiciones, la organización, la carga por la UI, las credenciales, el encendido de la lectura, H-4 con el primer mensaje controlado, la apertura, la allowlist contra una credencial de control, el apagado y qué se registra.
- [observar el primer negocio](../runbooks/observar-el-primer-negocio.md): capacidad por credencial, R-6, latencia, APM, detección de caídas y privacidad, cada una con su regla de decisión escrita antes de ver datos.

**Una corrección del autor al escribirlo**: el primer borrador del paso 5 pasaba el teléfono como `sudo VERIFICAR_TELEFONO="$TEL" …`, que lo deja en los argumentos de `sudo`, legibles con `ps` por cualquier usuario del servidor. Es el defecto del hallazgo 6 de la revisión de la 13.3. Ahora va exportado y con `--preserve-env`. *Corregido después*: `--preserve-env` también deja el valor en el log de `sudo`; la forma vigente lo lee dentro del shell de `root` (ver «Lo que encontró la verificación de H-5»).

**Sin probar al escribirlos**: ningún comando de los dos runbooks había corrido. Los probó el ensayo en staging del 2026-10-01, más abajo, y dos se corrigieron por lo que encontró.

### AC-5: el pedido al agente

Escrito el 2026-10-01 en el Escritorio del usuario, fuera del repositorio: `Pedido-13.5-CRM-al-Agente.md`. Pide si el agente puede apuntar a producción y cuándo, cómo arma los tres identificadores con la API oficial sin mandar valores reales, el plan del primer mensaje controlado, cómo guarda las credenciales de producción y cuántos pedidos de lectura hace un turno.

### AC-6: la suite, en local

`[transcrito]`, el 2026-10-01, con los cambios de la 13.5.1:

- integración: 670 de 670, en 43 archivos;
- unitarios: 492 de 492;
- guardas: 485 de 485;
- typecheck, lint y formato: sin errores.

CI del commit f7c728d: run 36915787928, `success`.

### AC-3: el ensayo del alta en staging

El 2026-10-01, con autorización del usuario. Staging no recibe datos reales: la organización, el producto, la entrada de información y los clientes son inventados, y los teléfonos son del rango ficticio.

**El despliegue**, con los pasos de `deploy/staging/README.md` y un backup antes de migrar:

```
[19:52:49] desplegado antes: c530558…; backup: success
[19:53:18] código y dependencias: f7c728d…
Migraciones aplicadas. migraciones: 26
[19:55:58] /login -> 200; servicio: active
ingestión sin credencial: 404; lectura: 404
```

**Los pasos, en orden** (horas UTC). `[transcrito]` donde el comando corrió en la terminal del usuario, porque imprime una contraseña o usa un token:

| Paso | Quién | Resultado |
|---|---|---|
| 1. Organización «Ensayo 13.5» y su `admin` | usuario | creada; la contraseña quedó solo en su terminal `[transcrito]` |
| 2. Carga por la UI | usuario | 1 producto y 1 entrada de información, comprobados con un recuento en la base |
| 3. Tres credenciales (`source` `ensayo-13-5`) y dos de control en la «Organización de ejemplo» | usuario | cinco ids, comprobados en la base; los tokens no pasaron por la conversación |
| 4 y 5.1. Encender la lectura y la ingestión con sus allowlists | agente | 20:08:50 y 20:08:53; `401` y `401` |
| Allowlist, primer intento | usuario | `200` en lectura y `400` en ingestión: **ver el hallazgo 1**. Se apagó todo a las 20:15:05 (`404` y `404`), como manda el paso 4 |
| Reencendido | agente | 20:18:25, con autorización; `401` y `401` |
| Allowlist (pasos 4 y 7) | usuario | `403` y `403` `[transcrito]`; el journal confirma `FORBIDDEN` con la organización `5eed0000-0000-4000-8000-000000000001` y `source` `control-allowlist` en los dos |
| `probar-ingestion` | usuario | 18 pedidos, **0 fallas** `[transcrito]` |
| `probar-api-lectura`, con `read`, `context` y la conversación de la sonda | usuario | conocimiento, historial, alcances cruzados (`403`), referencia inexistente (`404`) y `401` bien; **1 falla**, ver abajo `[transcrito]` |
| Búsqueda y detalle del producto del ensayo | usuario | `200` y `200`, con el producto y `price` `null`, `stock_status` `sin_stock`, que es lo que corresponde a un producto sin precio ni inventario `[transcrito]` |
| 5.3. H-4 | agente | ver AC-4 |
| 7. Revocar las de control | agente | 20:28:38 |
| 8. Apagar, y revocar las tres del ensayo | agente | 20:28:41; `404` y `404`; las cinco con `revoked_at` no nulo; 0 líneas `INGESTION_` o `READ_API_` en `app.env`; servicio `active` |

**La falla de `probar-api-lectura`** es de la sonda, no del CRM: busca términos del seed del piloto («Aria», «Novatek»…), así que contra otra organización no encuentra productos y no llega a pedir un detalle. El propio script lo avisa. La búsqueda y el detalle se cubrieron con dos pedidos a mano sobre el producto del ensayo. **Desvío de AC-3**, que pedía la sonda sin fallas: queda declarado, no se cambió la sonda.

**Hallazgo 1. La allowlist se probó con el token equivocado, y el código no lo delataba.** En el primer intento se usaron los tokens `read` e `ingest` del ensayo en lugar de los de control. El `200` parecía un agujero en la allowlist. El journal lo resolvió: cada pedido registra la organización y el `source` de su credencial, y los dos decían `ensayo-13-5`. El error inverso es peor: un token de otra organización que esté en la allowlist daría el `403` esperado sin probar nada. **Corregido** en el [alta](../runbooks/alta-de-un-negocio.md): en el paso 3, los tokens de control se guardan rotulados; en el paso 4, después del `curl` se confirma en el journal de quién era el token, con un comando de `jq` probado en staging contra los dos pedidos equivocados; en el paso 7, lo mismo, y se aclara que en la ingestión un `400` significa que el token estaba en la allowlist, porque la allowlist se mira antes que el cuerpo (`src/app/api/ingestion/v1/events/handler.ts`, `isCredentialAllowed` antes de leer el cuerpo).

### AC-4: las mediciones, sobre los logs del ensayo

Con los comandos de [observar el primer negocio](../runbooks/observar-el-primer-negocio.md), cambiando `crm-production` por `crm-staging`, sobre el journal desde las 20:08:00:

```
## H-4 (alta, paso 5.3), con un teléfono sintético del rango ficticio
Teléfonos buscados: 2 (uno de VERIFICAR_TELEFONO).
ingestion_events: 7 identificadores; con un teléfono en claro 0, en base64 0, en hexadecimal 0.
conversations: 1 identificadores; con un teléfono en claro 0, en base64 0, en hexadecimal 0.
messages: 4 identificadores; con un teléfono en claro 0, en base64 0, en hexadecimal 0.
Ningún identificador lleva un teléfono buscado.
código: 0

## H-4 diario (observar, 6), sin VERIFICAR_TELEFONO
Teléfonos buscados: 1.
ingestion_events: 7 identificadores; con un teléfono en claro 0, en base64 0, en hexadecimal 0.
conversations: 1 identificadores; con un teléfono en claro 0, en base64 0, en hexadecimal 0.
messages: 4 identificadores; con un teléfono en claro 0, en base64 0, en hexadecimal 0.
Ningún identificador lleva un teléfono buscado.
código: 0

## 1. Capacidad por credencial
alcance	minutos_con_pedidos	max_por_minuto	p99_por_minuto	rechazados_por_tasa
context	1	3	3	0
ingest	3	17	17	0
read	3	10	10	0

## 2. R-6
1 0 0

## 3. Latencia por ruta
ruta	n	p50_ms	p95_ms	max_ms	errores
/api/ingestion/v2/events	22	10	43	96	15
/api/read/v1/knowledge	9	16	72	72	4
/api/read/v1/messages	5	7	15	15	3
/api/read/v1/products	6	11	55	55	2
/api/read/v1/products/{product_id}	2	9	15	15	2
```

El `VERIFICAR_TELEFONO` viajó exportado y con `--preserve-env`, como en el runbook de ese momento; la forma vigente es otra (ver «Lo que encontró la verificación de H-5»). Los «errores» de la latencia son los `400`, `403`, `404` y `409` que las sondas provocan a propósito. Los números son de un ensayo de minutos: prueban que los programas corren contra el formato real del journal, **no** dicen nada de la capacidad ni de la latencia con tráfico real.

**Hallazgo 2. El chequeo de privacidad del journal se disparaba con los uuid.** La primera versión (`grep -cE '[0-9]{10,}'`) dio 2 en la ventana del ensayo: las dos líneas `FORBIDDEN` de control, por el `organization_id` `5eed…-000000000001`. El defecto es general. El último bloque de un uuid tiene 12 caracteres hexadecimales, y en uno de cada cuarenta, más o menos, diez son dígitos seguidos. Toda línea lleva el `request_id`, así que en producción el recuento casi nunca daría 0, y cada vez sería una condición de detención falsa. Sobre 30 días del journal de staging (1624 líneas): 120 con la versión original, 7 quitando los uuid. Las 7 son `correlation_id` de una sonda de una fase anterior con una marca de tiempo de 14 dígitos (`probe-99-9-9-p99999999999999`, dígitos enmascarados). **Corregido** en la §6 del runbook: los uuid se quitan antes de contar, y si queda algo, un segundo comando dice en qué campo está, con los dígitos enmascarados. Corregido, la ventana del ensayo da 0.

**Límite, sin corregir**: el programa de capacidad agrupa por alcance y no por organización, así que suma los pedidos de las credenciales de control del paso 7. Son uno o dos pedidos, y no mueven ninguna regla de decisión.

**Sin medir**: los puntos 4 (APM) y 5 (detección de caídas) dependen de turnos del agente y de una caída real; en un ensayo no hay ninguno de los dos.

### AC-7: la revisión independiente de la 13.5.1

El 2026-10-01, a cargo de un agente que no participó del trabajo, con acceso de solo lectura, contra el brief y las reglas. Encontró **11 hallazgos: ninguno crítico, 5 mayores y 6 menores**. Cada uno se verificó contra el código antes de aceptarlo, y todos se sostuvieron. El usuario autorizó corregirlos, incluido `scripts/crear-organizacion.ts`, que estaba fuera de la lista del brief (ampliación registrada en el brief), y **aceptó los desvíos de AC-3 y AC-4** declarados arriba.

| Hallazgo | Severidad | Qué era | Cómo quedó |
|---|---|---|---|
| H-1 | mayor | el script daba pase con 0 identificadores revisados: un id equivocado o un mensaje que no llegó pasaban como «limpio» | sale con `2` si la organización no tiene eventos de ingestión; el runbook exige 1 o más (test 20, M13) |
| H-2 | mayor | un teléfono mal tecleado daba limpio | se pide dos veces y se compara; el runbook dice qué «Teléfonos buscados» se espera y qué significa uno de más |
| H-3 | mayor | el desplazamiento de medio byte en hexadecimal no tenía test ni mutación | test 17, con el prefijo `id`; M11 |
| H-4 | mayor | un `wamid` entero codificado otra vez (base64 o hex) no se veía | dos niveles de decodificación (tests 18 y 19, M12); el hash sin clave, declarado como límite en el script |
| H-5 | mayor | el nombre y el correo del `admin` iban como variables de `sudo` y quedaban en su log | `org:create` los lee del entorno, y el runbook los pide dentro del shell de `root`. **Su verificación encontró algo más grave**: abajo |
| H-6 | menor | producción corre un SHA sin el script | el paso 0 exige que la verificación salga con `3` ante un id inválido, lo que solo hace la versión corregida |
| H-7 | menor | el código 1 mezclaba «encontró un teléfono» con cualquier error | los errores salen con `3` (test 16, M14) |
| H-8 | menor | «el `403` trae la organización» vale solo para el de la allowlist | el runbook lo dice, y qué significa `organization_id` nulo |
| H-9 | menor | el control de la ingestión iba después de abrir al negocio, y `tail -n 3` se perdía con tráfico | el control va en el paso 5, antes del mensaje controlado; el comando filtra por `FORBIDDEN`. Los pasos 5 a 7 se renumeraron: H-4 es ahora el paso 6 y la apertura, el 7 |
| H-10 | menor | el chequeo del journal no ve un teléfono en base64 en el `correlation_id` | declarado como límite en la §6 de observación |
| H-11 | menor | cuatro imprecisiones | (a) abajo; (b) «uno de cada cuarenta» era falso: es (10/16)^10 × 1,75, cerca de 1 en 63; (c) la consulta de `revoked_at` es un comando completo; (d) los códigos `2` y `3` no son la condición de detención 5 |

**H-11 (a)**: la traza `SyntaxError` dentro del bloque de mutaciones es del primer intento del runner de M9 y M10, que tenía un salto de línea literal dentro de un texto de JavaScript. Node no lo compiló, así que **no aplicó ninguna mutación** ni tocó el archivo. La corrida siguiente, con el salto escrito como `\n`, es la que da M9 y M10 en rojo.

**Los dos archivos fuera de la lista** que la revisión vio en `git status`, `scripts/migrar.ts` y `src/modules/crm/repository.ts`, solo difieren en los finales de línea, no son de esta etapa y no están en ningún commit.

**Las mutaciones de las reglas nuevas**, con el mismo método de bytes guardados:

```
== M11 (hexadecimal corrido medio byte (H-3)) — scripts/verificar-identificadores.ts
     × 17. en hexadecimal corrido medio byte
      Tests  1 failed | 19 passed (20)
código de salida: 1
restaurado: bytes idénticos
== M12 (dos niveles de codificación (H-4)) — scripts/verificar-identificadores.ts
     × 18. un wamid entero en base64, otra vez
     × 19. un wamid entero en hexadecimal
      Tests  2 failed | 18 passed (20)
código de salida: 1
restaurado: bytes idénticos
== M13 (sin eventos no es un pase (H-1)) — scripts/verificar-identificadores.ts
     × 20. sale con 2 si la organización no tiene eventos de ingestión
      Tests  1 failed | 19 passed (20)
código de salida: 1
restaurado: bytes idénticos
== M14 (un error sale con 3 (H-7)) — scripts/verificar-identificadores.ts
     × 16. VERIFICAR_TELEFONO inválido se rechaza con 3, sin repetir el valor
      Tests  1 failed | 19 passed (20)
código de salida: 1
restaurado: bytes idénticos
```

### Lo que encontró la verificación de H-5: contraseñas de la base en el log de `sudo`

Al comprobar H-5 en staging apareció que **`sudo` escribe en su log el valor de toda variable que se le pasa**, también con `--preserve-env`, que era la forma que los READMEs y runbooks usaban para `DATABASE_URL` desde la 11.4. Prueba con una marca inofensiva, en staging, con la marca enmascarada:

```
   benja : PWD=/home/benja ; USER=root ; ENV=CREAR_ORG_ADMIN_CORREO=<MARCA> ; COMMAND=/usr/bin/bash -c 'exec sudo -u benja --preserve-env=CREAR_ORG_ADMIN_CORREO printenv CREAR_ORG_ADMIN_CORREO'
    root : PWD=/home/benja ; USER=benja ; ENV=CREAR_ORG_ADMIN_CORREO=<MARCA> ; COMMAND=/usr/bin/printenv CREAR_ORG_ADMIN_CORREO
```

**Los recuentos**, sin imprimir ningún valor. Staging, desde el 2026-09-22:

```
lineas_sudo: 2172
con_contrasena_en_url: 52
      4 crm_owner
     48 crm_staging_app
auth_log: /var/log/auth.log:40 /var/log/auth.log.1:12
```

Producción, desde el 2026-09-29, con autorización del usuario:

```
lineas_sudo: 1563
con_contrasena_en_url: 31
      8 crm_app_login
     12 crm_medicion
      6 crm_owner
      5 crm_vaciado
con_ORG_NOMBRE_CORREO: 0
con_admin_email_en_comando: 2
auth_log: 31
```

`crm_medicion` (13.2) y `crm_vaciado` (13.4) ya no existen; los roles vivos son `crm_app_login` y `crm_owner` en producción, y `crm_staging_app` y `crm_owner` en staging. Las dos líneas con `admin-email` son del alta de la organización del operador (13.1, paso 10): su propio correo. **El alcance**: `/var/log/auth.log` es `syslog:adm 640`, el grupo `adm` solo tiene a `syslog`, el journal lo lee `root`, y PostgreSQL escucha solo en `localhost` en los dos servidores. No abre un acceso que `root` no tenga ya; es un secreto guardado en un segundo lugar, no declarado, durante la retención de los logs.

**La forma nueva**: el shell de `root` carga el archivo sin `set -a`, exporta solo las variables que nombra, pide con `read` lo que tipea el operador, y cambia de usuario con `runuser`, que no pasa por `sudo`. Probada en staging tres veces. La primera, con una marca por la entrada estándar:

```
usuario: benja; HOME: /home/benja; dir: /srv/crm-staging
DATABASE_URL presente
VALOR presente
código: 0
marca en el journal: 0
URL con contraseña: 0
líneas ENV=: 0
```

La segunda, con el paso 6 del alta y un teléfono sintético por la entrada estándar:

```
Teléfonos buscados: 2 (uno de VERIFICAR_TELEFONO).
ingestion_events: 7 identificadores; con un teléfono en claro 0, en base64 0, en hexadecimal 0.
conversations: 1 identificadores; con un teléfono en claro 0, en base64 0, en hexadecimal 0.
messages: 4 identificadores; con un teléfono en claro 0, en base64 0, en hexadecimal 0.
Ningún identificador lleva un teléfono buscado.
código: 0
número en el journal: 0
URL con contraseña: 0
líneas ENV=: 0
```

La tercera, con la carga sin `set -a` y el `export` explícito:

```
DATABASE_URL: presente; NODE_ENV: presente; TRUSTED_PROXY: no llega
TRUSTED_PROXY está en app.env: 1
Ningún identificador lleva un teléfono buscado.
URL con contraseña: 0; líneas ENV=: 0
```

La tercera muestra que se conserva lo que el README de staging buscaba con `--preserve-env`: al proceso le llega solo lo exportado. `runuser` deja en el journal la apertura y el cierre de su sesión, sin valores.

**Lo que se cambió**: los comandos de `deploy/staging/README.md`, `deploy/production/README.md`, los runbooks del alta y de la observación, `datos-de-un-cliente.md` y el comentario de uso de `conciliar-turnos.ts`. **No** se reescribieron los briefs, las evidencias ni los guiones de fases cerradas: son registro. `org:create` lee los datos del `admin` de `CREAR_ORG_NOMBRE`, `CREAR_ORG_ADMIN_NOMBRE` y `CREAR_ORG_ADMIN_CORREO`. Probado en la base local de desarrollo, con la contraseña inicial filtrada de la salida:

```
Organización creada: 5a1dc916-e489-470d-9bb8-2e5c389f994c
Admin creado: 2ec91901-3793-4bfa-9cbd-aa02b89348c5
código: 0
Uso: npm run org:create -- --name "<organización>" --admin-name "<nombre>" --admin-email <correo> [--timezone <IANA>]
sin valores, código: 1
```

(El texto de uso se amplió después de esta corrida para nombrar las tres variables.)

La rotación y la purga quedaron hechas el mismo día: ver «La rotación de las contraseñas» más abajo.

### Staging con `6705457`

Desplegado el 2026-10-01 a las 21:15 UTC, con autorización del usuario, con los comandos nuevos (`runuser`) y un backup antes de migrar `[transcrito]`:

```
desplegado antes: f7c728d…
backup: success
código y dependencias: 6705457…
migraciones: 26
/login -> 200; servicio: active
ingestión sin credencial: 404; lectura: 404
log de sudo desde el inicio: URL con contraseña 0; líneas ENV= 0
```

Las correcciones, probadas en el servidor `[transcrito]`:

| Prueba | Resultado |
|---|---|
| Paso 0 del alta: `--org no-es-un-uuid` | código `3` |
| H-1: la organización de ejemplo, sin eventos | «no tiene eventos de ingestión», código `2` |
| H-2: dos teléfonos distintos | «No coinciden. No se corrió nada.», código `3` |
| H-5: `org:create` por el entorno, con datos inventados | organización «Prueba H-5» creada (`a0cb86ab-…`, sintética, queda en staging), código `0` |
| El journal desde el inicio de esas pruebas | correo del `admin`, nombre de la organización, teléfono, URL con contraseña y líneas `ENV=`: 0 |

El correo inventado aparece una vez en `auth.log`: es el `sudo grep` de la propia comprobación, que registra su patrón. Es sintético.

### Un incidente propio: dos contraseñas en la conversación

Al preparar la rotación, el 2026-10-01, se listaron los nombres de variable de los archivos de `/etc/crm-staging/` y `/etc/crm-production/` con un filtro que borraba lo que sigue a `=`. `backup.pgpass` no tiene `=`: sus líneas salieron enteras, y con ellas **las contraseñas de `crm_owner` de staging y de producción quedaron en la conversación con el asistente**. Se informó al usuario en el acto, sin repetir los valores, y se adelantó la rotación de `crm_owner`. La regla quedó en la memoria del asistente: los archivos de secretos solo se miran con un filtro de lo que se espera encontrar, nombrando cada archivo, y nunca recorriendo un directorio.

### La rotación de las contraseñas

Autorizada por el usuario el 2026-10-01 y hecha el mismo día, en este orden: `crm_owner` en staging y en producción, y después `crm_staging_app` y `crm_app_login`. Un solo script, que corre entero como `root` por la entrada estándar (`ssh <host> "sudo bash -s -- <owner|app> <entorno>"`), así que `sudo` registra solo `bash -s`. Lo que hace:

1. Lee la contraseña vieja de la URL del archivo de entorno, sin imprimirla, y exige que esté en una sola línea; para `crm_owner`, además, que coincida con la de `backup.pgpass`.
2. Busca la contraseña vieja en `/etc`, `/root`, `/home` y los `.env*` de la aplicación, y **se detiene** si aparece en un archivo que no espera.
3. Genera la nueva con `openssl rand -hex 32` y calcula su verificador SCRAM-SHA-256 en el servidor. A PostgreSQL llega solo el verificador, por la entrada estándar de `psql`.
4. Reescribe los archivos en el mismo inodo, con el mismo dueño y los mismos permisos.
5. Verifica con los consumidores reales. Para `crm_owner`, `db:migrate` con `migrate.env` y una conexión con `backup.pgpass`; para la aplicación, un reinicio y `/api/health`, que consulta la base. Si algo falla, restaura los archivos y el verificador anterior.
6. Borra las copias y cuenta la contraseña nueva en los logs.

La salida, sin valores `[transcrito]`:

| Rol | Archivos (líneas: con la nueva / con la vieja) | Dueño y permisos, antes y después | Verificación | Nueva en journal, log de PostgreSQL y `auth.log` |
|---|---|---|---|---|
| `crm_owner`, staging | `migrate.env` 1/0, `backup.pgpass` 1/0 | `root:root 600` | `db:migrate` código 0; `backup.pgpass` conecta como `crm_owner`; `crm-backup.service`: `success` | 0, 0, 0 |
| `crm_owner`, producción | `migrate.env` 1/0, `backup.pgpass` 1/0 | `root:root 600` | `db:migrate` código 0; `backup.pgpass` conecta como `crm_owner` | 0, 0, 0 |
| `crm_staging_app` | `app.env` 1/0 | `root:root 600` | `/api/health` 200, `/login` 200, servicio `active` | 0, 0, 0 |
| `crm_app_login` | `app.env` 1/0 | `root:root 600` | `/api/health` 200, `/login` 200, servicio `active` | 0, 0, 0 |

En los cuatro casos, la contraseña vieja estaba solo en los archivos esperados. **El backup de producción no se corrió a mano**: habría subido una copia más al bucket. Lo prueba la corrida programada siguiente, y su aviso de vida falla si no llega.

**La purga de `auth.log`**, también autorizada: se borraron las líneas con una URL de la base con contraseña, reescribiendo cada archivo en su mismo inodo. `[transcrito]`:

```
staging     /var/log/auth.log    con URL antes 40, después 0; syslog:adm 640
staging     /var/log/auth.log.1  con URL antes 12, después 0; syslog:adm 640
staging     /var/log/syslog*     con URL 0 (sin tocar)
staging     journal              con URL 52 (vence solo)
producción  /var/log/auth.log    con URL antes 31, después 0; syslog:adm 640
producción  /var/log/syslog      con URL 0 (sin tocar)
producción  journal              con URL 31 (vence solo)
```

Los recuentos de antes coinciden con los de la medición (52 y 31). **El journal no se tocó**, por decisión del usuario: vence con su retención. Las contraseñas que quedan ahí, y las dos de `crm_owner` que pasaron por la conversación, ya no abren nada. Las dos líneas de producción con el correo del operador (13.1, paso 10) no son contraseñas y siguen en `auth.log`.

**La suite, en local, con las correcciones de la revisión** `[transcrito]`, el 2026-10-01:

- integración: 674 de 674, en 43 archivos: los 670 anteriores y los tests 17 a 20;
- unitarios: 492 de 492;
- guardas: 485 de 485;
- typecheck, lint y formato: sin errores.

**El backup de producción con el `backup.pgpass` nuevo**, corrido a mano el 2026-10-01 con autorización del usuario, para no esperar a la corrida programada `[transcrito]`:

```
crm-backup: success; fin Thu 2026-10-01 21:52:24 UTC
crm-backup-offsite: success; fin Thu 2026-10-01 21:52:26 UTC
crm-heartbeat@backup: success; fin Thu 2026-10-01 21:52:25 UTC
crm-heartbeat@offsite: success; fin Thu 2026-10-01 21:52:26 UTC
```

Con eso, la fila de [Risks](../planning/Risks.md) queda cerrada.

### Verificación independiente de las correcciones

El 2026-10-01, a cargo de otro agente que no participó del trabajo, con acceso de solo lectura y sin git. Revisó H-1 a H-11 contra el código y los runbooks, todos los comandos operativos vigentes en busca de valores que pasen por `sudo`, la evidencia de la rotación y la purga, y Risks y HANDOFF. **H-1 a H-11 resueltos; ningún comando vigente pasa un secreto ni un dato personal por `sudo`; la evidencia no tiene valores, y sus recuentos cierran.** Encontró **7 hallazgos menores**, todos verificados contra los archivos:

| Hallazgo | Qué era | Cómo quedó |
|---|---|---|
| R-1 | el apagado definitivo remitía al comando del paso 5, que revoca dos credenciales; el negocio tiene tres | el paso 8 tiene su propio comando, para las tres |
| R-2 | dos frases de esta evidencia daban como vigente la forma con `--preserve-env` | anotadas, con remisión a la sección de H-5 |
| R-3 | Risks decía que H-4 es el paso 5 del alta | paso 6 |
| R-4 | HANDOFF: «sin commit» de la rotación, el último ref en verde y la 13.5 en «Esperando» | corregidos; Notion releído: la 13.5 está «En proceso» |
| R-5 | el README de staging enseña a listar los nombres de variable con `sed -E "s/=.*//"`, el filtro del incidente | el comando extrae solo `^[A-Z_]+=`, de un archivo por vez; autorizado por el usuario |
| R-6 | la rotación decía comparar con `backup.pgpass` también para el rol de la aplicación | dice que la comparación es solo para `crm_owner`, que es lo que hace el script |
| R-7 | el README de staging se cambió a `runuser` por la revisión, no por el ensayo, y la ampliación no lo nombra | ratificado por el usuario y registrado en la ampliación del brief |
