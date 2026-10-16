import {
  formatPurchaseOrderNumber,
  type PurchaseOrderAuditEntry,
} from "@/modules/purchasing";
import { formatMoney } from "@/shared/money";
import { STATUS_LABEL } from "../messages";

// La historia de una orden de compra en texto (brief-22.3, D-9): «Alta», con su número, sus líneas
// y su total, y «Cancelación», con el cambio de estado. Sin ids internos ni datos del proveedor.

const ACTION_LABEL: Record<string, string> = {
  create: "Alta",
  status_change: "Cancelación",
};

// En la 22.3 el único cambio de estado es la cancelación; el cierre llega con la 22.4 (D-3).
export function auditActionLabel(entry: PurchaseOrderAuditEntry): string {
  return ACTION_LABEL[entry.action] ?? entry.action;
}

function statusText(value: unknown): string {
  return typeof value === "string" && Object.hasOwn(STATUS_LABEL, value)
    ? STATUS_LABEL[value as keyof typeof STATUS_LABEL]
    : String(value);
}

export function describeAuditDiff(entry: PurchaseOrderAuditEntry): string {
  const { before, after } = entry.diff;
  if (entry.action === "create" && after) {
    const lines = Number(after.lines);
    const parts = [
      typeof after.number === "number"
        ? `Orden ${formatPurchaseOrderNumber(after.number)}`
        : "Orden",
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
