import type { StatementDocument } from "@/modules/cash";
import type { ClientConversationEvents } from "@/modules/conversations";
import type { IconName } from "@/app/_components/icons";
import { formatMoney } from "@/shared/money";
import { CHANNEL_LABEL } from "@/app/(autenticado)/conversaciones/messages";
import { documentHref } from "./cuenta/messages";
import type { OperationSources } from "./operations-rows";
import type { SearchParams } from "../filters";

// La cronología de Actividad (brief-24.4.3, D-5), pura: un evento por hecho que la fuente registra,
// de más nuevo a más viejo. Nunca el texto de un mensaje o una nota (H-3), ni el medio de un cobro,
// que el documento no trae. Una reparación y un turno guardan la última vez de cada estado (H-5), no
// su historial: no es un historial exhaustivo, como pide el README de la v2.

export type ActivityEvent = {
  key: string;
  at: Date;
  icon: IconName;
  title: string;
  // Lo que sigue al título: el número, el autor o el canal.
  source: string;
  detail: string | null;
  href: string;
};

export type ActivitySources = {
  operations: OperationSources;
  conversations: ClientConversationEvents | null;
  // null: el estado de cuenta no se pudo leer.
  documents: StatementDocument[] | null;
};

const DOCUMENT_TITLE: Partial<Record<StatementDocument["kind"], string>> = {
  receipt: "Cobro registrado",
  receipt_void: "Cobro anulado",
  refund: "Devolución registrada",
  refund_void: "Devolución anulada",
};

export function buildActivityEvents(sources: ActivitySources): ActivityEvent[] {
  const events: ActivityEvent[] = [];
  const add = (
    key: string,
    at: Date | null,
    icon: IconName,
    title: string,
    source: string,
    href: string,
    detail: string | null = null,
  ) => {
    if (at !== null)
      events.push({ key, at, icon, title, source, href, detail });
  };

  for (const item of sources.conversations?.conversations ?? []) {
    add(
      `conversacion-${item.id}`,
      item.at,
      "messageCircle",
      "Última interacción",
      CHANNEL_LABEL[item.channel],
      `/conversaciones/${item.id}`,
    );
  }
  for (const note of sources.conversations?.notes ?? []) {
    add(
      `nota-${note.id}`,
      note.at,
      "fileText",
      "Nota interna agregada",
      note.author,
      `/conversaciones/${note.conversationId}`,
    );
  }

  const { sales, orders, serviceOrders, appointments, tradeIns } =
    sources.operations;
  for (const sale of sales) {
    const href = `/ventas/${sale.id}`;
    add(
      `venta-${sale.id}`,
      sale.createdAt,
      "receipt",
      "Venta registrada",
      sale.displayNumber,
      href,
    );
    add(
      `venta-anulada-${sale.id}`,
      sale.voidedAt,
      "circleX",
      "Venta anulada",
      sale.displayNumber,
      href,
    );
  }
  for (const order of orders) {
    const href = `/pedidos/${order.id}`;
    add(
      `pedido-${order.id}`,
      order.createdAt,
      "list",
      "Pedido creado",
      order.displayNumber,
      href,
    );
    add(
      `pedido-cancelado-${order.id}`,
      order.cancelledAt,
      "circleX",
      "Pedido cancelado",
      order.displayNumber,
      href,
    );
  }
  for (const order of serviceOrders) {
    const number = order.displayNumber;
    const href = `/reparaciones/${order.id}`;
    const prefix = `reparacion-${order.id}`;
    add(prefix, order.createdAt, "wrench", "Reparación creada", number, href);
    add(
      `${prefix}-enviada`,
      order.sentAt,
      "send",
      "Reparación enviada al técnico",
      number,
      href,
    );
    add(
      `${prefix}-presupuesto`,
      order.quotedAt,
      "fileText",
      "Presupuesto cargado",
      number,
      href,
    );
    add(
      `${prefix}-aprobada`,
      order.approvedAt,
      "check",
      "Presupuesto aprobado",
      number,
      href,
    );
    add(
      `${prefix}-rechazada`,
      order.rejectedAt,
      "circleX",
      "Presupuesto rechazado",
      number,
      href,
    );
    add(
      `${prefix}-lista`,
      order.repairedAt,
      "circleCheck",
      "Reparación lista",
      number,
      href,
    );
    add(
      `${prefix}-entregada`,
      order.deliveredAt,
      "circleCheck",
      "Reparación entregada",
      number,
      href,
    );
    add(
      `${prefix}-cancelada`,
      order.cancelledAt,
      "circleX",
      "Reparación cancelada",
      number,
      href,
    );
  }
  for (const item of appointments) {
    const href = `/turnos/${item.id}`;
    const prefix = `turno-${item.id}`;
    const reason = item.reasonName;
    add(prefix, item.createdAt, "calendar", "Turno pedido", reason, href);
    add(
      `${prefix}-confirmado`,
      item.confirmedAt,
      "calendar",
      "Turno confirmado",
      reason,
      href,
    );
    add(
      `${prefix}-cancelado`,
      item.cancelledAt,
      "circleX",
      "Turno cancelado",
      reason,
      href,
    );
    add(
      `${prefix}-atendido`,
      item.attendedAt,
      "circleCheck",
      "Turno atendido",
      reason,
      href,
    );
    add(
      `${prefix}-ausente`,
      item.noShowAt,
      "circleMinus",
      "No asistió al turno",
      reason,
      href,
    );
  }
  for (const tradeIn of tradeIns) {
    const href = `/usados/${tradeIn.id}`;
    add(
      `usado-${tradeIn.id}`,
      tradeIn.createdAt,
      "smartphone",
      "Usado recibido",
      tradeIn.displayNumber,
      href,
    );
    add(
      `usado-anulado-${tradeIn.id}`,
      tradeIn.voidedAt,
      "circleX",
      "Recepción anulada",
      tradeIn.displayNumber,
      href,
    );
  }
  for (const document of sources.documents ?? []) {
    const title = DOCUMENT_TITLE[document.kind];
    if (title === undefined) continue;
    add(
      `documento-${document.kind}-${document.id}`,
      document.createdAt,
      document.kind.endsWith("_void") ? "circleX" : "banknote",
      title,
      document.displayNumber,
      documentHref(document),
      formatMoney(document.amount, document.currency),
    );
  }

  return events.sort(
    (a, b) => b.at.getTime() - a.at.getTime() || b.key.localeCompare(a.key),
  );
}

export const ACTIVITY_EVENTS_STEP = 20;
export const ACTIVITY_EVENTS_MAX = 200;

// ?eventos=40: un múltiplo de 20 hasta 200. Cualquier otro valor vuelve a los primeros 20.
export function parseEventsLimit(params: SearchParams): number {
  const raw = params.eventos;
  const value = Number(Array.isArray(raw) ? raw[0] : raw);
  return Number.isInteger(value) &&
    value >= ACTIVITY_EVENTS_STEP &&
    value <= ACTIVITY_EVENTS_MAX &&
    value % ACTIVITY_EVENTS_STEP === 0
    ? value
    : ACTIVITY_EVENTS_STEP;
}
