import type { ProductAuditEntry } from "@/modules/catalog";
import { formatQuantity } from "@/shared/quantity";

// Traduce un registro de auditoría a texto legible para la pantalla 4 (wireframe 04):
// solo los campos relevantes, sin IDs internos ni nombres de columnas.

export const AUDIT_ACTION_LABEL: Record<string, string> = {
  create: "Alta",
  update: "Edición",
  deactivate: "Desactivación",
  reactivate: "Reactivación",
  stock_adjustment: "Ajuste de stock",
};

const FIELD_LABEL: Record<string, string> = {
  sku: "SKU",
  name: "Nombre",
  description: "Descripción",
  unit: "Unidad",
  reorderPoint: "Punto de reposición",
  isActive: "Activo",
  quantityOnHand: "Stock",
};

const QUANTITY_FIELDS = new Set(["reorderPoint", "quantityOnHand"]);

function show(field: string, value: string | number | boolean | null): string {
  if (value === null || value === "") return "vacío";
  if (typeof value === "boolean") return value ? "sí" : "no";
  const text = String(value);
  return QUANTITY_FIELDS.has(field) ? formatQuantity(text) : text;
}

export function auditActionLabel(entry: ProductAuditEntry): string {
  return AUDIT_ACTION_LABEL[entry.action] ?? entry.action;
}

// "Stock: 10 → 6"; en un alta, los valores iniciales.
export function describeAuditDiff(entry: ProductAuditEntry): string {
  const { before, after } = entry.diff;
  if (before === null) {
    return after === null
      ? "—"
      : Object.entries(after)
          .filter(([field]) => Object.hasOwn(FIELD_LABEL, field))
          .map(
            ([field, value]) => `${FIELD_LABEL[field]}: ${show(field, value)}`,
          )
          .join(" · ");
  }
  if (after === null) return "—";
  return Object.keys(before)
    .filter((field) => Object.hasOwn(FIELD_LABEL, field))
    .map(
      (field) =>
        `${FIELD_LABEL[field]}: ${show(field, before[field]!)} → ${show(
          field,
          after[field]!,
        )}`,
    )
    .join(" · ");
}
