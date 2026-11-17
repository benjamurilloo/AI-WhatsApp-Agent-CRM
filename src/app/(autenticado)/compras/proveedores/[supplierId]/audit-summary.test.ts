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

// La marca de técnico (brief-24.8.2-b, D-2). Se auditaba desde la 29.6 y no se dibujaba.
describe("la marca de técnico en la historia", () => {
  it("el alta de un técnico la nombra, y la de un proveedor común también", () => {
    const alta = (isTechnician: boolean) =>
      describeAuditDiff(
        entry("create", {
          before: null,
          after: {
            name: "Taller Aurora",
            phone: null,
            email: null,
            cuit: null,
            isTechnician,
            isActive: true,
          },
        }),
      );
    expect(alta(true)).toBe(
      "Nombre: Taller Aurora · Teléfono: vacío · Email: vacío · CUIT: vacío · Técnico: sí",
    );
    expect(alta(false)).toBe(
      "Nombre: Taller Aurora · Teléfono: vacío · Email: vacío · CUIT: vacío · Técnico: no",
    );
  });

  it("un alta vieja, sin la marca en el diff, se sigue leyendo igual", () => {
    expect(
      describeAuditDiff(
        entry("create", {
          before: null,
          after: {
            name: "Distribuidora Norte",
            phone: null,
            email: null,
            cuit: null,
            isActive: true,
          },
        }),
      ),
    ).toBe(
      "Nombre: Distribuidora Norte · Teléfono: vacío · Email: vacío · CUIT: vacío",
    );
  });

  it("una edición que solo cambia la marca ya no queda vacía", () => {
    expect(
      describeAuditDiff(
        entry("update", {
          before: { isTechnician: false },
          after: { isTechnician: true },
        }),
      ),
    ).toBe("Técnico: no → sí");
  });

  it("con el nombre y la marca juntos, la marca va después del CUIT", () => {
    expect(
      describeAuditDiff(
        entry("update", {
          before: { name: "Taller Aurora", isTechnician: true },
          after: { name: "Taller Aurora SRL", isTechnician: false },
        }),
      ),
    ).toBe("Nombre: Taller Aurora → Taller Aurora SRL · Técnico: sí → no");
  });
});
