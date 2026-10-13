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

  it("la anulación dice su número y el motivo de la lista (brief-20.4, D-9)", () => {
    const voided = entry("void", {
      before: { void_number: null, reason: null },
      after: { void_number: 45, reason: "wrong_client" },
    });
    expect(auditActionLabel(voided)).toBe("Anulación");
    expect(describeAuditDiff(voided)).toBe(
      "Anulación A-000045: Cliente equivocado",
    );
  });

  it("un motivo fuera de la lista no se muestra", () => {
    const voided = entry("void", {
      before: { void_number: null, reason: null },
      after: { void_number: 3, reason: "inventado" },
    });
    expect(describeAuditDiff(voided)).toBe("Anulación A-000003");
  });

  it("una acción desconocida no inventa texto", () => {
    const other = entry("update", { before: null, after: null });
    expect(auditActionLabel(other)).toBe("update");
    expect(describeAuditDiff(other)).toBe("—");
  });
});
