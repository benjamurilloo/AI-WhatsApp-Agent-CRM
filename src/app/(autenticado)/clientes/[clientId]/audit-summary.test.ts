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

describe("etiquetas en el historial (brief-16.1, D-7)", () => {
  it("FR-CLI-09: dice qué etiqueta se agregó o se quitó", () => {
    expect(
      auditActionLabel(
        entry("tag_change", { before: { tag: null }, after: { tag: "X" } }),
      ),
    ).toBe("Etiqueta");
    expect(
      describeAuditDiff(
        entry("tag_change", {
          before: { tag: null },
          after: { tag: "Reclamo" },
        }),
      ),
    ).toBe("Etiqueta agregada: Reclamo");
    expect(
      describeAuditDiff(
        entry("tag_change", {
          before: { tag: "Reclamo" },
          after: { tag: null },
        }),
      ),
    ).toBe("Etiqueta quitada: Reclamo");
  });

  it("una entrada vaciada no muestra nada (ADR 0015)", () => {
    expect(
      describeAuditDiff(entry("tag_change", { before: null, after: null })),
    ).toBe("—");
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

describe("entrada vaciada (brief-13.4, D-3; ADR 0015)", () => {
  // La marca la escribe el operador con el rol dueño y no pasa por validateAuditEntry: trae una
  // clave más que el tipo no declara. La ficha conserva la acción y no muestra datos.
  const erased = {
    before: null,
    after: null,
    vaciado: true,
  } as unknown as ClientAuditEntry["diff"];

  it("muestra la acción y un guion en lugar del cambio, en cualquier acción", () => {
    for (const [action, label] of [
      ["create", "Alta"],
      ["update", "Edición"],
      ["deactivate", "Desactivación"],
      ["reactivate", "Reactivación"],
    ] as const) {
      expect(auditActionLabel(entry(action, erased))).toBe(label);
      expect(describeAuditDiff(entry(action, erased))).toBe("—");
    }
  });
});

describe("campos ampliados en el historial (brief-17.1, AC-3)", () => {
  it("nombra cada campo en castellano, y el tipo y la provincia por su nombre", () => {
    expect(
      describeAuditDiff(
        entry("update", {
          before: { segment: null, province: "AR-S", kind: null, email: null },
          after: {
            segment: "Mayorista",
            province: "AR-X",
            kind: "company",
            email: "ana@example.com",
          },
        }),
      ),
    ).toBe(
      "Email: vacío → ana@example.com · Tipo: vacío → Empresa · Provincia: Santa Fe → Córdoba · Segmento: vacío → Mayorista",
    );
    expect(
      describeAuditDiff(
        entry("update", {
          before: {
            companyName: "A",
            jobTitle: null,
            addressLine: "Calle 1",
            city: "Rosario",
            postalCode: "2000",
          },
          after: {
            companyName: null,
            jobTitle: "Compras",
            addressLine: "Calle 2",
            city: "Funes",
            postalCode: "S2132",
          },
        }),
      ),
    ).toBe(
      "Empresa: A → vacío · Cargo: vacío → Compras · Calle y número: Calle 1 → Calle 2 · Ciudad: Rosario → Funes · Código postal: 2000 → S2132",
    );
  });
});
