import type { ProductAuditEntry, ProductCondition } from "@/modules/catalog";
import { formatMoney } from "@/shared/money";
import { formatQuantity } from "@/shared/quantity";
import { CONDITION_LABEL, formatMeasure } from "../messages";

// Traduce un registro de auditoría a texto legible para la pantalla 4 (wireframe 04):
// solo los campos relevantes, sin IDs internos ni nombres de columnas.

export const AUDIT_ACTION_LABEL: Record<string, string> = {
  create: "Alta",
  update: "Edición",
  deactivate: "Desactivación",
  reactivate: "Reactivación",
  stock_adjustment: "Ajuste de stock",
  price_change: "Cambio de precio",
};

const FIELD_LABEL: Record<string, string> = {
  sku: "SKU",
  name: "Nombre",
  description: "Descripción",
  unit: "Unidad",
  reorderPoint: "Punto de reposición",
  brand: "Marca",
  category: "Categoría",
  condition: "Condición",
  // Campos de operación (brief-17.2, AC-4).
  barcode: "Código de barras",
  weightKg: "Peso",
  lengthCm: "Largo",
  widthCm: "Ancho",
  heightCm: "Alto",
  location: "Ubicación",
  shelf: "Estante",
  isActive: "Activo",
  quantityOnHand: "Stock",
};

const QUANTITY_FIELDS = new Set(["reorderPoint", "quantityOnHand"]);

// Peso en kg y dimensiones en cm, con su unidad (brief-17.2, D-5).
const MEASURE_UNIT: Record<string, string> = {
  weightKg: "kg",
  lengthCm: "cm",
  widthCm: "cm",
  heightCm: "cm",
};

// Los campos de la 17.2 que un alta sin ellos no menciona: siete «vacío» no dicen nada.
const OPTIONAL_ON_CREATE = new Set([
  "barcode",
  "weightKg",
  "lengthCm",
  "widthCm",
  "heightCm",
  "location",
  "shelf",
]);

function show(field: string, value: string | number | boolean | null): string {
  if (value === null || value === "") return "vacío";
  if (typeof value === "boolean") return value ? "sí" : "no";
  const text = String(value);
  if (field === "condition" && Object.hasOwn(CONDITION_LABEL, text)) {
    return CONDITION_LABEL[text as ProductCondition];
  }
  if (Object.hasOwn(MEASURE_UNIT, field)) {
    return `${formatMeasure(text)} ${MEASURE_UNIT[field]}`;
  }
  return QUANTITY_FIELDS.has(field) ? formatQuantity(text) : text;
}

// Un precio es monto y moneda juntos (brief-11.1, D-7): «Precio: sin precio → CLP 300.000».
function showPrice(fields: Record<string, unknown> | null): string {
  const amount = fields?.amount;
  const currency = fields?.currency;
  return typeof amount === "string" && typeof currency === "string"
    ? formatMoney(amount, currency)
    : "sin precio";
}

export function auditActionLabel(entry: ProductAuditEntry): string {
  return AUDIT_ACTION_LABEL[entry.action] ?? entry.action;
}

// "Stock: 10 → 6"; en un alta, los valores iniciales.
export function describeAuditDiff(entry: ProductAuditEntry): string {
  const { before, after } = entry.diff;
  if (entry.action === "price_change") {
    return `Precio: ${showPrice(before)} → ${showPrice(after)}`;
  }
  if (before === null) {
    return after === null
      ? "—"
      : Object.entries(after)
          .filter(([field]) => Object.hasOwn(FIELD_LABEL, field))
          .filter(
            ([field, value]) =>
              !(OPTIONAL_ON_CREATE.has(field) && value === null),
          )
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
