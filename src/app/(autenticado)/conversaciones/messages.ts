import type {
  AgentPauseAction,
  ConversationChannel,
  ConversationListField,
  ConversationNote,
  ConversationStatus,
  MessageDirection,
  MessageKind,
  MessageSender,
} from "@/modules/conversations";
import { formatShortDateTime } from "@/app/_format/date-time";
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
export const AGENT_ACTIVE_TEXT = "Activo";
export const CLOSED_NOT_PAUSABLE_TEXT =
  "Una conversación cerrada no se pausa: el agente no recibe mensajes en ella.";
export const AGENT_PAUSE_HINT =
  "Mientras está pausado, el agente no contesta en esta conversación. Una conversación nueva del cliente empieza con el agente activo.";

export function agentPausedSinceText(since: string): string {
  return `Pausado desde el ${since}`;
}

export function agentPauseChangedMessage(action: AgentPauseAction): string {
  return action === "pause" ? "Agente pausado." : "Agente reanudado.";
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
export const NO_NOTES_MESSAGE = "Sin notas.";
export const ERASED_NOTE_TEXT = "(nota vaciada con los datos del cliente)";
export const FORMER_MEMBER_TEXT = "Usuario que ya no es miembro";
export const NOTES_HINT =
  "Solo las ve el equipo: no le llegan al cliente ni al agente. Una nota no se edita ni se borra.";
export const NOTE_BODY_ERROR_MESSAGE =
  "Escribí la nota, de hasta 1000 caracteres.";
export const NOTE_ADDED_MESSAGE = "Nota agregada.";

export function loadNotesErrorMessage(requestId: string): string {
  return `No pudimos cargar las notas anteriores. Código: ${requestId}`;
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

// Una nota ya formateada en el servidor, con la zona de la organización, como TimelineItem.
export type NoteItem = {
  id: string;
  author: string;
  when: string;
  body: string | null;
};

// Las notas del servicio a lo que muestra la tarjeta. El texto viaja tal cual: lo escapa React.
export function toNoteItems(
  notes: ConversationNote[],
  timeZone: string,
): NoteItem[] {
  return notes.map((note) => ({
    id: note.id,
    author: note.author.name || FORMER_MEMBER_TEXT,
    when: formatShortDateTime(note.createdAt, timeZone),
    body: note.body,
  }));
}

export type OlderNotesResult =
  | { ok: true; items: NoteItem[]; before: string | null }
  | { ok: false; message: string };

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
  // null: sin rótulo (brief-12.3, D-5).
  kindLabel: string | null;
  senderLabel: string | null;
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
