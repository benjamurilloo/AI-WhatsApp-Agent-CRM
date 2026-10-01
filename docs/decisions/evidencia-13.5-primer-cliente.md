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

**Una corrección del autor al escribirlo**: el primer borrador del paso 5 pasaba el teléfono como `sudo VERIFICAR_TELEFONO="$TEL" …`, que lo deja en los argumentos de `sudo`, legibles con `ps` por cualquier usuario del servidor. Es el defecto del hallazgo 6 de la revisión de la 13.3. Ahora va exportado y con `--preserve-env`.

**Sin probar todavía**: ningún comando de los dos runbooks corrió. El ensayo en staging (AC-3) es el que los prueba, y el programa de `jq` de capacidad corre sobre los logs del ensayo (AC-4). Esta máquina no tiene `jq`.

### AC-5: el pedido al agente

Escrito el 2026-10-01 en el Escritorio del usuario, fuera del repositorio: `Pedido-13.5-CRM-al-Agente.md`. Pide si el agente puede apuntar a producción y cuándo, cómo arma los tres identificadores con la API oficial sin mandar valores reales, el plan del primer mensaje controlado, cómo guarda las credenciales de producción y cuántos pedidos de lectura hace un turno.

### AC-6: la suite, en local

`[transcrito]`, el 2026-10-01, con los cambios de la 13.5.1:

- integración: 670 de 670, en 43 archivos;
- unitarios: 492 de 492;
- guardas: 485 de 485;
- typecheck, lint y formato: sin errores.
