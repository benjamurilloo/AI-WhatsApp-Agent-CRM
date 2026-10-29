import type {
  AgentPauseAction,
  ConversationChannel,
  ConversationListField,
  ConversationStatus,
  MessageDirection,
  MessageKind,
  MessageSender,
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
// La búsqueda de cliente de la bandeja (brief-24.3, D-4): el teléfono se escribe entero y nunca
// se muestra.
export const CLIENT_SEARCH_HINT = "Nombre o teléfono";
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

// Tipo original y autor de una salida (brief-12.3, D-5). Un texto no lleva rótulo, y null (sin
// dato: mensajes de v1 y de los seeds) tampoco: el rótulo solo dice lo que se registró.
export const KIND_LABEL: Record<Exclude<MessageKind, "text">, string> = {
  audio: "Audio (transcripción)",
  image: "Imagen",
  video: "Video",
  document: "Documento",
  other: "Otro",
};

export const SENDER_LABEL: Record<MessageSender, string> = {
  agent: "Agente",
  person: "Persona",
};

export function kindLabel(kind: MessageKind | null): string | null {
  return kind === null || kind === "text" ? null : KIND_LABEL[kind];
}

export function senderLabel(sentBy: MessageSender | null): string | null {
  return sentBy === null ? null : SENDER_LABEL[sentBy];
}

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

// Pausa del agente (brief-16.3, D-4 y D-5). La marca es texto: el color acompaña.
export const AGENT_PAUSED_LABEL = "Agente pausado";
export const CLOSED_NOT_PAUSABLE_TEXT =
  "Una conversación cerrada no se pausa: el agente no recibe mensajes en ella.";
export const AGENT_PAUSE_HINT =
  "Mientras está pausado, el agente no contesta en esta conversación. Una conversación nueva del cliente empieza con el agente activo.";

export function agentPausedSinceText(since: string): string {
  return `Pausado desde el ${since}`;
}

// La franja del agente y las insignias de la bandeja (brief-24.3, D-3 y D-7). «Atención humana»
// es la pausa, no el estado pendiente: las dos marcas son independientes.
export const HUMAN_ATTENTION_LABEL = "Atención humana";
export const AGENT_ACTIVE_LABEL = "Agente activo";
export const AGENT_ACTIVE_STRIP_TEXT =
  "Las respuestas automáticas están habilitadas.";
// Desde la 24.3.1, la forma de los mockups 02 y 05 (brief-24.3.1).
export const AGENT_PAUSED_STRIP_TEXT =
  "Las respuestas automáticas están pausadas mientras atendés.";
export const TAKE_CONFIRM_TITLE = "Tomar atención humana";
export const TAKE_CONFIRM_TEXT = "Pausa al agente para que puedas responder.";
export const CANCEL_LABEL = "Cancelar";
export const TAKE_CONVERSATION_LABEL = "Tomar conversación";
export const REACTIVATE_AGENT_LABEL = "Reactivar agente";

export function agentPauseChangedMessage(action: AgentPauseAction): string {
  return action === "pause"
    ? "Tomaste la conversación: el agente está pausado."
    : "Agente reactivado.";
}

export function agentPauseUnchangedMessage(action: AgentPauseAction): string {
  return action === "pause"
    ? "El agente ya estaba pausado."
    : "El agente ya estaba activo.";
}

export function agentPauseErrorMessage(
  code: Exclude<ErrorCode, "UNAUTHENTICATED">,
  requestId: string,
): string {
  switch (code) {
    case "FORBIDDEN":
      return FORBIDDEN_ACTION_MESSAGE;
    case "NOT_FOUND":
      return CONVERSATION_NOT_FOUND_MESSAGE;
    case "BUSINESS_RULE_VIOLATION":
      return CLOSED_NOT_PAUSABLE_TEXT;
    default:
      return unexpectedErrorMessage(requestId);
  }
}

// Notas de la conversación (brief-16.4, D-6). Internas: no las ve el cliente ni el agente.
export const ERASED_NOTE_TEXT = "(nota vaciada con los datos del cliente)";
export const FORMER_MEMBER_TEXT = "Usuario que ya no es miembro";
export const NOTE_BODY_ERROR_MESSAGE =
  "Escribí la nota, de hasta 1000 caracteres.";
export const NOTE_ADDED_MESSAGE = "Nota guardada.";
// La nota en el hilo y al pie (brief-24.3, D-5 y D-8).
export const NOTE_LABEL = "Nota interna";
export const NOTE_ONLY_TEAM_TEXT = "Solo equipo";
export const NOTE_FIELD_LABEL = "Nota para el equipo";
export const NOTE_FIELD_HINT =
  "Guardar una nota no pausa al agente. Una nota no se edita ni se borra.";
export const NOTE_ONLY_TEAM_NOTICE = "Solo el equipo puede ver esta nota.";
export const NOTE_NOT_SENT_NOTICE = "No se envía por WhatsApp.";

// Las acciones de estado del encabezado (brief-24.3, D-7), con «Cerrada» (D-2).
export const STATUS_ACTION_LABEL: Record<ConversationStatus, string> = {
  open: "Marcar como abierta",
  pending: "Marcar como pendiente",
  closed: "Cerrar conversación",
};
export const REOPEN_LABEL = "Reabrir";

// El contexto del cliente (brief-24.3, D-6).
export const CONTEXT_TITLE = "Contexto del cliente";
export const SHOW_CONTEXT_LABEL = "Ver contexto";
export const NO_CLIENT_CONTEXT_TEXT =
  "Esta conversación no tiene un cliente asociado.";
export const NO_CONTEXT_DATA_TEXT =
  "Sin reparaciones abiertas, turnos próximos ni etiquetas.";
export const NO_APPOINTMENT_TEXT = "Sin turno asignado";
export const NO_TAGS_TEXT = "Sin etiquetas";
export const AGENT_ACTIVITY_TITLE = "Actividad del agente";
export const AGENT_REPLY_TEXT = "Respuesta automática";

// La bandeja como chat y su panel (brief-24.3.1, D-1 a D-3).
export const SEARCH_PLACEHOLDER = "Buscar nombre o teléfono";
export const ALL_CHIP_LABEL = "Todas";
export const MORE_FILTERS_LABEL = "Más filtros";
// En el teléfono, como el mockup 03.
export const FILTERS_SHORT_LABEL = "Filtros";
export const PREVIEW_TITLE = "Vista previa";
export const PREVIEW_EMPTY_TEXT = "Elegí una conversación para verla acá.";
// La agrupación de la bandeja (brief-24.3.1, R-3): las pestañas cuentan la más reciente de cada cliente.
export const ONE_ROW_PER_CLIENT_TEXT =
  "Cada cliente aparece una vez, con su conversación más reciente.";
export const PREVIEW_HINT = "Abrí la conversación para agregar una nota.";
// Un viewer no agrega notas.
export const PREVIEW_VIEWER_HINT = "Abrí la conversación para leerla entera.";
export const OPEN_CONVERSATION_LABEL = "Abrir conversación";
export const BACK_TO_LIST_LABEL = "Conversaciones";
export const BACK_TO_CHATS_LABEL = "Chats";

// El separador entre dos conversaciones del hilo unido (D-1).
export function conversationSeparatorText(
  startedAt: string,
  status: ConversationStatus,
): string {
  return `Conversación del ${startedAt} · ${STATUS_LABEL[status]}`;
}

export function noteErrorMessage(
  code: Exclude<ErrorCode, "UNAUTHENTICATED">,
  requestId: string,
  fields: readonly string[] = [],
): string {
  switch (code) {
    case "FORBIDDEN":
      return FORBIDDEN_ACTION_MESSAGE;
    case "NOT_FOUND":
      return CONVERSATION_NOT_FOUND_MESSAGE;
    case "VALIDATION_ERROR":
      // Sin fields, el id de la conversación era inválido: no hay texto que corregir.
      return fields.includes("body")
        ? NOTE_BODY_ERROR_MESSAGE
        : CONVERSATION_NOT_FOUND_MESSAGE;
    default:
      return unexpectedErrorMessage(requestId);
  }
}

// Estado del formulario de notas. Tras un rechazo se conserva lo escrito (body); el campo se
// marca inválido solo si el rechazo fue por el texto (invalidBody).
export type NoteFormState =
  | { status: "idle" }
  | { status: "done"; message: string }
  | {
      status: "error";
      requestId: string;
      message: string;
      body: string;
      invalidBody: boolean;
    };

// Estado de la acción de cambio de estado; el mensaje se anuncia con aria-live.
export type StatusChangeState =
  | { status: "idle" }
  | { status: "done"; message: string }
  | { status: "error"; requestId: string; message: string };

// Un mensaje del timeline ya formateado en el servidor, con la zona de la organización: el
// componente de cliente no formatea fechas ni importa módulos. Desde la 24.3, el hilo intercala
// las notas (brief-24.3, D-5).
export type MessageTimelineItem = {
  type: "message";
  id: string;
  // Para los separadores del hilo unido (brief-24.3.1, D-1).
  conversationId: string;
  // El avatar de la burbuja: el cliente, el agente, una persona o el negocio sin dato.
  avatar: "client" | "agent" | "person" | "business";
  direction: MessageDirection;
  directionLabel: string;
  // null: sin rótulo (brief-12.3, D-5).
  kindLabel: string | null;
  senderLabel: string | null;
  // day compara días; dayLabel se muestra en la píldora («Hoy · 27 oct»).
  day: string;
  dayLabel: string;
  time: string;
  body: string | null;
};

export type NoteTimelineItem = {
  type: "note";
  id: string;
  conversationId: string;
  author: string;
  day: string;
  dayLabel: string;
  time: string;
  // null: vaciada con los datos del cliente (brief-16.4, D-5).
  body: string | null;
};

export type TimelineItem = MessageTimelineItem | NoteTimelineItem;

// Un separador de día va antes del primer mensaje de cada día, también al unir páginas.
export function startsDay(items: TimelineItem[], index: number): boolean {
  return index === 0 || items[index - 1]?.day !== items[index]?.day;
}

// Un separador de conversación va antes de la primera entrada de cada una, salvo la primera del
// hilo (brief-24.3.1, D-1).
export function startsConversation(
  items: TimelineItem[],
  index: number,
): boolean {
  return (
    index > 0 &&
    items[index - 1]?.conversationId !== items[index]?.conversationId
  );
}

export type OlderMessagesResult =
  | { ok: true; items: TimelineItem[]; before: string | null }
  | { ok: false; message: string };
