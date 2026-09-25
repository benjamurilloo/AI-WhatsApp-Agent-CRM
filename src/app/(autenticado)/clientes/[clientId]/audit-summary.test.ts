import { describe, expect, it } from "vitest";
import type { ClientAuditEntry } from "@/modules/crm";
import { auditActionLabel, describeAuditDiff } from "./audit-summary";

function entry(
  action: ClientAuditEntry["action"],
  diff: ClientAuditEntry["diff"],
): ClientAuditEntry {
  return {
    id: "a",
    entityType: "client",
    action,
    diff,
    createdAt: new Date(0),
    actor: { kind: "user", id: "u", name: "Ana" },
  };
}

describe("auditActionLabel", () => {
  it("traduce las acciones del cliente", () => {
    expect(auditActionLabel(entry("create", { before: null, after: {} }))).toBe(
      "Alta",
    );
    expect(
      auditActionLabel(entry("reactivate", { before: {}, after: {} })),
    ).toBe("Reactivación");
  });
});

describe("describeAuditDiff (brief-5.3, D-4)", () => {
  it("un alta muestra nombre y teléfono, y de las notas solo si se cargaron", () => {
    expect(
      describeAuditDiff(
        entry("create", {
          before: null,
          after: {
            displayName: "Ana Pérez",
            phoneE164: "+5491155551234",
            notes: "Una nota larga con datos",
            isActive: true,
          },
        }),
      ),
    ).toBe("Nombre: Ana Pérez · Teléfono: +5491155551234 · Notas cargadas");
    expect(
      describeAuditDiff(
        entry("create", {
          before: null,
          after: {
            displayName: "Bruno",
            phoneE164: null,
            notes: null,
            isActive: true,
          },
        }),
      ),
    ).toBe("Nombre: Bruno · Teléfono: vacío · Sin notas");
  });

  it("una edición muestra antes y después, sin el texto de las notas", () => {
    const summary = describeAuditDiff(
      entry("update", {
        before: {
          displayName: "Ana",
          phoneE164: "+5491155551234",
          notes: "Nota vieja secreta",
        },
        after: { displayName: "Ana Pérez", phoneE164: null, notes: "Nueva" },
      }),
    );
    expect(summary).toBe(
      "Nombre: Ana → Ana Pérez · Teléfono: +5491155551234 → vacío · Notas actualizadas",
    );
    expect(summary).not.toContain("secreta");
  });

  it("sigue el orden del formulario aunque jsonb reordene las claves", () => {
    expect(
      describeAuditDiff(
        entry("update", {
          before: { notes: "a", isActive: true, phoneE164: null },
          after: { notes: "b", isActive: false, phoneE164: "+12" },
        }),
      ),
    ).toBe("Teléfono: vacío → +12 · Notas actualizadas · Activo: sí → no");
    expect(
      describeAuditDiff(
        entry("create", {
          before: null,
          after: {
            notes: null,
            isActive: true,
            phoneE164: "+12",
            displayName: "Bo",
          },
        }),
      ),
    ).toBe("Nombre: Bo · Teléfono: +12 · Sin notas");
  });

  it("distingue notas cargadas, borradas y actualizadas", () => {
    const notes = (before: string | null, after: string | null) =>
      describeAuditDiff(
        entry("update", { before: { notes: before }, after: { notes: after } }),
      );
    expect(notes(null, "x")).toBe("Notas cargadas");
    expect(notes("x", null)).toBe("Notas borradas");
    expect(notes("x", "y")).toBe("Notas actualizadas");
  });

  it("desactivación y reactivación muestran el estado", () => {
    expect(
      describeAuditDiff(
        entry("deactivate", {
          before: { isActive: true },
          after: { isActive: false },
        }),
      ),
    ).toBe("Activo: sí → no");
  });
});
