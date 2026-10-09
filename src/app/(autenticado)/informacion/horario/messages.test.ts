import { describe, expect, it } from "vitest";
import type { NamedAuditLogEntry } from "@/modules/audit";
import {
  describeHoursAudit,
  exceptionFieldError,
  formatAuditSlots,
  formatDayDate,
  formatSlots,
  noticeMessage,
} from "./messages";

function entry(diff: NamedAuditLogEntry["diff"]): NamedAuditLogEntry {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    entityType: "business_hours",
    action: "update",
    diff,
    actor: { kind: "user", id: "u", name: "Ana" },
    createdAt: new Date("2026-10-12T12:00:00Z"),
  };
}

describe("formatos del horario (brief-17.4, D-4)", () => {
  it("formatSlots: cerrado, un tramo y dos", () => {
    expect(formatSlots([])).toBe("Cerrado");
    expect(formatSlots([{ opens: "09:00", closes: "13:00" }])).toBe(
      "09:00 a 13:00",
    );
    expect(
      formatSlots([
        { opens: "09:00", closes: "13:00" },
        { opens: "16:00", closes: "20:00" },
      ]),
    ).toBe("09:00 a 13:00 y 16:00 a 20:00");
  });

  it("formatDayDate: el día de la semana sale del calendario, también en domingo", () => {
    expect(formatDayDate("2026-10-12")).toBe("Lunes 12/10/2026");
    expect(formatDayDate("2026-10-18")).toBe("Domingo 18/10/2026");
    expect(formatDayDate("2024-02-29")).toBe("Jueves 29/02/2024");
  });

  it("formatAuditSlots: sin cargar, cerrado y tramos", () => {
    expect(formatAuditSlots(null)).toBe("sin cargar");
    expect(formatAuditSlots("")).toBe("cerrado");
    expect(formatAuditSlots("09:00-13:00,16:00-20:00")).toBe(
      "09:00 a 13:00 y 16:00 a 20:00",
    );
  });
});

describe("describeHoursAudit (AC-5)", () => {
  it("nombra en castellano cada día que cambió, en orden", () => {
    expect(
      describeHoursAudit(
        entry({
          before: { day7: "", day6: "09:00-13:00" },
          after: { day7: "09:00-13:00", day6: "" },
        }),
      ),
    ).toEqual({
      action: "Horario semanal",
      change:
        "Sábado: 09:00 a 13:00 → cerrado; Domingo: cerrado → 09:00 a 13:00",
    });
  });

  it("un día especial agregado y uno quitado, con su motivo", () => {
    const empty = {
      exception: null,
      exceptionHours: null,
      exceptionReason: null,
    };
    expect(
      describeHoursAudit(
        entry({
          before: empty,
          after: {
            exception: "2026-10-12",
            exceptionHours: "",
            exceptionReason: "Feriado",
          },
        }),
      ),
    ).toEqual({
      action: "Día especial agregado",
      change: "Lunes 12/10/2026: cerrado (Feriado)",
    });
    expect(
      describeHoursAudit(
        entry({
          before: {
            exception: "2026-10-15",
            exceptionHours: "10:00-12:00",
            exceptionReason: null,
          },
          after: empty,
        }),
      ),
    ).toEqual({
      action: "Día especial quitado",
      change: "Jueves 15/10/2026: 10:00 a 12:00",
    });
  });
});

describe("mensajes", () => {
  it("el primer campo inválido del día especial, en el orden del formulario", () => {
    expect(exceptionFieldError(["reason", "slots"]).field).toBe("slots");
  });

  it("solo los avisos conocidos", () => {
    expect(noticeMessage("guardado")).toBe("Horario guardado.");
    expect(noticeMessage("toString")).toBeNull();
  });
});
