import { describe, expect, it } from "vitest";
import type { CashSessionAuditEntry } from "@/modules/cash";
import { auditActionLabel, describeAuditDiff } from "./audit-summary";

// La historia de una sesión de caja en texto (brief-21.2, D-9).

function entry(
  action: string,
  diff: CashSessionAuditEntry["diff"],
): CashSessionAuditEntry {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    organizationId: "00000000-0000-4000-8000-000000000002",
    entityType: "cash_session",
    entityId: "00000000-0000-4000-8000-000000000003",
    action,
    diff,
    createdAt: new Date("2026-10-13T12:00:00Z"),
    actor: { kind: "user", id: "u", name: "Ana" },
  } as CashSessionAuditEntry;
}

describe("la historia de una sesión de caja", () => {
  it("nombra la apertura y el cierre", () => {
    expect(auditActionLabel(entry("create", { before: null, after: {} }))).toBe(
      "Apertura",
    );
    expect(auditActionLabel(entry("close", { before: {}, after: {} }))).toBe(
      "Cierre",
    );
  });

  it("la apertura dice su número y su inicial por moneda, en orden", () => {
    const text = describeAuditDiff(
      entry("create", {
        before: null,
        after: { number: 45, opening_USD: "10.00", opening_ARS: "1500.50" },
      }),
    );
    expect(text).toMatch(/^Sesión C-000045 · inicial /);
    expect(text.indexOf("1.500,50")).toBeLessThan(text.indexOf("10,00"));
  });

  it("el cierre dice lo contado y lo esperado de cada moneda", () => {
    const text = describeAuditDiff(
      entry("close", {
        before: { counted_ARS: null, expected_ARS: null },
        after: { counted_ARS: "90.00", expected_ARS: "100.00" },
      }),
    );
    expect(text).toMatch(/^ARS: contado .*90,00, esperado .*100,00$/);
  });

  it("una acción desconocida no se describe", () => {
    expect(describeAuditDiff(entry("update", { before: {}, after: {} }))).toBe(
      "—",
    );
  });
});
