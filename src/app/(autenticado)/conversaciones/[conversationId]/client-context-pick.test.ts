import { describe, expect, it } from "vitest";
import {
  appointmentDayText,
  pickNextAppointment,
  pickOpenServiceOrder,
} from "./client-context-pick";

describe("el contexto del cliente (brief-24.3, D-6)", () => {
  it("elige la orden más reciente que no esté entregada ni cancelada", () => {
    expect(
      pickOpenServiceOrder([
        { id: "5", status: "delivered" },
        { id: "4", status: "cancelled" },
        { id: "3", status: "quoted" },
        { id: "2", status: "received" },
      ]),
    ).toEqual({ id: "3", status: "quoted" });
    expect(
      pickOpenServiceOrder([
        { id: "2", status: "delivered" },
        { id: "1", status: "cancelled" },
      ]),
    ).toBeNull();
    expect(pickOpenServiceOrder([])).toBeNull();
  });

  it("elige el próximo turno pedido o confirmado desde hoy", () => {
    const today = "2026-10-28";
    // Llegan del más nuevo al más viejo, como en la ficha.
    const appointments = [
      { id: "a", date: "2026-11-05", start: "10:00", status: "confirmed" },
      { id: "b", date: "2026-10-30", start: "16:00", status: "requested" },
      { id: "c", date: "2026-10-30", start: "09:30", status: "cancelled" },
      { id: "d", date: "2026-10-30", start: "11:00", status: "confirmed" },
      { id: "e", date: "2026-10-28", start: "08:00", status: "attended" },
      { id: "f", date: "2026-10-20", start: "10:00", status: "confirmed" },
    ];
    expect(pickNextAppointment(appointments, today)?.id).toBe("d");
    expect(
      pickNextAppointment(
        [{ id: "g", date: today, start: "18:00", status: "requested" }],
        today,
      )?.id,
    ).toBe("g");
    expect(pickNextAppointment(appointments.slice(4), today)).toBeNull();
  });

  it("brief-24.3.1: el día del turno dice Hoy, Mañana o el día con la fecha", () => {
    expect(appointmentDayText("2026-10-28", "2026-10-28")).toBe("Hoy");
    expect(appointmentDayText("2026-10-29", "2026-10-28")).toBe("Mañana");
    expect(appointmentDayText("2026-11-01", "2026-10-31")).toBe("Mañana");
    expect(appointmentDayText("2026-10-30", "2026-10-28")).toMatch(
      /30\/10\/2026$/,
    );
  });
});
