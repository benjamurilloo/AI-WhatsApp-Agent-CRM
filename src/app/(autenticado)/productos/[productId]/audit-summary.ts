import type {
  ProductAuditEntry,
  ProductCondition,
  StockTracking,
} from "@/modules/catalog";
import { formatMoney } from "@/shared/money";
import { formatQuantity } from "@/shared/quantity";
import { CONDITION_LABEL, formatMeasure } from "../messages";
import { TRACKING_LABEL } from "./unidades/messages";

// Traduce un registro de auditoría a texto legible para la pantalla 4 (wireframe 04):
// solo los campos relevantes, sin IDs internos ni nombres de columnas.

export const AUDIT_ACTION_LABEL: Record<string, string> = {
  create: "Alta",
  update: "Edición",
  deactivate: "Desactivación",
  reactivate: "Reactivación",
  stock_adjustment: "Ajuste de stock",
  price_change: "Cambio de precio",
  // Solo la ve un admin, como toda la auditoría (brief-18.2, D-1).
  cost_change: "Cambio de costo",
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
  // La imagen principal, con el hash corto y el tamaño, nunca los bytes (brief-17.5, D-8).
  image: "Imagen",
  isActive: "Activo",
  quantityOnHand: "Stock",
  // El cambio de seguimiento, auditado como edición del producto (brief-29.5, D-3).
  tracking: "Se lleva",
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

// El modelo y los atributos de la capacidad variants, auditados como valores planos (brief-29.2,
// H-2): «modelo» y «atributo.<clave>», con el nombre vigente del atributo; sin él, la clave legible.
function fieldLabel(
  field: string,
  attributeNames: Record<string, string>,
): string | undefined {
  if (Object.hasOwn(FIELD_LABEL, field)) return FIELD_LABEL[field];
  if (field === "modelo") return "Modelo";
  if (field.startsWith("atributo.")) {
    const key = field.slice("atributo.".length);
    if (Object.hasOwn(attributeNames, key)) return attributeNames[key];
    const words = key.replaceAll("_", " ");
    return words.charAt(0).toUpperCase() + words.slice(1);
  }
  return undefined;
}

function isVariantField(field: string): boolean {
  return field === "modelo" || field.startsWith("atributo.");
}

function show(field: string, value: string | number | boolean | null): string {
  if (field === "image" && value === null) return "sin imagen";
  if (value === null || value === "") return "vacío";
  if (typeof value === "boolean") return value ? "sí" : "no";
  const text = String(value);
  if (field === "condition" && Object.hasOwn(CONDITION_LABEL, text)) {
    return CONDITION_LABEL[text as ProductCondition];
  }
  if (field === "tracking" && Object.hasOwn(TRACKING_LABEL, text)) {
    return TRACKING_LABEL[text as StockTracking];
  }
  if (Object.hasOwn(MEASURE_UNIT, field)) {
    return `${formatMeasure(text)} ${MEASURE_UNIT[field]}`;
  }
  return QUANTITY_FIELDS.has(field) ? formatQuantity(text) : text;
}

// Un precio es monto y moneda juntos (brief-11.1, D-7): «Precio: sin precio → CLP 300.000».
// Un costo, igual (brief-18.2): «Costo: sin costo → $ 60,50».
function showMoney(
  fields: Record<string, unknown> | null,
  missing: string,
): string {
  const amount = fields?.amount;
  const currency = fields?.currency;
  return typeof amount === "string" && typeof currency === "string"
    ? formatMoney(amount, currency)
    : missing;
}

export function auditActionLabel(entry: ProductAuditEntry): string {
  return AUDIT_ACTION_LABEL[entry.action] ?? entry.action;
}

// "Stock: 10 → 6"; en un alta, los valores iniciales.
export function describeAuditDiff(
  entry: ProductAuditEntry,
  attributeNames: Record<string, string> = {},
): string {
  const { before, after } = entry.diff;
  if (entry.action === "price_change") {
    return `Precio: ${showMoney(before, "sin precio")} → ${showMoney(after, "sin precio")}`;
  }
  if (entry.action === "cost_change") {
    const change = `Costo: ${showMoney(before, "sin costo")} → ${showMoney(after, "sin costo")}`;
    // Desde la 22.4, el costo de una recepción lleva su origen (brief-22.4, D-5 y D-6).
    return after?.source === "goods_receipt" &&
      typeof after.goods_receipt_number === "string"
      ? `${change} · por la recepción ${after.goods_receipt_number}`
      : change;
  }
  if (before === null) {
    return after === null
      ? "—"
      : Object.entries(after)
          .filter(([field]) => fieldLabel(field, attributeNames) !== undefined)
          .filter(
            ([field, value]) =>
              !(
                (OPTIONAL_ON_CREATE.has(field) || isVariantField(field)) &&
                value === null
              ),
          )
          .map(
            ([field, value]) =>
              `${fieldLabel(field, attributeNames)}: ${show(field, value)}`,
          )
          .join(" · ");
  }
  if (after === null) return "—";
  return Object.keys(before)
    .filter((field) => fieldLabel(field, attributeNames) !== undefined)
    .map(
      (field) =>
        `${fieldLabel(field, attributeNames)}: ${show(field, before[field]!)} → ${show(
          field,
          after[field]!,
        )}`,
    )
    .join(" · ");
}
