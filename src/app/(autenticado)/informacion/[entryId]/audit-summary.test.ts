import { describe, expect, it } from "vitest";
import type { KnowledgeAuditEntry } from "@/modules/knowledge";
import { auditActionLabel, describeAuditDiff } from "./audit-summary";

function entry(
  action: string,
  before: KnowledgeAuditEntry["diff"]["before"],
  after: KnowledgeAuditEntry["diff"]["after"],
): KnowledgeAuditEntry {
  return {
    id: "a",
    organizationId: "o",
    entityType: "knowledge_entry",
    entityId: "e",
    action,
    diff: { before, after },
    createdAt: new Date(0),
    actor: { id: "u", name: "Ana" },
  } as KnowledgeAuditEntry;
}

describe("resumen de auditoría de una entrada (pantalla 12)", () => {
  it("un alta muestra los valores iniciales, sin repetir el contenido", () => {
    const created = entry("create", null, {
      title: "Horario de atención",
      category: "Horarios",
      content: "Lunes a viernes de 9 a 18.",
      validFrom: "2026-12-24",
      validUntil: null,
      isActive: true,
    });
    expect(auditActionLabel(created)).toBe("Alta");
    expect(describeAuditDiff(created)).toBe(
      "Título: Horario de atención · Categoría: Horarios · Contenido cargado · Vigente desde: 24/12/2026 · Vigente hasta: sin límite · Activa: sí",
    );
  });

  it("una edición muestra antes y después, y el contenido solo como modificado", () => {
    expect(
      describeAuditDiff(
        entry(
          "update",
          { title: "Horario", content: "viejo", validUntil: null },
          {
            title: "Horario de verano",
            content: "nuevo",
            validUntil: "2027-03-01",
          },
        ),
      ),
    ).toBe(
      "Título: Horario → Horario de verano · Contenido modificado · Vigente hasta: sin límite → 01/03/2027",
    );
  });

  it("desactivar y reactivar", () => {
    const deactivated = entry(
      "deactivate",
      { isActive: true },
      { isActive: false },
    );
    expect(auditActionLabel(deactivated)).toBe("Desactivación");
    expect(describeAuditDiff(deactivated)).toBe("Activa: sí → no");
  });
});
