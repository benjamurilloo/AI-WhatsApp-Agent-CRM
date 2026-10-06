import { readIngestionConfig, type IngestionConfig } from "@/modules/ingestion";
import {
  authorize,
  getOrganizationTimezone,
  type AuthContext,
} from "@/modules/organizations";
import { isCalendarDate } from "@/shared/calendar";
import type { Failure } from "@/shared/errors";
import * as repository from "./repository";

// Métricas de volumen (brief-7.1): 1 a 6 y 10 de MetricsCatalog, para admin y viewer. Una función
// por tarjeta del dashboard (D-1), calculada desde los datos transaccionales en cada llamada.

export const DEFAULT_PERIOD_DAYS = 30;
export const MAX_PERIOD_DAYS = 366;

// Período de la URL, como texto: fechas YYYY-MM-DD con el fin incluido, o las dos vacías.
export type MetricsPeriodInput = { from: string; to: string };
export type MetricsPeriodField = "from" | "to";

export type MetricsPeriod = {
  from: string;
  to: string;
  days: number;
  // Zona IANA en la que se interpretan los días.
  timezone: string;
};

// Valor de una métrica con denominador (7.1, D-4), con el estado "unavailable" que suma la 7.3.
// Los tres estados son distintos entre sí y ninguno se presenta como 0 (MetricsCatalog).
export type RatioMetric<T> =
  ({ status: "value" } & T) | { status: "no_data" } | { status: "unavailable" };

export type MetricResult<T> =
  | { ok: true; period: MetricsPeriod; value: T }
  | Failure<"FORBIDDEN">
  | Failure<"VALIDATION_ERROR", { fields: MetricsPeriodField[] }>;

const DAY_MS = 24 * 60 * 60 * 1000;

const toDayNumber = (date: string) => Date.parse(`${date}T00:00:00Z`) / DAY_MS;
const fromDayNumber = (day: number) =>
  new Date(day * DAY_MS).toISOString().slice(0, 10);

// Resuelve y valida el período contra la fecha de hoy de la organización (D-2). Sin fechas, los
// últimos 30 días completos sin hoy. Hoy se admite como día parcial; el futuro, no.
export function resolveMetricsPeriod(
  input: MetricsPeriodInput,
  today: string,
):
  | { ok: true; from: string; to: string; days: number }
  | Failure<"VALIDATION_ERROR", { fields: MetricsPeriodField[] }> {
  const from = input.from.trim();
  const to = input.to.trim();
  const todayNumber = toDayNumber(today);
  if (from === "" && to === "") {
    return {
      ok: true,
      from: fromDayNumber(todayNumber - DEFAULT_PERIOD_DAYS),
      to: fromDayNumber(todayNumber - 1),
      days: DEFAULT_PERIOD_DAYS,
    };
  }
  const invalid = new Set<MetricsPeriodField>();
  if (!isCalendarDate(from)) invalid.add("from");
  if (!isCalendarDate(to)) invalid.add("to");
  if (invalid.size === 0) {
    const days = toDayNumber(to) - toDayNumber(from) + 1;
    if (days < 1 || days > MAX_PERIOD_DAYS) {
      invalid.add("from");
      invalid.add("to");
    }
    if (toDayNumber(to) > todayNumber) invalid.add("to");
    if (invalid.size === 0) return { ok: true, from, to, days };
  }
  return {
    ok: false,
    code: "VALIDATION_ERROR",
    fields: (["from", "to"] as const).filter((field) => invalid.has(field)),
  };
}

// Período anterior (brief-15.3, D-2): la misma cantidad de días, terminando el día antes de que
// empiece el elegido. Es aritmética de días de calendario; cada día se convierte después con la
// zona de la organización, como cualquier período. Para el valor por defecto (del 18/08 al 16/09),
// del 19/07 al 17/08.
export function previousPeriodInput(period: {
  from: string;
  days: number;
}): MetricsPeriodInput {
  const start = toDayNumber(period.from);
  return {
    from: fromDayNumber(start - period.days),
    to: fromDayNumber(start - 1),
  };
}

async function withPeriod<T>(
  context: AuthContext,
  input: MetricsPeriodInput,
  compute: (query: repository.MetricsQuery) => Promise<T>,
): Promise<MetricResult<T>> {
  const authorized = authorize(context);
  if (!authorized.ok) return authorized;
  const timezone = await getOrganizationTimezone(context);
  const resolved = resolveMetricsPeriod(
    input,
    await repository.currentDate(timezone),
  );
  if (!resolved.ok) return resolved;
  const { from, to, days } = resolved;
  const value = await compute({
    organizationId: context.organizationId,
    from,
    to,
    timezone,
  });
  return { ok: true, period: { from, to, days, timezone }, value };
}

export type MetricsPeriodResult =
  | { ok: true; period: MetricsPeriod }
  | Failure<"FORBIDDEN">
  | Failure<"VALIDATION_ERROR", { fields: MetricsPeriodField[] }>;

// Resuelve el período una sola vez para toda la pantalla (brief-7.4, D-6): autoriza, toma la zona
// de la organización y el "hoy" del reloj de la base, igual que cada métrica por dentro, pero sin
// leer ninguna tabla de datos. Un período inválido es un error de la entrada compartida, no de una
// métrica, así que la pantalla lo muestra una vez y no pide las doce.
export async function getMetricsPeriod(
  context: AuthContext,
  input: MetricsPeriodInput,
): Promise<MetricsPeriodResult> {
  const result = await withPeriod(context, input, async () => null);
  return result.ok ? { ok: true, period: result.period } : result;
}

// Métrica 1: conversaciones con started_at en el período.
export function getConversationsStarted(
  context: AuthContext,
  input: MetricsPeriodInput,
): Promise<MetricResult<number>> {
  return withPeriod(context, input, repository.countConversationsStarted);
}

// Métrica 2: conversaciones con al menos un mensaje en el período (|A|).
export function getActiveConversations(
  context: AuthContext,
  input: MetricsPeriodInput,
): Promise<MetricResult<number>> {
  return withPeriod(context, input, repository.countActiveConversations);
}

// Métrica 3: clientes distintos de A; las conversaciones sin cliente se cuentan aparte.
export function getUniqueClients(
  context: AuthContext,
  input: MetricsPeriodInput,
): Promise<MetricResult<{ clients: number; withoutClient: number }>> {
  return withPeriod(context, input, repository.countUniqueClients);
}

// Métricas 4 y 5: salen de la misma consulta (D-1).
export function getMessageCounts(
  context: AuthContext,
  input: MetricsPeriodInput,
): Promise<MetricResult<{ inbound: number; outbound: number }>> {
  return withPeriod(context, input, repository.countMessagesByDirection);
}

export type MessagesPerConversation = RatioMetric<{
  conversations: number;
  messages: number;
  // Sin redondear: la presentación muestra un decimal (D-3).
  average: number;
  median: number;
}>;

// Métrica 6: con |A| = 0, "sin datos" (MetricsCatalog, denominador cero).
export function getMessagesPerConversation(
  context: AuthContext,
  input: MetricsPeriodInput,
): Promise<MetricResult<MessagesPerConversation>> {
  return withPeriod(context, input, async (query) => {
    const found = await repository.messagesPerConversation(query);
    if (found.conversations === 0 || found.median === null) {
      return { status: "no_data" };
    }
    return {
      status: "value",
      conversations: found.conversations,
      messages: found.messages,
      average: found.messages / found.conversations,
      median: found.median,
    };
  });
}

// Métrica 7: conversaciones con un entrante y un saliente posterior, los dos dentro de I. Un empate
// de timestamps no es una respuesta (MetricsCatalog).
export function getRespondedConversations(
  context: AuthContext,
  input: MetricsPeriodInput,
): Promise<MetricResult<number>> {
  return withPeriod(context, input, repository.countRespondedConversations);
}

export type ResponseCoverage = RatioMetric<{
  responded: number;
  // |A_in|: conversaciones con al menos un entrante en I. Las que solo tienen salientes no cuentan,
  // porque no tienen nada que responder (MetricsCatalog).
  withInbound: number;
  // Porcentaje sin redondear, entre 0 y 100 (7.1, D-3).
  percentage: number;
}>;

// Métrica 8: con |A_in| = 0, "sin datos".
export function getResponseCoverage(
  context: AuthContext,
  input: MetricsPeriodInput,
): Promise<MetricResult<ResponseCoverage>> {
  return withPeriod(context, input, async (query) => {
    const found = await repository.responseCoverage(query);
    if (found.withInbound === 0) return { status: "no_data" };
    return {
      status: "value",
      responded: found.responded,
      withInbound: found.withInbound,
      percentage: (found.responded * 100) / found.withInbound,
    };
  });
}

export type FirstResponseTime = {
  // Conversaciones cuyo primer entrante de toda la conversación cae en I.
  population: number;
  // Las que no tienen primera respuesta: se muestran aparte y no se les imputa valor. Viajan
  // siempre, también cuando la mediana es "sin datos" (brief-7.2, D-3).
  withoutResponse: number;
  median: RatioMetric<{ minutes: number }>;
};

// Métrica 9: mediana del tiempo a la primera respuesta. La respuesta puede ser posterior al fin de
// I, así que el valor de los días recientes cambia mientras llegan respuestas (MetricsCatalog).
export function getFirstResponseTime(
  context: AuthContext,
  input: MetricsPeriodInput,
): Promise<MetricResult<FirstResponseTime>> {
  return withPeriod(context, input, async (query) => {
    const found = await repository.firstResponseTime(query);
    return {
      population: found.population,
      withoutResponse: found.population - found.withResponse,
      median:
        found.withResponse === 0 || found.medianMinutes === null
          ? { status: "no_data" }
          : { status: "value", minutes: found.medianMinutes },
    };
  });
}

export type StatusDistribution = Awaited<
  ReturnType<typeof repository.statusDistribution>
>;

// Métrica 11: conversaciones de A por su estado actual, con los tres estados siempre presentes. Es
// el estado de ahora, no el que la conversación tenía durante I (MetricsCatalog).
export function getStatusDistribution(
  context: AuthContext,
  input: MetricsPeriodInput,
): Promise<MetricResult<StatusDistribution>> {
  return withPeriod(context, input, repository.statusDistribution);
}

export type DailyActivity = repository.DailyRow;

// Métrica 10: métricas 1, 2, 4 y 5 por día, con 0 explícito. La 2 diaria no se suma.
export function getDailyActivity(
  context: AuthContext,
  input: MetricsPeriodInput,
): Promise<MetricResult<DailyActivity[]>> {
  return withPeriod(context, input, repository.dailyActivity);
}

export type IngestionErrorGroup = repository.IngestionErrorGroup;

export type IngestionErrors = RatioMetric<{
  // Eventos registrados en el período, en cualquier estado: es el denominador de la tasa.
  total: number;
  failed: number;
  // Porcentaje sin redondear, entre 0 y 100 (7.1, D-3).
  percentage: number;
  groups: IngestionErrorGroup[];
}>;

// Parte pura de la disponibilidad (brief-7.3, D-1): la métrica es "no disponible" cuando la
// ingestión no está configurada en el entorno —apagada o con configuración inválida— y el período
// no tiene ningún evento. Con eventos registrados se muestran, aunque hoy el endpoint esté apagado:
// apagarlo después de un incidente no borra de la vista los fallos que quedaron registrados.
export function isIngestionUnavailable(
  config: IngestionConfig,
  totalEvents: number,
): boolean {
  return !config.enabled && totalEvents === 0;
}

// Métrica 12: eventos de ingestión fallidos por origen y código de error, y su tasa sobre el total
// del período. Mide solo lo que el CRM aceptó procesar: los rechazos de validación, autenticación y
// límite de tasa no dejan fila, así que no cuentan (contrato de ingestión v1, brief-6.5.1, D-6).
// El entorno viaja por parámetro para que la decisión de D-1 sea verificable sin variables globales.
export function getIngestionErrors(
  context: AuthContext,
  input: MetricsPeriodInput,
  env: Record<string, string | undefined> = process.env,
): Promise<MetricResult<IngestionErrors>> {
  return withPeriod(context, input, async (query) => {
    const found = await repository.ingestionErrors(query);
    if (isIngestionUnavailable(readIngestionConfig(env), found.total)) {
      return { status: "unavailable" };
    }
    // Sin un solo evento no hay tasa: "sin datos" nunca se presenta como 0 %.
    if (found.total === 0) return { status: "no_data" };
    return {
      status: "value",
      total: found.total,
      failed: found.failed,
      percentage: (found.failed * 100) / found.total,
      groups: found.groups,
    };
  });
}

export type MessageKindCount = repository.MessageKindCount;

export type MessageKindDistribution = RatioMetric<{
  // Entrantes de I: es la métrica 4, y la suma de los grupos.
  total: number;
  groups: MessageKindCount[];
}>;

// Métrica 13 (brief-15.3, D-4): los entrantes de I por tipo, con los nulos como «sin dato». Sin
// entrantes no hay distribución: "sin datos", nunca seis ceros.
export function getInboundMessageKinds(
  context: AuthContext,
  input: MetricsPeriodInput,
): Promise<MetricResult<MessageKindDistribution>> {
  return withPeriod(context, input, async (query) => {
    const groups = await repository.inboundMessagesByKind(query);
    const total = groups.reduce((sum, group) => sum + group.count, 0);
    if (total === 0) return { status: "no_data" };
    return { status: "value", total, groups };
  });
}

export const FIRST_RESPONSE_BUCKETS = repository.FIRST_RESPONSE_BUCKETS;

export type FirstResponseBucket = {
  fromMinutes: number;
  // null en el último rango: «1 h o más».
  toMinutes: number | null;
  count: number;
};

export type FirstResponseDistribution = {
  // Las mismas dos cifras que la métrica 9, sobre la misma población.
  population: number;
  withoutResponse: number;
  buckets: RatioMetric<{ withResponse: number; ranges: FirstResponseBucket[] }>;
};

// Métrica 14 (brief-15.3, D-5): las conversaciones con primera respuesta, por rango de minutos. Las
// que no tienen respuesta no son un rango: viajan aparte, siempre, como en la métrica 9.
export function getFirstResponseDistribution(
  context: AuthContext,
  input: MetricsPeriodInput,
): Promise<MetricResult<FirstResponseDistribution>> {
  return withPeriod(context, input, async (query) => {
    const found = await repository.firstResponseDistribution(query);
    return {
      population: found.population,
      withoutResponse: found.population - found.withResponse,
      buckets:
        found.withResponse === 0
          ? { status: "no_data" }
          : {
              status: "value",
              withResponse: found.withResponse,
              ranges: FIRST_RESPONSE_BUCKETS.map((bucket, index) => ({
                fromMinutes: bucket.fromMinutes,
                toMinutes: bucket.toMinutes,
                count: found.counts[index]!,
              })),
            },
    };
  });
}
