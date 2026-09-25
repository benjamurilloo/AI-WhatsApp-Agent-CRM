import { describe, expect, it } from "vitest";
import type { ProductAuditEntry } from "@/modules/catalog";
import { auditActionLabel, describeAuditDiff } from "./audit-summary";

function entry(overrides: Partial<ProductAuditEntry>): ProductAuditEntry {
  return {
    id: "b3c5b1f4-0000-4000-8000-000000000001",
    entityType: "product",
    action: "update",
    diff: { before: {}, after: {} },
    createdAt: new Date("2026-09-15T12:00:00Z"),
    actor: {
      kind: "user",
      id: "b3c5b1f4-0000-4000-8000-000000000002",
      name: "Ana Pérez",
    },
    ...overrides,
  };
}

describe("auditActionLabel", () => {
  it("traduce cada acción con productor en el producto", () => {
    expect(auditActionLabel(entry({ action: "create" }))).toBe("Alta");
    expect(auditActionLabel(entry({ action: "update" }))).toBe("Edición");
    expect(auditActionLabel(entry({ action: "deactivate" }))).toBe(
      "Desactivación",
    );
    expect(auditActionLabel(entry({ action: "reactivate" }))).toBe(
      "Reactivación",
    );
    expect(
      auditActionLabel(
        entry({ entityType: "inventory", action: "stock_adjustment" }),
      ),
    ).toBe("Ajuste de stock");
    expect(auditActionLabel(entry({ action: "price_change" }))).toBe(
      "Cambio de precio",
    );
  });
});

describe("describeAuditDiff", () => {
  it("un ajuste de stock muestra el saldo antes y después, en formato local", () => {
    expect(
      describeAuditDiff(
        entry({
          entityType: "inventory",
          action: "stock_adjustment",
          diff: {
            before: { quantityOnHand: "10.000" },
            after: { quantityOnHand: "6.500" },
          },
        }),
      ),
    ).toBe("Stock: 10 → 6,5");
  });

  it("una edición nombra los campos con su etiqueta", () => {
    expect(
      describeAuditDiff(
        entry({
          diff: {
            before: { reorderPoint: "5.000", name: "Café" },
            after: { reorderPoint: "10.000", name: "Café molido" },
          },
        }),
      ),
    ).toBe("Punto de reposición: 5 → 10 · Nombre: Café → Café molido");
  });

  it("una desactivación se lee como sí o no", () => {
    expect(
      describeAuditDiff(
        entry({
          action: "deactivate",
          diff: { before: { isActive: true }, after: { isActive: false } },
        }),
      ),
    ).toBe("Activo: sí → no");
  });

  it("un alta muestra los valores iniciales y marca lo vacío", () => {
    expect(
      describeAuditDiff(
        entry({
          action: "create",
          diff: {
            before: null,
            after: {
              sku: "CAF-250",
              name: "Café",
              description: null,
              unit: "unidad",
              reorderPoint: "2.500",
              isActive: true,
            },
          },
        }),
      ),
    ).toBe(
      "SKU: CAF-250 · Nombre: Café · Descripción: vacío · Unidad: unidad · Punto de reposición: 2,5 · Activo: sí",
    );
  });

  // FR-PROD-10 (brief-11.1): sin estas etiquetas, una edición de solo la marca quedaba vacía.
  it("FR-PROD-10: una edición de marca, categoría y condición se lee con sus etiquetas", () => {
    expect(
      describeAuditDiff(
        entry({
          diff: {
            before: { brand: null, category: "Almacén", condition: "new" },
            after: {
              brand: "Cafetal",
              category: "Bebidas",
              condition: "refurbished",
            },
          },
        }),
      ),
    ).toBe(
      "Marca: vacío → Cafetal · Categoría: Almacén → Bebidas · Condición: Nuevo → Reacondicionado",
    );
  });

  // FR-PROD-12 (brief-11.1, D-7): monto y moneda se leen juntos, con los decimales de la moneda.
  it("FR-PROD-12: un cambio de precio muestra el precio antes y después, formateado", () => {
    const nbsp = "\u00a0";
    expect(
      describeAuditDiff(
        entry({
          action: "price_change",
          diff: {
            before: { amount: null, currency: null },
            after: { amount: "300000.00", currency: "CLP" },
          },
        }),
      ),
    ).toBe(`Precio: sin precio → CLP${nbsp}300.000`);
    expect(
      describeAuditDiff(
        entry({
          action: "price_change",
          diff: {
            before: { amount: "1234.50", currency: "USD" },
            after: { amount: "1300.00", currency: "USD" },
          },
        }),
      ),
    ).toBe(`Precio: US$${nbsp}1.234,50 → US$${nbsp}1.300,00`);
  });

  it("ignora claves que no son campos conocidos", () => {
    expect(
      describeAuditDiff(
        entry({
          diff: {
            before: { name: "Café", internalId: "no-mostrar" },
            after: { name: "Yerba", internalId: "tampoco" },
          },
        }),
      ),
    ).toBe("Nombre: Café → Yerba");
  });
});
