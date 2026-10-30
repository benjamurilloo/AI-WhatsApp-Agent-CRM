import { describe, expect, it } from "vitest";
import { buildActivityEvents, parseEventsLimit } from "./activity-events";
import { pickNextAttention } from "./next-attention";
import type { ActivitySources } from "./activity-events";

const EMPTY: ActivitySources["operations"] = {
  sales: [],
  orders: [],
  serviceOrders: [],
  appointments: [],
  tradeIns: [],
};

const at = (day: number) => new Date(`2026-10-${day}T15:00:00Z`);

describe("la cronología de Actividad (brief-24.4.3, D-5)", () => {
  it("una fila por conversación y las notas con su autor, de más nuevo a más viejo", () => {
    const events = buildActivityEvents({
      operations: EMPTY,
      documents: [],
      conversations: {
        conversations: [{ id: "c1", channel: "whatsapp", at: at(20) }],
        notes: [
          { id: "n1", conversationId: "c1", author: "Carla", at: at(21) },
        ],
      },
    });
    expect(events.map((event) => [event.title, event.source])).toEqual([
      ["Nota interna agregada", "Carla"],
      ["Última interacción", "WhatsApp"],
    ]);
    expect(events[0]?.href).toBe("/conversaciones/c1");
  });

  it("una reparación da su alta y cada estado con fecha", () => {
    const events = buildActivityEvents({
      conversations: null,
      documents: [],
      operations: {
        ...EMPTY,
        serviceOrders: [
          {
            id: "r1",
            displayNumber: "OS-000248",
            createdAt: at(10),
            sentAt: at(11),
            quotedAt: null,
            approvedAt: null,
            rejectedAt: null,
            repairedAt: at(12),
            deliveredAt: null,
            cancelledAt: null,
          },
        ] as unknown as ActivitySources["operations"]["serviceOrders"],
      },
    });
    expect(events.map((event) => event.title)).toEqual([
      "Reparación lista",
      "Reparación enviada al técnico",
      "Reparación creada",
    ]);
    expect(events[0]?.source).toBe("OS-000248");
    expect(events[0]?.href).toBe("/reparaciones/r1");
  });

  it("los cobros y devoluciones vienen del estado de cuenta, con importe; las ventas no se repiten", () => {
    const document = (kind: string, id: string) => ({
      kind,
      id,
      displayNumber: "R-000042",
      createdAt: at(15),
      currency: "ARS",
      amount: "30000.00",
      destination: null,
      voided: false,
    });
    const events = buildActivityEvents({
      conversations: null,
      operations: EMPTY,
      documents: [
        document("sale", "s1"),
        document("sale_void", "s1"),
        document("receipt", "r1"),
      ] as ActivitySources["documents"],
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      title: "Cobro registrado",
      source: "R-000042",
      href: "/cobros/r1",
    });
    expect(events[0]?.detail).toMatch(/30\.000/);
  });

  it("ningún evento trae texto de mensajes o notas: no hay campo de dónde sacarlo", () => {
    const events = buildActivityEvents({
      operations: EMPTY,
      documents: [],
      conversations: {
        conversations: [],
        notes: [
          {
            id: "n1",
            conversationId: "c1",
            author: "Carla",
            at: at(21),
            body: "TEXTO-PRIVADO",
          } as never,
        ],
      },
    });
    expect(JSON.stringify(events)).not.toContain("TEXTO-PRIVADO");
  });

  it("?eventos= acepta múltiplos de 20 hasta 200", () => {
    expect(parseEventsLimit({})).toBe(20);
    expect(parseEventsLimit({ eventos: "40" })).toBe(40);
    expect(parseEventsLimit({ eventos: "200" })).toBe(200);
    for (const eventos of ["0", "30", "220", "x"]) {
      expect(parseEventsLimit({ eventos })).toBe(20);
    }
  });
});

describe("«Próxima atención» (brief-24.4.3, D-6)", () => {
  const TODAY = "2026-10-30";
  const appointment = (date: string, status = "confirmed") => ({
    id: date,
    date,
    start: "17:00",
    status,
  });
  const order = (id: string, status: string, day: number) => ({
    id,
    status,
    createdAt: at(day),
  });

  it("primero el próximo turno desde hoy", () => {
    const result = pickNextAttention(
      [appointment("2026-11-05"), appointment("2026-10-30")],
      [order("r1", "repaired", 1)],
      TODAY,
    );
    expect(result?.kind).toBe("appointment");
    expect(result?.kind === "appointment" && result.appointment.date).toBe(
      "2026-10-30",
    );
    expect(result?.more).toBe(true);
  });

  it("sin turno, la reparación lista más vieja, y no una que sigue en curso", () => {
    const result = pickNextAttention(
      [appointment("2026-10-01"), appointment("2026-11-05", "cancelled")],
      [
        order("r3", "received", 1),
        order("r2", "repaired", 20),
        order("r1", "repaired", 10),
      ],
      TODAY,
    );
    expect(result?.kind === "repair" && result.order.id).toBe("r1");
    expect(result?.more).toBe(true);
  });

  it("una sola atención no ofrece «Ver todas»", () => {
    expect(
      pickNextAttention([], [order("r1", "repaired", 1)], TODAY)?.more,
    ).toBe(false);
  });

  it("sin nada pendiente, ninguna: no se inventa una recomendación", () => {
    expect(
      pickNextAttention(
        [appointment("2026-10-01")],
        [order("r1", "received", 1)],
        TODAY,
      ),
    ).toBeNull();
  });
});
