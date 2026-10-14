import {
  formatCashSessionNumber,
  type CashSessionAuditEntry,
} from "@/modules/cash";
import { formatMoney } from "@/shared/money";

// La historia de una sesión de caja en texto (brief-21.2, D-9): la apertura con su inicial por
// moneda y el cierre con lo contado y lo esperado. Sin ids internos.

export const AUDIT_ACTION_LABEL: Record<string, string> = {
  create: "Apertura",
  close: "Cierre",
};

export function auditActionLabel(entry: CashSessionAuditEntry): string {
  return AUDIT_ACTION_LABEL[entry.action] ?? entry.action;
}

// Las monedas de un diff, por sus claves «<prefijo>_<MONEDA>».
function amountsOf(
  fields: Record<string, unknown>,
  prefix: string,
): [string, string][] {
  return Object.entries(fields)
    .filter(
      (entry): entry is [string, string] =>
        entry[0].startsWith(`${prefix}_`) && typeof entry[1] === "string",
    )
    .map(
      ([key, value]) =>
        [key.slice(prefix.length + 1), value] as [string, string],
    )
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}

export function describeAuditDiff(entry: CashSessionAuditEntry): string {
  const { after } = entry.diff;
  if (!after) return "—";
  if (entry.action === "create") {
    const opening = amountsOf(after, "opening").map(([currency, amount]) =>
      formatMoney(amount, currency),
    );
    const number =
      typeof after.number === "number"
        ? `Sesión ${formatCashSessionNumber(after.number)}`
        : "Sesión";
    return opening.length > 0
      ? `${number} · inicial ${opening.join(", ")}`
      : number;
  }
  if (entry.action === "close") {
    const expected = new Map(amountsOf(after, "expected"));
    return amountsOf(after, "counted")
      .map(
        ([currency, counted]) =>
          `${currency}: contado ${formatMoney(counted, currency)}, esperado ${formatMoney(
            expected.get(currency) ?? "0.00",
            currency,
          )}`,
      )
      .join(" · ");
  }
  return "—";
}
