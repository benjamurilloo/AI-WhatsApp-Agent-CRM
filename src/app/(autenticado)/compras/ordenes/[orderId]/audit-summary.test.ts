import { describe, expect, it } from "vitest";
import type { PurchaseOrderAuditEntry } from "@/modules/purchasing";
import { auditActionLabel, describeAuditDiff } from "./audit-summary";

// La historia de la orden de compra (brief-22.3, D-9).

function entry(
  action: PurchaseOrderAuditEntry["action"],
  diff: PurchaseOrderAuditEntry["diff"],
): PurchaseOrderAuditEntry {
  return {
    id: "a",
    entityType: "purchase_order",
    action,
    diff,
    actor: { kind: "user", id: "u", name: "Ana" },
    createdAt: new Date(0),
  };
}

describe("la historia de una orden de compra", () => {
  it("el alta dice el número, las líneas y el total, sin el proveedor", () => {
    const created = entry("create", {
      before: null,
      after: {
        number: 4,
        status: "open",
        supplier_id: "proveedor-x",
        currency: "ARS",
        total: "3002.49",
        lines: 2,
      },
    });
    expect(auditActionLabel(created)).toBe("Alta");
    expect(describeAuditDiff(created)).toMatch(
      /^Orden OC-000004 · 2 líneas · total \$\s3\.002,49$/,
    );
    expect(describeAuditDiff(created)).not.toContain("proveedor-x");
  });

  it("la cancelación dice el cambio de estado", () => {
    const cancelled = entry("status_change", {
      before: { status: "open" },
      after: { status: "cancelled" },
    });
    expect(auditActionLabel(cancelled)).toBe("Cancelación");
    expect(describeAuditDiff(cancelled)).toBe("Abierta → Cancelada");
  });

  it("un estado desconocido se muestra tal cual", () => {
    expect(
      describeAuditDiff(
        entry("status_change", {
          before: { status: "open" },
          after: { status: "toString" },
        }),
      ),
    ).toBe("Abierta → toString");
  });
});
