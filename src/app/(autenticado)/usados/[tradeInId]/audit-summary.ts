import type { NamedAuditLogEntry } from "@/modules/audit";
import {
  formatTradeInNumber,
  formatTradeInVoidNumber,
} from "@/modules/tradeins";
import { formatMoney } from "@/shared/money";
import { DESTINATION_SHORT_LABEL, VOID_REASON_LABEL } from "../messages";

// La historia de una recepción en texto (brief-29.7, D-4 y D-5): el alta y la anulación. Sin ids
// internos ni datos del cliente: la auditoría no los guarda. Solo la ve un admin, así que lleva el
// valor.

export function auditActionLabel(entry: NamedAuditLogEntry): string {
  if (entry.action === "create") return "Recepción";
  if (entry.action === "void") return "Anulación";
  return entry.action;
}

export function describeAuditDiff(entry: NamedAuditLogEntry): string {
  const { after } = entry.diff;
  if (!after) return "—";
  if (entry.action === "create") {
    const parts: string[] = [];
    if (typeof after.number === "number") {
      parts.push(formatTradeInNumber(after.number));
    }
    if (typeof after.serial === "string") parts.push(`IMEI ${after.serial}`);
    if (typeof after.value === "string" && typeof after.currency === "string") {
      parts.push(formatMoney(after.value, after.currency));
    }
    if (
      typeof after.destination === "string" &&
      Object.hasOwn(DESTINATION_SHORT_LABEL, after.destination)
    ) {
      parts.push(
        DESTINATION_SHORT_LABEL[
          after.destination as keyof typeof DESTINATION_SHORT_LABEL
        ],
      );
    }
    return parts.join(" · ") || "—";
  }
  if (entry.action === "void") {
    const parts: string[] = [];
    if (typeof after.void_number === "number") {
      parts.push(formatTradeInVoidNumber(after.void_number));
    }
    if (
      typeof after.reason === "string" &&
      Object.hasOwn(VOID_REASON_LABEL, after.reason)
    ) {
      parts.push(
        VOID_REASON_LABEL[after.reason as keyof typeof VOID_REASON_LABEL],
      );
    }
    return parts.join(" · ") || "—";
  }
  return "—";
}
