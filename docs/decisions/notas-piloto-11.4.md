# Notas del piloto 11.4

Guion, notas y triage de la ventana de observación de la subfase 11.4 ([brief-11.4](brief-11.4-piloto-en-staging.md), etapa 11.4.3; D-4 y D-5). El guion y la escala se escribieron **antes** de abrir la ventana.

## Cómo se usa este documento

- El usuario recorre el guion en `https://staging.vixoraai.app` con los dos usuarios del piloto. La contraseña de los dos es la de `SEED_USER_PASSWORD`, en `/etc/crm-staging/seed.env`.
  - `piloto-admin@example.com`, con rol `admin`;
  - `piloto-lectura@example.com`, con rol `viewer`.
- Cada tarea se marca **hecha**, o **no hecha** con su motivo.
- Cada cosa que llame la atención va a §Notas: fecha, persona, pantalla y qué pasó. **Se anota lo que se vio, no la severidad**: la severidad se pone en el triage, contra la escala de abajo. Si es más cómodo, las notas se pueden dictar en el chat y Claude las transcribe tal cual.
- **Durante la ventana no se cambia nada** en staging: ni código, ni configuración, ni esquema (D-5). Lo que el usuario hace desde las pantallas no cuenta como cambio: es el piloto.
- Todos los datos son sintéticos. Ningún nombre, teléfono ni precio es del negocio real.

## Escala de severidad (D-5, fijada antes de mirar)

- **Bloqueante**: una persona no puede completar una tarea del guion; un dato se pierde, se corrompe o se muestra a quien no debe; o la API devuelve algo que contradice su contrato.
- **Mayor**: la tarea se completa, pero con un error visible o con un resultado equivocado que la persona puede no notar.
- **Menor**: la tarea se completa bien, pero con fricción, un texto confuso o un paso de más.
- **Observación**: una idea, un pedido o una diferencia con cómo se opera de verdad.

El gate de la Fase 11 cierra solo si, después del triage, **no queda ningún bloqueante abierto**. Un mayor abierto necesita una subfase con nombre y tu aceptación explícita. La ventana se rompe solo por un bloqueante y solo si lo decidís vos: en ese caso se corrige con su propio brief y el guion vuelve a empezar.

## Estado de staging al abrir

Tomado el 2026-09-25 a las 13:32 UTC. Al cerrar la ventana se repite y tiene que coincidir (AC-11). Salida cruda, en el orden de la tabla de abajo, que la resume:

```
$ ssh crm-staging 'date -u +%FT%TZ; cd /srv/crm-staging && git rev-parse HEAD && git status --short | wc -l; sudo sha256sum /etc/crm-staging/app.env | cut -c1-16; cat .next/BUILD_ID; echo; sudo cat <los nueve, en el orden del README> | sha256sum | cut -c1-16; sudo -u postgres psql -d crm_staging -tAc "select count(*) from drizzle.__drizzle_migrations"; curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/api/read/v1/knowledge'
2026-09-25T13:32:01Z
f241f62e2d7ca199fcb4f9e1205d2bdb37677b7c
0
82c3e86b92176a6f
L55sqvkKhty5VIsps8KqW
96bc5df5f773cc71
21
404
$ cat <los nueve del repositorio, en el mismo orden> | sha256sum | cut -c1-16
96bc5df5f773cc71
```

| Qué | Valor |
| --- | --- |
| `git rev-parse HEAD` en el servidor | `f241f62e2d7ca199fcb4f9e1205d2bdb37677b7c`, sin cambios locales |
| `BUILD_ID` de `.next` | `L55sqvkKhty5VIsps8KqW` |
| `sha256` de los nueve archivos de configuración, concatenados en el orden del README (primeros 16) | `96bc5df5f773cc71`, igual al del repositorio |
| `sha256` de `/etc/crm-staging/app.env` (primeros 16) | `82c3e86b92176a6f` |
| Filas de `__drizzle_migrations` | 21 |
| `GET /api/read/v1/knowledge` | `404`: la API de lectura está apagada |

## Guion

### Persona `admin` (`piloto-admin@example.com`)

| # | Tarea | Pista con los datos del seed | Estado |
| --- | --- | --- | --- |
| A-1 | Buscar un producto por una palabra de la marca, y otro por el SKU | Marca: `Novatek`. SKU: `PIL-ACC-012` (Cable USB-C) | **Hecha** (2026-09-25, informada por el usuario) |
| A-2 | Crear un producto, cambiarle el precio dos veces y mirar el historial de precios | Desde `/productos/nuevo`; el precio se fija desde el detalle, en «Ver historial y fijar precio» | **Hecha** (2026-09-25, informada por el usuario) |
| A-3 | Ajustar el stock de un producto hasta que quede en stock bajo, y después sin stock | El punto de reposición del seed es 3 | **Hecha** (2026-09-25, informada por el usuario) |
| A-4 | Crear una entrada de información programada para mañana, y desactivar una vigente | En `/informacion`. Ya hay una programada («Horario especial de fin de año»), una vencida («Promoción de vuelta a clases») y una inactiva («Envíos en moto») | **Hecha** (2026-09-25, informada por el usuario) |
| A-5 | Cambiar el estado de una conversación | Por ejemplo, una de `Camila Olmedo` o `Florencia Salvatierra` | **Hecha** (2026-09-25, informada por el usuario) |
| A-6 | Crear un usuario `viewer`, desactivarlo y reactivarlo | En `/usuarios`. Usar un email `@example.com` | **Hecha** (2026-09-25, informada por el usuario) |
| A-7 | Leer el dashboard del último mes | Las conversaciones del seed caen en los últimos 30 días | **Hecha** (2026-09-25, informada por el usuario) |

### Persona `viewer` (`piloto-lectura@example.com`)

| # | Tarea | Pista | Estado |
| --- | --- | --- | --- |
| V-1 | Encontrar un producto y su precio | Cualquiera de A-1 | **Hecha** (2026-09-25, informada por el usuario) |
| V-2 | Encontrar a un cliente y sus conversaciones, con el teléfono enmascarado | `Camila Olmedo` | **Hecha** (2026-09-25, informada por el usuario) |
| V-3 | Leer la información del negocio | `/informacion` | **Hecha** (2026-09-25, informada por el usuario) |
| V-4 | Comprobar que no puede editar nada de lo anterior | Buscar botones o formularios de edición en productos, clientes, conversaciones, información y usuarios | **Hecha** (2026-09-25, informada por el usuario) |

### Desde el lado del agente

| # | Tarea | Estado |
| --- | --- | --- |
| G-1 | Leer la salida de `probar-api-lectura.ts` contra staging ([evidencia-11.4-piloto.md](evidencia-11.4-piloto.md), §AC-9, «La prueba») para tres preguntas típicas de un cliente: «¿tienen un celular reacondicionado?», «¿hacen envíos?» y «¿qué garantía tienen?». Anotar si la respuesta le alcanzaría al agente para contestar, y qué le faltaría | **Hecha** (2026-09-25). El usuario leyó en el chat las respuestas de las tres preguntas, copiadas de la evidencia |

**Esto no es integración**: es tu juicio como dueño del negocio sobre la forma del contrato. La integración con el agente es de la 12.3. La API no se vuelve a encender para esta tarea: se lee la salida ya registrada.

**Desvío de D-6, registrado**: D-6 preveía volver a correr la prueba durante la ventana, en este paso. No se volvió a encender: la salida de la 11.4.2 ya contestaba las tres preguntas, y encenderla habría cambiado `app.env` durante la ventana, que el invariante de D-5 prohíbe. Es más conservador que lo aprobado, pero es un desvío, y se dice.

**Respuesta del usuario a G-1**, textual:

> Con respecto a la información, sí, está perfecta. Con eso le alcanza y sobra para poder contestar a las preguntas de los clientes.
>
> En cuanto a los productos, quizá necesite consultar el stock para responderles, porque un cliente podría preguntar cuántas televisiones quedan, cuántos auriculares, etc. Necesitaría saber el stock. No sé si eso es lo que devuelve lo que me mostraste, o si también puede revisarse el stock, ya que esa información está disponible en stock recondicionado. Puede ser útil para él, o quizá no sea información que el cliente requiera. Obviamente la información es perfecta; por el momento está bien, me gusta.
>
> El precio también está bien. En pesos argentinos, así que creo que está correcto.

**Qué contesta el contrato a la duda del usuario**: `read-v1` devuelve el **estado** de stock (`disponible`, `bajo_stock` o `sin_stock`) y **no la cantidad**. Fue una decisión deliberada de la 11.3, tomada sobre el supuesto de brechas «no hace falta exponer la cantidad exacta al agente» (B-8), y el brief de la 11.3 dejó dicho: «si el piloto o el agente la necesitan, es un cambio del contrato». Se contrasta en el triage (N-1).

## Preguntas de las personas (O-36)

Una por cada supuesto de `docs/product/Personas.md`. Se contestan desde cómo se opera de verdad el negocio, no desde lo que el sistema permite. Respuestas del usuario del 2026-09-25, textuales.

| # | Pregunta | Respuesta |
| --- | --- | --- |
| P-1 | ¿Quién opera el backoffice en el negocio, y con qué rol? | «El dueño con rol de admin.» |
| P-2 | ¿Existe de verdad alguien que solo necesita leer? | «Si, va a ser necesario en caso de tener algun empleado que solo necesite chequear precios o información sin requerir editar nada. Luego si haría falta un rol intermedio que pueda realizar ventas, agendar nuevos clientes, etc. Pero que no llegue a editar información importante que solo sea del alcance del admin.» |
| P-3 | ¿El `viewer` necesita ver el precio? ¿Y el teléfono sin enmascarar? | «Si, debería poder ver precio y telefono completo» |
| P-4 | ¿Quién cambia los precios, y quién ajusta el stock? | «Por el momento, el admin, es decir el dueño de negocio.» |
| P-5 | ¿Quién edita la información del negocio? | «Misma respuesta que P-4.» |

**Límite declarado** (D-4): los datos son sintéticos y la misma persona hace de las dos personas. Esto valida las personas **contra el conocimiento del dueño sobre su operación**, no contra la observación de un operador real. La observación de un operador real queda para la 13.5, con datos reales.

## Notas

Una fila por observación. N-1 sale de G-1; N-2 a N-7, de las respuestas del usuario al cierre del recorrido y a P-2 y P-3, dadas en el chat el 2026-09-25. Las citas son textuales. Los hallazgos E-1 a E-4 de la etapa 11.4.2 ([evidencia](evidencia-11.4-piloto.md), §Hallazgos de la etapa) entran también al triage.

| # | Fecha | Persona | Pantalla | Qué pasó |
| --- | --- | --- | --- | --- |
| N-1 | 2026-09-25 | agente (G-1) | API de lectura, `/products` | El agente «quizá necesite consultar el stock», porque un cliente podría preguntar «cuántas televisiones quedan, cuántos auriculares». El usuario duda: «quizá no sea información que el cliente requiera» |
| N-2 | 2026-09-25 | `admin` | Dashboard | Las métricas «solo miden las conversaciones de la gente […] No miden lo que son los productos» |
| N-3 | 2026-09-25 | `admin` | Alta de producto | Mejoraría «la interfaz de creación de productos o la lista que despliega las categorías». Sin más detalle |
| N-4 | 2026-09-25 | ambas | Listas | «También podría haber un filtro para ordenar» |
| N-5 | 2026-09-25 | ambas | General | Mejoras «quizá estéticas». «No son fundamentales» |
| N-6 | 2026-09-25 | ambas | General | «Es funcional, pero todavía es muy básico […] para poder manejar un negocio, esto todavía no sirve. Sí sirve como respaldo para el agente» |
| N-7 | 2026-09-25 | — (P-2, P-3) | Roles | Hace falta un **rol intermedio** que pueda «realizar ventas, agendar nuevos clientes», sin editar lo que es del `admin`; y el `viewer` debería ver el **teléfono completo** |

## Cierre de la ventana

Lo confirma el usuario, no la fecha.

- **Confirmación**: «Confirmo cierre», el 2026-09-25. Las 12 tareas del guion quedaron hechas (A-1 a A-7, V-1 a V-4 y G-1), y las cinco preguntas, contestadas.
- **Estado de staging al cerrar**, tomado a las 14:28 UTC. Salida cruda:

```
$ <el mismo comando de la apertura>; systemctl show crm-staging -p ActiveEnterTimestamp; sudo -u postgres psql -d crm_staging -tAc "select count(*), count(*) filter (where revoked_at is null) from ingestion_credentials where scope = 'read'"
2026-09-25T14:28:54Z
f241f62e2d7ca199fcb4f9e1205d2bdb37677b7c
0
82c3e86b92176a6f
L55sqvkKhty5VIsps8KqW
96bc5df5f773cc71
21
404
ActiveEnterTimestamp=Fri 2026-09-25 13:22:01 UTC
1|0
```

Resumen de las dos salidas crudas, la de apertura y la de cierre:

| Qué | Apertura (13:32) | Cierre (14:28) |
| --- | --- | --- |
| `git rev-parse HEAD`, cambios locales | `f241f62e…`, 0 | `f241f62e…`, 0 |
| `BUILD_ID` | `L55sqvkKhty5VIsps8KqW` | `L55sqvkKhty5VIsps8KqW` |
| `sha256` de los nueve archivos | `96bc5df5f773cc71` | `96bc5df5f773cc71` |
| `sha256` de `app.env` | `82c3e86b92176a6f` | `82c3e86b92176a6f` |
| `__drizzle_migrations` | 21 | 21 |
| `GET /api/read/v1/knowledge` | `404` | `404` |

El servicio no se reinició durante la ventana: su último arranque es de las 13:22:01 UTC, el de la etapa 11.4.2. No quedó ninguna credencial de lectura activa: hay 1 y está revocada (`1|0`). **Staging no cambió de código ni de configuración durante la ventana** (AC-11).

- **Contraste con la auditoría**: `audit_logs` desde las 13:32 UTC, por usuario y acción.

```
          email           |     entity_type     |      action      | count |  desde   |  hasta
--------------------------+---------------------+------------------+-------+----------+----------
 piloto-admin@example.com | product             | create           |     1 | 13:53:39 | 13:53:39
 piloto-admin@example.com | product             | price_change     |     2 | 13:54:12 | 13:54:45
 piloto-admin@example.com | inventory           | stock_adjustment |     3 | 13:55:28 | 13:56:31
 piloto-admin@example.com | conversation        | status_change    |     1 | 14:00:52 | 14:00:52
 piloto-admin@example.com | organization_member | create           |     1 | 14:02:01 | 14:02:01
 piloto-admin@example.com | organization_member | deactivate       |     1 | 14:02:22 | 14:02:22
 piloto-admin@example.com | organization_member | reactivate       |     1 | 14:02:36 | 14:02:36
 piloto-admin@example.com | knowledge_entry     | create           |     1 | 13:59:35 | 13:59:35
 piloto-admin@example.com | knowledge_entry     | deactivate       |     1 | 14:00:01 | 14:00:01
(9 rows)
```

Los diffs de la auditoría que sostienen A-2 a A-4. Salida cruda, sin las dos líneas de encabezado de la primera consulta y con cada línea recortada a 260 caracteres:

```
$ ssh crm-staging "sudo -u postgres psql -d crm_staging -c \"select a.entity_type, a.action, a.created_at::time(0), a.diff::text from audit_logs a where a.created_at > '2026-09-25 13:32' and a.action in ('stock_adjustment','create','deactivate','price_change') and a.entity_type in ('inventory','knowledge_entry','product') order by a.created_at\"" | cut -c1-260
 product         | create           | 13:53:39   | {"after": {"sku": "BEN-MUR-021", "name": "Mouse 2pi1", "unit": "unidad", "brand": "Microsoft", "category": "Mouse", "isActive": true, "condition": "new", "description": "Color Negro e Inalámbrico", "reorderPo
 product         | price_change     | 13:54:12   | {"after": {"amount": "35000.00", "currency": "ARS"}, "before": {"amount": null, "currency": null}}
 product         | price_change     | 13:54:45   | {"after": {"amount": "30000.00", "currency": "ARS"}, "before": {"amount": "35000.00", "currency": "ARS"}}
 inventory       | stock_adjustment | 13:55:28   | {"after": {"quantityOnHand": "50.000"}, "before": {"quantityOnHand": "0.000"}}
 inventory       | stock_adjustment | 13:55:46   | {"after": {"quantityOnHand": "5.000"}, "before": {"quantityOnHand": "50.000"}}
 inventory       | stock_adjustment | 13:56:31   | {"after": {"quantityOnHand": "0.000"}, "before": {"quantityOnHand": "5.000"}}
 knowledge_entry | create           | 13:59:35   | {"after": {"title": "Promoción Día de la Madre", "content": "Por la semana del Día de la Madre todos los productos tienen un 20% de descuento pagando con cualquier medio de pago.", "category": "Promoción",
 knowledge_entry | deactivate       | 14:00:01   | {"after": {"isActive": false}, "before": {"isActive": true}}
(8 rows)

$ ssh crm-staging "sudo -u postgres psql -d crm_staging -tA -c \"select diff->'after'->>'reorderPoint' from audit_logs where action='create' and entity_type='product' and created_at > '2026-09-25 13:32'\" -c \"select title, valid_from, valid_until, is_active from knowledge_entries where created_at > '2026-09-25 13:32'\""
5.000
Promoción Día de la Madre|2026-09-26|2026-10-18|t

$ ssh crm-staging "sudo -u postgres psql -d crm_staging -c \"select scope, count(*) from login_attempts where attempted_at > '2026-09-25 13:32' group by 1\""
 scope | count
-------+-------
(0 rows)
```
- A-2: un producto creado y **dos** cambios de precio, de `null` a 35 000 y de 35 000 a 30 000 ARS.
- A-3: el stock pasó de 0 a 50, de 50 a 5 y de 5 a 0. El punto de reposición del producto creado es 5: quedó en bajo stock y después sin stock.
- A-4: una entrada creada con vigencia desde el 2026-09-26, el día siguiente, y otra desactivada.
- A-5 y A-6: un cambio de estado de conversación, y un usuario creado, desactivado y reactivado.
- A-1, A-7 y V-1 a V-4 son lecturas y no dejan auditoría. El `viewer` **no tiene ninguna escritura**, lo que es coherente con V-4. No hubo intentos de ingreso fallidos en la ventana.

## Triage

Hecho el 2026-09-25, contra la escala de D-5 fijada antes de mirar. Autoevaluación. **Nada del triage se implementa en la 11.4.**

**Ningún bloqueante.** Todas las tareas del guion se completaron. Ningún dato se perdió, se corrompió ni se mostró a quien no debía. La API no contradijo su contrato: 0 fallas contra los esquemas estrictos (evidencia, §AC-9).

| # | Severidad | Contrastado con | Destino |
| --- | --- | --- | --- |
| E-1 — el procedimiento de despliegue del README no corre tal como está escrito | **mayor**: el despliegue se completó, pero el paso documentado falla con un error visible y hace falta saber cómo sortearlo | evidencia, §AC-6: `Permission denied`, 16 migraciones antes y después del intento fallido | **Propuesto: 12.1**, con `deploy/staging/README.md` en su lista de archivos, corregido antes de su primer despliegue. El Roadmap no dice que la 12.1 despliegue: se infiere de que su brief decide cómo son «las pruebas contra staging» (Roadmap, §Fase 12). La corrección cubre las **tres** secciones que usan `. /etc/crm-staging/*.env` como el usuario del ssh: «Aprovisionamiento» paso 5, «Desplegar un cambio» y «Encender y apagar la API de lectura», que escribió esta misma subfase. **Aceptado por el usuario el 2026-09-25**: «Acepto» |
| N-1 — la cantidad en stock para el agente | observación: una diferencia posible con cómo se opera, y el usuario no la afirma | `read-v1.md`, línea 65: «**Sin la cantidad**»; brief-11.3, línea 114 | **Pregunta asignada a la 12.5**, turno completo en staging, donde el agente usa el contrato de verdad: ¿los clientes preguntan cuántas unidades quedan? Si la respuesta es sí, un campo nuevo en la respuesta **requiere v2** (`read-v1.md`, §Versionado), con su propio brief. No se cambia antes sobre una duda |
| N-2 — el dashboard no mide productos | observación: un pedido | `MetricsCatalog.md`, «Catálogo de Métricas — WhatsApp»: sus 12 métricas son de conversaciones, mensajes, clientes e ingestión, por diseño de la Fase 7 | **Descartada para las Fases 11 a 14**, con motivo: ninguna de sus subfases la toma, y agregarla sería alcance nuevo sin brief. Se reabre al planificar lo posterior a la Fase 14. Una métrica de ventas choca con la prohibición de ventas de `CLAUDE.md`; una de catálogo o de stock no choca |
| N-3 — alta de producto y lista de categorías | **menor**: la tarea se completó (A-2, auditado), con fricción | auditoría: `product create` a las 13:53:39 | **Descartada para las Fases 11 a 14**, con motivo: ninguna de sus subfases la toma, y agregarla sería alcance nuevo sin brief. Se reabre al planificar lo posterior a la Fase 14. Hace falta el detalle de qué molestó para poder diseñarlo |
| N-4 — ordenar las listas | observación: un pedido | — | **Descartada para las Fases 11 a 14**, con motivo: ninguna de sus subfases la toma, y agregarla sería alcance nuevo sin brief. Se reabre al planificar lo posterior a la Fase 14. |
| N-5 — estética | observación | — | **Descartada para las Fases 11 a 14**, con motivo: ninguna de sus subfases la toma, y agregarla sería alcance nuevo sin brief. Se reabre al planificar lo posterior a la Fase 14. Sin detalle |
| N-6 — «para manejar un negocio, esto todavía no sirve; sí sirve como respaldo para el agente» | observación | `Scope.md` y el Roadmap: el MVP excluye ventas, compras y caja, y el ERP no empieza antes de la Fase 13 | **Confirma el plan vigente**, no lo contradice: el CRM es hoy el respaldo del agente, y gestionar el negocio es el ERP, posterior a la Fase 13. Sin acción |
| N-7a — un rol intermedio que venda y dé de alta clientes | observación: una diferencia con cómo se operará | P-1, P-4 y P-5: **hoy opera solo el dueño**, como `admin` | **Descartada para las Fases 11 a 14**, con motivo: hoy no hay empleado que la ocupe. Se registra en `Personas.md` como persona **futura** y se reabre cuando el negocio sume un empleado. La parte de «ventas» espera al ERP, por la prohibición de `CLAUDE.md` |
| N-7b — el `viewer` debería ver el teléfono completo | observación: refuta un supuesto | `SecurityModel.md`: el enmascarado de FR-CLI-06 vive en `crm`, probado en `crm.test.ts` y `clients.spec.ts` | **Supuesto refutado** en `Personas.md`. **El cambio se descarta para las Fases 11 a 14**, con motivo: afloja una regla de privacidad y hoy no hay ningún `viewer` real (P-1). Se reabre con N-7a, cuando exista el empleado |
| E-2 — collation `C.UTF-8` en staging | observación. **El piloto no la midió**: ni el guion ni las preguntas trataron el orden de las listas, y N-4 pide justamente ordenar | evidencia, §N-5 | **13.1**, entorno productivo: la base de producción se crea con la collation decidida, no con la que traiga el servidor |
| E-3 — el `401` no registra la correlación | observación: la conducta es deliberada | `serve.ts:125-132`; `read-v1.md:155` | Aclarar la redacción de `read-v1.md` en el próximo cambio del contrato de lectura (N-1, si prospera). Sin cambio de código |
| E-4 — swap residual después del build | observación, **descartada**: sin actividad en régimen normal y la aplicación con 0 kB en swap | evidencia, §Estado al terminar la etapa | Descartada con motivo. La 13.2 mide la memoria antes de exponer datos reales |

**Recuento**: 12 filas, porque N-7 se parte en dos. 0 bloqueantes, 1 mayor (E-1), 1 menor (N-3) y 10 observaciones. Destinos:

- una subfase propuesta (E-1, la 12.1);
- dos asignadas (N-1, la 12.5; E-2, la 13.1);
- una sin acción, porque confirma el plan (N-6);
- una a la próxima versión del contrato (E-3);
- siete descartadas con motivo: N-2, N-3, N-4, N-5, N-7a, N-7b y E-4.

*Corregido el 2026-09-25 tras la revisión independiente (H-2, H-3, H-4, H-9 y H-10): decía «11 filas… 9 observaciones», y seis destinos no eran ni una subfase ni un descarte.*
