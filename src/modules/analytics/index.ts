// Interfaz pública del módulo analytics (brief-7.1).
export {
  DEFAULT_PERIOD_DAYS,
  getActiveConversations,
  getConversationsStarted,
  getDailyActivity,
  getMessageCounts,
  getMessagesPerConversation,
  getUniqueClients,
  MAX_PERIOD_DAYS,
  resolveMetricsPeriod,
  type DailyActivity,
  type MessagesPerConversation,
  type MetricResult,
  type MetricsPeriod,
  type MetricsPeriodField,
  type MetricsPeriodInput,
  type RatioMetric,
} from "./service";
