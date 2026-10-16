import {
  formatGoodsReceiptNumber,
  formatGoodsReceiptVoidNumber,
  type GoodsReceiptAuditEntry,
} from "@/modules/purchasing";
import { formatMoney } from "@/shared/money";
import { VOID_REASON_LABEL } from "../messages";

// La historia de una recepción en texto (brief-22.4, D-6): «Alta», con su número, la orden, sus
// líneas y su total. Sin ids internos ni datos del proveedor. Desde la 22.5, la anulación, con su
// número y su motivo: «Anulación ARC-000001: Error de carga» (brief-22.5, D-7).

const AUDIT_ACTION_LABEL: Record<string, string> = {
  create: "Alta",
  void: "Anulación",
};

export function auditActionLabel(entry: GoodsReceiptAuditEntry): string {
  return AUDIT_ACTION_LABEL[entry.action] ?? entry.action;
}

export function describeAuditDiff(entry: GoodsReceiptAuditEntry): string {
  const { after } = entry.diff;
  if (entry.action === "void" && after) {
    const reason =
      typeof after.reason === "string" &&
      Object.hasOwn(VOID_REASON_LABEL, after.reason)
        ? VOID_REASON_LABEL[after.reason as keyof typeof VOID_REASON_LABEL]
        : null;
    const number =
      typeof after.void_number === "number"
        ? `Anulación ${formatGoodsReceiptVoidNumber(after.void_number)}`
        : "Anulación";
    return reason ? `${number}: ${reason}` : number;
  }
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
