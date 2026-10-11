import { formatOrderNumber, type OrderAuditEntry } from "@/modules/orders";
import { formatMoney } from "@/shared/money";
import { STATUS_LABEL } from "../messages";

// La historia de un pedido en texto (brief-19.2, D-12): el alta con su número, sus líneas y su
// total, y cada cambio de estado. Sin ids internos.

export const AUDIT_ACTION_LABEL: Record<string, string> = {
  create: "Alta",
  status_change: "Cambio de estado",
};

export function auditActionLabel(entry: OrderAuditEntry): string {
  return AUDIT_ACTION_LABEL[entry.action] ?? entry.action;
}

function statusText(value: unknown): string {
  return typeof value === "string" && value in STATUS_LABEL
    ? STATUS_LABEL[value as keyof typeof STATUS_LABEL]
    : String(value);
}

export function describeAuditDiff(entry: OrderAuditEntry): string {
  const { before, after } = entry.diff;
  if (entry.action === "create" && after) {
    const lines = Number(after.lines);
    const parts = [
      typeof after.number === "number"
        ? `Pedido ${formatOrderNumber(after.number)}`
        : "Pedido",
      `${lines} ${lines === 1 ? "línea" : "líneas"}`,
    ];
    if (typeof after.total === "string" && typeof after.currency === "string") {
      parts.push(`total ${formatMoney(after.total, after.currency)}`);
    }
    return parts.join(" · ");
  }
  if (entry.action === "status_change" && before && after) {
    return `${statusText(before.status)} → ${statusText(after.status)}`;
  }
  return "—";
}
