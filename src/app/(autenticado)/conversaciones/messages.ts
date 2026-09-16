import type {
  ConversationChannel,
  ConversationListField,
  ConversationStatus,
  MessageDirection,
} from "@/modules/conversations";
import type { ErrorCode } from "@/shared/errors";

// Textos de las pantallas 8 y 9 (wireframes 08 y 09) y de la sección de conversaciones de la 7,
// derivados de la taxonomía de errores (brief-6.4).

export const FORBIDDEN_PAGE_MESSAGE = "No tenés permiso para ver esta página.";
export const FORBIDDEN_ACTION_MESSAGE = "No tenés permiso para esta acción.";
export const CONVERSATION_NOT_FOUND_MESSAGE = "Esta conversación no existe.";
export const NO_CONVERSATIONS_MESSAGE = "No hay conversaciones.";
export const NO_CONVERSATION_RESULTS_MESSAGE =
  "Ninguna conversación coincide con estos filtros.";
export const NO_MESSAGES_MESSAGE = "Esta conversación no tiene mensajes.";
export const EMPTY_BODY_TEXT = "(mensaje sin texto)";
export const NO_CLIENT_TEXT = "Sin cliente";
export const PERIOD_INVALID_MESSAGE =
  "Revisá el período: las fechas deben existir y «Desde» no puede ser posterior a «Hasta».";
export const NO_CLIENT_MATCH_MESSAGE =
  "Ningún cliente coincide con esa búsqueda.";
export const CHOOSE_CLIENT_MESSAGE =
  "Varios clientes coinciden. Elegí uno para filtrar:";
export const MORE_CLIENTS_MESSAGE =
  "Se muestran los primeros 25. Escribí más del nombre para acotar.";
export const CLIENT_FILTER_NOT_FOUND_MESSAGE =
  "El cliente del filtro no existe.";

// Pantalla 7.
export const NO_CLIENT_CONVERSATIONS_MESSAGE =
  "Sin conversaciones registradas.";
export const NO_CLIENT_CONVERSATION_RESULTS_MESSAGE =
  "Ninguna conversación con este estado.";
export const NO_INTERACTIONS_TEXT = "Sin interacciones";

export const STATUS_LABEL: Record<ConversationStatus, string> = {
  open: "Abierta",
  pending: "Pendiente",
  closed: "Cerrada",
};

export const CHANNEL_LABEL: Record<ConversationChannel, string> = {
  whatsapp: "WhatsApp",
};

// La dirección se nombra con texto, no solo con la alineación (Screens §9).
export const DIRECTION_LABEL: Record<MessageDirection, string> = {
  inbound: "Cliente",
  outbound: "Negocio",
};

export function periodHasError(fields: ConversationListField[]): boolean {
  return fields.includes("from") || fields.includes("to");
}

export function unexpectedErrorMessage(requestId: string): string {
  return `No pudimos completar la acción. Código: ${requestId}`;
}

export function loadMessagesErrorMessage(requestId: string): string {
  return `No pudimos cargar los mensajes anteriores. Código: ${requestId}`;
}

export function statusChangedMessage(status: ConversationStatus): string {
  return `Estado cambiado a ${STATUS_LABEL[status]}.`;
}

export function statusUnchangedMessage(status: ConversationStatus): string {
  return `La conversación ya estaba ${STATUS_LABEL[status]}.`;
}

export function statusChangeErrorMessage(
  code: Exclude<ErrorCode, "UNAUTHENTICATED">,
  requestId: string,
): string {
  switch (code) {
    case "FORBIDDEN":
      return FORBIDDEN_ACTION_MESSAGE;
    case "NOT_FOUND":
      return CONVERSATION_NOT_FOUND_MESSAGE;
    case "VALIDATION_ERROR":
      return "Elegí un estado válido.";
    default:
      return unexpectedErrorMessage(requestId);
  }
}

// Estado de la acción de cambio de estado; el mensaje se anuncia con aria-live.
export type StatusChangeState =
  | { status: "idle" }
  | { status: "done"; message: string }
  | { status: "error"; requestId: string; message: string };

// Un mensaje del timeline ya formateado en el servidor, con la zona de la organización: el
// componente de cliente no formatea fechas ni importa módulos.
export type TimelineItem = {
  id: string;
  direction: MessageDirection;
  directionLabel: string;
  day: string;
  time: string;
  body: string | null;
};

// Un separador de día va antes del primer mensaje de cada día, también al unir páginas.
export function startsDay(items: TimelineItem[], index: number): boolean {
  return index === 0 || items[index - 1]?.day !== items[index]?.day;
}

export type OlderMessagesResult =
  | { ok: true; items: TimelineItem[]; before: string | null }
  | { ok: false; message: string };
