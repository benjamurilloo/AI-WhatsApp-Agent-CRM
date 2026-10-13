import { formatSaleNumber, type SaleAuditEntry } from "@/modules/sales";
import { formatMoney } from "@/shared/money";

// La historia de una venta en texto (brief-20.2, D-9): la emisión con su número, sus líneas y su
// total. Sin ids internos. La anulación llega con la 20.4.

export const AUDIT_ACTION_LABEL: Record<string, string> = {
  create: "Emisión",
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
  return "—";
}
