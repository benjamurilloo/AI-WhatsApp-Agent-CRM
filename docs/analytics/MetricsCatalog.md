# Catálogo de Métricas — WhatsApp

**Estado**:

- **Métricas 1 a 6 y 10**: implementadas y validadas localmente y en CI con fixtures sintéticos ([brief-7.1](../decisions/brief-7.1-metricas-de-volumen.md)).
- **Métricas 7 a 9, 11 y 12**: diseñadas.

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
- **Redondeo**: el servicio devuelve los valores sin redondear, y la presentación los muestra con un decimal (brief-7.1, D-3).
- **Lecturas independientes**: cada tarjeta se calcula con su propia consulta (brief-7.1, D-1). Si llega un mensaje entre dos lecturas, dos tarjetas pueden diferir en ese mensaje.
- **Población A (conversaciones con actividad)**: conversaciones con al menos un mensaje con `sent_at ∈ I`.
- **Población A_in**: conversaciones de A con al menos un mensaje `inbound` con `sent_at ∈ I`.

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
- **Nulos**: las conversaciones sin respuesta no entran en la mediana y no se les imputa valor. Se muestran aparte como "N sin primera respuesta".
- **Casos límite**: los mensajes salientes anteriores al primer entrante (proactivos) se ignoran. Se mide solo la primera respuesta de la conversación, no la de cada reapertura. A diferencia de la métrica 7, la respuesta puede caer después del fin de `I`, así que el valor de los días recientes puede cambiar mientras llegan respuestas. El dashboard lo aclara.

### 10. Evolución diaria de conversaciones y mensajes

- **Fórmula**: para cada día `d` de `I`, las métricas 1, 2, 4 y 5 calculadas con `I = d`.
- **Casos límite**: los días sin actividad se muestran con `0` explícito y no se omiten del eje. La métrica 2 diaria no es aditiva (ver su validación).

### 11. Distribución por estado de conversación

- **Fórmula**: `COUNT` de las conversaciones de A agrupadas por su `status` actual.
- **Fuente**: `conversations` y `messages`.
- **Validación**: la suma de los grupos es igual a `|A|`.
- **Casos límite**: una conversación cerrada después de `I` aparece como `closed`, porque se usa el estado actual y no el que tenía durante `I`.

### 12. Errores de ingestión

- **Fórmula**: `COUNT(ingestion_events.id)` con `status = 'failed'` y `received_at ∈ I`, agrupado por `source` y `error_code`. También se muestra la tasa: fallidos / total de eventos con `received_at ∈ I`.
- **Fuente**: `ingestion_events`.
- **Alcance**: solo los eventos que el CRM aceptó procesar. Los payloads inválidos, las credenciales inválidas y los excesos de tasa se rechazan sin fila, así que no cuentan (brief-6.5.1, D-6).
- **Denominador de la tasa**: total de eventos recibidos en `I`. Si es 0, "sin datos".
- **Disponibilidad**: mientras el módulo de ingestión no exista en el entorno, la métrica se muestra como "no disponible" y no como `0`, para no sugerir que no hubo errores.

## Criterios de validación del dashboard

- Cada métrica tiene un test contra un fixture sintético con el valor esperado calculado a mano.
- Los fixtures incluyen un mensaje cerca de la medianoche local que en UTC cae en otro día, y un día con cambio de horario.
- Los invariantes de cada métrica ("Validación") se prueban como tests.
- Ningún valor de métrica es editable desde la UI.
- Cambiar el intervalo o la organización siempre recalcula. Si se cachea, con un TTL corto documentado en la implementación.
