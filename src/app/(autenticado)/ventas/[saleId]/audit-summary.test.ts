import { describe, expect, it } from "vitest";
import type { SaleAuditEntry } from "@/modules/sales";
import { auditActionLabel, describeAuditDiff } from "./audit-summary";

function entry(
  action: SaleAuditEntry["action"],
  diff: SaleAuditEntry["diff"],
): SaleAuditEntry {
  return {
    id: "a",
    entityType: "sale",
    action,
    diff,
    actor: { kind: "user", id: "u", name: "Ana" },
    createdAt: new Date(0),
  };
}

describe("historia de una venta", () => {
  it("la emisión dice el número, las líneas y el total", () => {
    const issued = entry("create", {
      before: null,
      after: {
        number: 7,
        order_id: "o",
        client_id: "c",
        currency: "ARS",
        total: "450000.00",
        lines: 1,
      },
    });
    expect(auditActionLabel(issued)).toBe("Emisión");
    expect(describeAuditDiff(issued)).toMatch(
      /^Venta V-000007 · 1 línea · total \$\s450\.000,00$/,
    );
  });

  it("sin número ni total, dice lo que hay", () => {
    const issued = entry("create", {
      before: null,
      after: { lines: 3 },
    });
    expect(describeAuditDiff(issued)).toBe("Venta · 3 líneas");
  });

  it("una acción desconocida no inventa texto", () => {
    const other = entry("update", { before: null, after: null });
    expect(auditActionLabel(other)).toBe("update");
    expect(describeAuditDiff(other)).toBe("—");
  });
});
