import { PROVINCES, type ClientAuditEntry } from "@/modules/crm";
import { KIND_LABEL } from "../filters";

// Traduce un registro de auditoría del cliente a texto legible (wireframe 07, brief-5.3, D-4):
// valores para nombre, teléfono y estado; de las notas, solo qué pasó, porque no entran en una celda.
// Desde la 17.1, los campos ampliados con su nombre en castellano, y el tipo y la provincia con su
// etiqueta en lugar del código (AC-3).

const ACTION_LABEL: Record<string, string> = {
  create: "Alta",
  update: "Edición",
  deactivate: "Desactivación",
  reactivate: "Reactivación",
  tag_change: "Etiqueta",
};

const VALUE_LABEL: Record<string, string> = {
  displayName: "Nombre",
  phoneE164: "Teléfono",
  email: "Email",
  kind: "Tipo",
  companyName: "Empresa",
  jobTitle: "Cargo",
  addressLine: "Calle y número",
  city: "Ciudad",
  province: "Provincia",
  postalCode: "Código postal",
  segment: "Segmento",
  isActive: "Activo",
};

type Value = string | number | boolean | null | undefined;

function show(value: Value): string {
  if (value === null || value === undefined || value === "") return "vacío";
  if (typeof value === "boolean") return value ? "sí" : "no";
  return String(value);
}

// El tipo y la provincia se guardan como código; se muestran con su nombre.
function showField(field: string, value: Value): string {
  if (field === "kind" && typeof value === "string") {
    return Object.hasOwn(KIND_LABEL, value)
      ? KIND_LABEL[value as keyof typeof KIND_LABEL]
      : value;
  }
  if (field === "province" && typeof value === "string") {
    return Object.hasOwn(PROVINCES, value)
      ? PROVINCES[value as keyof typeof PROVINCES]
      : value;
  }
  return show(value);
}

function notesChange(before: Value, after: Value): string {
  if (before == null) return "Notas cargadas";
  if (after == null) return "Notas borradas";
  return "Notas actualizadas";
}

export function auditActionLabel(entry: ClientAuditEntry): string {
  return ACTION_LABEL[entry.action] ?? entry.action;
}

// Orden del formulario. jsonb no conserva el orden de las claves con que se escribió el diff.
const FIELD_ORDER = [
  "displayName",
  "phoneE164",
  "notes",
  "email",
  "kind",
  "companyName",
  "jobTitle",
  "addressLine",
  "city",
  "province",
  "postalCode",
  "segment",
  "isActive",
];

export function describeAuditDiff(entry: ClientAuditEntry): string {
  const { before, after } = entry.diff;
  if (after === null) return "—";
  // Etiqueta puesta o quitada, con el nombre que tenía en ese momento (brief-16.1, D-7).
  if (entry.action === "tag_change" && before !== null) {
    return after.tag == null
      ? `Etiqueta quitada: ${show(before.tag)}`
      : `Etiqueta agregada: ${show(after.tag)}`;
  }
  if (before === null) {
    return [
      `Nombre: ${show(after.displayName)}`,
      `Teléfono: ${show(after.phoneE164)}`,
      after.notes == null ? "Sin notas" : "Notas cargadas",
    ].join(" · ");
  }
  return FIELD_ORDER.filter((field) => Object.hasOwn(before, field))
    .map((field) => {
      if (field === "notes") return notesChange(before.notes, after.notes);
      if (!Object.hasOwn(VALUE_LABEL, field)) return null;
      return `${VALUE_LABEL[field]}: ${showField(field, before[field])} → ${showField(field, after[field])}`;
    })
    .filter((part): part is string => part !== null)
    .join(" · ");
}
