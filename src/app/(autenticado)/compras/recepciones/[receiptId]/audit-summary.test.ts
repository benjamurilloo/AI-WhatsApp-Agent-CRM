import { describe, expect, it } from "vitest";
import type { GoodsReceiptAuditEntry } from "@/modules/purchasing";
import { auditActionLabel, describeAuditDiff } from "./audit-summary";

// La historia de la recepción (brief-22.4, D-6).

function entry(after: Record<string, unknown>): GoodsReceiptAuditEntry {
  return {
    id: "a",
    entityType: "goods_receipt",
    action: "create",
    diff: {
      before: null,
      after: after as GoodsReceiptAuditEntry["diff"]["after"],
    },
    actor: { kind: "user", id: "u", name: "Ana" },
    createdAt: new Date(0),
  } as GoodsReceiptAuditEntry;
}

describe("la historia de una recepción", () => {
  it("el alta dice el número, la orden, las líneas y el total, sin el proveedor", () => {
    const created = entry({
      number: 12,
      supplier_id: "proveedor-x",
      purchase_order_number: "OC-000004",
      currency: "ARS",
      total: "2401.49",
      supplier_reference: "R 0001",
      lines: 2,
    });
    expect(auditActionLabel(created)).toBe("Alta");
    expect(describeAuditDiff(created)).toMatch(
      /^Recepción RC-000012 · de la orden OC-000004 · 2 líneas · total \$\s2\.401,49$/,
    );
    expect(describeAuditDiff(created)).not.toContain("proveedor-x");
  });

  it("sin orden lo dice", () => {
    expect(
      describeAuditDiff(
        entry({
          number: 1,
          purchase_order_number: null,
          currency: "USD",
          total: "10.00",
          lines: 1,
        }),
      ),
    ).toMatch(
      /^Recepción RC-000001 · sin orden · 1 línea · total US\$\s10,00$/,
    );
  });

  // brief-22.5, D-7.
  it("la anulación dice su número y su motivo", () => {
    const voided = {
      ...entry({ void_number: 1, reason: "returned_to_supplier" }),
      action: "void",
    } as GoodsReceiptAuditEntry;
    expect(auditActionLabel(voided)).toBe("Anulación");
    expect(describeAuditDiff(voided)).toBe(
      "Anulación ARC-000001: Mercadería devuelta al proveedor",
    );
    expect(
      describeAuditDiff({
        ...voided,
        diff: { before: null, after: { void_number: 2, reason: "x" } },
      } as GoodsReceiptAuditEntry),
    ).toBe("Anulación ARC-000002");
  });
});
