import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  getConversationsStarted,
  getFirstResponseDistribution,
  getFirstResponseTime,
  getInboundMessageKinds,
  getMessageCounts,
  previousPeriodInput,
  type MetricsPeriodInput,
} from "@/modules/analytics";
import { getDb } from "@/shared/db";
import {
  inbound,
  insertConversation,
  outbound,
  preparePasswordHash,
  SECRET_BODY,
  users,
  valueOf,
} from "./analytics-helpers";
import { resetDatabase } from "./reset-database";

// Métricas 13 y 14 y el período anterior contra PostgreSQL real (brief-15.3, D-2, D-4 y D-5):
// valores calculados a mano, invariantes del catálogo, bordes de zona horaria, aislamiento y
// autorización. Fixtures propios: los de la 7.1 y la 7.2 no se tocan.

// Período I = 01/09 a 03/09 locales de Buenos Aires (UTC−3) = [2026-09-01T03:00Z, 2026-09-04T03:00Z).
const PERIOD: MetricsPeriodInput = { from: "2026-09-01", to: "2026-09-03" };

// Métrica 13. Solo cuentan los entrantes de I, por su kind:
//
// | Conv. | Mensajes (UTC)                                                 | En I                |
// |-------|----------------------------------------------------------------|---------------------|
// | K1    | in 01/09 13:00 text · in 01/09 13:05 audio · out 13:10 text    | text, audio         |
// | K2    | in 02/09 10:00 image · in 10:01 sin kind · in 10:02 audio      | image, nulo, audio  |
// | K3    | in 04/09 02:30 document (03/09 23:30 local) · in 04/09 03:00   | document            |
// |       | video (04/09 00:00 local, fuera de I)                          |                     |
// | K4    | in 01/09 02:59 other (31/08 23:59 local, fuera de I)           | —                   |
//
// text 1, audio 2, image 1, video 0, document 1, other 0, sin dato 1 → total 6, que es la métrica 4.
// El saliente de K1 no cuenta. La organización B tiene tres entrantes de texto en I y no cambia nada.
async function kindsFixture(orgA: string, orgB: string) {
  await insertConversation(orgA, {
    messages: [
      inbound("2026-09-01T13:00:00Z", "text"),
      inbound("2026-09-01T13:05:00Z", "audio"),
      { ...outbound("2026-09-01T13:10:00Z"), kind: "text" },
    ],
  });
  await insertConversation(orgA, {
    messages: [
      inbound("2026-09-02T10:00:00Z", "image"),
      inbound("2026-09-02T10:01:00Z"),
      inbound("2026-09-02T10:02:00Z", "audio"),
    ],
  });
  await insertConversation(orgA, {
    messages: [
      inbound("2026-09-04T02:30:00Z", "document"),
      inbound("2026-09-04T03:00:00Z", "video"),
    ],
  });
  await insertConversation(orgA, {
    messages: [inbound("2026-09-01T02:59:00Z", "other")],
  });
  await insertConversation(orgB, {
    messages: [
      inbound("2026-09-02T12:00:00Z", "text"),
      inbound("2026-09-02T12:01:00Z", "text"),
      inbound("2026-09-02T12:02:00Z", "text"),
    ],
  });
}

// Métrica 14. Población y delta de la métrica 9; rangos [desde, hasta) en minutos:
//
// | Conv. | Primer entrante (UTC) | Primera respuesta    | Delta          | Rango    |
// |-------|-----------------------|----------------------|----------------|----------|
// | D1    | 01/09 12:00           | 12:00:59             | 59 s           | < 1      |
// | D2    | 01/09 13:00           | 13:01                | 1 min exacto   | 1 a 5    |
// | D3    | 01/09 14:00           | 14:05                | 5 min exactos  | 5 a 30   |
// | D4    | 01/09 15:00           | 15:29:59             | 29 min 59 s    | 5 a 30   |
// | D5    | 02/09 12:00           | 12:30                | 30 min exactos | 30 a 60  |
// | D6    | 02/09 13:00           | 14:00                | 60 min exactos | 1 h o más|
// | D7    | 03/09 20:00           | 06/09 20:00 (fuera)  | 3 días         | 1 h o más|
// | D8    | 03/09 21:00           | —                    | sin respuesta  | aparte   |
// | D9    | 31/08 12:00 (fuera)   | 02/09 12:00          | no es población| —        |
//
// Población 8 (D1 a D8), con respuesta 7, sin respuesta 1 → rangos [1, 1, 2, 1, 2], que suman 7.
// La organización B tiene una respuesta de 10 min en I y no cambia nada.
async function bucketsFixture(orgA: string, orgB: string) {
  const answered: [string, string][] = [
    ["2026-09-01T12:00:00Z", "2026-09-01T12:00:59Z"],
    ["2026-09-01T13:00:00Z", "2026-09-01T13:01:00Z"],
    ["2026-09-01T14:00:00Z", "2026-09-01T14:05:00Z"],
    ["2026-09-01T15:00:00Z", "2026-09-01T15:29:59Z"],
    ["2026-09-02T12:00:00Z", "2026-09-02T12:30:00Z"],
    ["2026-09-02T13:00:00Z", "2026-09-02T14:00:00Z"],
    ["2026-09-03T20:00:00Z", "2026-09-06T20:00:00Z"],
  ];
  for (const [question, answer] of answered) {
    await insertConversation(orgA, {
      messages: [inbound(question), outbound(answer)],
    });
  }
  await insertConversation(orgA, {
    messages: [inbound("2026-09-03T21:00:00Z")],
  });
  await insertConversation(orgA, {
    messages: [
      inbound("2026-08-31T12:00:00Z"),
      inbound("2026-09-02T11:00:00Z"),
      outbound("2026-09-02T12:00:00Z"),
    ],
  });
  await insertConversation(orgB, {
    messages: [
      inbound("2026-09-02T12:00:00Z"),
      outbound("2026-09-02T12:10:00Z"),
    ],
  });
}

beforeAll(async () => {
  await preparePasswordHash();
});

beforeEach(async () => {
  await resetDatabase(getDb());
});

afterAll(async () => {
  await getDb().$client.end();
});

describe("métrica 13: entrantes por tipo", () => {
  it("cuenta los entrantes de I por kind, con los nulos como sin dato y 0 explícito", async () => {
    const { orgA, orgB, adminA } = await users();
    await kindsFixture(orgA, orgB);
    expect(valueOf(await getInboundMessageKinds(adminA, PERIOD))).toEqual({
      status: "value",
      total: 6,
      groups: [
        { kind: "text", count: 1 },
        { kind: "audio", count: 2 },
        { kind: "image", count: 1 },
        { kind: "video", count: 0 },
        { kind: "document", count: 1 },
        { kind: "other", count: 0 },
        { kind: null, count: 1 },
      ],
    });
  });

  it("la suma de los grupos es la métrica 4", async () => {
    const { orgA, orgB, adminA } = await users();
    await kindsFixture(orgA, orgB);
    const kinds = valueOf(await getInboundMessageKinds(adminA, PERIOD));
    const counts = valueOf(await getMessageCounts(adminA, PERIOD));
    if (kinds.status !== "value") throw new Error("se esperaba un valor");
    expect(kinds.groups.reduce((sum, group) => sum + group.count, 0)).toBe(
      counts.inbound,
    );
    expect(kinds.total).toBe(counts.inbound);
  });

  it("sin entrantes en I es sin datos, nunca seis ceros", async () => {
    const { orgA, adminA } = await users();
    await insertConversation(orgA, {
      messages: [{ ...outbound("2026-09-02T12:00:00Z"), kind: "text" }],
    });
    expect(valueOf(await getInboundMessageKinds(adminA, PERIOD))).toEqual({
      status: "no_data",
    });
  });
});

describe("métrica 14: tiempo a primera respuesta por rangos", () => {
  it("reparte los deltas en rangos semiabiertos, con cada borde en el rango que empieza ahí", async () => {
    const { orgA, orgB, adminA } = await users();
    await bucketsFixture(orgA, orgB);
    expect(valueOf(await getFirstResponseDistribution(adminA, PERIOD))).toEqual(
      {
        population: 8,
        withoutResponse: 1,
        buckets: {
          status: "value",
          withResponse: 7,
          ranges: [
            { fromMinutes: 0, toMinutes: 1, count: 1 },
            { fromMinutes: 1, toMinutes: 5, count: 1 },
            { fromMinutes: 5, toMinutes: 30, count: 2 },
            { fromMinutes: 30, toMinutes: 60, count: 1 },
            { fromMinutes: 60, toMinutes: null, count: 2 },
          ],
        },
      },
    );
  });

  it("tiene la población de la métrica 9, y sus rangos suman las conversaciones con respuesta", async () => {
    const { orgA, orgB, adminA } = await users();
    await bucketsFixture(orgA, orgB);
    const buckets = valueOf(await getFirstResponseDistribution(adminA, PERIOD));
    const median = valueOf(await getFirstResponseTime(adminA, PERIOD));
    expect(buckets.population).toBe(median.population);
    expect(buckets.withoutResponse).toBe(median.withoutResponse);
    if (buckets.buckets.status !== "value") {
      throw new Error("se esperaba un valor");
    }
    expect(
      buckets.buckets.ranges.reduce((sum, range) => sum + range.count, 0),
    ).toBe(median.population - median.withoutResponse);
  });

  it("sin ninguna respuesta: rangos sin datos, y las que esperan respuesta igual se informan", async () => {
    const { orgA, adminA } = await users();
    await insertConversation(orgA, {
      messages: [inbound("2026-09-02T12:00:00Z")],
    });
    expect(valueOf(await getFirstResponseDistribution(adminA, PERIOD))).toEqual(
      { population: 1, withoutResponse: 1, buckets: { status: "no_data" } },
    );
  });

  // El 14/03/2009 de Buenos Aires dura 25 horas: 01:30Z y 02:30Z del 15/03 son las dos 23:30
  // locales del 14/03. Por el reloj la respuesta llega «al mismo tiempo»; transcurrió una hora.
  it("mide el tiempo transcurrido, no la diferencia del reloj, en el día de 25 horas", async () => {
    const { orgA, adminA } = await users();
    await insertConversation(orgA, {
      messages: [
        inbound("2009-03-15T01:30:00Z"),
        outbound("2009-03-15T02:30:00Z"),
      ],
    });
    const result = valueOf(
      await getFirstResponseDistribution(adminA, {
        from: "2009-03-14",
        to: "2009-03-14",
      }),
    );
    expect(result.buckets).toEqual({
      status: "value",
      withResponse: 1,
      ranges: [
        { fromMinutes: 0, toMinutes: 1, count: 0 },
        { fromMinutes: 1, toMinutes: 5, count: 0 },
        { fromMinutes: 5, toMinutes: 30, count: 0 },
        { fromMinutes: 30, toMinutes: 60, count: 0 },
        { fromMinutes: 60, toMinutes: null, count: 1 },
      ],
    });
  });
});

describe("período anterior", () => {
  // El 19/10/2008 de Buenos Aires dura 23 horas: [2008-10-19T03:00Z, 2008-10-20T02:00Z). Es el
  // período anterior de un período de un día, el 20/10.
  it("se resuelve con la zona de la organización, también en un día de 23 horas", async () => {
    const { orgA, adminA } = await users();
    for (const at of [
      "2008-10-19T03:00:00Z",
      "2008-10-20T01:59:00Z",
      "2008-10-20T02:00:00Z",
    ]) {
      await insertConversation(orgA, { messages: [inbound(at)] });
    }
    const current = await getConversationsStarted(adminA, {
      from: "2008-10-20",
      to: "2008-10-20",
    });
    if (!current.ok) throw new Error("período rechazado");
    const previous = previousPeriodInput(current.period);
    expect(previous).toEqual({ from: "2008-10-19", to: "2008-10-19" });
    // 03:00Z y 01:59Z caen en el día de 23 horas; 02:00Z ya es el 20/10 local.
    expect(valueOf(await getConversationsStarted(adminA, previous))).toBe(2);
    expect(current.value).toBe(1);
  });
});

describe("métricas 13 y 14: autorización, aislamiento y contenido", () => {
  it("viewer lee lo mismo que admin; con la contraseña pendiente, FORBIDDEN", async () => {
    const { orgA, orgB, adminA, viewerA, pendingA } = await users();
    await kindsFixture(orgA, orgB);
    await bucketsFixture(orgA, orgB);
    for (const load of [getInboundMessageKinds, getFirstResponseDistribution]) {
      expect(await load(viewerA, PERIOD)).toEqual(await load(adminA, PERIOD));
      expect(await load(pendingA, PERIOD)).toEqual({
        ok: false,
        code: "FORBIDDEN",
      });
    }
  });

  it("rechaza un período inválido con sus campos", async () => {
    const { adminA } = await users();
    const invalid = { from: "2026-09-03", to: "2026-09-01" };
    for (const load of [getInboundMessageKinds, getFirstResponseDistribution]) {
      expect(await load(adminA, invalid)).toEqual({
        ok: false,
        code: "VALIDATION_ERROR",
        fields: ["from", "to"],
      });
    }
  });

  it("cada organización ve solo sus datos, y ninguna respuesta lleva cuerpos de mensajes", async () => {
    const { orgA, orgB, adminB } = await users();
    await kindsFixture(orgA, orgB);
    await bucketsFixture(orgA, orgB);
    const kinds = await getInboundMessageKinds(adminB, PERIOD);
    const buckets = await getFirstResponseDistribution(adminB, PERIOD);
    // B: tres entrantes de texto (kinds) y una respuesta de 10 min (buckets), más su entrante.
    expect(valueOf(kinds)).toMatchObject({ status: "value", total: 4 });
    expect(valueOf(buckets)).toMatchObject({
      population: 2,
      withoutResponse: 1,
    });
    expect(JSON.stringify([kinds, buckets])).not.toContain(SECRET_BODY);
  });
});
