import {
  formatServiceOrderNumber,
  type ServiceOrderAuditEntry,
} from "@/modules/service";
import { formatMoney } from "@/shared/money";
import { CANCEL_REASON_LABEL, STATUS_LABEL } from "../messages";

// La historia de una orden de servicio en texto (brief-29.6, D-4): «Alta» y cada cambio de estado,
// rotulado por el estado nuevo. Sin ids internos, sin el IMEI ni lo que reportó el cliente: la
// auditoría no los guarda (D-11). Solo la ve un admin, así que el presupuesto lleva el costo.

const ACTION_LABEL: Record<string, string> = {
  sent: "Mandada al técnico",
  quoted: "Presupuesto",
  approved: "Aprobación",
  rejected: "Rechazo",
  repaired: "Reparada",
  delivered: "Entrega",
  cancelled: "Cancelación",
};

export function auditActionLabel(entry: ServiceOrderAuditEntry): string {
  if (entry.action === "create") return "Alta";
  if (entry.action !== "status_change") return entry.action;
  const status = entry.diff.after?.status;
  return typeof status === "string" && Object.hasOwn(ACTION_LABEL, status)
    ? ACTION_LABEL[status]!
    : "Cambio de estado";
}

function statusText(value: unknown): string {
  return typeof value === "string" && Object.hasOwn(STATUS_LABEL, value)
    ? STATUS_LABEL[value as keyof typeof STATUS_LABEL]
    : String(value);
}

export function describeAuditDiff(entry: ServiceOrderAuditEntry): string {
  const { before, after } = entry.diff;
  if (entry.action === "create" && after) {
    return typeof after.number === "number"
      ? `Orden ${formatServiceOrderNumber(after.number)}`
      : "Orden";
  }
  if (entry.action !== "status_change" || !before || !after) return "—";
  const parts = [`${statusText(before.status)} → ${statusText(after.status)}`];
  if (
    after.status === "quoted" &&
    typeof after.customer_total === "string" &&
    typeof after.customer_currency === "string" &&
    typeof after.technician_total === "string" &&
    typeof after.technician_currency === "string"
  ) {
    parts.push(
      `cliente ${formatMoney(after.customer_total, after.customer_currency)}`,
      `técnico ${formatMoney(after.technician_total, after.technician_currency)}`,
    );
  }
  if (
    after.status === "cancelled" &&
    typeof after.cancel_reason === "string" &&
    Object.hasOwn(CANCEL_REASON_LABEL, after.cancel_reason)
  ) {
    parts.push(
      CANCEL_REASON_LABEL[
        after.cancel_reason as keyof typeof CANCEL_REASON_LABEL
      ],
    );
  }
  return parts.join(" · ");
}
