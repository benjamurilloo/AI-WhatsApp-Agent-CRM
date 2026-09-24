import type { KnowledgeAuditEntry } from "@/modules/knowledge";
import { formatCalendarDate } from "../messages";

// Traduce un registro de auditoría de una entrada a texto legible para la pantalla 12: solo los
// campos relevantes, sin IDs internos ni nombres de columnas. El contenido puede tener 4000
// caracteres: la tabla dice que cambió, no lo repite (el texto completo está en la auditoría).

export const AUDIT_ACTION_LABEL: Record<string, string> = {
  create: "Alta",
  update: "Edición",
  deactivate: "Desactivación",
  reactivate: "Reactivación",
};

const FIELD_LABEL: Record<string, string> = {
  title: "Título",
  category: "Categoría",
  content: "Contenido",
  validFrom: "Vigente desde",
  validUntil: "Vigente hasta",
  isActive: "Activa",
};

const DATE_FIELDS = new Set(["validFrom", "validUntil"]);

function show(field: string, value: string | number | boolean | null): string {
  if (DATE_FIELDS.has(field)) {
    return typeof value === "string" && value !== ""
      ? formatCalendarDate(value)
      : "sin límite";
  }
  if (value === null || value === "") return "vacío";
  if (typeof value === "boolean") return value ? "sí" : "no";
  return String(value);
}

export function auditActionLabel(entry: KnowledgeAuditEntry): string {
  return AUDIT_ACTION_LABEL[entry.action] ?? entry.action;
}

// «Título: Horario → Horario de verano · Contenido modificado»; en un alta, los valores iniciales.
export function describeAuditDiff(entry: KnowledgeAuditEntry): string {
  const { before, after } = entry.diff;
  if (after === null) return "—";
  const fields = Object.keys(before ?? after).filter((field) =>
    Object.hasOwn(FIELD_LABEL, field),
  );
  return fields
    .map((field) => {
      if (field === "content") {
        return before === null ? "Contenido cargado" : "Contenido modificado";
      }
      const label = FIELD_LABEL[field];
      return before === null
        ? `${label}: ${show(field, after[field]!)}`
        : `${label}: ${show(field, before[field]!)} → ${show(field, after[field]!)}`;
    })
    .join(" · ");
}
