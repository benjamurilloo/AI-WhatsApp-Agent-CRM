import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  getActiveConversations,
  getConversationsStarted,
  getDailyActivity,
  getMessageCounts,
  getMessagesPerConversation,
  getUniqueClients,
  type MetricsPeriodInput,
} from "@/modules/analytics";
import { getDb } from "@/shared/db";
import {
  addUser,
  contextFor,
  createOrganization,
  inbound,
  insertClient,
  insertConversation,
  outbound,
  preparePasswordHash,
  SECRET_BODY,
  users,
  valueOf,
} from "./analytics-helpers";
import { resetDatabase } from "./reset-database";

// Métricas de volumen contra PostgreSQL real (brief-7.1): valores calculados a mano sobre fixtures
// sintéticos, invariantes de MetricsCatalog, bordes de zona horaria, aislamiento y autorización.
// Los ayudantes de inserción son compartidos (brief-7.2, D-5); el fixture y sus valores son de acá.

// Fixture principal, en America/Argentina/Buenos_Aires (UTC−3, sin horario de verano en 2026).
// Período I = 01/09 a 03/09 locales = [2026-09-01T03:00Z, 2026-09-04T03:00Z).
//
// | Conv. | Cliente | Mensajes (UTC → día local)                                          | En I      |
// |-------|---------|---------------------------------------------------------------------|-----------|
// | C1    | Ana     | in 31/08 12:00 (fuera) · in 01/09 13:00 → 01 · out 02/09 14:00 → 02 | 1 in 1 out|
// | C2    | Ana     | in 01/09 03:00 → 01 (inicio exacto) · out 02/09 02:30 → 01 (23:30)  | 2 in 1 out|
// |       |         | · in 02/09 03:00 → 02 (medianoche local)                            |           |
// | C3    | ninguno | out 03/09 20:00 → 03 · in 04/09 02:59 → 03 · in 04/09 03:00 (fin)    | 1 in 1 out|
// | C4    | Beto    | in 04/09 03:00 → 04 (fuera de I)                                    | —         |
// | C5    | Ana     | in 20/08 12:00 (fuera de I)                                         | —         |
// | C6    | Beto    | in 02/09 15:00 · out 15:05 · in 15:10 · out 15:20 → 02              | 2 in 2 out|
//
// Métrica 1: iniciadas en I = C2 (01), C6 (02), C3 (03) = 3. C1 empezó antes de I.
// Métrica 2: A = {C1, C2, C3, C6} = 4.
// Métrica 3: Ana (C1, C2) y Beto (C6) = 2; C3 sin cliente = 1.
// Métricas 4 y 5: entrantes 1 + 2 + 1 + 2 = 6; salientes 1 + 1 + 1 + 2 = 5.
// Métrica 6: mensajes por conversación 2, 3, 2, 4 → 11 / 4 = 2,75; mediana de (2, 2, 3, 4) = 2,5.
// Métrica 10:
//   01/09: iniciadas 1 (C2), activas 2 (C1, C2), entrantes 2 (C1, C2), salientes 1 (C2 a las 23:30)
//   02/09: iniciadas 1 (C6), activas 3 (C1, C2, C6), entrantes 3 (C2, C6 ×2), salientes 3 (C1, C6 ×2)
//   03/09: iniciadas 1 (C3), activas 1 (C3), entrantes 1, salientes 1
//   04/09: iniciadas 1 (C4), activas 2 (C3 y C4, a las 00:00), entrantes 2, salientes 0
//   05/09: todo 0
// La organización B tiene la misma forma de datos dentro de I y no cambia ningún valor de A.
async function mainFixture(orgA: string, orgB: string) {
  const ana = await insertClient(orgA, "Ana Secreta", "+5491155550001");
  const beto = await insertClient(orgA, "Beto Secreto", "+5491155550002");
  await insertConversation(orgA, {
    clientId: ana,
    messages: [
      inbound("2026-08-31T12:00:00Z"),
      inbound("2026-09-01T13:00:00Z"),
      outbound("2026-09-02T14:00:00Z"),
    ],
  });
  await insertConversation(orgA, {
    clientId: ana,
    status: "closed",
    messages: [
      inbound("2026-09-01T03:00:00Z"),
      outbound("2026-09-02T02:30:00Z"),
      inbound("2026-09-02T03:00:00Z"),
    ],
  });
  await insertConversation(orgA, {
    status: "pending",
    messages: [
      outbound("2026-09-03T20:00:00Z"),
      inbound("2026-09-04T02:59:00Z"),
      inbound("2026-09-04T03:00:00Z"),
    ],
  });
  await insertConversation(orgA, {
    clientId: beto,
    messages: [inbound("2026-09-04T03:00:00Z")],
  });
  await insertConversation(orgA, {
    clientId: ana,
    messages: [inbound("2026-08-20T12:00:00Z")],
  });
  await insertConversation(orgA, {
    clientId: beto,
    messages: [
      inbound("2026-09-02T15:00:00Z"),
      outbound("2026-09-02T15:05:00Z"),
      inbound("2026-09-02T15:10:00Z"),
      outbound("2026-09-02T15:20:00Z"),
    ],
  });

  const otherClient = await insertClient(orgB, "Cliente B", "+5491155550003");
  for (let index = 0; index < 3; index++) {
    await insertConversation(orgB, {
      clientId: index === 0 ? null : otherClient,
      messages: [
        inbound(`2026-09-0${index + 1}T12:00:00Z`),
        outbound(`2026-09-0${index + 1}T12:10:00Z`),
        outbound(`2026-09-0${index + 1}T12:20:00Z`),
      ],
    });
  }
}

const PERIOD: MetricsPeriodInput = { from: "2026-09-01", to: "2026-09-03" };

beforeAll(async () => {
  await preparePasswordHash();
});

beforeEach(async () => {
  await resetDatabase(getDb());
});

afterAll(async () => {
  await getDb().$client.end();
});

describe("métricas de volumen: valores calculados a mano", () => {
  it("métrica 1: cuenta las conversaciones iniciadas en I, no las anteriores con actividad", async () => {
    const s = await users();
    await mainFixture(s.orgA, s.orgB);
    const result = await getConversationsStarted(s.adminA, PERIOD);
    expect(result).toEqual({
      ok: true,
      period: {
        from: "2026-09-01",
        to: "2026-09-03",
        days: 3,
        timezone: "America/Argentina/Buenos_Aires",
      },
      value: 3,
    });
  });

  it("métrica 2: cuenta cada conversación con actividad una sola vez", async () => {
    const s = await users();
    await mainFixture(s.orgA, s.orgB);
    expect(valueOf(await getActiveConversations(s.adminA, PERIOD))).toBe(4);
  });

  it("métrica 3: clientes distintos, con las conversaciones sin cliente aparte", async () => {
    const s = await users();
    await mainFixture(s.orgA, s.orgB);
    expect(valueOf(await getUniqueClients(s.adminA, PERIOD))).toEqual({
      clients: 2,
      withoutClient: 1,
    });
  });

  it("métricas 4 y 5: entrantes y salientes, con los bordes de I", async () => {
    const s = await users();
    await mainFixture(s.orgA, s.orgB);
    expect(valueOf(await getMessageCounts(s.adminA, PERIOD))).toEqual({
      inbound: 6,
      outbound: 5,
    });
  });

  it("métrica 6: promedio y mediana con una cantidad par de conversaciones", async () => {
    const s = await users();
    await mainFixture(s.orgA, s.orgB);
    expect(valueOf(await getMessagesPerConversation(s.adminA, PERIOD))).toEqual(
      {
        status: "value",
        conversations: 4,
        messages: 11,
        average: 2.75,
        median: 2.5,
      },
    );
  });

  it("métrica 6: solo cuenta los mensajes de I, con una cantidad impar de conversaciones", async () => {
    const s = await users();
    await mainFixture(s.orgA, s.orgB);
    // 02/09: C1 1, C2 1, C6 4 → 6 / 3 = 2; mediana 1.
    expect(
      valueOf(
        await getMessagesPerConversation(s.adminA, {
          from: "2026-09-02",
          to: "2026-09-02",
        }),
      ),
    ).toEqual({
      status: "value",
      conversations: 3,
      messages: 6,
      average: 2,
      median: 1,
    });
  });

  it("métrica 10: un punto por día, agrupado en la zona de la organización y con ceros explícitos", async () => {
    const s = await users();
    await mainFixture(s.orgA, s.orgB);
    const result = await getDailyActivity(s.adminA, {
      from: "2026-09-01",
      to: "2026-09-05",
    });
    expect(valueOf(result)).toEqual([
      { day: "2026-09-01", started: 1, active: 2, inbound: 2, outbound: 1 },
      { day: "2026-09-02", started: 1, active: 3, inbound: 3, outbound: 3 },
      { day: "2026-09-03", started: 1, active: 1, inbound: 1, outbound: 1 },
      { day: "2026-09-04", started: 1, active: 2, inbound: 2, outbound: 0 },
      { day: "2026-09-05", started: 0, active: 0, inbound: 0, outbound: 0 },
    ]);
  });
});

describe("métricas de volumen: invariantes de MetricsCatalog", () => {
  it("cumplen las validaciones del catálogo sobre el mismo período", async () => {
    const s = await users();
    await mainFixture(s.orgA, s.orgB);
    const started = valueOf(await getConversationsStarted(s.adminA, PERIOD));
    const active = valueOf(await getActiveConversations(s.adminA, PERIOD));
    const unique = valueOf(await getUniqueClients(s.adminA, PERIOD));
    const counts = valueOf(await getMessageCounts(s.adminA, PERIOD));
    const perConversation = valueOf(
      await getMessagesPerConversation(s.adminA, PERIOD),
    );
    const daily = valueOf(await getDailyActivity(s.adminA, PERIOD));
    const total = await getDb().execute<{ total: string }>(
      sql`select count(*) as total from messages
          where organization_id = ${s.orgA}
            and sent_at >= '2026-09-01T03:00:00Z' and sent_at < '2026-09-04T03:00:00Z'`,
    );
    const sum = (key: "started" | "active" | "inbound" | "outbound") =>
      daily.reduce((accumulated, day) => accumulated + day[key], 0);

    // 1: la suma diaria es el total.
    expect(sum("started")).toBe(started);
    // 2: la suma diaria supera el total si una conversación está activa varios días.
    expect(sum("active")).toBeGreaterThan(active);
    // 3: nunca supera |A|.
    expect(unique.clients).toBeLessThanOrEqual(active);
    // 4 y 5: suman el total de mensajes de I, también por día.
    expect(counts.inbound + counts.outbound).toBe(Number(total.rows[0]!.total));
    expect(sum("inbound")).toBe(counts.inbound);
    expect(sum("outbound")).toBe(counts.outbound);
    // 6: el promedio por |A| es la suma de 4 y 5, y su denominador es |A|.
    if (perConversation.status !== "value") throw new Error("sin datos");
    expect(perConversation.conversations).toBe(active);
    expect(perConversation.average * active).toBe(
      counts.inbound + counts.outbound,
    );
    // 10: un punto por día de I.
    expect(daily.map((day) => day.day)).toEqual([
      "2026-09-01",
      "2026-09-02",
      "2026-09-03",
    ]);
  });

  it("sin mensajes en I: sin datos en la métrica 6 y ceros en los conteos", async () => {
    const s = await users();
    await mainFixture(s.orgA, s.orgB);
    const empty = { from: "2026-07-01", to: "2026-07-02" };
    expect(valueOf(await getMessagesPerConversation(s.adminA, empty))).toEqual({
      status: "no_data",
    });
    expect(valueOf(await getConversationsStarted(s.adminA, empty))).toBe(0);
    expect(valueOf(await getActiveConversations(s.adminA, empty))).toBe(0);
    expect(valueOf(await getUniqueClients(s.adminA, empty))).toEqual({
      clients: 0,
      withoutClient: 0,
    });
    expect(valueOf(await getMessageCounts(s.adminA, empty))).toEqual({
      inbound: 0,
      outbound: 0,
    });
    expect(valueOf(await getDailyActivity(s.adminA, empty))).toEqual([
      { day: "2026-07-01", started: 0, active: 0, inbound: 0, outbound: 0 },
      { day: "2026-07-02", started: 0, active: 0, inbound: 0, outbound: 0 },
    ]);
  });

  it("una conversación cerrada que vuelve a tener mensajes no se cuenta dos veces", async () => {
    const s = await users();
    await insertConversation(s.orgA, {
      status: "closed",
      messages: [
        inbound("2026-09-01T12:00:00Z"),
        outbound("2026-09-01T12:05:00Z"),
        inbound("2026-09-03T12:00:00Z"),
      ],
    });
    expect(valueOf(await getConversationsStarted(s.adminA, PERIOD))).toBe(1);
    expect(valueOf(await getActiveConversations(s.adminA, PERIOD))).toBe(1);
  });
});

describe("métricas de volumen: zona horaria", () => {
  it("el 19/10/2008 de Buenos Aires dura 23 horas", async () => {
    const s = await users();
    // El día empieza a las 03:00Z (00:00 −03) y termina a las 02:00Z del 20 (00:00 −02).
    await insertConversation(s.orgA, {
      messages: [
        inbound("2008-10-19T02:59:00Z"), // 18/10 23:59 −03
        inbound("2008-10-19T03:00:00Z"), // 19/10 01:00 −02
        outbound("2008-10-20T01:59:00Z"), // 19/10 23:59 −02
        inbound("2008-10-20T02:00:00Z"), // 20/10 00:00 −02
      ],
    });
    expect(
      valueOf(
        await getDailyActivity(s.adminA, {
          from: "2008-10-18",
          to: "2008-10-20",
        }),
      ),
    ).toEqual([
      { day: "2008-10-18", started: 1, active: 1, inbound: 1, outbound: 0 },
      { day: "2008-10-19", started: 0, active: 1, inbound: 1, outbound: 1 },
      { day: "2008-10-20", started: 0, active: 1, inbound: 1, outbound: 0 },
    ]);
    expect(
      valueOf(
        await getMessageCounts(s.adminA, {
          from: "2008-10-19",
          to: "2008-10-19",
        }),
      ),
    ).toEqual({ inbound: 1, outbound: 1 });
  });

  it("el 14/03/2009 de Buenos Aires dura 25 horas", async () => {
    const s = await users();
    // El día empieza a las 02:00Z (00:00 −02) y termina a las 03:00Z del 15 (00:00 −03).
    await insertConversation(s.orgA, {
      messages: [
        inbound("2009-03-14T01:59:00Z"), // 13/03 23:59 −02
        inbound("2009-03-14T02:00:00Z"), // 14/03 00:00 −02
        outbound("2009-03-15T02:30:00Z"), // 14/03 23:30 −03, después del cambio
        inbound("2009-03-15T03:00:00Z"), // 15/03 00:00 −03
      ],
    });
    expect(
      valueOf(
        await getDailyActivity(s.adminA, {
          from: "2009-03-13",
          to: "2009-03-15",
        }),
      ),
    ).toEqual([
      { day: "2009-03-13", started: 1, active: 1, inbound: 1, outbound: 0 },
      { day: "2009-03-14", started: 0, active: 1, inbound: 1, outbound: 1 },
      { day: "2009-03-15", started: 0, active: 1, inbound: 1, outbound: 0 },
    ]);
    expect(
      valueOf(
        await getMessageCounts(s.adminA, {
          from: "2009-03-14",
          to: "2009-03-14",
        }),
      ),
    ).toEqual({ inbound: 1, outbound: 1 });
  });

  it("usa la zona de la organización: en UTC el mismo mensaje cae otro día", async () => {
    const s = await users();
    const orgUtc = await createOrganization("Negocio UTC", "UTC");
    await addUser(orgUtc, "admin-utc@example.com", "admin");
    const adminUtc = await contextFor("admin-utc@example.com");
    for (const organizationId of [s.orgA, orgUtc]) {
      await insertConversation(organizationId, {
        messages: [inbound("2026-09-02T02:30:00Z")],
      });
    }
    const day = { from: "2026-09-01", to: "2026-09-01" };
    expect(valueOf(await getActiveConversations(s.adminA, day))).toBe(1);
    const utc = await getActiveConversations(adminUtc, day);
    expect(utc).toMatchObject({ ok: true, value: 0 });
    if (utc.ok) expect(utc.period.timezone).toBe("UTC");
    expect(
      valueOf(
        await getActiveConversations(adminUtc, {
          from: "2026-09-02",
          to: "2026-09-02",
        }),
      ),
    ).toBe(1);
  });
});

describe("métricas de volumen: período", () => {
  it("sin fechas usa los últimos 30 días completos de la organización, sin hoy", async () => {
    const s = await users();
    const today = await getDb().execute<{ today: string }>(
      sql`select to_char((now() at time zone 'America/Argentina/Buenos_Aires')::date, 'YYYY-MM-DD') as today`,
    );
    // Hoy no cuenta; el día anterior sí; el día 31 hacia atrás, no.
    await insertConversation(s.orgA, {
      messages: [
        inbound(new Date().toISOString()),
        inbound(new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
        inbound(new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString()),
      ],
    });
    const result = await getMessageCounts(s.adminA, { from: "", to: "" });
    if (!result.ok) throw new Error(result.code);
    const todayNumber = Date.parse(`${today.rows[0]!.today}T00:00:00Z`);
    const dayString = (offset: number) =>
      new Date(todayNumber + offset * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);
    expect(result.period).toEqual({
      from: dayString(-30),
      to: dayString(-1),
      days: 30,
      timezone: "America/Argentina/Buenos_Aires",
    });
    expect(result.value).toEqual({ inbound: 1, outbound: 0 });
  });

  it("rechaza un período inválido o futuro con sus campos", async () => {
    const s = await users();
    expect(
      await getDailyActivity(s.adminA, {
        from: "2026-09-03",
        to: "2026-09-01",
      }),
    ).toEqual({ ok: false, code: "VALIDATION_ERROR", fields: ["from", "to"] });
    expect(
      await getConversationsStarted(s.adminA, {
        from: "2026-01-01",
        to: "2999-01-01",
      }),
    ).toEqual({ ok: false, code: "VALIDATION_ERROR", fields: ["from", "to"] });
    expect(
      await getMessageCounts(s.adminA, { from: "2026-09-01", to: "x" }),
    ).toEqual({ ok: false, code: "VALIDATION_ERROR", fields: ["to"] });
  });
});

describe("métricas de volumen: autorización, aislamiento y contenido", () => {
  const all = [
    getConversationsStarted,
    getActiveConversations,
    getUniqueClients,
    getMessageCounts,
    getMessagesPerConversation,
    getDailyActivity,
  ];

  it("viewer lee lo mismo que admin; con la contraseña pendiente, FORBIDDEN", async () => {
    const s = await users();
    await mainFixture(s.orgA, s.orgB);
    for (const metric of all) {
      expect(await metric(s.viewerA, PERIOD)).toEqual(
        await metric(s.adminA, PERIOD),
      );
      expect(await metric(s.pendingA, PERIOD)).toEqual({
        ok: false,
        code: "FORBIDDEN",
      });
    }
  });

  // Los valores a mano de A ya se calculan con los datos de B dentro de I. Acá, B ve solo los suyos.
  it("cada organización ve solo sus datos", async () => {
    const s = await users();
    await mainFixture(s.orgA, s.orgB);
    // B: tres conversaciones, una por día, con 1 entrante y 2 salientes cada una.
    expect(valueOf(await getConversationsStarted(s.adminB, PERIOD))).toBe(3);
    expect(valueOf(await getActiveConversations(s.adminB, PERIOD))).toBe(3);
    expect(valueOf(await getUniqueClients(s.adminB, PERIOD))).toEqual({
      clients: 1,
      withoutClient: 1,
    });
    expect(valueOf(await getMessageCounts(s.adminB, PERIOD))).toEqual({
      inbound: 3,
      outbound: 6,
    });
    expect(valueOf(await getMessagesPerConversation(s.adminB, PERIOD))).toEqual(
      { status: "value", conversations: 3, messages: 9, average: 3, median: 3 },
    );
    expect(valueOf(await getDailyActivity(s.adminB, PERIOD))).toEqual([
      { day: "2026-09-01", started: 1, active: 1, inbound: 1, outbound: 2 },
      { day: "2026-09-02", started: 1, active: 1, inbound: 1, outbound: 2 },
      { day: "2026-09-03", started: 1, active: 1, inbound: 1, outbound: 2 },
    ]);
  });

  it("ninguna respuesta contiene cuerpos de mensajes, teléfonos ni nombres de clientes", async () => {
    const s = await users();
    await mainFixture(s.orgA, s.orgB);
    for (const metric of all) {
      const serialized = JSON.stringify(await metric(s.adminA, PERIOD));
      expect(serialized).not.toContain(SECRET_BODY);
      expect(serialized).not.toContain("Secret");
      expect(serialized).not.toContain("+54911");
    }
  });
});
