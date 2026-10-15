import { describe, expect, it } from "vitest";
import type { SupplierAuditEntry } from "@/modules/purchasing";
import { auditActionLabel, describeAuditDiff } from "./audit-summary";

// La historia del proveedor (brief-22.2, D-8).

function entry(
  action: SupplierAuditEntry["action"],
  diff: SupplierAuditEntry["diff"],
): SupplierAuditEntry {
  return {
    id: "a",
    entityType: "supplier",
    action,
    diff,
    createdAt: new Date(0),
    actor: { kind: "user", id: "u", name: "Ana" },
  };
}

describe("auditActionLabel", () => {
  it("traduce las cuatro acciones", () => {
    expect(auditActionLabel(entry("create", { before: null, after: {} }))).toBe(
      "Alta",
    );
    expect(auditActionLabel(entry("update", { before: {}, after: {} }))).toBe(
      "Edición",
    );
    expect(
      auditActionLabel(entry("deactivate", { before: {}, after: {} })),
    ).toBe("Desactivación");
    expect(
      auditActionLabel(entry("reactivate", { before: {}, after: {} })),
    ).toBe("Reactivación");
  });
});

describe("describeAuditDiff", () => {
  it("el alta lista los cuatro campos, con el CUIT formateado y los vacíos dichos", () => {
    expect(
      describeAuditDiff(
        entry("create", {
          before: null,
          after: {
            name: "Distribuidora Norte",
            phone: null,
            email: "ventas@norte.com",
            cuit: "20123456786",
            isActive: true,
          },
        }),
      ),
    ).toBe(
      "Nombre: Distribuidora Norte · Teléfono: vacío · Email: ventas@norte.com · CUIT: 20-12345678-6",
    );
  });

  it("una edición muestra antes y después de lo que cambió, en el orden del formulario", () => {
    expect(
      describeAuditDiff(
        entry("update", {
          before: { cuit: null, email: "a@b.com" },
          after: { cuit: "30712345671", email: null },
        }),
      ),
    ).toBe("Email: a@b.com → vacío · CUIT: vacío → 30-71234567-1");
  });

  it("la desactivación dice el estado", () => {
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
