// Textos del dashboard (brief-7.4). Los tres estados son distintos entre sí y ninguno se muestra
// como 0 (MetricsCatalog, convenciones; brief-7.3, D-1).

export const NO_DATA_MESSAGE = "Sin datos";
export const UNAVAILABLE_MESSAGE = "No disponible";

export const NO_DATA_HINT = "El período no tiene con qué calcular este valor.";
export const UNAVAILABLE_HINT =
  "La ingestión no está configurada en este entorno y el período no registró eventos.";

// Texto y explicación de cada estado sin valor, como función pura: así queda versionado que la
// pantalla distingue "sin datos" de "no disponible" y que ninguno de los dos es 0.
export function metricStateText(status: "no_data" | "unavailable"): {
  message: string;
  hint: string;
} {
  return status === "unavailable"
    ? { message: UNAVAILABLE_MESSAGE, hint: UNAVAILABLE_HINT }
    : { message: NO_DATA_MESSAGE, hint: NO_DATA_HINT };
}

export const METRIC_ERROR_MESSAGE = "No se pudo calcular.";
export const METRIC_ERROR_RETRY = "Reintentar";

export const PERIOD_INVALID_MESSAGE =
  "El período no es válido: revisá las fechas. Tiene que empezar antes de terminar, no incluir días futuros y abarcar como máximo 366 días.";

export const FORBIDDEN_PAGE_MESSAGE =
  "Tu cuenta tiene la contraseña pendiente de cambio, así que todavía no puede ver las métricas.";

export const DAILY_NOT_ADDITIVE_NOTE =
  '"Con actividad" diario no se suma: una conversación activa varios días cuenta una vez por día.';

export const CHART_SERIES_LABEL = {
  conversaciones: "Conversaciones",
  mensajes: "Mensajes",
} as const;

export const TODAY_EXCLUDED_NOTE = "hoy no incluido";

// El desplegable de cada tarjeta (brief-15.3, D-3): la definición y el período anterior.
export const METRIC_DETAILS_LABEL = "Ver detalles";
export const PREVIOUS_ERROR = "No se pudo calcular el período anterior.";
export const STATUS_NOT_COMPARED =
  "No se compara con el período anterior: es el estado actual de cada conversación, y el del período anterior no se guarda.";
