import { describe, expect, it } from "vitest";
import type { OrderAuditEntry } from "@/modules/orders";
import { auditActionLabel, describeAuditDiff } from "./audit-summary";

function entry(
  action: OrderAuditEntry["action"],
  diff: OrderAuditEntry["diff"],
): OrderAuditEntry {
  return {
    id: "a",
    entityType: "order",
    action,
    diff,
    actor: { kind: "user", id: "u", name: "Ana" },
    createdAt: new Date(0),
  };
}

describe("historia de un pedido", () => {
  it("el alta dice el número, las líneas y el total", () => {
    const created = entry("create", {
      before: null,
      after: {
        number: 12,
        status: "pending",
        client_id: "c",
        currency: "ARS",
        total: "3703.53",
        lines: 2,
      },
    });
    expect(auditActionLabel(created)).toBe("Alta");
    expect(describeAuditDiff(created)).toMatch(
      /^Pedido P-000012 · 2 líneas · total \$\s3\.703,53$/,
    );
    expect(
      describeAuditDiff(
        entry("create", {
          before: null,
          after: { number: 1, lines: 1, total: "5.00", currency: "USD" },
        }),
      ),
    ).toMatch(/^Pedido P-000001 · 1 línea · total US\$\s5,00$/);
  });

  it("un cambio de estado dice el anterior y el nuevo", () => {
    const changed = entry("status_change", {
      before: { status: "pending" },
      after: { status: "cancelled" },
    });
    expect(auditActionLabel(changed)).toBe("Cambio de estado");
    expect(describeAuditDiff(changed)).toBe("Pendiente → Cancelado");
  });
});
