import {
  formatSaleNumber,
  formatSaleVoidNumber,
  type SaleAuditEntry,
} from "@/modules/sales";
import { formatMoney } from "@/shared/money";
import { VOID_REASON_LABEL } from "../messages";

// La historia de una venta en texto (brief-20.2, D-9): la emisión con su número, sus líneas y su
// total. Sin ids internos. Desde la 20.4, la anulación, con su número y su motivo (brief-20.4, D-9).

export const AUDIT_ACTION_LABEL: Record<string, string> = {
  create: "Emisión",
  void: "Anulación",
};

export function auditActionLabel(entry: SaleAuditEntry): string {
  return AUDIT_ACTION_LABEL[entry.action] ?? entry.action;
}

export function describeAuditDiff(entry: SaleAuditEntry): string {
  const { after } = entry.diff;
  if (entry.action === "create" && after) {
    const lines = Number(after.lines);
    const parts = [
      typeof after.number === "number"
        ? `Venta ${formatSaleNumber(after.number)}`
        : "Venta",
      `${lines} ${lines === 1 ? "línea" : "líneas"}`,
    ];
    if (typeof after.total === "string" && typeof after.currency === "string") {
      parts.push(`total ${formatMoney(after.total, after.currency)}`);
    }
    return parts.join(" · ");
  }
  if (entry.action === "void" && after) {
    const reason =
      typeof after.reason === "string" &&
      Object.hasOwn(VOID_REASON_LABEL, after.reason)
        ? VOID_REASON_LABEL[after.reason as keyof typeof VOID_REASON_LABEL]
        : null;
    const number =
      typeof after.void_number === "number"
        ? `Anulación ${formatSaleVoidNumber(after.void_number)}`
        : "Anulación";
    return reason ? `${number}: ${reason}` : number;
  }
  return "—";
}
