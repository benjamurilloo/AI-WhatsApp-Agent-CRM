# Catálogo de Métricas — WhatsApp

**Estado**:

- **Métricas 1 a 6 y 10**: implementadas y validadas localmente y en CI con fixtures sintéticos ([brief-7.1](../decisions/brief-7.1-metricas-de-volumen.md)).
- **Métricas 7, 8, 9 y 11**: implementadas y validadas localmente y en CI con fixtures sintéticos ([brief-7.2](../decisions/brief-7.2-metricas-de-respuesta-y-estado.md)).
- **Métrica 12**: implementada y validada localmente y en CI con fixtures sintéticos ([brief-7.3](../decisions/brief-7.3-metrica-de-errores-de-ingestion.md)). Con ella el catálogo del MVP quedó completo.
- **Métricas 13 y 14 y el período anterior**: agregados el 2026-10-06 por la [brief-15.3](../decisions/brief-15.3-dashboard-interactivo.md) (D-2, D-4 y D-5), implementados y validados localmente con fixtures sintéticos. Son de solo lectura y no cambian ninguna fórmula de las métricas 1 a 12.

Ninguna está validada con datos reales.

## Fuente: datos transaccionales, no tabla de agregados

Todas las métricas se calculan por consulta (vistas SQL o queries del módulo `analytics`) sobre `conversations`, `messages` e `ingestion_events`. En el MVP no hay tabla de métricas ([ADR 0005](../decisions/0005-metricas-desde-datos-transaccionales.md)).

**Por qué**: a la escala del MVP una consulta agregada es correcta, siempre reconstruible y no puede desincronizarse de la fuente. Un snapshot hoy sería una segunda fuente de verdad sin necesidad demostrada.

**Cuándo se justificaría un snapshot diario**: solo si en staging las consultas en vivo degradan el dashboard, medido y no supuesto. En ese caso:

- Lo genera un job idempotente que recalcula el día completo desde la fuente. Nunca se edita a mano.
- Se identifica por `UNIQUE(organization_id, metric_date)`, así un día puede recalcularse sin duplicar.
- Es una copia derivada: ante una discrepancia gana el recálculo desde la fuente y el snapshot se regenera.
- Se registra primero en un ADR nuevo.

## Convenciones comunes

- **Zona horaria**: `organizations.timezone` (IANA). Todo timestamp se guarda en UTC. El valor por defecto es `America/Argentina/Buenos_Aires` y en el MVP no se edita por pantalla (decisión D-5 del [brief-1.3](../decisions/brief-1.3-decisiones-de-producto-abiertas.md)). Esa zona hoy no tiene horario de verano, pero lo tuvo hasta 2009: los fixtures de cambio de horario usan una fecha histórica de esa misma zona, no UTC ni otra zona.
- **Intervalo `I`**: semiabierto `[inicio, fin)`, en días calendario de la zona horaria de la organización, convertido a UTC para consultar. En un cambio de horario un día puede durar 23 o 25 horas; la conversión con zona IANA lo resuelve y no se corrige a mano. El período lo resuelve el servicio (brief-7.1, D-2):
  - llega como dos fechas `YYYY-MM-DD` con el fin incluido;
  - sin fechas, se usan los últimos 30 días completos, sin incluir hoy. "Hoy" sale del reloj de la base, en la zona de la organización;
  - se rechaza con `VALIDATION_ERROR` un período con una sola fecha, invertido, de más de 366 días o con un fin posterior a hoy. Hoy se admite como día parcial.

  A diferencia de los filtros de las listas, un campo vacío no significa "sin límite".
- **Agrupación diaria**: `date_trunc('day', ts AT TIME ZONE organizations.timezone)`.
- **Aislamiento**: toda métrica filtra por `organization_id`. No hay métricas entre organizaciones.
- **Nulos**: `messages.sent_at`, `messages.direction` y `conversations.started_at` son `NOT NULL` por constraint, así que no admiten nulos. `conversations.client_id` sí puede ser nulo (ver métrica 3).
- **`started_at`**: la carga (seeds o ingestión) lo fija con el `sent_at` del primer mensaje de la conversación. Un test de integración verifica este invariante.
- **Estado de una conversación**: es el estado actual al momento de la consulta. No existe historial de transiciones en el MVP.
- **Denominador cero**: la métrica muestra "sin datos", nunca `0` ni un error. El servicio lo devuelve como un estado propio (`no_data`), distinto del "no disponible" de la métrica 12 (brief-7.1, D-4).
- **Mediana**: `percentile_cont(0.5)`. Con una cantidad par, es el promedio de los dos valores centrales (brief-7.1, D-3).
- **Redondeo**: el servicio devuelve los valores sin redondear, y la presentación los muestra con un decimal (brief-7.1, D-3). Donde una métrica dice "con un decimal", ese decimal es de la pantalla, no del valor calculado.
- **Lecturas independientes**: cada tarjeta se calcula con su propia consulta (brief-7.1, D-1). Si llega un mensaje entre dos lecturas, dos tarjetas pueden diferir en ese mensaje.
- **Población A (conversaciones con actividad)**: conversaciones con al menos un mensaje con `sent_at ∈ I`.
- **Población A_in**: conversaciones de A con al menos un mensaje `inbound` con `sent_at ∈ I`.
- **Período anterior** (*desde la 15.3*, D-2): el intervalo de la misma cantidad de días que termina el día antes de que empiece `I`. Para `I` del 06/09 al 05/10, del 07/08 al 05/09. Es aritmética de días de calendario; cada día se convierte con la zona de la organización como cualquier `I`, así que un período anterior puede tener un día de 23 o 25 horas. Cada métrica se calcula sobre él con su misma fórmula. La comparación es de la pantalla, no del catálogo:
  - cantidades (1, 2, 3, 4, 5 y 7) en porcentaje; tasas (8 y 12) en puntos porcentuales; promedio y mediana (6 y 9) como diferencia absoluta;
  - la métrica 11 no se compara: es el estado actual, y no existe el del período anterior;
  - con el período anterior en «sin datos» o «no disponible», no hay comparación, y se dice cuál de los dos. Una cantidad con el anterior en 0 tampoco se compara (el porcentaje sería infinito), y se dice que fue 0; una tasa o un promedio con el anterior en 0 sí, porque la diferencia está definida (*precisado el 2026-10-06*, revisión de la 15.3);
  - si `I` incluye hoy, que es un día parcial, no se compara.

---

### 1. Conversaciones iniciadas

- **Fórmula**: `COUNT(conversations.id)` con `started_at ∈ I`.
- **Fuente**: `conversations`.
- **Denominador**: no aplica, es un conteo.
- **Casos límite**: una conversación que vuelve a tener mensajes después de `closed` no crea una fila nueva ni vuelve a contarse.
- **Validación**: la suma de los valores diarios de `I` es igual al total de `I`.

### 2. Conversaciones con actividad

- **Fórmula**: `|A|`.
- **Fuente**: `messages` unido a `conversations`.
- **Denominador**: no aplica.
- **Casos límite**: una conversación iniciada antes de `I` con mensajes dentro de `I` cuenta aquí y no en la métrica 1.
- **Validación**: la suma de los valores diarios puede superar el total de `I`, porque una conversación activa varios días cuenta una vez por día. El dashboard lo aclara y el test lo verifica.

### 3. Clientes únicos

- **Fórmula**: `COUNT(DISTINCT conversations.client_id)` sobre A, excluyendo `client_id IS NULL`.
- **Fuente**: `conversations` y `messages`.
- **Nulos**: las conversaciones sin cliente resuelto no suman. Junto a la métrica se muestra "N conversaciones sin cliente asociado".
- **Validación**: el resultado nunca supera `|A|`.

### 4. Mensajes entrantes y 5. Mensajes salientes

- **Fórmula**: `COUNT(messages.id)` con `sent_at ∈ I` y `direction = 'inbound'` (métrica 4) o `'outbound'` (métrica 5).
- **Fuente**: `messages`.
- **Validación**: entrantes más salientes es igual al total de mensajes con `sent_at ∈ I`.

### 6. Mensajes por conversación

- **Fórmula**: promedio = mensajes con `sent_at ∈ I` / `|A|`. También se muestra la mediana de la cantidad de mensajes en `I` por conversación de A.
- **Denominador**: `|A|`. Si es 0, "sin datos".
- **Casos límite**: solo cuentan los mensajes dentro de `I`, no los de toda la vida de la conversación. La mediana evita que unas pocas conversaciones largas escondan la distribución.
- **Validación**: el promedio multiplicado por `|A|` es igual a la suma de las métricas 4 y 5.

### 7. Conversaciones respondidas

- **Definición**: una conversación de A está respondida en `I` si tiene un mensaje `inbound` y un mensaje `outbound` posterior, ambos con `sent_at ∈ I` y con `outbound.sent_at > inbound.sent_at`.
- **Fórmula**: cantidad de conversaciones de A que cumplen la definición.
- **Fuente**: `messages`.
- **Casos límite**: si un `inbound` recibe su respuesta después del fin de `I`, no cuenta en `I`. Si ambos mensajes tienen el mismo timestamp, no cuenta como respuesta. Una conversación con solo mensajes salientes nunca está respondida.

### 8. Cobertura de respuesta

- **Fórmula**: métrica 7 / `|A_in|`, en porcentaje con un decimal.
- **Denominador**: `|A_in|`. Las conversaciones con solo mensajes salientes en `I` se excluyen porque no tienen nada que responder. Si es 0, "sin datos".
- **Validación**: el valor está entre 0 y 100 %, y la métrica 7 nunca supera `|A_in|`.

### 9. Mediana del tiempo a primera respuesta

- **Población**: conversaciones cuyo primer mensaje `inbound` de toda la conversación tiene `sent_at ∈ I`.
- **Por conversación**: `delta` = `sent_at` del primer `outbound` estrictamente posterior a ese primer `inbound` (en cualquier momento hasta la consulta) menos `sent_at` del primer `inbound`.
- **Fórmula**: mediana de `delta` en minutos, con un decimal, sobre las conversaciones de la población que tienen respuesta.
- **Nulos**: las conversaciones sin respuesta no entran en la mediana y no se les imputa valor. Se muestran aparte como "N sin primera respuesta". Ese conteo acompaña siempre al valor, también cuando ninguna conversación tiene respuesta y la mediana es "sin datos" (brief-7.2, D-3).
- **Casos límite**: los mensajes salientes anteriores al primer entrante (proactivos) se ignoran. Se mide solo la primera respuesta de la conversación, no la de cada reapertura. A diferencia de la métrica 7, la respuesta puede caer después del fin de `I`, así que el valor de los días recientes puede cambiar mientras llegan respuestas. El dashboard lo aclara.

### 10. Evolución diaria de conversaciones y mensajes

- **Fórmula**: para cada día `d` de `I`, las métricas 1, 2, 4 y 5 calculadas con `I = d`.
- **Casos límite**: los días sin actividad se muestran con `0` explícito y no se omiten del eje. La métrica 2 diaria no es aditiva (ver su validación).

### 11. Distribución por estado de conversación

- **Fórmula**: `COUNT` de las conversaciones de A agrupadas por su `status` actual.
- **Fuente**: `conversations` y `messages`.
- **Validación**: la suma de los grupos es igual a `|A|`.
- **Casos límite**: una conversación cerrada después de `I` aparece como `closed`, porque se usa el estado actual y no el que tenía durante `I`.
- **Estados sin conversaciones**: la métrica devuelve los tres estados (`open`, `pending`, `closed`) en el orden del dominio, con `0` explícito, igual que los días vacíos de la serie diaria (brief-7.2, D-4).

### 12. Errores de ingestión

- **Fórmula**: `COUNT(ingestion_events.id)` con `status = 'failed'` y `received_at ∈ I`, agrupado por `source` y `error_code`. También se muestra la tasa: fallidos / total de eventos con `received_at ∈ I`.
- **Fuente**: `ingestion_events`.
- **Qué eventos cuenta** (*desde la 12.1*, revisión independiente R-2): todos los de `ingestion_events` salvo `client.resolved`, que resuelve un cliente y no es un mensaje ingerido. Sin esa exclusión, cada turno del agente bajaría la tasa sin que fallaran menos mensajes. Si otra subfase agrega un tipo de evento que no sea un mensaje, decide ahí si cuenta. *Desde la 12.2* ([brief-12.2](../decisions/brief-12.2-conversacion-vigente-y-derivacion.md), D-9): `conversation.resolved` **cuenta**, porque registra un mensaje entrante y su fallo es un mensaje perdido; su rechazo por falta de cliente aparece con el código `client_not_found`, porque `error_code` guarda la regla de un rechazo de negocio (DataModel). `conversation.escalated` **no cuenta**, ni fallido ni procesado: deriva una conversación y no es un mensaje.
- **Alcance**: solo los eventos que el CRM aceptó procesar. Los payloads inválidos, las credenciales inválidas y los excesos de tasa se rechazan sin fila, así que no cuentan (brief-6.5.1, D-6).
- **Denominador de la tasa**: total de eventos con `received_at ∈ I`, en cualquier estado: los `received` y los `processed` cuentan en el denominador y no en el numerador. Si es 0, "sin datos".
- **Grupos**: una lista plana de `{ source, error_code, count }`, ordenada por conteo descendente y, a igual conteo, por `source` y `error_code` alfabéticos (brief-7.3, D-3). Solo aparecen las combinaciones con al menos un evento: el origen y el código son taxonomías abiertas, así que no hay conjunto completo para rellenar con `0`, a diferencia de los estados de la métrica 11.
- **Validación**: los fallidos no superan el total, la suma de los grupos es igual a los fallidos y la tasa es su cociente, entre 0 y 100 %.
- **Disponibilidad**: la métrica se muestra como "no disponible", y no como `0` ni como "sin datos", cuando la ingestión no está configurada en el entorno **y** el período no tiene ningún evento (brief-7.3, D-1). La configuración se lee en cada llamada; una configuración inválida cuenta como no configurada. Con eventos registrados la métrica muestra su valor aunque el endpoint esté apagado: apagarlo después de un incidente no borra de la vista los fallos ya registrados.
- **Estados**: los tres —valor, "sin datos" y "no disponible"— son distintos entre sí y ninguno se presenta como `0`.
- **Primera medición con un emisor real** (*2026-09-27, 12.3.3*, [evidencia-12.3](../decisions/evidencia-12.3-ingestion-v2.md), AC-18): un turno sintético emitido por la instancia del agente contra staging dejó cinco filas en `ingestion_events`. El conteo a mano con las exclusiones de arriba dio 3 eventos y 0 fallidos, y el dashboard mostró «0,0 %, 0 fallidos de 3 eventos». Un solo turno sin fallos: prueba que la métrica cuenta bien los eventos de un emisor real, no cómo se comporta con la distribución real (pocos orígenes, ráfagas de un mismo código).
- **Primera medición con fallidos, con la cadena real del agente** (*2026-09-28, 12.5.2*, [evidencia-12.5](../decisions/evidencia-12.5-turno-completo.md), AC-12): dos ventanas con seis turnos sintéticos, una semilla y un duplicado deliberado. El conteo a mano del script de conciliación dio 7 eventos y 0 fallidos, y 9 y 2. El dashboard del día mostró «12,5 %, 2 fallidos de 16 eventos», con los dos grupos `agente-12-5-2 · conversation_ref_taken` y `agente-12-5-2 · message_already_recorded`. Los dos fallidos son `409` provocados por el guion, **no mensajes perdidos**: un emisor que sigue la guía guarda el mensaje igual. **Leerla con eso en cuenta**: la métrica cuenta un `CONFLICT` como fallido aunque la reacción del emisor lo resuelva, así que en producción una tasa distinta de cero no implica pérdida. Hay que mirar el código de cada grupo.

### 13. Distribución por tipo de mensaje entrante

- **Fórmula**: `COUNT` de los mensajes `inbound` con `sent_at ∈ I`, agrupados por `kind` ([brief-15.3](../decisions/brief-15.3-dashboard-interactivo.md), D-4).
- **Fuente**: `messages`.
- **Grupos**: los seis tipos del enum en el orden del dominio (`text`, `audio`, `image`, `video`, `document`, `other`), con `0` explícito, y al final **«sin dato»**: los mensajes con `kind` nulo, que son los de la ingestión v1 y los seeds (DataModel). Nunca se reparten entre los tipos ni se esconden.
- **Validación**: la suma de los grupos es igual a la métrica 4.
- **Denominador cero**: sin entrantes en `I`, «sin datos», no siete ceros.
- **Por qué solo entrantes**: la pregunta es qué mandan los clientes; los salientes son casi todos texto del agente.

### 14. Distribución del tiempo a primera respuesta

- **Población y delta**: los de la métrica 9 ([brief-15.3](../decisions/brief-15.3-dashboard-interactivo.md), D-5).
- **Fórmula**: `COUNT` de las conversaciones de la población **con** respuesta, por rango de `delta`. Los rangos son semiabiertos `[desde, hasta)`: menos de 1 min; 1 a 5 min; 5 a 30 min; 30 a 60 min; 1 h o más. Un delta de exactamente 5 min cae en «5 a 30».
- **Nulos**: las conversaciones sin primera respuesta no son un rango; se informan aparte, siempre, como en la métrica 9.
- **Validación**: la suma de los rangos es igual a las conversaciones con respuesta de la métrica 9, y la población es la misma.
- **Denominador cero**: sin ninguna conversación con respuesta, los rangos son «sin datos», y las que esperan respuesta se informan igual.
- **Casos límite**: los de la métrica 9. El delta es tiempo transcurrido: en un día de 25 horas, una respuesta a la misma hora del reloj pero una hora después cae en «1 h o más».

## Criterios de validación del dashboard

- Cada métrica tiene un test contra un fixture sintético con el valor esperado calculado a mano.
- Los fixtures incluyen un mensaje cerca de la medianoche local que en UTC cae en otro día, y un día con cambio de horario.
- Los invariantes de cada métrica ("Validación") se prueban como tests.
- Ningún valor de métrica es editable desde la UI.
- Cambiar el intervalo o la organización siempre recalcula. Si se cachea, con un TTL corto documentado en la implementación.
