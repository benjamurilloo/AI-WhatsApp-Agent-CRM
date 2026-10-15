import { formatCuit, type SupplierAuditEntry } from "@/modules/purchasing";

// La historia del proveedor en texto (brief-22.2, D-8): «Alta», «Edición», «Desactivación» y
// «Reactivación», con los valores de cada campo. El CUIT se muestra con sus guiones.

const ACTION_LABEL: Record<string, string> = {
  create: "Alta",
  update: "Edición",
  deactivate: "Desactivación",
  reactivate: "Reactivación",
};

const VALUE_LABEL: Record<string, string> = {
  name: "Nombre",
  phone: "Teléfono",
  email: "Email",
  cuit: "CUIT",
  isActive: "Activo",
};

// Orden del formulario. jsonb no conserva el orden de las claves con que se escribió el diff.
const FIELD_ORDER = ["name", "phone", "email", "cuit", "isActive"];

type Value = string | number | boolean | null | undefined;

function show(field: string, value: Value): string {
  if (value === null || value === undefined || value === "") return "vacío";
  if (typeof value === "boolean") return value ? "sí" : "no";
  if (field === "cuit" && typeof value === "string" && /^\d{11}$/.test(value)) {
    return formatCuit(value);
  }
  return String(value);
}

export function auditActionLabel(entry: SupplierAuditEntry): string {
  return ACTION_LABEL[entry.action] ?? entry.action;
}

export function describeAuditDiff(entry: SupplierAuditEntry): string {
  const { before, after } = entry.diff;
  if (after === null) return "—";
  if (before === null) {
    return ["name", "phone", "email", "cuit"]
      .map((field) => `${VALUE_LABEL[field]}: ${show(field, after[field])}`)
      .join(" · ");
  }
  return FIELD_ORDER.filter((field) => Object.hasOwn(before, field))
    .map(
      (field) =>
        `${VALUE_LABEL[field]}: ${show(field, before[field])} → ${show(field, after[field])}`,
    )
    .join(" · ");
}
