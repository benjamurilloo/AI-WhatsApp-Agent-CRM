import {
  formatGoodsReceiptNumber,
  type GoodsReceiptAuditEntry,
} from "@/modules/purchasing";
import { formatMoney } from "@/shared/money";

// La historia de una recepción en texto (brief-22.4, D-6): «Alta», con su número, la orden, sus
// líneas y su total. Sin ids internos ni datos del proveedor. La anulación llega con la 22.5.

export function auditActionLabel(entry: GoodsReceiptAuditEntry): string {
  return entry.action === "create" ? "Alta" : entry.action;
}

export function describeAuditDiff(entry: GoodsReceiptAuditEntry): string {
  const { after } = entry.diff;
  if (entry.action !== "create" || !after) return "—";
  const lines = Number(after.lines);
  const parts = [
    typeof after.number === "number"
      ? `Recepción ${formatGoodsReceiptNumber(after.number)}`
      : "Recepción",
  ];
  parts.push(
    typeof after.purchase_order_number === "string"
      ? `de la orden ${after.purchase_order_number}`
      : "sin orden",
  );
  parts.push(`${lines} ${lines === 1 ? "línea" : "líneas"}`);
  if (typeof after.total === "string" && typeof after.currency === "string") {
    parts.push(`total ${formatMoney(after.total, after.currency)}`);
  }
  return parts.join(" · ");
}
