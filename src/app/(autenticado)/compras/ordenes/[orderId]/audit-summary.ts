import {
  formatPurchaseOrderNumber,
  type PurchaseOrderAuditEntry,
} from "@/modules/purchasing";
import { formatMoney } from "@/shared/money";
import { STATUS_LABEL } from "../messages";

// La historia de una orden de compra en texto (brief-22.3, D-9): «Alta», con su número, sus líneas
// y su total, y cada cambio de estado. Sin ids internos ni datos del proveedor.

// Desde la 22.4 (brief-22.4, D-6), el cambio de estado se rotula por el estado nuevo: «Cancelación»,
// «Cierre por la recepción RC-000123» o «Cierre a mano» (R-6 de la 22.3).
export function auditActionLabel(entry: PurchaseOrderAuditEntry): string {
  if (entry.action === "create") return "Alta";
  if (entry.action !== "status_change") return entry.action;
  const after = entry.diff.after;
  if (after?.status === "cancelled") return "Cancelación";
  if (after?.status === "closed") {
    if (
      after.closed_by === "goods_receipt" &&
      typeof after.goods_receipt_number === "string"
    ) {
      return `Cierre por la recepción ${after.goods_receipt_number}`;
    }
    if (after.closed_by === "manual") return "Cierre a mano";
    return "Cierre";
  }
  return "Cambio de estado";
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
